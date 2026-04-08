# -*- coding: utf-8 -*-
"""Job diario: evalúa pendientes y POST a Webhook n8n (hora America/Lima en BD)."""
from __future__ import annotations

import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError

logger = logging.getLogger(__name__)

JOB_ID = "notificaciones_envio_diario"
_TZ = ZoneInfo("America/Lima")
_scheduler: BackgroundScheduler | None = None


def ensure_notificaciones_envio_n8n_columns() -> None:
    """ALTER ADD COLUMN si la tabla ya existía sin columnas de Webhook n8n."""
    from app.database import engine

    stmts = (
        "ALTER TABLE notificaciones_envio_config ADD COLUMN IF NOT EXISTS n8n_webhook_url TEXT",
        "ALTER TABLE notificaciones_envio_config ADD COLUMN IF NOT EXISTS n8n_webhook_secret VARCHAR(512)",
    )
    try:
        with engine.begin() as conn:
            for sql in stmts:
                conn.execute(text(sql))
    except Exception as exc:  # noqa: BLE001
        logger.warning("[notificaciones] no se pudieron asegurar columnas n8n: %s", exc)


def ensure_notificaciones_envio_table() -> None:
    """
    Crea notificaciones_envio_config si no existe y deja fila id=1 (equivalente a patch_db_notificaciones).
    Así `python main.py` arranca sin ejecutar el script de patch antes.
    """
    from app.database import engine, SessionLocal
    from app.models.notificaciones_config import NotificacionesEnvioConfig

    try:
        NotificacionesEnvioConfig.__table__.create(engine, checkfirst=True)
    except (OperationalError, ProgrammingError) as exc:
        logger.warning("[notificaciones] no se pudo crear tabla notificaciones_envio_config: %s", exc)
        return
    except Exception as exc:  # noqa: BLE001
        logger.warning("[notificaciones] error creando tabla envio_config: %s", exc)
        return

    ensure_notificaciones_envio_n8n_columns()

    db = SessionLocal()
    try:
        if db.get(NotificacionesEnvioConfig, 1) is None:
            db.add(
                NotificacionesEnvioConfig(
                    id=1,
                    schedule_enabled=False,
                    schedule_hour=9,
                    schedule_minute=0,
                )
            )
            db.commit()
            logger.info("[notificaciones] insertada fila id=1 en notificaciones_envio_config")
    except Exception as exc:  # noqa: BLE001
        logger.warning("[notificaciones] seed id=1 envio_config: %s", exc)
        db.rollback()
    finally:
        db.close()


def _tick_programado() -> None:
    from app.database import SessionLocal
    from app.models.notificaciones_config import NotificacionesEnvioConfig
    from app.services import notificaciones_n8n as n8n
    from app.services.notificaciones_service import resolver_periodo_notificaciones

    db = SessionLocal()
    try:
        cfg = db.get(NotificacionesEnvioConfig, 1)
        if not cfg or not cfg.schedule_enabled:
            return
        pi, pf, etiqueta, rodante = resolver_periodo_notificaciones(
            "ultima_semana",
            dias=None,
            fecha_inicio=None,
            fecha_fin=None,
        )
        out = n8n.ejecutar_envio_n8n_desde_evaluacion(
            db,
            trigger="schedule",
            modo="ultima_semana",
            periodo_inicio=pi,
            periodo_fin=pf,
            etiqueta=etiqueta,
            ventana_rodante=rodante,
        )
        logger.info("[notificaciones] job programado resultado: %s", out)
    except Exception:  # noqa: BLE001
        logger.exception("[notificaciones] error en job programado")
    finally:
        db.close()


def start_notificaciones_scheduler() -> None:
    global _scheduler
    try:
        ensure_notificaciones_envio_table()
    except Exception:  # noqa: BLE001
        logger.exception("[notificaciones] ensure_notificaciones_envio_table falló")

    if _scheduler is not None and _scheduler.running:
        try:
            refresh_notificaciones_cron_job()
        except Exception:  # noqa: BLE001
            logger.exception("[notificaciones] refresh cron (scheduler ya activo)")
        return
    _scheduler = BackgroundScheduler(timezone=_TZ)
    _scheduler.start()
    try:
        refresh_notificaciones_cron_job()
    except Exception:  # noqa: BLE001
        logger.exception("[notificaciones] refresh cron al iniciar APScheduler")
    logger.info("[notificaciones] APScheduler iniciado (America/Lima)")


def shutdown_notificaciones_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None


def refresh_notificaciones_cron_job() -> None:
    from app.database import SessionLocal
    from app.models.notificaciones_config import NotificacionesEnvioConfig

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
            cfg = db.get(NotificacionesEnvioConfig, 1)
        except (OperationalError, ProgrammingError) as exc:
            logger.warning("[notificaciones] cron no registrado (BD/tabla): %s", exc)
            return
        if not cfg or not cfg.schedule_enabled:
            logger.info("[notificaciones] cron desactivado o sin fila id=1")
            return
        h, m = int(cfg.schedule_hour), int(cfg.schedule_minute)
        sched.add_job(
            _tick_programado,
            CronTrigger(hour=h, minute=m, timezone=_TZ),
            id=JOB_ID,
            replace_existing=True,
        )
        logger.info("[notificaciones] cron registrado %02d:%02d America/Lima", h, m)
    finally:
        db.close()
