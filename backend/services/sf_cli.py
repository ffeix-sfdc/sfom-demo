import asyncio
import json
import subprocess
from typing import Optional

_orgs_cache: Optional[list] = None


def _run(cmd: list[str]) -> dict:
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except Exception:
        raise RuntimeError(result.stderr or result.stdout)


def _fetch_orgs() -> list[dict]:
    data = _run(["sf", "org", "list", "--json"])
    result = data.get("result", {})
    seen_usernames = set()
    orgs = []
    for org in result.get("nonScratchOrgs", []):
        username = org.get("username", "")
        if username in seen_usernames:
            continue
        seen_usernames.add(username)
        alias = org.get("alias") or username
        if not alias:
            continue
        orgs.append({
            "alias": alias,
            "username": username,
            "instance_url": org.get("instanceUrl", ""),
            "is_default": org.get("isDefaultUsername", False),
        })
    return orgs


async def refresh_orgs_cache() -> list[dict]:
    global _orgs_cache
    loop = asyncio.get_event_loop()
    orgs = await loop.run_in_executor(None, _fetch_orgs)
    _orgs_cache = orgs
    return orgs


def get_cached_orgs() -> Optional[list[dict]]:
    return _orgs_cache


def list_orgs() -> list[dict]:
    return _fetch_orgs()


def get_org_token(alias: str) -> dict:
    data = _run(["sf", "org", "display", "--target-org", alias, "--json"])
    r = data.get("result", {})
    return {
        "alias": alias,
        "access_token": r.get("accessToken", ""),
        "instance_url": r.get("instanceUrl", ""),
        "username": r.get("username", ""),
    }


async def login_web(alias: str) -> bool:
    proc = await asyncio.create_subprocess_exec(
        "sf", "org", "login", "web", "--alias", alias,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(stderr.decode())
    return True
