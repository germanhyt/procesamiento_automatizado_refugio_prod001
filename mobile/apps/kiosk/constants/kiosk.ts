export const KIOSK_PLATFORM_OPTIONS = ['RAPPI', 'PEDIDOSYA'] as const;
export type KioskPlatform = (typeof KIOSK_PLATFORM_OPTIONS)[number];

export const KIOSK_DRIVER_POLLING_MS = 3000;

export const KIOSK_CODE_MAX_LEN = 32;
export const KIOSK_PLACA_MAX_LEN = 16;
/** DNI / documento numérico (PE u otros), solo dígitos en validación cliente. */
export const KIOSK_DNI_MIN_LEN = 8;
export const KIOSK_DNI_MAX_LEN = 12;

export const KIOSK_NUMPAD_KEYS: readonly string[] = [
  '1','2','3',
  '4','5','6',
  '7','8','9',
  '-','0','⌫',
] as const;

