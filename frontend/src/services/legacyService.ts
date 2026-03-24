import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;
const LEGACY = `${API_URL}/procesamiento/legacy`;

export type ModoRango = 'semana_actual' | 'ultima_semana' | 'rango_libre';

export function buildRangoParams(modo: ModoRango, fechaInicio: string, fechaFin: string): Record<string, string | undefined> {
    const p: Record<string, string | undefined> = { modo_rango: modo };
    if (modo === 'rango_libre') {
        p.fecha_inicio = fechaInicio || undefined;
        p.fecha_fin = fechaFin || undefined;
    }
    return p;
}

export async function postLegacyConsolidar(modo: ModoRango, fechaInicio: string, fechaFin: string) {
    return axios.post(`${LEGACY}/consolidar`, null, { params: buildRangoParams(modo, fechaInicio, fechaFin) });
}

export async function postLegacyAsociar(modo: ModoRango, fechaInicio: string, fechaFin: string) {
    return axios.post(`${LEGACY}/asociar`, null, { params: buildRangoParams(modo, fechaInicio, fechaFin) });
}

export async function postLegacyConvertir() {
    return axios.post(`${LEGACY}/convertir`);
}

export async function postLegacyCargarVentas(clear: boolean, archivarPendientesTrasConsolidado = false) {
    return axios.post(`${LEGACY}/cargar-ventas`, null, {
        params: {
            clear,
            archivar_pendientes_tras_consolidado: archivarPendientesTrasConsolidado,
        },
    });
}

export async function postLegacyCargarBigQuery() {
    return axios.post(`${LEGACY}/cargar-bigquery`);
}

export async function getLegacyArchivos() {
    return axios.get(`${LEGACY}/archivos`);
}

export async function getLegacyNegocios() {
    return axios.get(`${LEGACY}/negocios`);
}

export async function postLegacySubir(file: File, locatarioCodigo: string) {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post(`${LEGACY}/subir`, formData, {
        params: { locatario_codigo: locatarioCodigo },
    });
}

export async function postGuardarAsociacion(archivo: string, codigo: string, inicio: string, fin: string) {
    return axios.post(`${LEGACY}/guardar-asociacion`, null, {
        params: { archivo, codigo, inicio, fin },
    });
}

export async function getPreviewSales(limit = 100, offset = 0) {
    return axios.get(`${LEGACY}/preview-sales`, { params: { limit, offset } });
}

export async function getPreviewRealizadas(limit = 100) {
    return axios.get(`${LEGACY}/preview-realizadas`, { params: { limit } });
}
