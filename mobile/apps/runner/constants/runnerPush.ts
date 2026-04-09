/**
 * Push Expo / FCM — alineado con `backend/app/core/delivery_constants.py`
 * (`RUNNER_PUSH_DATA_TYPE_*`, canal Android).
 *
 * Si cambias valores en el backend, actualízalos aquí y en `app.json` → `defaultChannel`.
 */
export const RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO = 'PEDIDO_LISTO' as const;
export const RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO = 'NUEVO_DRIVER_ESPERANDO' as const;
export const RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH = 'KIOSK_MATCH' as const;

/** Mismo id que `plugins.expo-notifications.defaultChannel` en app.json */
export const RUNNER_ANDROID_NOTIFICATION_CHANNEL_ID = 'delivery-runner' as const;

export type RunnerInboxItemKind =
  | typeof RUNNER_PUSH_DATA_TYPE_PEDIDO_LISTO
  | typeof RUNNER_PUSH_DATA_TYPE_NUEVO_DRIVER_ESPERANDO
  | typeof RUNNER_PUSH_DATA_TYPE_KIOSK_MATCH;
