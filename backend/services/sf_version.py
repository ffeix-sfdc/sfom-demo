import os

# Highest API version the app has been tested with (68.0 = Winter '27).
# The version actually used is the target org's own apiVersion (from get_org_token),
# capped at this ceiling. Override the ceiling with SF_API_VERSION.
MAX_API_VERSION = os.getenv("SF_API_VERSION", "68.0")

# The org is only known once get_org_token() has run, so paths are written with a
# placeholder and resolved by versioned(). An unresolved placeholder produces a 404
# instead of silently hitting the wrong API version.
_PLACEHOLDER = "{api}"

SF_API = f"/services/data/v{_PLACEHOLDER}"
CONNECT_API = f"{SF_API}/connect"
SOAP_API = f"/services/Soap/m/{_PLACEHOLDER}"


def effective_version(org: dict) -> str:
    ceiling = float(MAX_API_VERSION)
    try:
        version = float(org.get("api_version") or ceiling)
    except (TypeError, ValueError):
        version = ceiling
    return f"{min(version, ceiling):.1f}"


def versioned(path: str, org: dict) -> str:
    return path.replace(_PLACEHOLDER, effective_version(org))
