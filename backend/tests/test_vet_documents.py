import json
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.integrations.llm.vet_document_analyzer import analyze_veterinary_document

ANALYZED_FIELDS = {
    "visit_at": "2026-10-10T00:00:00Z",
    "visit_reason": "Routine examination",
    "visit_price": 1500,
    "veterinarian_name": "Dr. Smith",
    "veterinarian_profession": "Veterinarian",
    "vet": "Happy Paws Veterinary Clinic",
    "post_visit_instructions": "Buy the prescribed food and give the medication for 5 days.",
}
EXPECTED_ANALYSIS = {
    "status": "success",
    "document_type": "veterinary_report",
    **ANALYZED_FIELDS,
    "warnings": [],
    "error_code": None,
}


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    password = "correct-horse-battery-staple"
    assert client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password},
    ).status_code == 201
    logged_in = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert logged_in.status_code == 200
    return {"Authorization": f"Bearer {logged_in.json()['access_token']}"}


def create_pet(client: TestClient, headers: dict[str, str]) -> int:
    response = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={"name": "Milo", "species": "cat", "sex": "boy", "weight_g": 4500},
    )
    assert response.status_code == 201
    return response.json()["id"]


def image_bytes(image_format: str = "PNG") -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (2, 2), color="blue").save(buffer, format=image_format)
    return buffer.getvalue()


def test_analyze_endpoint_returns_exact_new_contract(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1 import vet_documents

    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    captured: dict[str, object] = {}

    def fake_analyze(image: bytes, *, content_type: str, user_text: str):
        captured.update(image=image, content_type=content_type, user_text=user_text)
        return EXPECTED_ANALYSIS

    monkeypatch.setattr(vet_documents, "analyze_veterinary_document", fake_analyze)
    response = client.post(
        f"/api/v1/pets/{pet_id}/vet-documents/analyze",
        headers=headers,
        data={"pet_context": "  This document is about my cat Milo.  "},
        files={"image": ("document.bin", image_bytes(), "text/plain")},
    )

    assert response.status_code == 200
    assert response.json() == EXPECTED_ANALYSIS
    assert set(response.json()) == {
        "status",
        "document_type",
        *ANALYZED_FIELDS,
        "warnings",
        "error_code",
    }
    assert captured["content_type"] == "image/png"
    assert captured["user_text"] == "This document is about my cat Milo."


def test_analyze_endpoint_allows_missing_context(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1 import vet_documents

    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    captured: dict[str, object] = {}

    def fake_analyze(image: bytes, *, content_type: str, user_text: str):
        captured["user_text"] = user_text
        return EXPECTED_ANALYSIS

    monkeypatch.setattr(vet_documents, "analyze_veterinary_document", fake_analyze)
    response = client.post(
        f"/api/v1/pets/{pet_id}/vet-documents/analyze",
        headers=headers,
        files={"image": ("document.png", image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert captured["user_text"] == ""


def test_analyze_endpoint_requires_authentication_and_owned_pet(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1 import vet_documents

    monkeypatch.setattr(
        vet_documents, "analyze_veterinary_document", lambda *args, **kwargs: EXPECTED_ANALYSIS
    )
    owner_headers = auth_headers(client, "owner@example.com")
    other_headers = auth_headers(client, "other@example.com")
    pet_id = create_pet(client, owner_headers)
    request = {"files": {"image": ("document.png", image_bytes(), "image/png")}}

    assert client.post(f"/api/v1/pets/{pet_id}/vet-documents/analyze", **request).status_code == 401
    assert client.post(
        f"/api/v1/pets/{pet_id}/vet-documents/analyze", headers=other_headers, **request
    ).status_code == 404


def test_analyze_endpoint_rejects_invalid_unsupported_and_oversized_images(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    url = f"/api/v1/pets/{pet_id}/vet-documents/analyze"

    invalid = client.post(
        url, headers=headers, files={"image": ("fake.png", b"not an image", "image/png")}
    )
    assert invalid.status_code == 415

    gif = client.post(
        url,
        headers=headers,
        files={"image": ("document.gif", image_bytes("GIF"), "image/gif")},
    )
    assert gif.status_code == 415

    oversized = client.post(
        url,
        headers=headers,
        files={"image": ("large.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
    )
    assert oversized.status_code == 413


def fake_client_with_json(payload: dict[str, object]):
    message = SimpleNamespace(content=json.dumps(payload), refusal=None)
    response = SimpleNamespace(
        choices=[SimpleNamespace(finish_reason="stop", message=message)]
    )
    completions = SimpleNamespace(create=lambda **kwargs: response)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions))


def test_llm_normalization_fills_missing_and_removes_additional_fields() -> None:
    valid_input = {
        "image_bytes": image_bytes(),
        "content_type": "image/png",
        "user_text": "This is about Milo.",
    }

    missing = {key: value for key, value in EXPECTED_ANALYSIS.items() if key != "status"}
    result = analyze_veterinary_document(**valid_input, client=fake_client_with_json(missing))
    assert set(result) == set(EXPECTED_ANALYSIS)
    assert result["status"] == "partial"
    assert result["document_type"] == "veterinary_report"
    assert result["visit_at"] == EXPECTED_ANALYSIS["visit_at"]
    assert result["visit_reason"] == EXPECTED_ANALYSIS["visit_reason"]

    additional = {**EXPECTED_ANALYSIS, "diagnosis": "forbidden"}
    result = analyze_veterinary_document(**valid_input, client=fake_client_with_json(additional))
    assert result == EXPECTED_ANALYSIS
    assert "diagnosis" not in result


def test_llm_normalization_coerces_recoverable_field_types() -> None:
    payload = {
        **EXPECTED_ANALYSIS,
        "visit_price": "1 500 руб.",
        "veterinarian_name": 123,
        "veterinarian_profession": 456,
        "vet": 789,
        "post_visit_instructions": 101112,
    }
    result = analyze_veterinary_document(
        image_bytes(),
        content_type="image/png",
        client=fake_client_with_json(payload),
    )

    assert result["visit_price"] == 1500
    assert result["veterinarian_name"] == "123"
    assert result["veterinarian_profession"] == "456"
    assert result["vet"] == "789"
    assert result["post_visit_instructions"] == "101112"


def test_llm_validation_accepts_null_optional_values() -> None:
    payload = {
        **EXPECTED_ANALYSIS,
        "status": "error",
        **{key: None for key in ANALYZED_FIELDS},
        "error_code": "UNSUPPORTED_DOCUMENT",
    }
    result = analyze_veterinary_document(
        image_bytes(), content_type="image/png", client=fake_client_with_json(payload)
    )
    assert result == payload


def test_llm_validation_accepts_zero_visit_price() -> None:
    payload = {**EXPECTED_ANALYSIS, "visit_price": 0}
    result = analyze_veterinary_document(
        image_bytes(), content_type="image/png", client=fake_client_with_json(payload)
    )
    assert result == payload


def test_llm_validation_returns_exact_contract() -> None:
    result = analyze_veterinary_document(
        image_bytes(), content_type="image/png", client=fake_client_with_json(EXPECTED_ANALYSIS)
    )
    assert result == EXPECTED_ANALYSIS


def test_llm_validation_rejects_unsupported_content_type() -> None:
    with pytest.raises(ValueError, match="unsupported"):
        analyze_veterinary_document(
            image_bytes(), content_type="application/pdf", client=fake_client_with_json(EXPECTED_ANALYSIS)
        )
