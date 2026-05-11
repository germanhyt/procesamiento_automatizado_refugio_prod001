import React from 'react';

import { parseLandingSnapshot } from '@/utils/bosqueMagicoLandingSnapshot';

type Props = {
    payload_snapshot: Record<string, unknown> | null;
    /** Título de sección */
    title?: string;
    /** En modal: tipografía y paddings un poco más compactos */
    compact?: boolean;
};

/**
 * Vista legible del armado/precios enviado desde la landing (sustituye mostrar solo JSON al usuario).
 */
const BosqueMagicoLandingSnapshotCard: React.FC<Props> = ({
    payload_snapshot,
    title = 'Solicitud armada en la web',
    compact,
}) => {
    const parsed = React.useMemo(() => parseLandingSnapshot(payload_snapshot), [payload_snapshot]);

    if (!parsed) return null;

    const th = compact ? 'px-2 py-1.5 text-[9px]' : 'px-3 py-2 text-[10px]';
    const td = compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs';

    if (!parsed.isStructured) {
        return (
            <div className="rounded-2xl border border-dashed border-app-border bg-app-input/15 p-4 text-sm text-app-muted">
                Sin formato de landing reconocido. Use “Datos técnicos (JSON)” para ver el contenido bruto.
            </div>
        );
    }

    const hasContent = parsed.eventRows.length > 0 || parsed.items.length > 0 || parsed.totals.length > 0;

    if (!hasContent) {
        return (
            <div className="rounded-2xl border border-app-border bg-app-input/15 p-4 text-sm text-app-muted">
                Snapshot vacío o incompleto.
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-app-border bg-app-card/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-app-border bg-app-input/25">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-app-muted">{title}</h3>
                <p className="text-[10px] text-app-muted mt-1 normal-case font-normal tracking-normal">
                    Totales orientativos según lo que eligió el visitante en el cotizador; la cotización formal del CRM puede
                    ajustarse.
                </p>
            </div>

            {parsed.eventRows.length > 0 && (
                <div className={`${compact ? 'p-3' : 'p-4'} border-b border-app-border/80`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-2">Evento y contacto</p>
                    <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {parsed.eventRows.map((r, i) => (
                            <div key={`ev-${i}`}>
                                <dt className="text-[10px] text-app-muted font-semibold">{r.label}</dt>
                                <dd className="text-app-text break-words">{r.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}

            {parsed.items.length > 0 && (
                <div className={`${compact ? 'p-3' : 'p-4'} border-b border-app-border/80 overflow-x-auto`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-2">Ítems</p>
                    <table className="w-full min-w-[420px] text-left border-collapse">
                        <thead>
                            <tr className="border-b border-app-border text-app-muted">
                                <th className={`font-black uppercase tracking-wider ${th}`}>Concepto</th>
                                <th className={`font-black uppercase tracking-wider whitespace-nowrap ${th}`}>Cant.</th>
                                <th className={`font-black uppercase tracking-wider whitespace-nowrap ${th}`}>P. unit.</th>
                                <th className={`font-black uppercase tracking-wider whitespace-nowrap text-right ${th}`}>
                                    Importe
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {parsed.items.map((row, i) => (
                                <tr key={i} className="border-b border-app-border/60 align-top">
                                    <td className={`${td} text-app-text`}>
                                        <span className="font-medium">{row.label}</span>
                                        {row.extras && (
                                            <span className="block text-[10px] text-app-muted mt-0.5 font-normal">{row.extras}</span>
                                        )}
                                    </td>
                                    <td className={`${td} font-mono text-app-text-secondary whitespace-nowrap`}>{row.qty}</td>
                                    <td className={`${td} font-mono text-app-text-secondary whitespace-nowrap`}>{row.unit}</td>
                                    <td className={`${td} font-mono text-right text-app-text`}>{row.line}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {parsed.totals.length > 0 && (
                <div className={`${compact ? 'p-3' : 'p-4'} bg-app-input/20`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-app-muted mb-2">Totales</p>
                    <ul className="space-y-1.5 text-sm">
                        {parsed.totals.map((t, i) => (
                            <li key={`tot-${i}`} className="flex justify-between gap-4 border-b border-app-border/40 pb-1.5 last:border-0">
                                <span className="text-app-muted">{t.label}</span>
                                <span className="font-mono font-semibold text-app-text">{t.value}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default BosqueMagicoLandingSnapshotCard;
