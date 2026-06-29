"""Mock snapshot centro de control."""
from app.services.delivery_control_mock import build_control_audit_mock, build_control_snapshot_mock


def test_mock_snapshot_structure():
    snap = build_control_snapshot_mock()
    assert snap["mock"] is True
    assert len(snap["orders"]) == 4
    assert len(snap["drivers"]) >= 2
    assert len(snap["alerts"]) == 4
    assert snap["counts"]["orders_active"] == len(snap["orders"])
    assert snap["counts"]["alerts_total"] == len(snap["alerts"])


def test_mock_audit_structure():
    audit = build_control_audit_mock()
    assert audit["total"] == len(audit["items"]) >= 1
    assert audit["items"][0]["source"] in ("control_center", "admin_panel")
