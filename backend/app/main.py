from fastapi import FastAPI

from app.api.v1 import auth, health, pets

app = FastAPI(title="PetCare API", version="0.1.0")

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(pets.router, prefix="/api/v1")
