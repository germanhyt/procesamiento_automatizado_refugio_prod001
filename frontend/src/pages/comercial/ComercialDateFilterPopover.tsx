import React, { useEffect, useRef, useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';

export const DATE_FILTER_HINT_RESERVAS =
    'Filtra por la fecha en que se guardó el registro en el sistema (alta), no por la fecha de la mesa.';

export const DATE_FILTER_HINT_EVENTOS =
    'Filtra por la fecha en que se guardó el lead en el sistema, no por la fecha tentativa del evento.';

function isoToDisplay(iso: string): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

export type ComercialDateFilterPopoverProps = {
    desde: string;
    hasta: string;
    onDesdeChange: (value: string) => void;
    onHastaChange: (value: string) => void;
    hint: string;
    /** id para accesibilidad del botón */
    id?: string;
};

const inputCls =
    'w-full rounded-xl border px-3 py-2 text-sm min-h-[40px] outline-none focus:ring-2 focus:ring-teal-500/35';

/**
 * Botón “Filtro por fecha” que abre un panel flotante con rango (alta en sistema).
 */
const ComercialDateFilterPopover: React.FC<ComercialDateFilterPopoverProps> = ({
    desde,
    hasta,
    onDesdeChange,
    onHastaChange,
    hint,
    id = 'comercial-date-filter-trigger',
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const active = Boolean(desde || hasta);
    const summary =
        desde && hasta
            ? `${isoToDisplay(desde)} → ${isoToDisplay(hasta)}`
            : desde
                ? `Desde ${isoToDisplay(desde)}`
                : hasta
                    ? `Hasta ${isoToDisplay(hasta)}`
                    : '';

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const el = wrapRef.current;
            if (el && e.target instanceof Node && !el.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const fieldStyle = { borderColor: 'var(--app-border)', backgroundColor: 'var(--app-input-bg)' } as const;

    return (
        <div className="relative shrink-0" ref={wrapRef}>
            <button
                type="button"
                id={id}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen((o) => !o)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left min-h-[42px] transition-colors ${active ? 'border-teal-500/50 bg-teal-500/5' : ''
                    } hover:border-teal-500/40`}
                style={{ borderColor: active ? undefined : 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
            >
                <CalendarRange size={16} className="text-teal-500 shrink-0" aria-hidden />
                <span className="flex flex-col min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-widest text-app-muted leading-none">
                        Filtro por fecha
                    </span>
                    {summary ? (
                        <span className="text-[11px] font-mono text-teal-400/95 mt-1 truncate max-w-[200px]">{summary}</span>
                    ) : (
                        <span className="text-[10px] text-app-muted mt-0.5">Alta en sistema</span>
                    )}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-app-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden
                />
            </button>

            {open && (
                <div
                    className="absolute left-0 top-full z-140 mt-2 w-[min(100vw-2rem,320px)] rounded-2xl border p-4 shadow-2xl"
                    style={{
                        backgroundColor: 'var(--app-panel)',
                        borderColor: 'var(--app-border)',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
                    }}
                    role="dialog"
                    aria-labelledby={id}
                >
                    <p className="text-[10px] font-black uppercase tracking-widest text-teal-500/90 mb-3">
                        Rango · alta en sistema
                    </p>
                    <div className="space-y-3">
                        <label className="block">
                            <span className="text-[9px] font-semibold text-app-muted uppercase tracking-wide">Desde</span>
                            <input
                                type="date"
                                className={`${inputCls} mt-1`}
                                style={fieldStyle}
                                value={desde}
                                onChange={(e) => onDesdeChange(e.target.value)}
                            />
                        </label>
                        <label className="block">
                            <span className="text-[9px] font-semibold text-app-muted uppercase tracking-wide">Hasta</span>
                            <input
                                type="date"
                                className={`${inputCls} mt-1`}
                                style={fieldStyle}
                                value={hasta}
                                onChange={(e) => onHastaChange(e.target.value)}
                            />
                        </label>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            disabled={!active}
                            onClick={() => {
                                onDesdeChange('');
                                onHastaChange('');
                            }}
                            className="text-[10px] font-bold uppercase tracking-wide text-teal-500 hover:text-teal-400 disabled:opacity-30 disabled:pointer-events-none"
                        >
                            Limpiar fechas
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide"
                            style={{ borderColor: 'var(--app-border)' }}
                        >
                            Cerrar
                        </button>
                    </div>
                    {/* <p className="mt-3 pt-3 border-t text-[9px] text-app-muted leading-relaxed" style={{ borderColor: 'var(--app-border)' }}>
                        {hint}
                    </p> */}
                </div>
            )}
        </div>
    );
};

export default ComercialDateFilterPopover;
