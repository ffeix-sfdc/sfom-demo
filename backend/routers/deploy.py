from fastapi import APIRouter, HTTPException
from services.salesforce import sf_get
from services.sf_cli import get_org_token
from services.org_store import get_active_alias
import httpx
import zipfile
import io
import os
import base64

router = APIRouter()
SF_API = "/services/data/v65.0"

OBJECTS = ["SlotConfig__c", "SlotBooking__c", "TmsConfig__c", "TmsTimeWindow__c", "TmsBooking__c"]
TABS = ["SlotConfig__c", "SlotBooking__c", "TmsConfig__c", "TmsTimeWindow__c", "TmsBooking__c"]
LAYOUTS = [
    "SlotConfig__c-Slot Config Layout",
    "SlotBooking__c-Slot Booking Layout",
    "TmsConfig__c-TMS Config Layout",
    "TmsTimeWindow__c-TMS Time Window Layout",
    "TmsBooking__c-TMS Booking Layout",
]
PERMISSION_SET = "OmsAppConfig"
METADATA_DIR = os.path.join(os.path.dirname(__file__), "..", "metadata")


# ── Status ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def deploy_status():
    # Check objects
    names_quoted = ", ".join(f"'{o}'" for o in OBJECTS)
    soql_obj = f"SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName IN ({names_quoted})"
    try:
        result = await sf_get(f"{SF_API}/query", params={"q": soql_obj})
        existing_objects = {r["QualifiedApiName"] for r in result.get("records", [])}
    except Exception:
        existing_objects = set()

    # Check tabs
    tabs_quoted = ", ".join(f"'{t}'" for t in TABS)
    soql_tabs = f"SELECT Name FROM TabDefinition WHERE Name IN ({tabs_quoted})"
    try:
        result = await sf_get(f"{SF_API}/query", params={"q": soql_tabs})
        existing_tabs = {r["Name"] for r in result.get("records", [])}
    except Exception:
        existing_tabs = set()

    # Check permission set exists + is assigned to current user
    soql_ps = f"SELECT Id FROM PermissionSet WHERE Name = '{PERMISSION_SET}' LIMIT 1"
    ps_exists = False
    ps_assigned = False
    try:
        result = await sf_get(f"{SF_API}/query", params={"q": soql_ps})
        records = result.get("records", [])
        if records:
            ps_exists = True
            ps_id = records[0]["Id"]
            org_info = await sf_get(f"{SF_API}/chatter/users/me")
            user_id = org_info.get("id") or org_info.get("userId", "")
            soql_asgn = f"SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '{user_id}' AND PermissionSetId = '{ps_id}' LIMIT 1"
            asgn = await sf_get(f"{SF_API}/query", params={"q": soql_asgn})
            ps_assigned = len(asgn.get("records", [])) > 0
    except Exception:
        pass

    missing = (
        [o for o in OBJECTS if o not in existing_objects]
        + [t for t in TABS if t not in existing_tabs]
        + ([PERMISSION_SET] if not ps_exists else [])
    )

    return {
        "objects": {o: o in existing_objects for o in OBJECTS},
        "tabs": {t: t in existing_tabs for t in TABS},
        "permission_set": ps_exists,
        "permission_set_assigned": ps_assigned,
        "all_deployed": len(missing) == 0,
        "missing": missing,
    }


# ── Deploy ───────────────────────────────────────────────────────────────────

def _build_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(os.path.join(METADATA_DIR, "package.xml"), "package.xml")
        for obj in OBJECTS:
            p = os.path.join(METADATA_DIR, f"{obj}.object-meta.xml")
            if os.path.exists(p):
                zf.write(p, f"objects/{obj}.object")
        for tab in TABS:
            p = os.path.join(METADATA_DIR, f"{tab}.tab-meta.xml")
            if os.path.exists(p):
                zf.write(p, f"tabs/{tab}.tab")
        p = os.path.join(METADATA_DIR, f"{PERMISSION_SET}.permissionset-meta.xml")
        if os.path.exists(p):
            zf.write(p, f"permissionsets/{PERMISSION_SET}.permissionset")
        for layout in LAYOUTS:
            p = os.path.join(METADATA_DIR, f"{layout}.layout-meta.xml")
            if os.path.exists(p):
                zf.write(p, f"layouts/{layout}.layout")
    buf.seek(0)
    return buf.read()


@router.post("")
async def start_deploy():
    alias = get_active_alias()
    if not alias:
        raise HTTPException(status_code=400, detail="No active org")
    org = get_org_token(alias)

    zip_bytes = _build_zip()
    zip_b64 = base64.b64encode(zip_bytes).decode()

    soap_body = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:CallOptions/>
    <met:SessionHeader>
      <met:sessionId>{org['access_token']}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:deploy>
      <met:ZipFile>{zip_b64}</met:ZipFile>
      <met:DeployOptions>
        <met:allowMissingFiles>false</met:allowMissingFiles>
        <met:autoUpdatePackage>false</met:autoUpdatePackage>
        <met:checkOnly>false</met:checkOnly>
        <met:ignoreWarnings>true</met:ignoreWarnings>
        <met:performRetrieve>false</met:performRetrieve>
        <met:purgeOnDelete>false</met:purgeOnDelete>
        <met:rollbackOnError>true</met:rollbackOnError>
        <met:singlePackage>true</met:singlePackage>
        <met:testLevel>NoTestRun</met:testLevel>
      </met:DeployOptions>
    </met:deploy>
  </soapenv:Body>
</soapenv:Envelope>"""

    url = f"{org['instance_url']}/services/Soap/m/65.0"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            content=soap_body.encode("utf-8"),
            headers={
                "Content-Type": "text/xml; charset=UTF-8",
                "SOAPAction": "deploy",
            },
            timeout=30,
        )
        if not resp.is_success:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        body_text = resp.text

    # Extract asyncProcessId from SOAP response
    import re
    match = re.search(r"<id>([^<]+)</id>", body_text)
    if not match:
        raise HTTPException(status_code=500, detail=f"Could not parse deploy job ID from response: {body_text[:500]}")
    job_id = match.group(1)
    return {"job_id": job_id}


# ── Poll status ───────────────────────────────────────────────────────────────

@router.get("/{job_id}")
async def poll_deploy(job_id: str):
    alias = get_active_alias()
    if not alias:
        raise HTTPException(status_code=400, detail="No active org")
    org = get_org_token(alias)

    soap_body = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:met="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <met:SessionHeader>
      <met:sessionId>{org['access_token']}</met:sessionId>
    </met:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <met:checkDeployStatus>
      <met:asyncProcessId>{job_id}</met:asyncProcessId>
      <met:includeDetails>true</met:includeDetails>
    </met:checkDeployStatus>
  </soapenv:Body>
</soapenv:Envelope>"""

    url = f"{org['instance_url']}/services/Soap/m/65.0"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            url,
            content=soap_body.encode("utf-8"),
            headers={
                "Content-Type": "text/xml; charset=UTF-8",
                "SOAPAction": "checkDeployStatus",
            },
            timeout=30,
        )
        if not resp.is_success:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        body_text = resp.text

    import re

    def _extract(tag):
        m = re.search(rf"<{tag}>([^<]+)</{tag}>", body_text)
        return m.group(1) if m else None

    status = _extract("status")
    done = _extract("done")
    success = _extract("success")
    error_msg = _extract("errorMessage")
    state_detail = _extract("stateDetail")
    number_components_deployed = _extract("numberComponentsDeployed")
    number_components_total = _extract("numberComponentsTotal")

    # Collect per-component failures for detailed error reporting
    component_failures = []
    for m in re.finditer(r"<componentFailures>(.*?)</componentFailures>", body_text, re.DOTALL):
        block = m.group(1)
        def _e(t, b=block):
            x = re.search(rf"<{t}>([^<]+)</{t}>", b)
            return x.group(1) if x else ""
        component_failures.append({
            "component": _e("fullName") or _e("fileName"),
            "problem": _e("problem"),
            "problemType": _e("problemType"),
        })

    return {
        "job_id": job_id,
        "status": status,
        "done": done == "true",
        "success": success == "true",
        "error": error_msg,
        "detail": state_detail,
        "deployed": number_components_deployed,
        "total": number_components_total,
        "failures": component_failures,
    }


# ── Assign permission set to connected user ───────────────────────────────────

@router.post("/assign-permset")
async def assign_permset():
    # Resolve connected user ID
    org_info = await sf_get(f"{SF_API}/chatter/users/me")
    user_id = org_info.get("id") or org_info.get("userId")
    if not user_id:
        raise HTTPException(status_code=500, detail="Could not resolve connected user ID")

    # Find permission set ID
    soql = f"SELECT Id FROM PermissionSet WHERE Name = '{PERMISSION_SET}' LIMIT 1"
    ps_res = await sf_get(f"{SF_API}/query", params={"q": soql})
    records = ps_res.get("records", [])
    if not records:
        raise HTTPException(status_code=404, detail=f"PermissionSet '{PERMISSION_SET}' not found — deploy first")
    ps_id = records[0]["Id"]

    # Check if already assigned
    soql_check = f"SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '{user_id}' AND PermissionSetId = '{ps_id}' LIMIT 1"
    check_res = await sf_get(f"{SF_API}/query", params={"q": soql_check})
    if check_res.get("records"):
        return {"ok": True, "already_assigned": True}

    # Assign
    from services.salesforce import sf_post as _sf_post
    await _sf_post(f"{SF_API}/sobjects/PermissionSetAssignment", {
        "AssigneeId": user_id,
        "PermissionSetId": ps_id,
    })
    return {"ok": True, "already_assigned": False}
