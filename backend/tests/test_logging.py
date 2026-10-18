import json
import logging
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.v1 import vet_documents
from app.core.sage_logging import SageMultilineHandler
from app.core.log import JsonFormatter, TextFormatter, mask_path, start_request_context
from app.integrations.llm.vet_document_analyzer import analyze_veterinary_document
from app.main import app
from tests.health_helpers import PASSWORD, auth_headers, create_pet, pet_url


@pytest.fixture
def logs(caplog: pytest.LogCaptureFixture) -> pytest.LogCaptureFixture:
    caplog.set_level(logging.DEBUG)
    return caplog


def app_text(logs: pytest.LogCaptureFixture) -> str:
    """Everything the application logged (the test HTTP client's own logger excluded)."""
    return "\n".join(
        f"{record.getMessage()} {record.__dict__}"
        for record in logs.records
        if not record.name.startswith("httpx")
    )


def access_records(logs: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in logs.records if record.name == "app.access"]


def events(logs: pytest.LogCaptureFixture, name: str) -> list[logging.LogRecord]:
    return [record for record in logs.records if getattr(record, "event", None) == name]


def test_access_line_has_route_status_duration_and_request_id(client: TestClient, logs) -> None:
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401

    [line] = access_records(logs)
    assert line.levelname == "WARNING"
    assert (line.method, line.path, line.route, line.status) == (
        "GET", "/api/v1/auth/me", "/auth/me", 401,
    )
    assert line.duration_ms >= 0
    assert line.error == "Could not validate credentials"
    assert line.request_id == response.headers["X-Request-ID"]
    assert len(line.request_id) == 16


def test_request_id_from_caller_is_kept_if_plain(client: TestClient, logs) -> None:
    kept = client.get("/api/v1/health", headers={"X-Request-ID": "front-abc.1"})
    assert kept.headers["X-Request-ID"] == "front-abc.1"
    replaced = client.get("/api/v1/health", headers={"X-Request-ID": "bad id\nwith newline"})
    assert replaced.headers["X-Request-ID"] != "bad id\nwith newline"
    assert len(replaced.headers["X-Request-ID"]) == 16
    # Health checks are logged at DEBUG only.
    assert {record.levelname for record in access_records(logs)} == {"DEBUG"}


def test_all_lines_of_a_request_share_id_and_user(client: TestClient, logs) -> None:
    headers = auth_headers(client, "owner@example.com")
    logs.clear()
    pet_id = create_pet(client, headers)
    [created] = events(logs, "pet.created")
    [access] = access_records(logs)
    assert created.pet_id == pet_id
    assert created.request_id == access.request_id
    assert created.user_id == access.user_id is not None


def test_user_is_bound_on_async_endpoints_too(client: TestClient, logs) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    logs.clear()
    client.get(pet_url(pet_id, "symptoms"), headers=headers)
    [access] = access_records(logs)
    assert access.status == 200
    assert access.user_id is not None


def test_validation_errors_name_fields_but_never_values(client: TestClient, logs) -> None:
    secret = "VerySecretPassword-123"
    client.post("/api/v1/auth/register", json={"email": "not-an-email", "password": secret})
    [access] = access_records(logs)
    assert access.status == 422
    assert access.error == "validation failed"
    assert access.invalid_fields == ["body.email"]
    assert secret not in app_text(logs)
    assert "not-an-email" not in app_text(logs)


def test_login_events_without_email_or_password(client: TestClient, logs) -> None:
    auth_headers(client, "anna@example.com")
    client.post("/api/v1/auth/login", json={"email": "anna@example.com", "password": "wrong-password"})
    client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"})

    assert len(events(logs, "user.registered")) == 1
    assert len(events(logs, "auth.login")) == 1
    failed = events(logs, "auth.login_failed")
    assert [record.known_user for record in failed] == [True, False]
    for secret in ("anna@example.com", "nobody@example.com", PASSWORD, "wrong-password"):
        assert secret not in app_text(logs)


def test_calendar_feed_token_is_masked(client: TestClient, logs) -> None:
    headers = auth_headers(client, "owner@example.com")
    create_pet(client, headers)
    path = client.post("/api/v1/calendar/feed", headers=headers, json={}).json()["path"]
    token = path.rsplit("/", 1)[1].removesuffix(".ics")
    logs.clear()

    assert client.get(path).status_code == 200
    [access] = access_records(logs)
    assert access.path == "/api/v1/calendar/feed/***.ics"
    assert access.events == 0
    assert access.user_id is not None
    assert token not in app_text(logs)


def test_mask_path() -> None:
    assert mask_path("/api/v1/calendar/feed/abc_DEF-123.ics") == "/api/v1/calendar/feed/***.ics"
    assert mask_path("/api/v1/pets/1") == "/api/v1/pets/1"


def test_transfer_events(client: TestClient, logs) -> None:
    owner = auth_headers(client, "owner@example.com")
    recipient = auth_headers(client, "ivan@example.com")
    pet_id = create_pet(client, owner)
    transfer = client.post(
        f"/api/v1/pets/{pet_id}/transfers",
        headers=owner,
        json={"recipient_email": "ivan@example.com", "duration": "week"},
    ).json()
    client.post(f"/api/v1/transfers/{transfer['id']}/accept", headers=recipient)

    [requested] = events(logs, "transfer.requested")
    assert (requested.transfer_id, requested.pet_id, requested.duration) == (transfer["id"], pet_id, "week")
    [changed] = events(logs, "transfer.status_changed")
    assert changed.status == "accepted"
    assert "ivan@example.com" not in app_text(logs)


def test_unhandled_error_is_logged_with_traceback_and_request_id(logs) -> None:
    def explode() -> None:
        raise RuntimeError("boom")

    app.add_api_route("/api/v1/_explode", explode)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/api/v1/_explode", headers={"X-Request-ID": "trace-me"})
    finally:
        app.router.routes.pop()
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}

    [error] = [record for record in logs.records if record.name == "app.errors"]
    assert error.levelname == "ERROR"
    assert error.request_id == "trace-me"
    assert error.exc_info is not None
    [access] = access_records(logs)
    assert (access.status, access.levelname) == (500, "ERROR")


def png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_llm_call_is_logged_without_document_content(logs) -> None:
    answer = {
        "status": "success", "document_type": "veterinary_report",
        "visit_at": "2026-10-10T00:00:00Z", "visit_reason": "Секретный диагноз",
        "visit_price": 1500, "veterinarian_name": "Dr. Smith", "veterinarian_profession": None,
        "vet": None, "post_visit_instructions": None, "warnings": [], "error_code": None,
    }
    message = SimpleNamespace(content=json.dumps(answer), refusal=None)
    response = SimpleNamespace(
        choices=[SimpleNamespace(finish_reason="stop", message=message)],
        usage=SimpleNamespace(prompt_tokens=1200, completion_tokens=150),
    )
    fake = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **kwargs: response))
    )
    analyze_veterinary_document(png(), content_type="image/png", user_text="Кличка Барсик", client=fake)

    [call] = events(logs, "llm.response")
    assert (call.prompt_tokens, call.completion_tokens, call.finish_reason) == (1200, 150, "stop")
    assert call.duration_ms >= 0
    assert "Секретный диагноз" not in app_text(logs)
    assert "Барсик" not in app_text(logs)


def test_vet_document_outcome_and_ai_failure_are_logged(
    client: TestClient, logs, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    url = pet_url(pet_id, "vet-documents/analyze")

    def unavailable(*args, **kwargs):
        raise RuntimeError("no key")

    monkeypatch.setattr(vet_documents, "analyze_veterinary_document", unavailable)
    response = client.post(url, headers=headers, files={"image": ("doc.png", png(), "image/png")})
    assert response.status_code == 502
    [failure] = events(logs, "vet_document.ai_unavailable")
    assert failure.levelname == "ERROR"
    assert failure.pet_id == pet_id
    assert failure.exc_info is not None


def test_json_formatter_writes_one_object_per_line() -> None:
    start_request_context("req-1")
    try:
        raise ValueError("bad")
    except ValueError:
        record = logging.getLogger("app.test").makeRecord(
            "app.test", logging.WARNING, __file__, 1, "Hello %s", ("world",),
            exc_info=__import__("sys").exc_info(), extra={"event": "x.y", "pet_id": 5},
        )
    line = JsonFormatter().format(record)
    assert "\n" not in line.split('"exc"')[0]
    entry = json.loads(line)
    assert entry["level"] == "WARNING"
    assert entry["logger"] == "app.test"
    assert entry["message"] == "Hello world"
    assert entry["request_id"] == "req-1"
    assert (entry["event"], entry["pet_id"]) == ("x.y", 5)
    assert "ValueError: bad" in entry["exc"]
    assert entry["ts"].endswith("+00:00")

    text = TextFormatter().format(record)
    assert "WARNING" in text and "[req-1]" in text and "event=x.y" in text and "pet_id=5" in text


def test_log_settings_accept_any_case(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import Settings

    monkeypatch.setenv("LOG_FORMAT", "JSON")
    monkeypatch.setenv("LOG_LEVEL", " debug ")
    settings = Settings(jwt_secret_key="test")
    assert (settings.log_format, settings.log_level) == ("json", "DEBUG")


def test_sage_handler_posts_one_formatted_record(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[tuple[str, dict[str, str], bytes]] = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout):
        sent.append((request.full_url, dict(request.header_items()), request.data))
        return FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    handler = SageMultilineHandler("https://sage.example/api/hack-led-22/multiline/", "secret")
    handler.setFormatter(JsonFormatter())
    try:
        record = logging.getLogger("app.test").makeRecord(
            "app.test", logging.WARNING, __file__, 1, "hello", (), None, extra={"event": "test"}
        )
        handler.emit(record)
        handler._records.join()
        assert len(sent) == 1
        assert sent[0][0].endswith("/multiline/")
        assert sent[0][1]["Authorization"] == "Bearer secret"
        assert sent[0][1]["Content-type"] == "application/x-ndjson"
        assert json.loads(sent[0][2])['message'] == "hello"
    finally:
        handler.close()
