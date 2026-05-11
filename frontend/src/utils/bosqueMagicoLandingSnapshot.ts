/**
 * Normaliza `payload_snapshot` del lead (eventDetails + items + totals desde la landing).
 * Tolerante a claves alternativas para no romper si el store cambia ligeramente.
 */

export type LandingEventRow = { label: string; value: string };

export type LandingLineItem = {
    label: string;
    qty: string;
    unit: string;
    line: string;
    /** Claves no mapeadas a columnas, para depuración en UI */
    extras?: string;
};

export type LandingTotalsRow = { label: string; value: string };

export type ParsedLandingSnapshot = {
    eventRows: LandingEventRow[];
    items: LandingLineItem[];
    totals: LandingTotalsRow[];
    /** true si reconocemos forma típica landing */
    isStructured: boolean;
};

function asRecord(v: unknown): Record<string, unknown> | null {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    return null;
}

function str(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
}

function formatMoney(n: number): string {
    if (!Number.isFinite(n)) return '—';
    try {
        return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 }).format(n);
    } catch {
        return `S/ ${n.toFixed(2)}`;
    }
}

function parseMoneyLoose(v: unknown): number | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).replace(/S\/?\s*/i, '').replace(/\s/g, '').replace(/,/g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

const EVENT_LABELS: [string, string][] = [
    ['clienteNombre', 'Cliente / celebrado'],
    ['celular', 'Celular'],
    ['correo', 'Correo'],
    ['fechaEvento', 'Fecha evento'],
    ['turno', 'Turno'],
    ['ninos', 'Niños'],
    ['ninos_estimados', 'Niños'],
    ['lugar', 'Lugar'],
    ['notas', 'Notas del cliente'],
    ['mensaje', 'Mensaje'],
];

function itemLabel(row: Record<string, unknown>): string {
    const keys = ['name', 'label', 'nombre', 'titulo', 'title', 'producto', 'descripcion', 'concepto'];
    for (const k of keys) {
        const x = row[k];
        if (x !== undefined && x !== null && String(x).trim() !== '') return String(x).trim();
    }
    const first =
        Object.entries(row).find(
            ([k, v]) => !/^(cantidad|qty|quantity|precio|price|total|subtotal)$/i.test(k) && typeof v === 'string' && String(v).trim()
        )?.[1] ?? '';
    return str(first).trim() || 'Concepto';
}

function itemExtras(row: Record<string, unknown>, used: Set<string>): string | undefined {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(row)) {
        if (used.has(k)) continue;
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'object') {
            parts.push(`${k}: ${JSON.stringify(v)}`);
            continue;
        }
        parts.push(`${k}: ${String(v)}`);
    }
    return parts.length ? parts.join(' · ') : undefined;
}

const LABEL_KEYS = ['name', 'label', 'nombre', 'titulo', 'title', 'producto', 'descripcion', 'concepto'] as const;
const QTY_KEYS = ['qty', 'quantity', 'cantidad', 'count', 'q', 'unidades'] as const;
const UNIT_KEYS = ['unitPrice', 'precioUnitario', 'precio_unitario', 'price', 'precio'] as const;
const LINE_KEYS = ['total', 'subtotal', 'lineTotal', 'importe'] as const;

function normalizeLine(row: unknown): LandingLineItem | null {
    const rec = asRecord(row);
    if (!rec) return null;
    const label = itemLabel(rec);

    let qtyRaw: unknown;
    for (const k of QTY_KEYS) {
        if (rec[k] !== undefined && rec[k] !== null && String(rec[k]).trim() !== '') {
            qtyRaw = rec[k];
            break;
        }
    }
    const qty = qtyRaw !== undefined ? str(qtyRaw) : '—';
    const qtyDisp = qty || '—';

    const unitNum = UNIT_KEYS.map((k) => parseMoneyLoose(rec[k])).find((n) => n != null) ?? null;

    const lineNum = LINE_KEYS.map((k) => parseMoneyLoose(rec[k])).find((n) => n != null) ?? null;

    const unit = unitNum != null ? formatMoney(unitNum) : '—';
    const line = lineNum != null ? formatMoney(lineNum) : '—';

    const used = new Set<string>([
        ...LABEL_KEYS.filter((k) => rec[k] != null),
        ...QTY_KEYS.filter((k) => rec[k] != null),
        ...UNIT_KEYS.filter((k) => rec[k] != null),
        ...LINE_KEYS.filter((k) => rec[k] != null),
    ]);

    const extras = itemExtras(rec, used);
    return { label, qty: qtyDisp, unit, line, extras };
}

const TOTAL_LABELS: [string, string][] = [
    ['grandTotal', 'Total estimado'],
    ['total', 'Total'],
    ['subtotal', 'Subtotal'],
    ['descuento', 'Descuento'],
    ['tax', 'Impuestos'],
    ['igv', 'IGV'],
    ['envio', 'Envío / logística'],
];

export function parseLandingSnapshot(snapshot: Record<string, unknown> | null): ParsedLandingSnapshot | null {
    if (!snapshot || typeof snapshot !== 'object') return null;

    const hasShape = 'eventDetails' in snapshot || 'items' in snapshot || 'totals' in snapshot;
    if (!hasShape) {
        return { eventRows: [], items: [], totals: [], isStructured: false };
    }

    const event = asRecord(snapshot.eventDetails);
    const eventRows: LandingEventRow[] = [];
    if (event) {
        const seen = new Set<string>();
        for (const [key, title] of EVENT_LABELS) {
            const v = event[key];
            if (v !== undefined && v !== null && String(v).trim() !== '') {
                eventRows.push({ label: title, value: str(v) });
                seen.add(key);
            }
        }
        for (const [k, v] of Object.entries(event)) {
            if (seen.has(k)) continue;
            if (v === null || v === undefined || String(v).trim() === '') continue;
            if (typeof v === 'object') {
                eventRows.push({ label: k, value: JSON.stringify(v) });
                continue;
            }
            eventRows.push({ label: k, value: String(v) });
        }
    }

    const rawItems = snapshot.items;
    const items: LandingLineItem[] = Array.isArray(rawItems)
        ? rawItems.map(normalizeLine).filter((x): x is LandingLineItem => x != null)
        : [];

    const totalsRec = asRecord(snapshot.totals);
    const totals: LandingTotalsRow[] = [];
    if (totalsRec) {
        const seenT = new Set<string>();
        for (const [key, title] of TOTAL_LABELS) {
            const v = totalsRec[key];
            const n = parseMoneyLoose(v);
            if (n != null) {
                totals.push({ label: title, value: formatMoney(n) });
                seenT.add(key);
            } else if (v !== undefined && v !== null && String(v).trim() !== '') {
                totals.push({ label: title, value: str(v) });
                seenT.add(key);
            }
        }
        for (const [k, v] of Object.entries(totalsRec)) {
            if (seenT.has(k)) continue;
            if (v === null || v === undefined || String(v).trim() === '') continue;
            const n = parseMoneyLoose(v);
            totals.push({ label: k, value: n != null ? formatMoney(n) : str(v) });
        }
    }

    return {
        eventRows,
        items,
        totals,
        isStructured: true,
    };
}
