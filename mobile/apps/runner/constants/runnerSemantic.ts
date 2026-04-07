/**
 * Colores semánticos fijos (Tailwind-like) para iconos y badges
 * donde no usamos tokens del tema dinámico.
 */
export const SEMANTIC_EMERALD_500 = '#10b981';
export const SEMANTIC_AMBER_500 = '#f59e0b';
export const SEMANTIC_BLUE_500 = '#3b82f6';
export const SEMANTIC_ZINC_500 = '#6b7280';

/** Mismo hex que `RunnerPalette.accent` (tema claro/oscuro). */
export const RUNNER_BRAND_ACCENT_HEX = '#00cc99';

/** Indicador de conexión WS en barra de kiosko (legible en claro/oscuro). */
export const RUNNER_WS_DOT = {
  error: '#ef4444',
  warn: '#f59e0b',
  ok: '#22c55e',
} as const;

/** Fondos suaves para iconos de fila en inbox (opacidad sobre blanco). */
export const RUNNER_INBOX_ICON_BG = {
  listo: 'rgba(16,185,129,0.15)',
  driver: 'rgba(245,158,11,0.15)',
} as const;
