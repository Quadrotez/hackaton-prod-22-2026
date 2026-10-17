import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.health import Measurement, MeasurementParameter, MeasurementProfile
from tests.health_helpers import auth_headers, create_pet, pet_url


TEMPLATE_NAMES = ["Рост в холке", "Длина тела", "Обхват груди", "Обхват шеи", "Температура"]


def parameters(client: TestClient, headers: dict[str, str], pet_id: int) -> list[dict]:
    response = client.get(pet_url(pet_id, "measurement-parameters"), headers=headers)
    assert response.status_code == 200, response.json()
    return response.json()


def add_parameter(client: TestClient, headers: dict[str, str], pet_id: int, **body) -> dict:
    response = client.post(pet_url(pet_id, "measurement-parameters"), headers=headers, json=body)
    assert response.status_code == 201, response.json()
    return response.json()


def add_measurement(
    client: TestClient, headers: dict[str, str], pet_id: int, parameter_id: int, value, measured_at: str
) -> dict:
    response = client.post(
        pet_url(pet_id, f"measurement-parameters/{parameter_id}/measurements"),
        headers=headers,
        json={"value": value, "measured_at": measured_at},
    )
    assert response.status_code == 201, response.json()
    return response.json()


@pytest.mark.parametrize("species", ["cat", "dog", "Кошка", "  СОБАКА "])
def test_known_species_get_template_parameters(client: TestClient, species: str) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers, species=species)

    listed = parameters(client, headers, pet_id)
    assert [item["name"] for item in listed] == TEMPLATE_NAMES
    assert [item["unit"] for item in listed] == ["см", "см", "см", "см", "°C"]
    assert [item["sort_order"] for item in listed] == [10, 20, 30, 40, 50]
    # Applied once: listing again does not duplicate anything.
    assert len(parameters(client, headers, pet_id)) == len(TEMPLATE_NAMES)


@pytest.mark.parametrize("species", ["hamster", "other", "Попугай"])
def test_other_species_start_without_parameters(client: TestClient, species: str) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers, species=species)
    assert parameters(client, headers, pet_id) == []

    custom = add_parameter(client, headers, pet_id, name="Длина клюва", unit="мм")
    assert custom["sort_order"] == 10
    assert [item["name"] for item in parameters(client, headers, pet_id)] == ["Длина клюва"]

    response = client.post(pet_url(pet_id, "measurement-parameters/apply-template"), headers=headers)
    assert response.status_code == 422
    assert response.json()["detail"] == "No measurement template for this species"


def test_template_parameters_are_editable_and_stay_deleted(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    by_name = {item["name"]: item for item in parameters(client, headers, pet_id)}
    url = pet_url(pet_id, "measurement-parameters")

    renamed = client.patch(
        f"{url}/{by_name['Температура']['id']}",
        headers=headers,
        json={"name": "Температура тела", "unit": "°F", "sort_order": 1},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Температура тела"
    assert client.delete(f"{url}/{by_name['Обхват шеи']['id']}", headers=headers).status_code == 204

    names = [item["name"] for item in parameters(client, headers, pet_id)]
    assert names == ["Температура тела", "Рост в холке", "Длина тела", "Обхват груди"]

    # Explicitly re-applying restores only what is missing by name.
    restored = client.post(f"{url}/apply-template", headers=headers)
    assert restored.status_code == 200
    assert [item["name"] for item in restored.json()] == names + ["Обхват шеи", "Температура"]


def test_custom_parameters_on_template_pet(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers, species="dog")
    url = pet_url(pet_id, "measurement-parameters")

    custom = add_parameter(client, headers, pet_id, name="Обхват лапы", unit="см")
    assert custom["sort_order"] == 60
    assert parameters(client, headers, pet_id)[-1]["name"] == "Обхват лапы"

    duplicate = client.post(url, headers=headers, json={"name": "  обхват   ЛАПЫ "})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "A parameter with this name already exists"
    template_name = client.patch(f"{url}/{custom['id']}", headers=headers, json={"name": "Длина тела"})
    assert template_name.status_code == 409
    same_name = client.patch(f"{url}/{custom['id']}", headers=headers, json={"name": "обхват лапы"})
    assert same_name.status_code == 200

    for body in ({"name": "   "}, {"name": None}, {"sort_order": None}, {}):
        assert client.patch(f"{url}/{custom['id']}", headers=headers, json=body).status_code == 422
    assert client.patch(f"{url}/{custom['id']}", headers=headers, json={"unit": None}).json()["unit"] is None


def test_species_change_does_not_reapply_automatically(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers, species="other")
    assert parameters(client, headers, pet_id) == []

    client.patch(f"/api/v1/pets/{pet_id}", headers=headers, json={"species": "cat"})
    assert parameters(client, headers, pet_id) == []

    applied = client.post(pet_url(pet_id, "measurement-parameters/apply-template"), headers=headers)
    assert [item["name"] for item in applied.json()] == TEMPLATE_NAMES


def test_measurements_crud_and_series(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    parameter = parameters(client, headers, pet_id)[0]
    url = pet_url(pet_id, f"measurement-parameters/{parameter['id']}/measurements")

    later = add_measurement(client, headers, pet_id, parameter["id"], 28, "2026-10-10T10:00:00Z")
    earlier = add_measurement(client, headers, pet_id, parameter["id"], 27.5, "2026-09-10T10:00:00Z")
    assert later["value"] == 28

    series = client.get(url, headers=headers).json()
    assert [item["id"] for item in series] == [earlier["id"], later["id"]]
    ranged = client.get(url, headers=headers, params={"from": "2026-10-01T00:00:00Z"}).json()
    assert [item["id"] for item in ranged] == [later["id"]]

    patched = client.patch(f"{url}/{later['id']}", headers=headers, json={"value": 28.4, "notes": "after walk"})
    assert patched.json()["value"] == 28.4
    assert patched.json()["notes"] == "after walk"
    assert client.patch(f"{url}/{later['id']}", headers=headers, json={"value": None}).status_code == 422
    for bad in ("nan", "inf", "abc"):
        response = client.post(url, headers=headers, json={"value": bad, "measured_at": "2026-10-10T10:00:00Z"})
        assert response.status_code == 422

    assert client.delete(f"{url}/{earlier['id']}", headers=headers).status_code == 204
    assert client.get(f"{url}/{earlier['id']}", headers=headers).status_code == 404


def test_summary_reports_latest_change_and_recent_points(client: TestClient) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    chest, length = parameters(client, headers, pet_id)[2], parameters(client, headers, pet_id)[1]
    for day, value in enumerate([30, 31, 32.5, 33, 33.5, 34, 33.8, 34.2, 34.5, 34.0], start=1):
        add_measurement(client, headers, pet_id, chest["id"], value, f"2026-09-{day:02d}T10:00:00Z")
    add_measurement(client, headers, pet_id, length["id"], 52, "2026-10-01T10:00:00Z")

    summary = {
        item["name"]: item
        for item in client.get(pet_url(pet_id, "measurement-parameters/summary"), headers=headers).json()
    }
    assert summary["Обхват груди"]["latest"]["value"] == 34.0
    assert summary["Обхват груди"]["change"] == -0.5
    assert [point["value"] for point in summary["Обхват груди"]["recent"]] == [
        32.5, 33, 33.5, 34, 33.8, 34.2, 34.5, 34.0
    ]
    assert summary["Длина тела"]["latest"]["value"] == 52
    assert summary["Длина тела"]["change"] is None
    assert summary["Рост в холке"]["latest"] is None
    assert summary["Рост в холке"]["recent"] == []

    overview = client.get(pet_url(pet_id, "health"), headers=headers).json()
    assert overview["measurements"][2]["change"] == -0.5


def test_templates_endpoint(client: TestClient) -> None:
    templates = {item["key"]: item for item in client.get("/api/v1/measurement-templates").json()}
    assert set(templates) == {"cat", "dog"}
    assert "Кошка".lower() in templates["cat"]["species"]
    assert [item["name"] for item in templates["dog"]["parameters"]] == TEMPLATE_NAMES


def test_measurements_are_isolated(client: TestClient) -> None:
    owner = auth_headers(client, "owner@example.com")
    other = auth_headers(client, "other@example.com")
    pet_id = create_pet(client, owner)
    second_pet = create_pet(client, owner, "Second")
    foreign_pet = create_pet(client, other, "Foreign")
    parameter = parameters(client, owner, pet_id)[0]
    measurement = add_measurement(client, owner, pet_id, parameter["id"], 28, "2026-10-10T10:00:00Z")

    assert client.get(pet_url(pet_id, "measurement-parameters"), headers=other).status_code == 404
    for target in (second_pet, foreign_pet):
        base = pet_url(target, f"measurement-parameters/{parameter['id']}")
        for method, path, kwargs in (
            ("get", base, {}),
            ("patch", base, {"json": {"name": "X"}}),
            ("delete", base, {}),
            ("get", f"{base}/measurements", {}),
            ("post", f"{base}/measurements", {"json": {"value": 1, "measured_at": "2026-10-10T10:00:00Z"}}),
            ("get", f"{base}/measurements/{measurement['id']}", {}),
        ):
            assert getattr(client, method)(path, headers=owner, **kwargs).status_code == 404

    # A measurement id combined with a different parameter of the same pet is not found.
    other_parameter = parameters(client, owner, pet_id)[1]
    wrong = pet_url(pet_id, f"measurement-parameters/{other_parameter['id']}/measurements/{measurement['id']}")
    assert client.get(wrong, headers=owner).status_code == 404


def test_deleting_parameter_and_pet_cascades(client: TestClient, db: Session) -> None:
    headers = auth_headers(client, "owner@example.com")
    pet_id = create_pet(client, headers)
    first, second = parameters(client, headers, pet_id)[:2]
    add_measurement(client, headers, pet_id, first["id"], 28, "2026-10-10T10:00:00Z")
    add_measurement(client, headers, pet_id, second["id"], 52, "2026-10-10T10:00:00Z")

    client.delete(pet_url(pet_id, f"measurement-parameters/{first['id']}"), headers=headers)
    assert db.scalar(select(func.count()).select_from(Measurement)) == 1

    assert client.delete(f"/api/v1/pets/{pet_id}", headers=headers).status_code == 204
    for model in (Measurement, MeasurementParameter, MeasurementProfile):
        assert db.scalar(select(func.count()).select_from(model)) == 0
