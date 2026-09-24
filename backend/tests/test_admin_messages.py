"""`/admin/messages`: newest first, unread filter, paging, read state, delete."""

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import hash_client_ip
from app.models.contact_message import ContactMessage
from tests.conftest import TEST_IP_HASH_SECRET

MESSAGES = "/api/v1/admin/messages"
T0 = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)


async def add_messages(session: AsyncSession, count: int) -> list[int]:
    rows = [
        ContactMessage(
            name=f"Sender {index}",
            email=f"sender{index}@example.com",
            message=f"Message number {index}.",
            ip_hash=hash_client_ip(f"198.51.100.{index}", TEST_IP_HASH_SECRET),
            user_agent="pytest-agent" if index % 2 else None,
            delivery_status="failed" if index == 0 else "sent",
            delivery_error="Resend responded 500" if index == 0 else None,
            created_at=T0 + timedelta(minutes=index),
        )
        for index in range(count)
    ]
    session.add_all(rows)
    await session.commit()
    return [row.id for row in rows]


async def test_newest_first_with_every_field(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await add_messages(session, 3)
    response = await admin_client.get(MESSAGES)
    assert response.status_code == 200
    page = response.json()
    assert page["total"] == 3
    assert page["unread"] == 3
    assert [item["name"] for item in page["items"]] == ["Sender 2", "Sender 1", "Sender 0"]
    newest = page["items"][0]
    assert set(newest) == {
        "id",
        "name",
        "email",
        "message",
        "createdAt",
        "readAt",
        "deliveryStatus",
        "deliveryError",
        "source",
        "userAgent",
    }
    digest = hash_client_ip("198.51.100.2", TEST_IP_HASH_SECRET)
    assert digest is not None
    assert newest["source"] == digest[:12]
    assert newest["readAt"] is None
    oldest = page["items"][-1]
    assert oldest["deliveryStatus"] == "failed"
    assert oldest["deliveryError"] == "Resend responded 500"


async def test_paging_and_unread_filter(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    ids = await add_messages(session, 5)
    first_page = (await admin_client.get(MESSAGES, params={"limit": 2})).json()
    second_page = (await admin_client.get(MESSAGES, params={"limit": 2, "offset": 2})).json()
    assert [item["id"] for item in first_page["items"]] == [ids[4], ids[3]]
    assert [item["id"] for item in second_page["items"]] == [ids[2], ids[1]]
    assert first_page["total"] == second_page["total"] == 5

    await admin_client.patch(f"{MESSAGES}/{ids[4]}", json={"read": True})
    unread = (await admin_client.get(MESSAGES, params={"status": "unread"})).json()
    assert unread["total"] == 4
    assert unread["unread"] == 4
    assert ids[4] not in [item["id"] for item in unread["items"]]
    everything = (await admin_client.get(MESSAGES)).json()
    assert everything["total"] == 5
    assert everything["unread"] == 4


async def test_as_of_keeps_the_pages_of_a_view_stable(
    admin_client: httpx.AsyncClient, session: AsyncSession
) -> None:
    """Reading messages, or new ones arriving, never shifts the later pages of the same view."""
    ids = await add_messages(session, 5)  # newest first: ids[4] .. ids[0]
    first = (await admin_client.get(MESSAGES, params={"status": "unread", "limit": 2})).json()
    assert [item["id"] for item in first["items"]] == [ids[4], ids[3]]
    as_of = first["asOf"]
    for message_id in (ids[4], ids[3]):  # read on page 1
        await admin_client.patch(f"{MESSAGES}/{message_id}", json={"read": True})
    session.add(
        ContactMessage(
            name="Late",
            email="late@example.com",
            message="Arrived after page 1 was shown.",
            ip_hash=hash_client_ip("198.51.100.99", TEST_IP_HASH_SECRET),
            delivery_status="sent",
        )
    )
    await session.commit()

    params = {"status": "unread", "limit": 2, "offset": 2, "asOf": as_of}
    second = (await admin_client.get(MESSAGES, params=params)).json()
    assert [item["id"] for item in second["items"]] == [ids[2], ids[1]]
    assert second["total"] == 5
    assert second["asOf"] == as_of
    assert second["unread"] == 4  # the badge stays live: 3 old unread + the late one
    fresh = (await admin_client.get(MESSAGES, params={"status": "unread", "limit": 2})).json()
    assert fresh["items"][0]["name"] == "Late"
    assert fresh["total"] == 4


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 101},
        {"offset": -1},
        {"offset": 2**31},
        {"status": "archived"},
        {"asOf": "yesterday"},
    ],
)
async def test_invalid_query(admin_client: httpx.AsyncClient, params: dict[str, str | int]) -> None:
    assert (await admin_client.get(MESSAGES, params=params)).status_code == 422


async def test_message_ids_out_of_range_are_invalid(admin_client: httpx.AsyncClient) -> None:
    huge = 2**63
    assert (await admin_client.patch(f"{MESSAGES}/{huge}", json={"read": True})).status_code == 422
    assert (await admin_client.delete(f"{MESSAGES}/{huge}")).status_code == 422


async def test_mark_read_and_unread(admin_client: httpx.AsyncClient, session: AsyncSession) -> None:
    [message_id] = await add_messages(session, 1)
    read = await admin_client.patch(f"{MESSAGES}/{message_id}", json={"read": True})
    assert read.status_code == 200
    first_read_at = read.json()["readAt"]
    assert first_read_at is not None
    again = await admin_client.patch(f"{MESSAGES}/{message_id}", json={"read": True})
    assert again.json()["readAt"] == first_read_at  # opening it again keeps the first read time
    unread = await admin_client.patch(f"{MESSAGES}/{message_id}", json={"read": False})
    assert unread.json()["readAt"] is None
    summary = (await admin_client.get("/api/v1/admin/summary")).json()
    assert summary["unreadMessages"] == 1


async def test_delete(admin_client: httpx.AsyncClient, session: AsyncSession) -> None:
    [message_id] = await add_messages(session, 1)
    response = await admin_client.delete(f"{MESSAGES}/{message_id}")
    assert response.status_code == 204
    assert (await admin_client.get(MESSAGES)).json()["total"] == 0
    assert (await admin_client.delete(f"{MESSAGES}/{message_id}")).status_code == 404


async def test_unknown_message(admin_client: httpx.AsyncClient) -> None:
    assert (await admin_client.patch(f"{MESSAGES}/999", json={"read": True})).status_code == 404
    bad_body = await admin_client.patch(f"{MESSAGES}/999", json={"read": "yes", "extra": 1})
    assert bad_body.status_code == 422


async def test_messages_submitted_through_the_form_appear_unread(
    admin_client: httpx.AsyncClient,
) -> None:
    response = await admin_client.post(
        "/api/v1/contact",
        json={
            "name": "Jane Doe",
            "email": "jane@example.com",
            "message": "Hello there, this is a test message.",
            "turnstileToken": "token-123",
            "website": "",
        },
    )
    assert response.status_code == 202
    page = (await admin_client.get(MESSAGES, params={"status": "unread"})).json()
    assert [item["email"] for item in page["items"]] == ["jane@example.com"]
    assert page["items"][0]["source"] != "unknown"
