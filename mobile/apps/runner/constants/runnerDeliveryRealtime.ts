/** Límite de filas UI para cola “driver en kiosko” en el dashboard. */
export const KIOSK_DRIVER_ALERTS_MAX = 30;

/** Contrato WS backend: `payload.source` al marcar LISTO desde Fidelio. */
export const WS_ORDER_SOURCE_FIDELIO_WEBHOOK = 'fidelio_webhook';

export const WS_ORDER_STATUS_LISTO = 'LISTO';

/** Contrato WS: `payload.kind` para nuevo driver esperando (kiosk). */
export const WS_DRIVER_KIND_NUEVO_ESPERANDO = 'NUEVO_DRIVER_ESPERANDO';
