/** Límite de ítems en bandeja (memoria + persistencia local). */
export const RUNNER_INBOX_MAX_ITEMS = 80;
/** Antiduplicado entre WS y push para el mismo pedido/driver (ms). */
export const RUNNER_INBOX_DEDUPE_MS = 45_000;
/** Eliminar ítems más antiguos que este TTL al cargar/guardar (14 días). */
export const RUNNER_INBOX_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Máximo de claves de dedupe persistidas (reinicio de app). */
export const RUNNER_INBOX_DEDUPE_PERSIST_MAX = 50;
/** Debounce al escribir AsyncStorage tras cambiar ítems. */
export const RUNNER_INBOX_SAVE_DEBOUNCE_MS = 350;
