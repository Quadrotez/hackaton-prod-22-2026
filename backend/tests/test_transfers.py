from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.transfer import PetTransfer
from app.services.transfers import add_months


PASSWORD = "correct-horse-battery-staple"


def auth_headers(client: TestClient, email: str, name: str | None = None) -> dict[str, str]:
    if name is None:
        name = email.split("@", 1)[0].replace("-", "_")
    registration = client.post(
        "/api/v1/auth/register",
        json={"email": email, "name": name, "password": PASSWORD},
    )
    assert registration.status_code in (201, 409), registration.json()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_pet(client: TestClient, headers: dict[str, str], name: str = "Rex") -> int:
    response = client.post(
        "/api/v1/pets/",
        headers=headers,
        json={"name": name, "species": "dog", "sex": "boy", "weight_g": 30000},
    )
    assert response.status_code == 201
    return response.json()["id"]


def send(
    client: TestClient, headers: dict[str, str], pet_id: int, email: str, duration: str = "month"
):
    return client.post(
        f"/api/v1/pets/{pet_id}/transfers",
        headers=headers,
        json={"recipient_email": email, "duration": duration},
    )


def act(client: TestClient, headers: dict[str, str], transfer_id: int, action: str):
    return client.post(f"/api/v1/transfers/{transfer_id}/{action}", headers=headers)


@pytest.fixture
def parties(client: TestClient) -> tuple[dict, dict, int]:
    owner = auth_headers(client, "anna@example.com")
    recipient = auth_headers(client, "ivan@example.com")
    return owner, recipient, create_pet(client, owner)


def test_full_lifecycle(client: TestClient, parties) -> None:
    owner, recipient, pet_id = parties

    created = send(client, owner, pet_id, "  IVAN@example.com ")
    assert created.status_code == 201
    body = created.json()
    assert body["status"] == "pending"
    assert body["role"] == "owner"
    assert body["recipient_email"] == "ivan@example.com"
    assert body["recipient"] is None
    assert body["pet"]["name"] == "Rex"
    assert body["owner"]["name"] == "anna"
    transfer_id = body["id"]

    incoming = client.get("/api/v1/transfers/incoming", headers=recipient).json()
    assert [item["id"] for item in incoming] == [transfer_id]
    assert incoming[0]["role"] == "recipient"

    accepted = act(client, recipient, transfer_id, "accept").json()
    assert accepted["status"] == "accepted"
    assert accepted["recipient"]["name"] == "ivan"
    assert accepted["responded_at"] is not None
    assert client.get("/api/v1/transfers/incoming", headers=recipient).json() == []
    received = client.get("/api/v1/transfers/received", headers=recipient).json()
    assert [item["id"] for item in received] == [transfer_id]

    returning = act(client, recipient, transfer_id, "return").json()
    assert returning["status"] == "return_requested"
    assert returning["return_requested_at"] is not None
    # Still with the recipient until the owner confirms.
    assert [item["id"] for item in client.get("/api/v1/transfers/received", headers=recipient).json()] == [
        transfer_id
    ]
    outgoing = client.get("/api/v1/transfers/outgoing", headers=owner).json()
    assert [item["status"] for item in outgoing] == ["return_requested"]

    back = act(client, recipient, transfer_id, "cancel-return").json()
    assert back["status"] == "accepted"
    assert back["return_requested_at"] is None

    act(client, recipient, transfer_id, "return")
    returned = act(client, owner, transfer_id, "confirm-return").json()
    assert returned["status"] == "returned"
    assert returned["ended_at"] is not None
    assert client.get("/api/v1/transfers/received", headers=recipient).json() == []
    assert client.get(f"/api/v1/pets/{pet_id}/transfers/current", headers=owner).json() is None

    history = client.get(f"/api/v1/pets/{pet_id}/transfers", headers=owner).json()
    assert [item["status"] for item in history] == ["returned"]


def test_owner_cancels_and_recipient_declines(client: TestClient, parties) -> None:
    owner, recipient, pet_id = parties

    first = send(client, owner, pet_id, "ivan@example.com").json()
    assert client.get(f"/api/v1/pets/{pet_id}/transfers/current", headers=owner).json()["id"] == first["id"]
    cancelled = act(client, owner, first["id"], "cancel").json()
    assert cancelled["status"] == "cancelled"
    assert client.get("/api/v1/transfers/incoming", headers=recipient).json() == []

    # The pet is free again, so a new request can be sent.
    second = send(client, owner, pet_id, "ivan@example.com")
    assert second.status_code == 201
    declined = act(client, recipient, second.json()["id"], "decline").json()
    assert declined["status"] == "declined"
    assert declined["ended_at"] is not None
    assert send(client, owner, pet_id, "ivan@example.com").status_code == 201


@pytest.mark.parametrize(
    ("duration", "expected"),
    [
        ("week", lambda start: start + timedelta(weeks=1)),
        ("month", lambda start: add_months(start, 1)),
        ("three_months", lambda start: add_months(start, 3)),
        ("indefinite", lambda start: None),
    ],
)
def test_end_date_follows_duration(client: TestClient, parties, duration, expected) -> None:
    owner, _, pet_id = parties
    body = send(client, owner, pet_id, "ivan@example.com", duration).json()
    start = datetime.fromisoformat(body["created_at"])
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    target = expected(start)
    if target is None:
        assert body["ends_at"] is None
    else:
        ends_at = datetime.fromisoformat(body["ends_at"])
        ends_at = ends_at if ends_at.tzinfo else ends_at.replace(tzinfo=UTC)
        assert abs(ends_at - target) < timedelta(seconds=1)


def test_add_months_clamps_to_month_end() -> None:
    start = datetime(2026, 11, 30, 12, tzinfo=UTC)
    assert add_months(start, 3) == datetime(2027, 2, 28, 12, tzinfo=UTC)
    assert add_months(datetime(2026, 10, 16, tzinfo=UTC), 3) == datetime(2027, 1, 16, tzinfo=UTC)


def test_validation(client: TestClient, parties) -> None:
    owner, recipient, pet_id = parties

    to_self = send(client, owner, pet_id, "ANNA@example.com")
    assert to_self.status_code == 422
    assert to_self.json()["detail"] == "You cannot transfer a pet to yourself"
    assert send(client, owner, pet_id, "not-an-email").status_code == 422
    assert send(client, owner, pet_id, "ivan@example.com", "forever").status_code == 422

    assert send(client, owner, pet_id, "ivan@example.com").status_code == 201
    duplicate = send(client, owner, pet_id, "someone@example.com")
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "This pet already has an unfinished transfer"

    # Somebody else's pet cannot be transferred.
    assert send(client, recipient, pet_id, "x@example.com").status_code == 404


def test_actions_check_role_and_status(client: TestClient, parties) -> None:
    owner, recipient, pet_id = parties
    transfer_id = send(client, owner, pet_id, "ivan@example.com").json()["id"]

    wrong_role = act(client, owner, transfer_id, "accept")
    assert wrong_role.status_code == 403
    assert wrong_role.json()["detail"] == "Only the recipient can accept this transfer"
    assert act(client, recipient, transfer_id, "cancel").status_code == 403
    assert act(client, recipient, transfer_id, "confirm-return").status_code == 403

    for action in ("return", "cancel-return"):
        response = act(client, recipient, transfer_id, action)
        assert response.status_code == 409
    assert act(client, owner, transfer_id, "confirm-return").status_code == 409

    act(client, recipient, transfer_id, "accept")
    conflict = act(client, owner, transfer_id, "cancel")
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "Cannot cancel a transfer in status accepted"
    assert act(client, recipient, transfer_id, "decline").status_code == 409


def test_strangers_cannot_see_or_act(client: TestClient, parties) -> None:
    owner, _, pet_id = parties
    stranger = auth_headers(client, "eve@example.com")
    transfer_id = send(client, owner, pet_id, "ivan@example.com").json()["id"]

    assert client.get(f"/api/v1/transfers/{transfer_id}", headers=stranger).status_code == 404
    for action in ("accept", "decline", "cancel", "return", "cancel-return", "confirm-return"):
        assert act(client, stranger, transfer_id, action).status_code == 404
    assert client.get(f"/api/v1/pets/{pet_id}/transfers", headers=stranger).status_code == 404
    assert client.get("/api/v1/transfers/incoming", headers=stranger).json() == []
    assert client.get(f"/api/v1/transfers/{transfer_id}").status_code == 401


def test_request_waits_for_recipient_without_account(client: TestClient) -> None:
    owner = auth_headers(client, "anna@example.com")
    pet_id = create_pet(client, owner)
    transfer_id = send(client, owner, pet_id, "newcomer@example.com").json()["id"]

    newcomer = auth_headers(client, "newcomer@example.com")
    incoming = client.get("/api/v1/transfers/incoming", headers=newcomer).json()
    assert [item["id"] for item in incoming] == [transfer_id]
    assert act(client, newcomer, transfer_id, "accept").json()["status"] == "accepted"


def test_overdue_transfers_expire(client: TestClient, parties, db: Session) -> None:
    owner, recipient, pet_id = parties
    transfer_id = send(client, owner, pet_id, "ivan@example.com", "week").json()["id"]
    act(client, recipient, transfer_id, "accept")

    db.execute(
        update(PetTransfer)
        .where(PetTransfer.id == transfer_id)
        .values(ends_at=datetime.now(UTC) - timedelta(minutes=1))
    )
    db.commit()

    assert client.get("/api/v1/transfers/received", headers=recipient).json() == []
    expired = client.get(f"/api/v1/transfers/{transfer_id}", headers=owner).json()
    assert expired["status"] == "expired"
    assert expired["ended_at"] is not None
    assert act(client, recipient, transfer_id, "return").status_code == 409
    # An expired transfer no longer blocks a new one.
    assert send(client, owner, pet_id, "ivan@example.com").status_code == 201


def test_deleting_pet_removes_transfers(client: TestClient, parties, db: Session) -> None:
    owner, recipient, pet_id = parties
    send(client, owner, pet_id, "ivan@example.com")

    assert client.delete(f"/api/v1/pets/{pet_id}", headers=owner).status_code == 204
    assert db.scalar(select(func.count()).select_from(PetTransfer)) == 0
    assert client.get("/api/v1/transfers/incoming", headers=recipient).json() == []
