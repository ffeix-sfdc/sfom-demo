import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.sf_cli import login_web

router = APIRouter()

# Tracks in-progress login tasks: alias -> asyncio.Task
_login_tasks: dict[str, asyncio.Task] = {}


class LoginRequest(BaseModel):
    alias: str


@router.post("/login")
async def start_login(body: LoginRequest):
    alias = body.alias.strip()
    if not alias:
        raise HTTPException(status_code=400, detail="Alias is required")

    if alias in _login_tasks and not _login_tasks[alias].done():
        return {"status": "pending", "alias": alias}

    task = asyncio.create_task(_do_login(alias))
    _login_tasks[alias] = task
    return {"status": "started", "alias": alias}


@router.get("/login/{alias}/status")
async def login_status(alias: str):
    task = _login_tasks.get(alias)
    if task is None:
        return {"status": "not_found"}
    if not task.done():
        return {"status": "pending"}
    try:
        task.result()
        return {"status": "done"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


async def _do_login(alias: str):
    await login_web(alias)
