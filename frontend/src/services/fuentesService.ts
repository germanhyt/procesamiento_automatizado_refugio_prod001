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
    zona: 'pendiente' | 'consolidado'
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
