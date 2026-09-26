from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import cors_origins
from app.modules.admin_units.router import router as admin_units_router
from app.modules.incidents.router import router as incidents_router
from app.modules.meta.router import router as meta_router

app = FastAPI(title="ReporteEC API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(meta_router, prefix="/api")
app.include_router(incidents_router, prefix="/api")
app.include_router(admin_units_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
