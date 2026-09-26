from fastapi import FastAPI

app = FastAPI(title="ReporteEC API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
