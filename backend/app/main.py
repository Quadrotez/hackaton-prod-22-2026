from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from app.api.v1 import auth, calendar, feeding, foods, health, pet_health, pets, transfers, vet_documents
from app.core.config import get_settings
from app.core.log import configure_logging
from app.core.request_logging import register_request_logging

settings = get_settings()
configure_logging(settings.log_level, settings.log_format)

SWAGGER_REQUEST_INTERCEPTOR_PLACEHOLDER = "__petcare_request_interceptor__"
SWAGGER_REQUEST_INTERCEPTOR = """request => {
  const headers = request.headers || {};
  const authorizationKey = Object.keys(headers).find(
    key => key.toLowerCase() === "authorization"
  );
  const authorization = authorizationKey ? headers[authorizationKey] : null;

  if (typeof authorization === "string" && /[^\\x00-\\x7F]/.test(authorization)) {
    headers[authorizationKey] = "Bearer invalid-non-ascii-token";
  }

  return request;
}"""

app = FastAPI(title="PetCare API", version="0.1.0", docs_url=None)


@app.get("/docs", include_in_schema=False)
async def swagger_ui() -> HTMLResponse:
    response = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - Swagger UI",
        swagger_ui_parameters={
            "requestInterceptor": SWAGGER_REQUEST_INTERCEPTOR_PLACEHOLDER,
        },
    )
    body = response.body.decode("utf-8").replace(
        f'"requestInterceptor": "{SWAGGER_REQUEST_INTERCEPTOR_PLACEHOLDER}"',
        f'"requestInterceptor": {SWAGGER_REQUEST_INTERCEPTOR}',
    )
    return HTMLResponse(content=body, status_code=response.status_code)


register_request_logging(app)

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
app.include_router(vet_documents.router, prefix="/api/v1")
app.include_router(foods.router, prefix="/api/v1")
app.include_router(pet_health.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
app.include_router(transfers.pet_router, prefix="/api/v1")
app.include_router(transfers.router, prefix="/api/v1")
