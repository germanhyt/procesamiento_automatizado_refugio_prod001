# -*- coding: utf-8 -*-
"""Intervalo: evalúa reservas Sisa próximas y POST a n8n (America/Lima)."""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.exc import OperationalError, ProgrammingError

logger = logging.getLogger(__name__)

JOB_ID = "sisa_reservas_proximity_webhook"
_scheduler: BackgroundScheduler | None = None


def _tick() -> None:
    from app.database import SessionLocal
    from app.services.sisa_reservas_notifications import ejecutar_envio_proximidad

    db = SessionLocal()
    try:
        out = ejecutar_envio_proximidad(db, trigger="schedule")
        if out.get("enviado"):
            logger.info("[sisa-reservas-notif] enviadas %s reserva(s) al webhook", out.get("items"))
        elif out.get("razon") not in (None, "sin_reservas_en_ventana"):
            logger.info("[sisa-reservas-notif] tick: %s", out)
    except Exception:  # noqa: BLE001
        logger.exception("[sisa-reservas-notif] error en job")
    finally:
        db.close()


def refresh_sisa_reservas_notifications_job() -> None:
    from app.database import SessionLocal
    from app.models.sisa_reservas import SisaReservasNotificacionesConfig
    from app.services.sisa_reservas_notifications import ensure_sisa_notificaciones_config_table

    global _scheduler
    sched = _scheduler
    if sched is None:
        return
    if sched.get_job(JOB_ID):
        try:
            sched.remove_job(JOB_ID)
        except Exception:  # noqa: BLE001
            pass

    db = SessionLocal()
    try:
        try:
            ensure_sisa_notificaciones_config_table(db)
            cfg = db.get(SisaReservasNotificacionesConfig, 1)
        except (OperationalError, ProgrammingError) as exc:
            logger.warning("[sisa-reservas-notif] job no registrado: %s", exc)
            return
        if not cfg or not cfg.schedule_enabled:
            logger.info("[sisa-reservas-notif] programación desactivada")
            return
        minutes = max(5, min(1440, int(cfg.schedule_interval_minutes or 15)))
        sched.add_job(
            _tick,
            IntervalTrigger(minutes=minutes),
            id=JOB_ID,
            replace_existing=True,
        )
        logger.info("[sisa-reservas-notif] intervalo cada %s min", minutes)
    finally:
        db.close()


def start_sisa_reservas_notifications_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        try:
            refresh_sisa_reservas_notifications_job()
        except Exception:  # noqa: BLE001
            logger.exception("[sisa-reservas-notif] refresh con scheduler ya activo")
        return
    _scheduler = BackgroundScheduler()
    _scheduler.start()
    try:
        refresh_sisa_reservas_notifications_job()
    except Exception:  # noqa: BLE001
        logger.exception("[sisa-reservas-notif] refresh al iniciar")
    logger.info("[sisa-reservas-notif] APScheduler iniciado")


def shutdown_sisa_reservas_notifications_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
