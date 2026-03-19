export type KioskThemeMode = 'dark' | 'light';

export interface KioskPalette {
  bg: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  topBarBg: string;
  topBarBorder: string;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  placeholder: string;
  modalOverlay: string;
  modalBg: string;
  modalBorder: string;
  error: string;
  successBg: string;
  successBorder: string;
  dangerBg: string;
  dangerBorder: string;
  infoBg: string;
  infoBorder: string;
  themeToggleBg: string;
  themeToggleBorder: string;
}

export const KIOSK_PALETTE: Record<KioskThemeMode, KioskPalette> = {
  dark: {
    bg: '#050505',
    text: '#ffffff',
    muted: '#6b7280',
    border: 'rgba(255,255,255,0.08)',
    accent: '#14b8a6',
    accentText: '#000000',
    topBarBg: '#050505',
    topBarBorder: 'rgba(255,255,255,0.08)',
    cardBg: 'rgba(255,255,255,0.03)',
    cardBorder: 'rgba(255,255,255,0.08)',
    inputBg: 'rgba(0,0,0,0.35)',
    inputBorder: 'rgba(255,255,255,0.12)',
    inputText: '#ffffff',
    placeholder: '#6b7280',
    modalOverlay: 'rgba(0,0,0,0.7)',
    modalBg: '#0b0b0b',
    modalBorder: 'rgba(255,255,255,0.12)',
    error: '#ef4444',
    successBg: 'rgba(16,185,129,0.08)',
    successBorder: 'rgba(16,185,129,0.25)',
    dangerBg: 'rgba(239,68,68,0.08)',
    dangerBorder: 'rgba(239,68,68,0.25)',
    infoBg: 'rgba(59,130,246,0.08)',
    infoBorder: 'rgba(59,130,246,0.25)',
    themeToggleBg: 'rgba(255,255,255,0.06)',
    themeToggleBorder: 'rgba(255,255,255,0.12)',
  },
  light: {
    bg: '#f4f6f9',
    text: '#18181b',
    muted: '#52525b',
    border: 'rgba(0,0,0,0.12)',
    accent: '#0d9488',
    accentText: '#ffffff',
    topBarBg: '#ffffff',
    topBarBorder: 'rgba(0,0,0,0.12)',
    cardBg: '#ffffff',
    cardBorder: 'rgba(0,0,0,0.10)',
    inputBg: '#f4f4f5',
    inputBorder: 'rgba(0,0,0,0.12)',
    inputText: '#18181b',
    placeholder: '#71717a',
    modalOverlay: 'rgba(0,0,0,0.45)',
    modalBg: '#ffffff',
    modalBorder: 'rgba(0,0,0,0.12)',
    error: '#dc2626',
    successBg: 'rgba(16,185,129,0.12)',
    successBorder: 'rgba(16,185,129,0.35)',
    dangerBg: 'rgba(239,68,68,0.1)',
    dangerBorder: 'rgba(239,68,68,0.35)',
    infoBg: 'rgba(59,130,246,0.1)',
    infoBorder: 'rgba(59,130,246,0.3)',
    themeToggleBg: '#ffffff',
    themeToggleBorder: 'rgba(0,0,0,0.14)',
  },
};
