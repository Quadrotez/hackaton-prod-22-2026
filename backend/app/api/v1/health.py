from fastapi import APIRouter

router = APIRouter(tags=["healthcheck"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
