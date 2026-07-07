"""Agregación de métricas Delivery en servidor (sin límite de filas al frontend)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from app.core.delivery_constants import (
    DRIVER_STATUS_EN_MATCH,
    DRIVER_STATUS_ESPERANDO,
    ORDER_STATUS_CANCELADO,
    ORDER_STATUS_DEVOLUCION,
    ORDER_STATUS_ENTREGADO,
)
from app.models.delivery import DriverArrival, Order

Dimension = Literal["estado", "locatario", "plataforma", "driver", "runner"]
TimeGranularity = Literal["day", "week", "month"]

ZONA_LIMA = ZoneInfo("America/Lima")

TERMINAL_STATUSES = frozenset(
    {ORDER_STATUS_ENTREGADO, ORDER_STATUS_CANCELADO, ORDER_STATUS_DEVOLUCION}
)

VALID_DIMENSIONS = frozenset({"estado", "locatario", "plataforma", "driver", "runner"})
VALID_TIME_GRANULARITIES = frozenset({"day", "week", "month"})


@dataclass
class MetricsRow:
    group: str
    total: int = 0
    active: int = 0
    delivered: int = 0
    canceled: int = 0
    returned: int = 0
    matched: int = 0
    bags: int = 0
    avg_create_to_ready: Optional[float] = None
    avg_ready_to_match: Optional[float] = None
    avg_match_to_pickup: Optional[float] = None
    avg_pickup_to_delivered: Optional[float] = None
    avg_ready_to_delivered: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "group": self.group,
            "total": self.total,
            "active": self.active,
            "delivered": self.delivered,
            "canceled": self.canceled,
            "returned": self.returned,
            "matched": self.matched,
            "bags": self.bags,
            "avg_create_to_ready": self.avg_create_to_ready,
            "avg_ready_to_match": self.avg_ready_to_match,
            "avg_match_to_pickup": self.avg_match_to_pickup,
            "avg_pickup_to_delivered": self.avg_pickup_to_delivered,
            "avg_ready_to_delivered": self.avg_ready_to_delivered,
        }


@dataclass
class MetricsAccumulator:
    total: int = 0
    active: int = 0
    delivered: int = 0
    canceled: int = 0
    returned: int = 0
    matched: int = 0
    bags: int = 0
    create_to_ready: list[int] = field(default_factory=list)
    ready_to_match: list[int] = field(default_factory=list)
    match_to_pickup: list[int] = field(default_factory=list)
    pickup_to_delivered: list[int] = field(default_factory=list)
    ready_to_delivered: list[int] = field(default_factory=list)

    def add_order(self, order: Order) -> None:
        self.total += 1
        estado = order.estado or ""
        if estado not in TERMINAL_STATUSES:
            self.active += 1
        if estado == ORDER_STATUS_ENTREGADO:
            self.delivered += 1
        if estado == ORDER_STATUS_CANCELADO:
            self.canceled += 1
        if estado == ORDER_STATUS_DEVOLUCION:
            self.returned += 1
        if order.matched_driver_arrival is not None:
            self.matched += 1
        self.bags += int(order.numero_bolsas or 0)

        for bucket, start, end in (
            (self.create_to_ready, order.created_at, order.listo_at),
            (self.ready_to_match, order.listo_at, order.match_at),
            (self.match_to_pickup, order.match_at, order.recogido_at),
            (self.pickup_to_delivered, order.recogido_at, order.entregado_at),
            (self.ready_to_delivered, order.listo_at, order.entregado_at),
        ):
            mins = _minutes_between(start, end)
            if mins is not None:
                bucket.append(mins)

    def to_row(self, group: str) -> MetricsRow:
        return MetricsRow(
            group=group,
            total=self.total,
            active=self.active,
            delivered=self.delivered,
            canceled=self.canceled,
            returned=self.returned,
            matched=self.matched,
            bags=self.bags,
            avg_create_to_ready=_avg(self.create_to_ready),
            avg_ready_to_match=_avg(self.ready_to_match),
            avg_match_to_pickup=_avg(self.match_to_pickup),
            avg_pickup_to_delivered=_avg(self.pickup_to_delivered),
            avg_ready_to_delivered=_avg(self.ready_to_delivered),
        )


def _clean_label(value: Optional[str], fallback: str) -> str:
    text = (value or "").strip()
    return text if text else fallback


def _minutes_between(start: Optional[datetime], end: Optional[datetime]) -> Optional[int]:
    if start is None or end is None:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    delta = end - start
    return max(0, int(delta.total_seconds() // 60))


def _avg(values: list[int]) -> Optional[float]:
    if not values:
        return None
    return sum(values) / len(values)


def _driver_label(driver: Optional[DriverArrival]) -> str:
    if driver is None:
        return "Sin driver"
    parts = [
        _clean_label(driver.placa, ""),
        _clean_label(driver.alias_conductor, ""),
        _clean_label(driver.codigo_ingresado, ""),
        _clean_label(driver.conductor_dni or driver.conductor_carne_extranjeria, ""),
    ]
    parts = [p for p in parts if p]
    return " · ".join(parts) if parts else f"Driver #{driver.id}"


def _runner_label(order: Order) -> str:
    runner = order.locked_by_runner
    if runner is not None and (runner.username or "").strip():
        return runner.username.strip()
    if order.locked_by_runner_id is not None:
        return f"Runner #{order.locked_by_runner_id}"
    return "Sin runner"


def _group_key(order: Order, dimension: Dimension) -> str:
    if dimension == "estado":
        return _clean_label(order.estado, "Sin estado")
    if dimension == "locatario":
        rest = order.restaurant
        return _clean_label(getattr(rest, "nombre", None), "Sin locatario")
    if dimension == "plataforma":
        return _clean_label(order.plataforma, "Sin plataforma")
    if dimension == "driver":
        return _driver_label(order.matched_driver_arrival)
    return _runner_label(order)


def _order_passes_filters(
    order: Order,
    *,
    estado: Optional[str],
    locatario: Optional[str],
    plataforma: Optional[str],
    driver: Optional[str],
    runner: Optional[str],
) -> bool:
    if estado and _clean_label(order.estado, "Sin estado") != estado:
        return False
    if locatario and _clean_label(getattr(order.restaurant, "nombre", None), "Sin locatario") != locatario:
        return False
    if plataforma and _clean_label(order.plataforma, "Sin plataforma") != plataforma:
        return False
    if driver and _driver_label(order.matched_driver_arrival) != driver:
        return False
    if runner and _runner_label(order) != runner:
        return False
    return True


def _load_orders_in_range(db: Session, start_utc: datetime, end_utc: datetime) -> list[Order]:
    return (
        db.query(Order)
        .options(
            joinedload(Order.matched_driver_arrival),
            joinedload(Order.restaurant),
            joinedload(Order.locked_by_runner),
        )
        .filter(Order.created_at >= start_utc, Order.created_at < end_utc)
        .all()
    )


def _parse_lima_date(value: str) -> date:
    return date.fromisoformat(value.strip())


def _to_lima(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZONA_LIMA)


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _period_key_for_order(order: Order, granularity: TimeGranularity) -> str:
    lima = _to_lima(order.created_at)
    d = lima.date()
    if granularity == "day":
        return d.isoformat()
    if granularity == "week":
        # Semana operativa lun–vie: sáb/dom se asignan al lunes de esa semana calendario
        return _monday_of(d).isoformat()
    return f"{d.year:04d}-{d.month:02d}"


def _period_label(period_key: str, granularity: TimeGranularity) -> str:
    if granularity == "day":
        return period_key
    if granularity == "week":
        monday = _parse_lima_date(period_key)
        friday = monday + timedelta(days=4)
        return f"{monday.strftime('%d/%m')} – {friday.strftime('%d/%m/%Y')}"
    year, month = period_key.split("-", 1)
    months = (
        "Ene", "Feb", "Mar", "Abr", "May", "Jun",
        "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    )
    return f"{months[int(month) - 1]} {year}"


def _iter_period_keys(
    fecha_desde: str,
    fecha_hasta: str,
    granularity: TimeGranularity,
) -> list[str]:
    start = _parse_lima_date(fecha_desde)
    end = _parse_lima_date(fecha_hasta)
    keys: list[str] = []
    if granularity == "day":
        cursor = start
        while cursor <= end:
            keys.append(cursor.isoformat())
            cursor += timedelta(days=1)
        return keys
    if granularity == "week":
        cursor = _monday_of(start)
        end_monday = _monday_of(end)
        while cursor <= end_monday:
            keys.append(cursor.isoformat())
            cursor += timedelta(days=7)
        return keys
    cursor = date(start.year, start.month, 1)
    end_month = date(end.year, end.month, 1)
    while cursor <= end_month:
        keys.append(f"{cursor.year:04d}-{cursor.month:02d}")
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return keys


def _build_time_series(
    orders: list[Order],
    *,
    fecha_desde: str,
    fecha_hasta: str,
    granularity: TimeGranularity,
) -> list[dict[str, Any]]:
    buckets: dict[str, MetricsAccumulator] = {}
    for order in orders:
        key = _period_key_for_order(order, granularity)
        if key not in buckets:
            buckets[key] = MetricsAccumulator()
        buckets[key].add_order(order)

    series: list[dict[str, Any]] = []
    for key in _iter_period_keys(fecha_desde, fecha_hasta, granularity):
        acc = buckets.get(key, MetricsAccumulator())
        series.append(
            {
                "period": key,
                "label": _period_label(key, granularity),
                "total": acc.total,
                "active": acc.active,
                "delivered": acc.delivered,
                "canceled": acc.canceled,
                "returned": acc.returned,
            }
        )
    return series


def _drivers_live(db: Session) -> dict[str, int]:
    rows = db.query(DriverArrival.estado).filter(
        DriverArrival.estado.in_([DRIVER_STATUS_ESPERANDO, DRIVER_STATUS_EN_MATCH])
    ).all()
    esperando = sum(1 for (st,) in rows if st == DRIVER_STATUS_ESPERANDO)
    en_match = sum(1 for (st,) in rows if st == DRIVER_STATUS_EN_MATCH)
    return {"esperando": esperando, "en_match": en_match, "total": len(rows)}


def compute_delivery_metrics(
    db: Session,
    *,
    start_utc: datetime,
    end_utc: datetime,
    dimension: str = "estado",
    estado: Optional[str] = None,
    locatario: Optional[str] = None,
    plataforma: Optional[str] = None,
    driver: Optional[str] = None,
    runner: Optional[str] = None,
    time_granularity: str = "day",
    fecha_desde: str = "",
    fecha_hasta: str = "",
) -> dict[str, Any]:
    dim: Dimension = dimension if dimension in VALID_DIMENSIONS else "estado"
    gran: TimeGranularity = (
        time_granularity if time_granularity in VALID_TIME_GRANULARITIES else "day"
    )
    orders = _load_orders_in_range(db, start_utc, end_utc)

    estados: set[str] = set()
    locatarios: set[str] = set()
    plataformas: set[str] = set()
    drivers: set[str] = set()
    runners: set[str] = set()

    for order in orders:
        estados.add(_clean_label(order.estado, "Sin estado"))
        locatarios.add(_clean_label(getattr(order.restaurant, "nombre", None), "Sin locatario"))
        plataformas.add(_clean_label(order.plataforma, "Sin plataforma"))
        drivers.add(_driver_label(order.matched_driver_arrival))
        runners.add(_runner_label(order))

    filtered = [
        o
        for o in orders
        if _order_passes_filters(
            o,
            estado=estado,
            locatario=locatario,
            plataforma=plataforma,
            driver=driver,
            runner=runner,
        )
    ]

    summary_acc = MetricsAccumulator()
    groups: dict[str, MetricsAccumulator] = {}

    for order in filtered:
        summary_acc.add_order(order)
        key = _group_key(order, dim)
        if key not in groups:
            groups[key] = MetricsAccumulator()
        groups[key].add_order(order)

    rows = [
        groups[key].to_row(key)
        for key in sorted(groups.keys(), key=lambda k: (-groups[k].total, k))
    ]

    time_series = (
        _build_time_series(
            filtered,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            granularity=gran,
        )
        if fecha_desde and fecha_hasta
        else []
    )

    return {
        "total_orders_in_range": len(orders),
        "total_filtered": len(filtered),
        "summary": summary_acc.to_row("Total filtrado").to_dict(),
        "rows": [row.to_dict() for row in rows],
        "filter_options": {
            "estado": sorted(estados),
            "locatario": sorted(locatarios),
            "plataforma": sorted(plataformas),
            "driver": sorted(drivers),
            "runner": sorted(runners),
        },
        "drivers_live": _drivers_live(db),
        "time_granularity": gran,
        "time_series": time_series,
    }
