import React, { useMemo } from 'react';

import { sisaEstadoLabel } from '@/constants/sisaReservas';
import type { SisaPlanoOccupancy, SisaPlanoResponse, SisaReservaRegistro } from '@/services/sisaReservasService';

import { MESA_EMPTY_FILL, MESA_STROKE, mesaFillForEstado } from '@/pages/sisa_reservas/sisaPlanoColors';
import { computeViewBox, PLANO_NODE_R } from '@/pages/sisa_reservas/sisaPlanoView';

function isRegistroPlano(r: SisaPlanoOccupancy): r is SisaReservaRegistro {
    return typeof (r as SisaReservaRegistro).id === 'number';
}

export type SisaPlanoMiniPickerProps = {
    data: SisaPlanoResponse | null;
    loading?: boolean;
    selectedMesaId: number | null;
    excludeReservaId?: number | null;
    onPickMesa: (zonaId: number, mesaId: number) => void;
    selectedZonaId?: number | null;
    onPickZona?: (zonaId: number) => void;
    privacyMode?: boolean;
    tone?: 'app' | 'public';
    className?: string;
};

const EMPTY_FILL_PUBLIC = 'rgba(18, 81, 40, 0.2)';
const STROKE_PUBLIC = 'rgba(59, 53, 46, 0.42)';

const SisaPlanoMiniPicker: React.FC<SisaPlanoMiniPickerProps> = ({
    data,
    loading,
    selectedMesaId,
    excludeReservaId = null,
    onPickMesa,
    selectedZonaId = null,
    onPickZona,
    privacyMode = false,
    tone = 'app',
    className = '',
}) => {
    const viewBox = useMemo(
        () => (data && data.zonas.length > 0 ? computeViewBox(data, PLANO_NODE_R) : '0 0 640 360'),
        [data]
    );
    const vb = useMemo(() => viewBox.split(' ').map(Number) as [number, number, number, number], [viewBox]);

    const wrapperPanel =
        tone === 'public'
            ? 'rounded-xl border border-black/10 overflow-hidden bg-white/92 max-h-[min(38vh,300px)] overflow-y-auto touch-pan-x touch-pan-y shadow-sm'
            : 'rounded-xl border border-app-border overflow-hidden bg-app-panel max-h-[min(36vh,260px)] overflow-y-auto touch-pan-x touch-pan-y';

    if (loading) {
        return (
            <div
                className={
                    tone === 'public'
                        ? `rounded-xl border border-black/10 bg-white/85 flex items-center justify-center min-h-[148px] ${className}`
                        : `rounded-xl border border-app-border bg-app-panel flex items-center justify-center min-h-[160px] ${className}`
                }
            >
                <div
                    className="w-8 h-8 border-[3px] rounded-full animate-spin border-t-transparent"
                    style={{ borderColor: 'var(--app-sisa-reservas-accent-muted)' }}
                />
            </div>
        );
    }

    if (!data || data.zonas.length === 0) {
        return (
            <p className={`text-[10px] ${tone === 'public' ? 'text-stone-600' : 'text-app-muted'} ${className}`}>
                No hay datos de plano para esta fecha y hora. Defina zonas y mesas en «Zonas y mesas».
            </p>
        );
    }

    const emptyFill = tone === 'public' ? EMPTY_FILL_PUBLIC : MESA_EMPTY_FILL;
    const baseStroke = tone === 'public' ? STROKE_PUBLIC : MESA_STROKE;
    const mesaNumOnFill = tone === 'public' ? '#fafaf9' : 'rgba(248,243,238,0.95)';
    const mesaNumEmpty = tone === 'public' ? '#1c1917' : mesaNumOnFill;

    function occupancyTitle(mesaNum: string, occ: SisaPlanoOccupancy | null, inactive: boolean): string {
        if (inactive) return `Mesa ${mesaNum} · inactiva`;
        if (!occ) return `Mesa ${mesaNum} · libre — clic para elegir`;
        if (privacyMode || !isRegistroPlano(occ)) {
            return `Mesa ${mesaNum} · ocupada (${occ.numero_personas} p. · ${sisaEstadoLabel(occ.estado)})`;
        }
        return `Mesa ${mesaNum} · ${occ.nombre_completo} · ${sisaEstadoLabel(occ.estado)}`;
    }

    return (
        <>
            <div className={`space-y-2 ${className}`}>
                <div className={wrapperPanel}>
                    <svg
                        className="w-full block select-none"
                        style={{ height: 'auto', minHeight: 132 }}
                        viewBox={viewBox}
                        preserveAspectRatio="xMidYMid meet"
                    >
                        <rect
                            x={vb[0]}
                            y={vb[1]}
                            width={vb[2]}
                            height={vb[3]}
                            fill={tone === 'public' ? 'rgba(18,81,40,0.05)' : 'rgba(0,0,0,0.12)'}
                        />
                        {data.zonas.map((slot) => {
                            const z = slot.zona;
                            const zx = z.pos_x;
                            const zy = z.pos_y;
                            const w = z.width > 0 ? z.width : 160;
                            const h = z.height > 0 ? z.height : 100;
                            const zSelected = selectedZonaId != null && selectedZonaId === z.id;
                            const stroke = zSelected ? '#125128' : z.color && /^#/.test(z.color) ? z.color : '#288248';
                            const strokeW = zSelected ? 3 : 2;
                            const zFill = tone === 'public' ? 'rgba(40, 130, 72, 0.07)' : 'rgba(40, 130, 72, 0.06)';
                            return (
                                <g key={z.id}>
                                    <rect
                                        x={zx}
                                        y={zy}
                                        width={w}
                                        height={h}
                                        rx={8}
                                        fill={zFill}
                                        stroke={stroke}
                                        strokeWidth={strokeW}
                                        strokeOpacity={tone === 'public' ? 0.55 : 0.5}
                                        style={{ cursor: onPickZona ? 'pointer' : 'default' }}
                                        onClick={() => onPickZona?.(z.id)}
                                        onKeyDown={(e) => {
                                            if (!onPickZona) return;
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onPickZona(z.id);
                                            }
                                        }}
                                        {...(onPickZona ? ({ role: 'button', tabIndex: 0 } as const) : {})}
                                    />
                                    <text
                                        x={zx + 8}
                                        y={zy + 16}
                                        fill={tone === 'public' ? '#44403c' : 'var(--app-text-secondary)'}
                                        pointerEvents="none"
                                        style={{ fontSize: 11, fontWeight: 800 }}
                                    >
                                        {z.nombre}
                                    </text>
                                    {slot.mesas.map(({ mesa: m, reserva }) => {
                                        const raw = reserva as SisaPlanoOccupancy | null;
                                        const excluded =
                                            excludeReservaId != null &&
                                            raw !== null &&
                                            isRegistroPlano(raw) &&
                                            raw.id === excludeReservaId;
                                        const effectiveR = excluded ? null : raw;
                                        const inactive = !m.is_active;
                                        const occupied = !!effectiveR;
                                        const pickable = m.is_active && !occupied;
                                        const selected = selectedMesaId === m.id;
                                        const px = m.pos_x;
                                        const py = m.pos_y;
                                        const cx = zx + px + PLANO_NODE_R;
                                        const cy = zy + py + PLANO_NODE_R;
                                        const fill = inactive
                                            ? 'rgba(100,100,100,0.25)'
                                            : effectiveR
                                                ? mesaFillForEstado(effectiveR.estado)
                                                : emptyFill;
                                        const strokeWmesa = selected ? 3.5 : 2;
                                        const strokeCol = selected ? 'var(--app-sisa-reservas-accent-strong)' : baseStroke;
                                        const numeroFill = inactive ? 'rgba(110,110,110,0.92)' : effectiveR ? mesaNumOnFill : mesaNumEmpty;
                                        const title = occupancyTitle(m.numero, effectiveR, inactive);
                                        return (
                                            <g key={m.id}>
                                                <title>{title}</title>
                                                <circle
                                                    role={pickable ? 'button' : undefined}
                                                    tabIndex={pickable ? 0 : undefined}
                                                    cx={cx}
                                                    cy={cy}
                                                    r={PLANO_NODE_R}
                                                    fill={fill}
                                                    stroke={strokeCol}
                                                    strokeWidth={strokeWmesa}
                                                    style={{
                                                        cursor: pickable ? 'pointer' : inactive ? 'not-allowed' : 'default',
                                                        opacity: inactive ? 0.45 : 1,
                                                    }}
                                                    onClick={() => {
                                                        if (!pickable) return;
                                                        onPickZona?.(z.id);
                                                        onPickMesa(z.id, m.id);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (!pickable) return;
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            onPickZona?.(z.id);
                                                            onPickMesa(z.id, m.id);
                                                        }
                                                    }}
                                                />
                                                <text
                                                    x={cx}
                                                    y={cy + 4}
                                                    textAnchor="middle"
                                                    fill={numeroFill}
                                                    pointerEvents="none"
                                                    style={{ fontSize: 10, fontWeight: 900 }}
                                                >
                                                    {m.numero}
                                                </text>
                                                {effectiveR ? (
                                                    <text
                                                        x={cx}
                                                        y={cy + PLANO_NODE_R + 11}
                                                        textAnchor="middle"
                                                        fill={tone === 'public' ? '#57534e' : 'var(--app-muted)'}
                                                        pointerEvents="none"
                                                        style={{ fontSize: 7, fontWeight: 700 }}
                                                    >
                                                        {effectiveR.numero_personas}p · {sisaEstadoLabel(effectiveR.estado).slice(0, 3)}
                                                    </text>
                                                ) : null}
                                            </g>
                                        );
                                    })}
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>

            <div className='py-1 px-2'>
                <p className={`text-[9px] leading-snug ${tone === 'public' ? 'text-stone-600' : 'text-app-muted'}`}>
                    Toque una mesa <span className={tone === 'public' ? 'font-semibold text-stone-800' : 'text-app-text'}>libre</span> para elegirla.
                    {privacyMode ? <> Solo se muestra ocupación agregada, sin datos personales.</> : null}
                </p>
            </div>

        </>
    );
};

export default SisaPlanoMiniPicker;
