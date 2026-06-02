import asyncio
import httpx
from fastapi import HTTPException
from services.org_store import get_active_alias
from services.sf_cli import get_org_token, refresh_org_token

_TIMEOUT = httpx.Timeout(60.0, connect=15.0)

_AUTH_ERROR_CODES = {"INVALID_AUTH_HEADER", "INVALID_SESSION_ID", "AUTHENTICATION_FAILURE"}


def _get_org(alias: str = None) -> dict:
    target = alias or get_active_alias()
    if not target:
        raise HTTPException(status_code=503, detail="No active org")
    return get_org_token(target)


def _is_auth_error(resp: httpx.Response) -> bool:
    if resp.status_code != 401:
        return False
    try:
        body = resp.json()
        codes = {e.get("errorCode", "") for e in (body if isinstance(body, list) else body.get("detail", []))}
        return bool(codes & _AUTH_ERROR_CODES)
    except Exception:
        return True



def _network_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=504, detail=f"Salesforce unreachable: {type(exc).__name__}")


def _auth_expired_error() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Salesforce session expired. Please re-authenticate via the org selector.",
    )


def _raise_sf_error(resp: httpx.Response) -> None:
    try:
        detail = resp.json()
    except Exception:
        detail = resp.text
    raise HTTPException(status_code=resp.status_code, detail=detail)


async def sf_get(path: str, alias: str = None, params: dict = None) -> dict:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(url, params=params,
                                    headers={"Authorization": f"Bearer {org['access_token']}"})
            if _is_auth_error(resp):
                org = await asyncio.get_event_loop().run_in_executor(None, refresh_org_token, alias or get_active_alias())
                resp = await client.get(url, params=params,
                                        headers={"Authorization": f"Bearer {org['access_token']}"})
                if _is_auth_error(resp):
                    raise _auth_expired_error()
    except HTTPException:
        raise
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        _raise_sf_error(resp)
    return resp.json()


async def sf_patch(path: str, payload: dict, alias: str = None) -> dict:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    headers = {"Authorization": f"Bearer {org['access_token']}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.patch(url, json=payload, headers=headers)
            if _is_auth_error(resp):
                org = await asyncio.get_event_loop().run_in_executor(None, refresh_org_token, alias or get_active_alias())
                headers["Authorization"] = f"Bearer {org['access_token']}"
                resp = await client.patch(url, json=payload, headers=headers)
                if _is_auth_error(resp):
                    raise _auth_expired_error()
    except HTTPException:
        raise
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        _raise_sf_error(resp)
    if not resp.content:
        return {}
    return resp.json()


async def sf_delete(path: str, alias: str = None) -> None:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.delete(url, headers={"Authorization": f"Bearer {org['access_token']}"})
            if _is_auth_error(resp):
                org = await asyncio.get_event_loop().run_in_executor(None, refresh_org_token, alias or get_active_alias())
                resp = await client.delete(url, headers={"Authorization": f"Bearer {org['access_token']}"})
                if _is_auth_error(resp):
                    raise _auth_expired_error()
    except HTTPException:
        raise
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        _raise_sf_error(resp)


async def sf_post(path: str, payload: dict, alias: str = None) -> dict:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    headers = {"Authorization": f"Bearer {org['access_token']}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if _is_auth_error(resp):
                org = await asyncio.get_event_loop().run_in_executor(None, refresh_org_token, alias or get_active_alias())
                headers["Authorization"] = f"Bearer {org['access_token']}"
                resp = await client.post(url, json=payload, headers=headers)
                if _is_auth_error(resp):
                    raise _auth_expired_error()
    except HTTPException:
        raise
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        _raise_sf_error(resp)
    if not resp.content:
        return {}
    return resp.json()
