import json
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.integrations.llm.vet_document_analyzer import analyze_veterinary_document


EXPECTED_ANALYSIS = {
    "animal_name": "Milo",
    "visit_date": "2026-10-10",
    "visit_reason": "Routine examination",
    "visit_price": 1500,
}


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    password = "correct-horse-battery-staple"
    assert client.post(
        "/api/v1/auth/register", json={"email": email, "password": password}
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
        json={
            "name": "Milo",
            "species": "cat",
            "sex": "boy",
            "weight_g": 4500,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def image_bytes(image_format: str = "PNG") -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (2, 2), color="blue").save(buffer, format=image_format)
    return buffer.getvalue()


def test_analyze_endpoint_returns_exactly_four_validated_fields(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1 import vet_documents

    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    captured: dict[str, object] = {}

    def fake_analyze(image: bytes, *, content_type: str, user_text: str):
        captured.update(
            image=image, content_type=content_type, user_text=user_text
        )
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
        "animal_name",
        "visit_date",
        "visit_reason",
        "visit_price",
    }
    assert captured["content_type"] == "image/png"
    assert captured["user_text"] == "This document is about my cat Milo."


def test_analyze_endpoint_requires_authentication_owned_pet_and_context(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1 import vet_documents

    monkeypatch.setattr(
        vet_documents,
        "analyze_veterinary_document",
        lambda *args, **kwargs: EXPECTED_ANALYSIS,
    )
    owner_headers = auth_headers(client, "owner@example.com")
    other_headers = auth_headers(client, "other@example.com")
    pet_id = create_pet(client, owner_headers)
    request = {
        "data": {"pet_context": "This is Milo's veterinary document."},
        "files": {"image": ("document.png", image_bytes(), "image/png")},
    }

    assert client.post(
        f"/api/v1/pets/{pet_id}/vet-documents/analyze", **request
    ).status_code == 401
    assert client.post(
        f"/api/v1/pets/{pet_id}/vet-documents/analyze",
        headers=other_headers,
        **request,
    ).status_code == 404
    blank = client.post(
        f"/api/v1/pets/{pet_id}/vet-documents/analyze",
        headers=owner_headers,
        data={"pet_context": "   "},
        files=request["files"],
    )
    assert blank.status_code == 422


def test_analyze_endpoint_rejects_invalid_unsupported_and_oversized_images(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    url = f"/api/v1/pets/{pet_id}/vet-documents/analyze"
    data = {"pet_context": "This is Milo's veterinary document."}

    invalid = client.post(
        url,
        headers=headers,
        data=data,
        files={"image": ("fake.png", b"not an image", "image/png")},
    )
    assert invalid.status_code == 415

    gif = client.post(
        url,
        headers=headers,
        data=data,
        files={"image": ("document.gif", image_bytes("GIF"), "image/gif")},
    )
    assert gif.status_code == 415

    oversized = client.post(
        url,
        headers=headers,
        data=data,
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


def test_llm_response_validation_rejects_missing_and_additional_fields() -> None:
    valid_input = {
        "image_bytes": image_bytes(),
        "content_type": "image/png",
        "user_text": "This is about Milo.",
    }

    missing = {key: value for key, value in EXPECTED_ANALYSIS.items() if key != "visit_price"}
    with pytest.raises(ValueError, match="exactly"):
        analyze_veterinary_document(**valid_input, client=fake_client_with_json(missing))

    additional = {**EXPECTED_ANALYSIS, "diagnosis": "forbidden"}
    with pytest.raises(ValueError, match="exactly"):
        analyze_veterinary_document(**valid_input, client=fake_client_with_json(additional))


def test_llm_response_validation_accepts_only_the_four_expected_fields() -> None:
    result = analyze_veterinary_document(
        image_bytes(),
        content_type="image/png",
        user_text="This is about Milo.",
        client=fake_client_with_json(EXPECTED_ANALYSIS),
    )
    assert result == EXPECTED_ANALYSIS
