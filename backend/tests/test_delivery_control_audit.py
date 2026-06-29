"""Auditoría centro de control delivery."""
from types import SimpleNamespace

from app.core.delivery_constants import DELIVERY_AUDIT_ACTION_UNLOCK, DELIVERY_AUDIT_SOURCE_CONTROL
from app.services.delivery_control_audit import audit_row_to_dict, log_delivery_control_action


def test_log_and_serialize_audit():
    db = SimpleNamespace(add=lambda x: None, flush=lambda: None)
    user = SimpleNamespace(id=7, username="operador1")
    row = log_delivery_control_action(
        db,
        user,
        action=DELIVERY_AUDIT_ACTION_UNLOCK,
        source=DELIVERY_AUDIT_SOURCE_CONTROL,
        order_id=101,
        detail="prueba unlock",
    )
    assert row.action == DELIVERY_AUDIT_ACTION_UNLOCK
    assert row.source == DELIVERY_AUDIT_SOURCE_CONTROL
    assert row.order_id == 101
    d = audit_row_to_dict(row)
    assert d["username"] == "operador1"
    assert d["detail"] == "prueba unlock"


def test_resolve_audit_source_control():
    from app.api.delivery import _resolve_audit_source

    assert _resolve_audit_source("control_center") == "control_center"
    assert _resolve_audit_source("control") == "control_center"
    assert _resolve_audit_source(None) == "admin_panel"
