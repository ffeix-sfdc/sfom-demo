import httpx
from fastapi import HTTPException
from services.org_store import get_active_alias
from services.sf_cli import get_org_token

_TIMEOUT = httpx.Timeout(60.0, connect=15.0)


def _get_org(alias: str = None) -> dict:
    target = alias or get_active_alias()
    if not target:
        raise HTTPException(status_code=503, detail="No active org")
    return get_org_token(target)


def _network_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=504, detail=f"Salesforce unreachable: {type(exc).__name__}")


async def sf_get(path: str, alias: str = None, params: dict = None) -> dict:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {org['access_token']}"},
            )
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=resp.status_code, detail=detail)
    return resp.json()


async def sf_patch(path: str, payload: dict, alias: str = None) -> dict:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.patch(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {org['access_token']}",
                    "Content-Type": "application/json",
                },
            )
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=resp.status_code, detail=detail)
    if not resp.content:
        return {}
    return resp.json()


async def sf_delete(path: str, alias: str = None) -> None:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.delete(
                url,
                headers={"Authorization": f"Bearer {org['access_token']}"},
            )
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=resp.status_code, detail=detail)


async def sf_post(path: str, payload: dict, alias: str = None) -> dict:
    org = _get_org(alias)
    url = f"{org['instance_url']}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {org['access_token']}",
                    "Content-Type": "application/json",
                },
            )
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as exc:
        raise _network_error(exc)
    if not resp.is_success:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=resp.status_code, detail=detail)
    if not resp.content:
        return {}
    return resp.json()
