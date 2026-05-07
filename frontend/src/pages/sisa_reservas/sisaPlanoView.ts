import type { SisaPlanoResponse } from '@/services/sisaReservasService';

/** Radio del nodo mesa en unidades del plano (SVG). */
export const PLANO_NODE_R = 16;

export function computeViewBox(data: SisaPlanoResponse, nodeR: number): string {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const expand = (x: number, y: number, w = 0, h = 0) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
    };

    for (const slot of data.zonas) {
        const z = slot.zona;
        if (z.width <= 0 || z.height <= 0) {
            expand(z.pos_x, z.pos_y, 120, 80);
        } else {
            expand(z.pos_x, z.pos_y, z.width, z.height);
        }
        for (const { mesa: m } of slot.mesas) {
            const cx = z.pos_x + m.pos_x + nodeR;
            const cy = z.pos_y + m.pos_y + nodeR;
            expand(cx - nodeR - 4, cy - nodeR - 4, nodeR * 2 + 8, nodeR * 2 + 28);
        }
    }

    if (!Number.isFinite(minX)) {
        return '0 0 640 360';
    }
    const pad = 24;
    const w = Math.max(280, maxX - minX + pad * 2);
    const h = Math.max(200, maxY - minY + pad * 2);
    return `${minX - pad} ${minY - pad} ${w} ${h}`;
}
