from fastapi.testclient import TestClient

from tests.health_helpers import auth_headers, create_pet, pet_url


def create_visit(client: TestClient, headers: dict[str, str], pet_id: int, **overrides) -> dict:
    payload = {
        "title": "Examination",
        "visit_at": "2026-09-25T10:00:00Z",
        "reason": "examination",
        "doctor_name": "Ivanova",
        "doctor_specialty": "therapist",
    } | overrides
    response = client.post(pet_url(pet_id, "visits"), headers=headers, json=payload)
    assert response.status_code == 201, response.json()
    return response.json()


def test_visit_defaults_and_status_ordering(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    later = create_visit(client, headers, pet_id, visit_at="2026-11-20T09:30:00Z")
    sooner = create_visit(client, headers, pet_id, visit_at="2026-10-22T11:00:00Z")
    past = create_visit(client, headers, pet_id, status="completed", diagnosis="Dermatitis")
    assert later["status"] == "planned"
    assert later["topic"] is None

    url = pet_url(pet_id, "visits")
    planned = client.get(url, headers=headers, params={"status": "planned"}).json()
    assert [visit["id"] for visit in planned] == [sooner["id"], later["id"]]
    everything = client.get(url, headers=headers).json()
    assert [visit["id"] for visit in everything] == [later["id"], sooner["id"], past["id"]]

    patched = client.patch(f"{url}/{sooner['id']}", headers=headers, json={"status": "cancelled"})
    assert patched.json()["status"] == "cancelled"
    assert client.patch(f"{url}/{sooner['id']}", headers=headers, json={"reason": None}).status_code == 422


def test_topics_are_grouped_case_insensitively(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    create_visit(client, headers, pet_id, topic="  аллергия ", status="completed", visit_at="2026-09-01T10:00:00Z")
    create_visit(client, headers, pet_id, topic="Аллергия", status="completed", visit_at="2026-10-09T10:00:00Z")
    create_visit(client, headers, pet_id, topic="АЛЛЕРГИЯ", visit_at="2026-11-05T10:00:00Z")
    create_visit(client, headers, pet_id, topic="Зубы", status="cancelled")
    create_visit(client, headers, pet_id)

    topics = client.get(pet_url(pet_id, "visits/topics"), headers=headers).json()
    assert topics == [
        {"topic": "АЛЛЕРГИЯ", "total": 3, "planned": 1, "completed": 2, "cancelled": 0},
        {"topic": "Зубы", "total": 1, "planned": 0, "completed": 0, "cancelled": 1},
    ]


def test_referral_graph(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    first = create_visit(client, headers, pet_id, topic="Allergy", status="completed", visit_at="2026-09-25T10:00:00Z")
    second = create_visit(
        client, headers, pet_id, topic="allergy", status="completed",
        visit_at="2026-10-09T10:00:00Z", referred_by_visit_id=first["id"],
    )
    third = create_visit(
        client, headers, pet_id, topic="Allergy", visit_at="2026-10-29T10:00:00Z",
        referred_by_visit_id=second["id"],
    )
    other_topic = create_visit(client, headers, pet_id, topic="Teeth", referred_by_visit_id=first["id"])

    graph = client.get(pet_url(pet_id, "visits/topics/graph"), headers=headers, params={"topic": "ALLERGY"})
    assert graph.status_code == 200
    body = graph.json()
    assert body["total"] == 3
    assert body["completed"] == 2
    assert [visit["id"] for visit in body["visits"]] == [first["id"], second["id"], third["id"]]
    assert body["edges"] == [
        {"from_visit_id": first["id"], "to_visit_id": second["id"]},
        {"from_visit_id": second["id"], "to_visit_id": third["id"]},
    ]
    assert other_topic["id"] not in [visit["id"] for visit in body["visits"]]

    missing = client.get(pet_url(pet_id, "visits/topics/graph"), headers=headers, params={"topic": "Eyes"})
    assert missing.status_code == 404


def test_referral_validation(client: TestClient) -> None:
    owner = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, owner)
    sibling_pet = create_pet(client, owner, "Sibling")
    first = create_visit(client, owner, pet_id)
    second = create_visit(client, owner, pet_id, referred_by_visit_id=first["id"])
    sibling_visit = create_visit(client, owner, sibling_pet)
    url = pet_url(pet_id, "visits")

    cases = [
        (f"{url}/{first['id']}", {"referred_by_visit_id": first["id"]}, "A visit cannot refer to itself"),
        (f"{url}/{first['id']}", {"referred_by_visit_id": second["id"]}, "Referral chain must not form a cycle"),
        (
            f"{url}/{second['id']}",
            {"referred_by_visit_id": sibling_visit["id"]},
            "referred_by_visit_id must reference a visit of the same pet",
        ),
    ]
    for path, body, detail in cases:
        response = client.patch(path, headers=owner, json=body)
        assert response.status_code == 422
        assert response.json()["detail"] == detail

    response = client.post(
        url,
        headers=owner,
        json={"title": "X", "visit_at": "2026-10-01T10:00:00Z", "reason": "illness", "referred_by_visit_id": 999},
    )
    assert response.status_code == 422

    cleared = client.patch(f"{url}/{second['id']}", headers=owner, json={"referred_by_visit_id": None})
    assert cleared.status_code == 200
    assert cleared.json()["referred_by_visit_id"] is None


def test_deleting_referring_visit_keeps_referred_one(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    first = create_visit(client, headers, pet_id)
    second = create_visit(client, headers, pet_id, referred_by_visit_id=first["id"])
    url = pet_url(pet_id, "visits")

    assert client.delete(f"{url}/{first['id']}", headers=headers).status_code == 204
    remaining = client.get(f"{url}/{second['id']}", headers=headers)
    assert remaining.status_code == 200
    assert remaining.json()["referred_by_visit_id"] is None


def test_visits_are_isolated(client: TestClient) -> None:
    owner = auth_headers(client, "owner@example.com")
    other = auth_headers(client, "other@example.com")
    pet_id = create_pet(client, owner)
    visit = create_visit(client, owner, pet_id, topic="Allergy")
    foreign_pet = create_pet(client, other)

    assert client.get(pet_url(foreign_pet, f"visits/{visit['id']}"), headers=owner).status_code == 404
    assert client.get(pet_url(pet_id, "visits/topics"), headers=other).status_code == 404
    assert client.get(
        pet_url(pet_id, "visits/topics/graph"), headers=other, params={"topic": "Allergy"}
    ).status_code == 404


def test_analyzer_fields_are_saved_and_returned_without_llm_call(client: TestClient, monkeypatch) -> None:
    headers = auth_headers(client, "analyzer@example.com")
    pet_id = create_pet(client, headers, "Milo")
    payload = {
        "visit_at": "2026-10-17T15:44:49.875Z",
        "visit_reason": "Routine examination",
        "visit_price": 0,
        "veterinarian_name": "Dr. Smith",
        "veterinarian_profession": "therapist",
        "vet": "Happy Paws Clinic",
        "post_visit_instructions": "Continue observation.",
    }
    monkeypatch.setattr(
        "app.integrations.llm.vet_document_analyzer.analyze_veterinary_document",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("LLM must not be called")),
    )
    created = client.post(pet_url(pet_id, "visits"), headers=headers, json=payload)
    assert created.status_code == 201, created.json()
    body = created.json()
    assert {key: body[key] for key in payload} == {
        **payload,
        "visit_at": "2026-10-17T15:44:49.875000",
        "visit_price": 0.0,
        "vet": "Happy Paws Clinic",
    }

    fetched = client.get(pet_url(pet_id, f"visits/{body['id']}"), headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["visit_at"] == "2026-10-17T15:44:49.875000"
    assert fetched.json()["vet"] == "Happy Paws Clinic"

    patched = client.patch(
        pet_url(pet_id, f"visits/{body['id']}"),
        headers=headers,
        json={"visit_at": "2026-10-18T12:00:00Z", "visit_price": 1250},
    )
    assert patched.status_code == 200
    assert patched.json()["visit_at"] == "2026-10-18T12:00:00"
    assert patched.json()["visit_price"] == 1250
