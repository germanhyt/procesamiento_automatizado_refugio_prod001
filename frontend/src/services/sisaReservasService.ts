import axios from 'axios';

import type { SisaEstadoReserva } from '@/constants/sisaReservas';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

export const SISA_LIST_STALE_MS = 25_000;

function authHeaders(token: string) {
    return { Authorization: `Bearer ${token}` };
}

export interface SisaZona {
    id: number;
    nombre: string;
    color: string | null;
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface SisaMesa {
    id: number;
    zona_id: number;
    numero: string;
    pos_x: number;
    pos_y: number;
    capacidad: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

/** Cuerpo para crear o reemplazar una reserva (coincide con el API). */
export type SisaReservaPayload = {
    fecha_reserva: string;
    hora_reserva: string;
    motivo_reserva: string;
    numero_personas: number;
    zona_id: number;
    mesa_id: number | null;
    nombre_completo: string;
    codigo_telefonico: string;
    numero_telefono: string;
    email: string | null;
    comentario: string | null;
    estado: SisaEstadoReserva;
};

export interface SisaReservaRegistro {
    id: number;
    fecha_reserva: string;
    hora_reserva: string;
    motivo_reserva: string;
    numero_personas: number;
    zona_id: number;
    mesa_id: number | null;
    nombre_completo: string;
    codigo_telefonico: string;
    numero_telefono: string;
    email: string | null;
    comentario: string | null;
    estado: SisaEstadoReserva;
    created_at: string;
    updated_at: string;
}

export interface PaginatedSisaReservas {
    total: number;
    items: SisaReservaRegistro[];
}

/** Ocupación pública sin PII (API `/public/plano`). */
export interface SisaPublicReservaPeek {
    estado: string;
    numero_personas: number;
}

/** Ocupación en plano interno (registro completo) o público (peek sin PII). */
export type SisaPlanoOccupancy = SisaReservaRegistro | SisaPublicReservaPeek;

export interface SisaPlanoMesaSlot {
    mesa: SisaMesa;
    reserva: SisaPlanoOccupancy | null;
}

export interface SisaPlanoZonaSlot {
    zona: SisaZona;
    mesas: SisaPlanoMesaSlot[];
}

export interface SisaPlanoResponse {
    fecha: string;
    hora: string;
    zonas: SisaPlanoZonaSlot[];
}

/** Alias semántico: mismo tipo que respuesta `/plano` (ocupación unificada). */
export type SisaPlanoUnifiedResponse = SisaPlanoResponse;

export interface SisaCountByLabel {
    label: string;
    count: number;
}

export interface SisaKpisResponse {
    total_reservas: number;
    pendientes: number;
    confirmados: number;
    ultimas: SisaReservaRegistro[];
    by_motivo: SisaCountByLabel[];
    by_zona: SisaCountByLabel[];
}

export async function listSisaReservas(
    token: string,
    params?: {
        skip?: number;
        limit?: number;
        nombre?: string;
        fecha?: string;
        estado?: string;
        zona_id?: number;
    }
): Promise<PaginatedSisaReservas> {
    const { data } = await axios.get(`${API_URL}/sisa-reservas/reservas`, {
        headers: authHeaders(token),
        params,
    });
    return data;
}

export async function createSisaReserva(token: string, body: SisaReservaPayload): Promise<SisaReservaRegistro> {
    const { data } = await axios.post(`${API_URL}/sisa-reservas/reservas`, body, { headers: authHeaders(token) });
    return data;
}

export async function updateSisaReserva(token: string, id: number, body: Partial<SisaReservaPayload>): Promise<SisaReservaRegistro> {
    const { data } = await axios.put(`${API_URL}/sisa-reservas/reservas/${id}`, body, { headers: authHeaders(token) });
    return data;
}

export async function deleteSisaReserva(token: string, id: number): Promise<void> {
    await axios.delete(`${API_URL}/sisa-reservas/reservas/${id}`, { headers: authHeaders(token) });
}

export async function patchSisaReservaEstado(
    token: string,
    id: number,
    estado: SisaEstadoReserva
): Promise<SisaReservaRegistro> {
    const { data } = await axios.patch(
        `${API_URL}/sisa-reservas/reservas/${id}/estado`,
        { estado },
        { headers: authHeaders(token) }
    );
    return data;
}

export async function listSisaZonas(token: string): Promise<SisaZona[]> {
    const { data } = await axios.get(`${API_URL}/sisa-reservas/zonas`, { headers: authHeaders(token) });
    return data;
}

export async function createSisaZona(
    token: string,
    body: Pick<SisaZona, 'nombre' | 'color' | 'pos_x' | 'pos_y' | 'width' | 'height' | 'sort_order'>
): Promise<SisaZona> {
    const { data } = await axios.post(`${API_URL}/sisa-reservas/zonas`, body, { headers: authHeaders(token) });
    return data;
}

export async function updateSisaZona(token: string, id: number, body: Partial<SisaZona>): Promise<SisaZona> {
    const { data } = await axios.put(`${API_URL}/sisa-reservas/zonas/${id}`, body, { headers: authHeaders(token) });
    return data;
}

export async function deleteSisaZona(token: string, id: number): Promise<void> {
    await axios.delete(`${API_URL}/sisa-reservas/zonas/${id}`, { headers: authHeaders(token) });
}

export async function listSisaMesas(token: string, zonaId?: number): Promise<SisaMesa[]> {
    const { data } = await axios.get(`${API_URL}/sisa-reservas/mesas`, {
        headers: authHeaders(token),
        params: zonaId != null ? { zona_id: zonaId } : undefined,
    });
    return data;
}

export async function createSisaMesa(
    token: string,
    body: Pick<SisaMesa, 'zona_id' | 'numero' | 'pos_x' | 'pos_y' | 'capacidad' | 'is_active'>
): Promise<SisaMesa> {
    const { data } = await axios.post(`${API_URL}/sisa-reservas/mesas`, body, { headers: authHeaders(token) });
    return data;
}

export async function updateSisaMesa(token: string, id: number, body: Partial<SisaMesa>): Promise<SisaMesa> {
    const { data } = await axios.put(`${API_URL}/sisa-reservas/mesas/${id}`, body, { headers: authHeaders(token) });
    return data;
}

export async function deleteSisaMesa(token: string, id: number): Promise<void> {
    await axios.delete(`${API_URL}/sisa-reservas/mesas/${id}`, { headers: authHeaders(token) });
}

export async function sisaWhatsappSend(
    token: string,
    codigo_telefonico: string,
    numero_telefono: string,
    message: string
): Promise<{ wa_url: string; phone_e164_digits: string }> {
    const { data } = await axios.post(
        `${API_URL}/sisa-reservas/whatsapp/send`,
        { codigo_telefonico, numero_telefono, message },
        { headers: authHeaders(token) }
    );
    return data;
}

export async function getSisaKpis(token: string): Promise<SisaKpisResponse> {
    const { data } = await axios.get(`${API_URL}/sisa-reservas/dashboard/kpis`, { headers: authHeaders(token) });
    return data;
}

export async function getSisaPlano(token: string, fecha: string, hora: string): Promise<SisaPlanoResponse> {
    const horaParam = hora.length === 5 ? `${hora}:00` : hora;
    const { data } = await axios.get(`${API_URL}/sisa-reservas/plano`, {
        headers: authHeaders(token),
        params: { fecha, hora: horaParam },
    });
    return data;
}

/** Plano ocupación sin datos personales. */
export async function fetchSisaPublicPlano(fecha: string, hora: string): Promise<SisaPlanoUnifiedResponse> {
    const horaParam = hora.length === 5 ? `${hora}:00` : hora;
    const { data } = await axios.get(`${API_URL}/sisa-reservas/public/plano`, {
        params: { fecha, hora: horaParam },
    });
    return data;
}

/** Alta web; el backend asigna `pendiente`. */
export type SisaPublicReservaPayload = Omit<SisaReservaPayload, 'estado'>;

export async function createSisaPublicReserva(body: SisaPublicReservaPayload): Promise<SisaReservaRegistro> {
    const { data } = await axios.post(`${API_URL}/sisa-reservas/public/reservas`, body);
    return data;
}

// --- Webhook notificaciones próximas (n8n) ---

export interface SisaNotificacionesConfig {
    schedule_enabled: boolean;
    schedule_interval_minutes: number;
    anticipation_minutes: number;
    include_confirmados: boolean;
    timezone: string;
    n8n_webhook_url: string | null;
    n8n_webhook_secret_configured: boolean;
}

export interface SisaNotificacionesConfigPatch {
    schedule_enabled?: boolean;
    schedule_interval_minutes?: number;
    anticipation_minutes?: number;
    include_confirmados?: boolean;
    n8n_webhook_url?: string | null;
    n8n_webhook_secret?: string | null;
}

export interface SisaNotificacionesDisparoResult {
    ok: boolean;
    enviado: boolean;
    items: number;
    error?: string | null;
    razon?: string | null;
}

export async function getSisaNotificacionesConfig(token: string): Promise<SisaNotificacionesConfig> {
    const { data } = await axios.get(`${API_URL}/sisa-reservas/notificaciones-config`, {
        headers: authHeaders(token),
    });
    return data;
}

export async function patchSisaNotificacionesConfig(
    token: string,
    body: SisaNotificacionesConfigPatch
): Promise<SisaNotificacionesConfig> {
    const { data } = await axios.patch(`${API_URL}/sisa-reservas/notificaciones-config`, body, {
        headers: authHeaders(token),
    });
    return data;
}

export async function dispararSisaNotificacionesWebhook(token: string): Promise<SisaNotificacionesDisparoResult> {
    const { data } = await axios.post(
        `${API_URL}/sisa-reservas/notificaciones/disparar`,
        {},
        { headers: authHeaders(token) }
    );
    return data;
}
