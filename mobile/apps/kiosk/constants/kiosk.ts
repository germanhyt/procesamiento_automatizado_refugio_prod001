export const KIOSK_PLATFORM_OPTIONS = ['RAPPI', 'PEDIDOSYA', 'DIDI', 'OTROS'] as const;
export type KioskPlatform = (typeof KIOSK_PLATFORM_OPTIONS)[number];

export const KIOSK_DRIVER_POLLING_MS = 3000;

/** Escala tipográfica global del contenido (títulos dinámicos y ajustes en pantalla). */
export const KIOSK_CONTENT_FONT_SCALE = 1.09;

export const KIOSK_CODE_MAX_LEN = 32;
export const KIOSK_PLACA_MAX_LEN = 16;
/** DNI / documento numérico (PE u otros), solo dígitos en validación cliente. */
export const KIOSK_DNI_MIN_LEN = 8;
export const KIOSK_DNI_MAX_LEN = 12;
/** Carné de extranjería (alfanumérico, sin espacios). */
export const KIOSK_CE_MIN_LEN = 4;
export const KIOSK_CE_MAX_LEN = 20;

export const KIOSK_DOCUMENTO_TIPOS = ['DNI', 'CE'] as const;
export type KioskDocumentoTipo = (typeof KIOSK_DOCUMENTO_TIPOS)[number];

export const KIOSK_NUMPAD_KEYS: readonly string[] = [
  '1','2','3',
  '4','5','6',
  '7','8','9',
  '-','0','⌫',
] as const;

