from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import asyncio
import logging
import os
import shutil
from pathlib import Path
from routers import auth, orgs, orders, use_cases, catalogs, oci, delivery_estimate, checkout, slot_manager, tms, deploy, fulfillment, cache, pickup_points
from services.sf_cli import refresh_orgs_cache

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("sfom")

# Bootstrap app_state.json from example if missing (first-run on a fresh clone)
_state_file = Path(__file__).parent / "app_state.json"
_example_file = Path(__file__).parent / "app_state.example.json"
if not _state_file.exists() and _example_file.exists():
    shutil.copy(_example_file, _state_file)

app = FastAPI(title="SFOM Demo API")


@app.middleware("http")
async def log_requests(request, call_next):
    import time
    start = time.monotonic()
    response = await call_next(request)
    ms = int((time.monotonic() - start) * 1000)
    logger.info("%s %s → %d  (%dms)", request.method, request.url.path, response.status_code, ms)
    return response


@app.on_event("startup")
async def startup():
    asyncio.create_task(refresh_orgs_cache())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(orgs.router, prefix="/orgs", tags=["orgs"])
app.include_router(orders.router, prefix="/orders", tags=["orders"])
app.include_router(use_cases.router, prefix="/use-cases", tags=["use-cases"])
app.include_router(catalogs.router, prefix="/catalogs", tags=["catalogs"])
app.include_router(oci.router, prefix="/oci", tags=["oci"])
app.include_router(delivery_estimate.router, prefix="/delivery-estimate", tags=["delivery-estimate"])
app.include_router(checkout.router, prefix="/checkout", tags=["checkout"])
app.include_router(slot_manager.router, prefix="/slot-manager", tags=["slot-manager"])
app.include_router(tms.router, prefix="/tms", tags=["tms"])
app.include_router(pickup_points.router, prefix="/pickup-points", tags=["pickup-points"])
app.include_router(deploy.router, prefix="/deploy", tags=["deploy"])
app.include_router(fulfillment.router, prefix="/fulfillment", tags=["fulfillment"])
app.include_router(cache.router, prefix="/cache", tags=["cache"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve built frontend if static/ exists (production mode)
_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(_static_dir, "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(os.path.join(_static_dir, "index.html"))

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Let API routes pass through; catch-all serves index.html for SPA routing
        file_path = os.path.join(_static_dir, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(_static_dir, "index.html"))
else:
    @app.get("/")
    def root():
        return {"status": "ok", "mode": "api-only (run install.sh to build frontend)"}
