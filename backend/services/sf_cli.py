import asyncio
import json
import os
import subprocess
import urllib.request
import urllib.parse
from typing import Optional

_orgs_cache: Optional[list] = None
_SFDX_DIR = os.path.expanduser("~/.sfdx")


def _run(cmd: list[str]) -> dict:
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except Exception:
        raise RuntimeError(result.stderr or result.stdout)


def _load_sfdx_creds(username: str) -> dict:
    cred_file = os.path.join(_SFDX_DIR, f"{username}.json")
    if not os.path.exists(cred_file):
        raise RuntimeError(f"No credentials file for {username}")
    with open(cred_file) as f:
        return json.load(f)


def _oauth_refresh(creds: dict) -> str:
    """Perform a real OAuth2 refresh_token grant and return new access_token."""
    refresh_token = creds.get("refreshToken", "")
    client_id = creds.get("clientId", "PlatformCLI")
    instance_url = creds.get("instanceUrl", "")
    if not refresh_token:
        raise RuntimeError("No refresh token stored — please re-authenticate via sf org login web")
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": client_id,
        "refresh_token": refresh_token,
    }).encode()
    req = urllib.request.Request(f"{instance_url}/services/oauth2/token", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
    new_token = result.get("access_token", "")
    if not new_token:
        raise RuntimeError(f"OAuth refresh returned no access_token: {result}")
    return new_token


def _alias_to_username(alias: str) -> str:
    """Resolve alias → username via sf org display (metadata only, no token needed)."""
    try:
        token_data = _run(["sf", "org", "display", "--target-org", alias, "--json"])
        return token_data.get("result", {}).get("username", alias)
    except Exception:
        return alias


def get_org_token(alias: str) -> dict:
    """Get a valid access token for the given org alias.

    sf org display redacts the token in newer CLI versions, so we fall back to
    sf org auth show-access-token which always returns a fresh, unredacted token.
    """
    display_data = _run(["sf", "org", "display", "--target-org", alias, "--json"])
    display = display_data.get("result", {})
    instance_url = display.get("instanceUrl", "")
    username = display.get("username", alias)
    access_token = display.get("accessToken", "")

    if not access_token or access_token.startswith("[REDACTED]"):
        # Newer SF CLI redacts the token in org display — use dedicated command
        try:
            token_data = _run(["sf", "org", "auth", "show-access-token", "--target-org", alias, "--json"])
            access_token = token_data.get("result", {}).get("accessToken", "")
        except Exception:
            pass

    if not access_token or access_token.startswith("[REDACTED]"):
        raise RuntimeError(f"No valid access token for '{alias}' — please re-authenticate via sf org login web")

    return {
        "alias": alias,
        "access_token": access_token,
        "instance_url": instance_url,
        "username": username,
    }


def refresh_org_token(alias: str) -> dict:
    """Force a real OAuth2 token refresh using the stored refresh token."""
    username = _alias_to_username(alias)
    try:
        creds = _load_sfdx_creds(username)
        new_token = _oauth_refresh(creds)
        creds["accessToken"] = new_token
        cred_file = os.path.join(_SFDX_DIR, f"{username}.json")
        with open(cred_file, "w") as f:
            json.dump(creds, f)
        return {
            "alias": alias,
            "access_token": new_token,
            "instance_url": creds.get("instanceUrl", ""),
            "username": username,
        }
    except Exception:
        return get_org_token(alias)


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
