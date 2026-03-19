---
name: ui-ux-refugio
description: Aplica diseño UX/UI minimalista, intuitivo y acorde al logo del sistema Refugio Data. Usar al crear o modificar componentes, páginas, estilos, variables CSS, Tailwind, o paleta de colores.
---

# UI/UX Refugio Data

Experto en diseño, estilos y experiencia de usuario. Respetar paleta, variables y convenciones del proyecto.

## Variables CSS (Tailwind @theme)

Definidas en `frontend/src/index.css`:

```css
--color-refugio-dark: #0a0a0a;
--color-refugio-card: #1a1a1a;
--color-refugio-primary: #3b82f6;
--color-refugio-secondary: #6366f1;
--color-refugio-muted: #a1a1aa;
```

## Paleta

| Uso | Color | Clase |
|-----|-------|-------|
| Fondo oscuro | #0a0a0a, #050505, #080808 | `bg-[#050505]`, `bg-zinc-950` |
| Cards | #1a1a1a | `bg-[#1a1a1a]` |
| Primary | #3b82f6 | `text-refugio-primary`, `bg-blue-500` |
| Secondary | #6366f1 | `text-refugio-secondary` |
| Muted | #a1a1aa | `text-refugio-muted` |
| Labels | zinc-500 | `text-zinc-500` |
| Bordes | white/5 | `border-white/5` |
| Acentos | teal-500 | `teal-500` (hover, loading) |

## Clases

- `text-refugio-muted` – Labels y texto secundario
- `bg-[#050505]`, `bg-[#080808]` – Fondos oscuros
- `text-zinc-100`, `text-zinc-500` – Texto
- `border-white/5` – Bordes sutiles

## Badges (estados)

Usar `orderStatusBadgeClass()` en `constants/delivery.ts`; colores por estado:
- LISTO: emerald
- PENDIENTE_RECOJO: amber
- PROCESO_ENTREGA: blue
- LISTO_PARA_ENTREGAR: teal
- ENTREGADO: zinc
- DEVOLUCION: orange
- CANCELADO: red

## Loading

```tsx
<div className="w-12 h-12 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
```

## Principios

1. **Minimalista:** Sin elementos innecesarios
2. **Intuitivo:** UX clara y predecible
3. **Amigable:** Accesible y legible
4. **Acorde al logo:** Paleta oscura, azul/índigo, teal como acento

## Mobile

- `constants/Colors.ts` en kiosk y runner: light/dark; tint, text, background, tabIconDefault, tabIconSelected
