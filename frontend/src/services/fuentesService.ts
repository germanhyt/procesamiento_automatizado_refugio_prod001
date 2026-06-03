import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;
const FUENTES_BASE = `${API_URL}/fuentes`;

export interface SemanaActual {
    carpeta: string;
    numero_semana: number;
    lunes: string;
    domingo: string;
}

export interface LocatarioArchivos {
    locatario: string;
    pendientes: string[];
    consolidados: string[];
    backup?: string[];
}

export interface ArchivosCierreCajaResponse {
    vista: string;
    archivos: Array<{
        semana: string;
        locatario: string;
        archivos: string[];
        pendientes?: string[];
        consolidados?: string[];
    }>;
    por_locatario: LocatarioArchivos[];
}

export async function fetchSemanaActual(): Promise<SemanaActual> {
    const res = await axios.get<SemanaActual>(`${FUENTES_BASE}/semana-actual`);
    return res.data;
}

export async function fetchArchivosCierreCaja(): Promise<ArchivosCierreCajaResponse> {
    const res = await axios.get<ArchivosCierreCajaResponse>(`${FUENTES_BASE}/archivos`);
    return res.data;
}

export async function uploadFuentesFile(locatarioCodigo: string, file: File): Promise<unknown> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axios.post(`${FUENTES_BASE}/upload?locatario_codigo=${encodeURIComponent(locatarioCodigo)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
}

export async function fetchProcesadosFechas(): Promise<string[]> {
    const res = await axios.get<{ fechas: string[] }>(`${FUENTES_BASE}/procesados/fechas`);
    return res.data.fechas ?? [];
}

export interface ProcesadosGrupo {
    locatario: string;
    archivos: string[];
}

export async function fetchProcesadosArchivos(fecha: string): Promise<{ fecha: string; grupos: ProcesadosGrupo[] }> {
    const res = await axios.get(`${FUENTES_BASE}/procesados/archivos`, { params: { fecha } });
    return res.data;
}

export function zipCierreCajaUrl(locatario?: string): string {
    const params = new URLSearchParams();
    if (locatario) params.set('locatario', locatario);
    const q = params.toString();
    return q ? `${FUENTES_BASE}/zip?${q}` : `${FUENTES_BASE}/zip`;
}

/** Descarga varios archivos de cierre_caja en un ZIP (POST /fuentes/zip-selection). */
export async function downloadFuentesZipSelection(params: {
    locatarioCodigo: string;
    zona: 'pendiente' | 'consolidado' | 'backup';
    filenames: string[];
}): Promise<void> {
    if (!params.filenames.length) return;
    const formData = new FormData();
    formData.append('locatario_codigo', params.locatarioCodigo);
    formData.append('zona', params.zona);
    params.filenames.forEach((name) => formData.append('filenames', name));
    const res = await axios.post<Blob>(`${FUENTES_BASE}/zip-selection`, formData, {
        responseType: 'blob',
    });
    const safeLoc = params.locatarioCodigo.replace(/[/\\?%*:|"<>]/g, '_');
    const safeName = `cierre_caja_${safeLoc}_${params.zona}_seleccion.zip`;
    const url = URL.createObjectURL(res.data);
    try {
        const a = document.createElement('a');
        a.href = url;
        a.download = safeName;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        URL.revokeObjectURL(url);
    }
}

export function downloadFuentesUrl(params: {
    origen: 'cierre' | 'procesados';
    locatario_codigo: string;
    filename: string;
    zona?: 'pendiente' | 'consolidado' | 'backup';
    fecha?: string;
}): string {
    const q = new URLSearchParams();
    q.set('origen', params.origen);
    q.set('locatario_codigo', params.locatario_codigo);
    q.set('filename', params.filename);
    if (params.origen === 'cierre' && params.zona) q.set('zona', params.zona);
    if (params.origen === 'procesados' && params.fecha) q.set('fecha', params.fecha);
    return `${FUENTES_BASE}/download?${q.toString()}`;
}

export async function uploadBulkFuentes(locatarioCodigo: string, files: FileList | File[], replace: boolean): Promise<unknown> {
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append('files', f));
    formData.append('locatario_codigo', locatarioCodigo);
    formData.append('replace', replace ? 'true' : 'false');
    const res = await axios.post(`${FUENTES_BASE}/upload-bulk`, formData);
    return res.data;
}

export interface FuentesPreviewResponse {
    ok: true;
    filename: string;
    extension: string;
    columns: string[];
    rows: string[][];
    truncated: boolean;
    row_count_shown: number;
}

export async function fetchFuentesPreview(params: {
    origen: 'cierre' | 'procesados';
    locatario_codigo: string;
    filename: string;
    zona?: 'pendiente' | 'consolidado';
    fecha?: string;
    max_rows?: number;
}): Promise<FuentesPreviewResponse> {
    const q: Record<string, string | number> = {
        origen: params.origen,
        locatario_codigo: params.locatario_codigo,
        filename: params.filename,
        max_rows: params.max_rows ?? 80,
    };
    if (params.origen === 'cierre' && params.zona) q.zona = params.zona;
    if (params.origen === 'procesados' && params.fecha) q.fecha = params.fecha;
    const res = await axios.get<FuentesPreviewResponse>(`${FUENTES_BASE}/preview`, { params: q });
    return res.data;
}

export async function deleteFuentesArchivo(
    token: string | null,
    locatarioCodigo: string,
    filename: string,
    zona: 'pendiente' | 'consolidado' | 'backup'
): Promise<void> {
    await axios.delete(`${FUENTES_BASE}/archivo`, {
        params: {
            locatario_codigo: locatarioCodigo,
            filename,
            zona,
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
}

export async function deleteFuentesArchivosBulk(
    token: string | null,
    params: { locatarioCodigo: string; zona: 'pendiente' | 'consolidado' | 'backup'; filenames: string[] }
): Promise<{ ok: boolean; deleted: string[]; requested: string[]; missing: string[]; zona: string }> {
    const formData = new FormData();
    formData.append('locatario_codigo', params.locatarioCodigo);
    formData.append('zona', params.zona);
    params.filenames.forEach((name) => formData.append('filenames', name));
    const res = await axios.post(`${FUENTES_BASE}/eliminar-bulk`, formData, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data;
}

export async function moveFuentesToBackup(
    token: string | null,
    params: { locatarioCodigo: string; filenames: string[]; zona: 'pendiente' | 'consolidado' }
): Promise<{ ok: boolean; moved: string[]; requested: string[]; missing: string[]; zona: string }> {
    const formData = new FormData();
    formData.append('locatario_codigo', params.locatarioCodigo);
    formData.append('zona', params.zona);
    params.filenames.forEach((name) => formData.append('filenames', name));
    const res = await axios.post(`${FUENTES_BASE}/mover-backup`, formData, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data;
}

export async function restoreFuentesFromBackup(
    token: string | null,
    params: { locatarioCodigo: string; filenames: string[]; destino: 'pendiente' | 'consolidado' }
): Promise<{ ok: boolean; moved: string[]; requested: string[]; missing: string[]; destino: string }> {
    const formData = new FormData();
    formData.append('locatario_codigo', params.locatarioCodigo);
    formData.append('destino', params.destino);
    params.filenames.forEach((name) => formData.append('filenames', name));
    const res = await axios.post(`${FUENTES_BASE}/restaurar-backup`, formData, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data;
}
