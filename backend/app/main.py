from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, calendar, feeding, health, pet_health, pets

app = FastAPI(title="PetCare API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(pets.router, prefix="/api/v1")
app.include_router(feeding.router, prefix="/api/v1")
app.include_router(pet_health.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
