import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

export interface DocumentoGcb {
    id: number;
    codigo: string;
    nombre: string;
    coleccion: string;
    categoria: string;
    subcategoria: string | null;
    descripcion: string | null;
    archivo_nombre_original: string;
    archivo_nombre_actual: string;
    archivo_ruta: string;
    mime_type: string;
    extension: string;
    tamano_bytes: number;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

export interface PaginatedDocumentosGcb {
    items: DocumentoGcb[];
    total: number;
    skip: number;
    limit: number;
}

/** Payload de alta (alineado con POST /documentos-gcb) */
export type DocumentosGcbCreatePayload = {
    codigo: string;
    nombre: string;
    coleccion: string;
    categoria: string;
    subcategoria?: string;
    descripcion?: string;
    file: File;
};

function authHeaders(token: string | null) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const documentosGcbService = {
    async list(
        token: string,
        params: {
            skip?: number;
            limit?: number;
            q?: string;
            coleccion?: string;
            categoria?: string;
            solo_activos?: boolean;
        }
    ) {
        const res = await axios.get<PaginatedDocumentosGcb>(`${API_URL}/documentos-gcb`, {
            headers: authHeaders(token),
            params,
        });
        return res.data;
    },

    async create(token: string, payload: DocumentosGcbCreatePayload) {
        const form = new FormData();
        form.append('codigo', payload.codigo);
        form.append('nombre', payload.nombre);
        form.append('coleccion', payload.coleccion);
        form.append('categoria', payload.categoria);
        if (payload.subcategoria) form.append('subcategoria', payload.subcategoria);
        if (payload.descripcion) form.append('descripcion', payload.descripcion);
        form.append('file', payload.file);

        const res = await axios.post<DocumentoGcb>(`${API_URL}/documentos-gcb`, form, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async update(
        token: string,
        id: number,
        payload: {
            nombre?: string;
            subcategoria?: string | null;
            descripcion?: string | null;
            activo?: boolean;
        }
    ) {
        const res = await axios.put<DocumentoGcb>(`${API_URL}/documentos-gcb/${id}`, payload, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async replaceFile(token: string, id: number, file: File) {
        const form = new FormData();
        form.append('file', file);
        const res = await axios.put<DocumentoGcb>(`${API_URL}/documentos-gcb/${id}/replace-file`, form, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async deactivate(token: string, id: number) {
        await axios.delete(`${API_URL}/documentos-gcb/${id}`, {
            headers: authHeaders(token),
        });
    },

    async getFileObjectUrl(token: string, id: number): Promise<string> {
        const res = await axios.get<Blob>(`${API_URL}/documentos-gcb/${id}/file`, {
            headers: authHeaders(token),
            responseType: 'blob',
        });
        return URL.createObjectURL(res.data);
    },
};
