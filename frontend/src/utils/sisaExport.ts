import { listSisaReservas, listSisaZonas, type SisaReservaRegistro } from '@/services/sisaReservasService';

function csvEscape(cell: string | number | null | undefined): string {
    const s = cell == null ? '' : String(cell);
    return `"${s.replace(/"/g, '""')}"`;
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/** Descarga todas las reservas accesibles (paginado) en CSV con nombre de zona. */
export async function exportSisaReservasCsv(token: string): Promise<void> {
    const zonas = await listSisaZonas(token);
    const zonaNombre = Object.fromEntries(zonas.map((z) => [z.id, z.nombre]));

    const rows: SisaReservaRegistro[] = [];
    let skip = 0;
    const limit = 500;
    for (;;) {
        const page = await listSisaReservas(token, { skip, limit });
        rows.push(...page.items);
        if (page.items.length < limit) break;
        skip += limit;
        if (skip > 20_000) break;
    }

    const header = [
        'id',
        'fecha_reserva',
        'hora_reserva',
        'motivo_reserva',
        'numero_personas',
        'zona',
        'mesa_id',
        'nombre_completo',
        'telefono',
        'email',
        'estado',
        'comentario',
        'created_at',
    ];

    const lines = [
        header.join(','),
        ...rows.map((r) =>
            [
                csvEscape(r.id),
                csvEscape(r.fecha_reserva),
                csvEscape(r.hora_reserva),
                csvEscape(r.motivo_reserva),
                csvEscape(r.numero_personas),
                csvEscape(zonaNombre[r.zona_id] ?? r.zona_id),
                csvEscape(r.mesa_id),
                csvEscape(r.nombre_completo),
                csvEscape(`${r.codigo_telefonico} ${r.numero_telefono}`),
                csvEscape(r.email),
                csvEscape(r.estado),
                csvEscape(r.comentario),
                csvEscape(r.created_at),
            ].join(',')
        ),
    ];

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadTextFile(`sisa_reservas_${stamp}.csv`, lines.join('\n'));
}
