import axios from 'axios';

import type { AgendaCategoriaLugar, AgendaModo } from '@/constants/agendaDeportiva';

import { API_URL } from '@/config/api';

export interface AgendaConfig {
    playlist_publica_habilitada: boolean;
    updated_at?: string;
}

export interface AgendaSlide {
    id: number;
    programacion_id: number;
    orden: number;
    alt_text: string | null;
    archivo_nombre_original: string;
    mime_type: string;
    extension: string;
    tamano_bytes: number;
    habilitada: boolean;
    created_at: string;
}

export interface AgendaProgramacion {
    id: number;
    titulo: string | null;
    categoria_lugar: AgendaCategoriaLugar;
    modo: AgendaModo;
    fecha_inicio: string;
    fecha_fin: string;
    activa: boolean;
    created_at: string;
    updated_at: string;
    slides: AgendaSlide[];
}

export interface AgendaTrack {
    id: number;
    titulo: string;
    categoria_lugar: AgendaCategoriaLugar;
    orden: number;
    archivo_nombre_original: string;
    mime_type: string;
    extension: string;
    tamano_bytes: number;
    habilitada: boolean;
    publica: boolean;
    created_at: string;
}

export type AgendaProgramacionCreatePayload = {
    titulo?: string;
    categoria_lugar: AgendaCategoriaLugar;
    modo: AgendaModo;
    fecha_inicio: string;
    fecha_fin?: string;
    activa?: boolean;
};

export type AgendaProgramacionUpdatePayload = Partial<{
    titulo: string | null;
    categoria_lugar: AgendaCategoriaLugar;
    modo: AgendaModo;
    fecha_inicio: string;
    fecha_fin: string;
    activa: boolean;
}>;

function authHeaders(token: string | null) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function apiErrorDetail(error: unknown): string {
    const ax = error as { response?: { data?: { detail?: unknown } } };
    const detail = ax.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((x) => String(x)).join(', ');
    return (error as Error).message || 'Error inesperado';
}

export { apiErrorDetail };

export const agendaDeportivaService = {
    async getConfig(token: string) {
        const res = await axios.get<AgendaConfig>(`${API_URL}/agenda-deportiva/config`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async patchConfig(token: string, playlist_publica_habilitada: boolean) {
        const res = await axios.patch<AgendaConfig>(
            `${API_URL}/agenda-deportiva/config`,
            { playlist_publica_habilitada },
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async listProgramaciones(token: string) {
        const res = await axios.get<AgendaProgramacion[]>(`${API_URL}/agenda-deportiva/programaciones`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async getProgramacion(token: string, id: number) {
        const res = await axios.get<AgendaProgramacion>(`${API_URL}/agenda-deportiva/programaciones/${id}`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async createProgramacion(token: string, payload: AgendaProgramacionCreatePayload) {
        const res = await axios.post<AgendaProgramacion>(`${API_URL}/agenda-deportiva/programaciones`, payload, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async updateProgramacion(token: string, id: number, payload: AgendaProgramacionUpdatePayload) {
        const res = await axios.patch<AgendaProgramacion>(
            `${API_URL}/agenda-deportiva/programaciones/${id}`,
            payload,
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async duplicateProgramacion(
        token: string,
        id: number,
        payload: { fecha_referencia: string; modo?: AgendaModo }
    ) {
        const res = await axios.post<AgendaProgramacion>(
            `${API_URL}/agenda-deportiva/programaciones/${id}/duplicar`,
            payload,
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async deleteProgramacion(token: string, id: number) {
        await axios.delete(`${API_URL}/agenda-deportiva/programaciones/${id}`, {
            headers: authHeaders(token),
        });
    },

    async activarProgramacion(token: string, id: number) {
        const res = await axios.post<AgendaProgramacion>(
            `${API_URL}/agenda-deportiva/programaciones/${id}/activar`,
            null,
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async uploadSlide(token: string, programacionId: number, file: File, altText?: string) {
        const form = new FormData();
        form.append('file', file);
        if (altText) form.append('alt_text', altText);
        const res = await axios.post<AgendaSlide>(
            `${API_URL}/agenda-deportiva/programaciones/${programacionId}/slides`,
            form,
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async updateSlide(
        token: string,
        slideId: number,
        payload: { alt_text?: string | null; habilitada?: boolean }
    ) {
        const res = await axios.patch<AgendaSlide>(`${API_URL}/agenda-deportiva/slides/${slideId}`, payload, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async deleteSlide(token: string, slideId: number) {
        await axios.delete(`${API_URL}/agenda-deportiva/slides/${slideId}`, {
            headers: authHeaders(token),
        });
    },

    async reorderSlides(token: string, programacionId: number, slideIds: number[]) {
        const res = await axios.patch<AgendaSlide[]>(
            `${API_URL}/agenda-deportiva/programaciones/${programacionId}/slides/reorder`,
            { slide_ids: slideIds },
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async listTracks(token: string) {
        const res = await axios.get<AgendaTrack[]>(`${API_URL}/agenda-deportiva/tracks`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async uploadTrack(
        token: string,
        file: File,
        titulo: string | undefined,
        categoria_lugar: AgendaCategoriaLugar,
        publica = false
    ) {
        const form = new FormData();
        form.append('file', file);
        if (titulo) form.append('titulo', titulo);
        form.append('categoria_lugar', categoria_lugar);
        form.append('publica', String(publica));
        const res = await axios.post<AgendaTrack>(`${API_URL}/agenda-deportiva/tracks`, form, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async updateTrack(
        token: string,
        trackId: number,
        payload: { titulo?: string; categoria_lugar?: AgendaCategoriaLugar; habilitada?: boolean; publica?: boolean }
    ) {
        const res = await axios.patch<AgendaTrack>(`${API_URL}/agenda-deportiva/tracks/${trackId}`, payload, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async deleteTrack(token: string, trackId: number) {
        await axios.delete(`${API_URL}/agenda-deportiva/tracks/${trackId}`, {
            headers: authHeaders(token),
        });
    },

    async reorderTracks(token: string, trackIds: number[]) {
        const res = await axios.patch<AgendaTrack[]>(
            `${API_URL}/agenda-deportiva/tracks/reorder`,
            { track_ids: trackIds },
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async getSlideObjectUrl(token: string, slideId: number): Promise<string> {
        const res = await axios.get<Blob>(`${API_URL}/agenda-deportiva/slides/${slideId}/file`, {
            headers: authHeaders(token),
            responseType: 'blob',
        });
        return URL.createObjectURL(res.data);
    },

    slideFileUrl(slideId: number): string {
        return `${API_URL}/agenda-deportiva/slides/${slideId}/file`;
    },

    trackFileUrl(trackId: number): string {
        return `${API_URL}/agenda-deportiva/tracks/${trackId}/file`;
    },
};
