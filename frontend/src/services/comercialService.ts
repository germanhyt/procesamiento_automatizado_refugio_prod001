import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

export type ComercialEstado = 'pendiente' | 'atendido';

export interface ComercialReserva {
    id: number;
    fecha_creacion: string;
    nombres: string;
    celular: string;
    cantidad_personas: number;
    fecha_reserva: string;
    hora_reserva: string;
    estado: ComercialEstado;
    created_at: string;
    updated_at: string;
}

export interface ComercialEvento {
    id: number;
    fecha_creacion: string;
    nombres: string;
    razon_social: string | null;
    celular: string;
    tipo_evento: string;
    cantidad_personas: number;
    fecha_tentativa: string;
    estado: ComercialEstado;
    created_at: string;
    updated_at: string;
}

export interface PaginatedReservas {
    items: ComercialReserva[];
    total: number;
    skip: number;
    limit: number;
}

export interface PaginatedEventos {
    items: ComercialEvento[];
    total: number;
    skip: number;
    limit: number;
}

export interface MonthlyCount {
    year: number;
    month: number;
    label: string;
    count: number;
}

export interface EstadoCount {
    estado: string;
    count: number;
}

export interface PersonasRangeCount {
    rango: string;
    count: number;
}

export interface TipoEventoCount {
    tipo_evento: string;
    count: number;
}

export interface TipoEventoAvg {
    tipo_evento: string;
    avg_personas: number;
}

export interface ReservasAnalytics {
    by_month: MonthlyCount[];
    by_estado: EstadoCount[];
    by_personas_rango: PersonasRangeCount[];
    avg_personas: number;
    total: number;
}

export interface EventosAnalytics {
    by_month: MonthlyCount[];
    by_estado: EstadoCount[];
    by_tipo_evento: TipoEventoCount[];
    avg_personas: number;
    avg_personas_por_tipo: TipoEventoAvg[];
    total: number;
}

function authHeaders(token: string | null) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function endOfDayIso(dateStr: string): string {
    const d = new Date(`${dateStr}T23:59:59`);
    return d.toISOString();
}

function startOfDayIso(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toISOString();
}

export const comercialService = {
    async listReservas(
        token: string,
        params: {
            skip?: number;
            limit?: number;
            estado?: string;
            buscar?: string;
            desde?: string;
            hasta?: string;
        }
    ) {
        const q: Record<string, string | number> = {};
        if (params.skip != null) q.skip = params.skip;
        if (params.limit != null) q.limit = params.limit;
        if (params.estado) q.estado = params.estado;
        if (params.buscar) q.buscar = params.buscar;
        if (params.desde) q.desde = startOfDayIso(params.desde);
        if (params.hasta) q.hasta = endOfDayIso(params.hasta);
        const res = await axios.get<PaginatedReservas>(`${API_URL}/comercial/reservas`, {
            headers: authHeaders(token),
            params: q,
        });
        return res.data;
    },

    async getReserva(token: string, id: number) {
        const res = await axios.get<ComercialReserva>(`${API_URL}/comercial/reservas/${id}`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async createReserva(token: string, body: Omit<ComercialReserva, 'id' | 'fecha_creacion' | 'created_at' | 'updated_at'>) {
        const res = await axios.post<ComercialReserva>(`${API_URL}/comercial/reservas`, body, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async updateReserva(token: string, id: number, body: Partial<ComercialReserva>) {
        const res = await axios.put<ComercialReserva>(`${API_URL}/comercial/reservas/${id}`, body, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async deleteReserva(token: string, id: number) {
        await axios.delete(`${API_URL}/comercial/reservas/${id}`, { headers: authHeaders(token) });
    },

    async patchReservaEstado(token: string, id: number, estado: ComercialEstado) {
        const res = await axios.patch<ComercialReserva>(`${API_URL}/comercial/reservas/${id}/estado`, { estado }, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async listEventos(
        token: string,
        params: {
            skip?: number;
            limit?: number;
            estado?: string;
            tipo_evento?: string;
            buscar?: string;
            desde?: string;
            hasta?: string;
        }
    ) {
        const q: Record<string, string | number> = {};
        if (params.skip != null) q.skip = params.skip;
        if (params.limit != null) q.limit = params.limit;
        if (params.estado) q.estado = params.estado;
        if (params.tipo_evento) q.tipo_evento = params.tipo_evento;
        if (params.buscar) q.buscar = params.buscar;
        if (params.desde) q.desde = startOfDayIso(params.desde);
        if (params.hasta) q.hasta = endOfDayIso(params.hasta);
        const res = await axios.get<PaginatedEventos>(`${API_URL}/comercial/eventos`, {
            headers: authHeaders(token),
            params: q,
        });
        return res.data;
    },

    async getEvento(token: string, id: number) {
        const res = await axios.get<ComercialEvento>(`${API_URL}/comercial/eventos/${id}`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async createEvento(
        token: string,
        body: Omit<ComercialEvento, 'id' | 'fecha_creacion' | 'created_at' | 'updated_at'>
    ) {
        const res = await axios.post<ComercialEvento>(`${API_URL}/comercial/eventos`, body, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async updateEvento(token: string, id: number, body: Partial<ComercialEvento>) {
        const res = await axios.put<ComercialEvento>(`${API_URL}/comercial/eventos/${id}`, body, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async deleteEvento(token: string, id: number) {
        await axios.delete(`${API_URL}/comercial/eventos/${id}`, { headers: authHeaders(token) });
    },

    async patchEventoEstado(token: string, id: number, estado: ComercialEstado) {
        const res = await axios.patch<ComercialEvento>(`${API_URL}/comercial/eventos/${id}/estado`, { estado }, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async whatsappSend(token: string, celular: string, message: string) {
        const res = await axios.post<{ wa_url: string; phone_e164_digits: string }>(
            `${API_URL}/comercial/whatsapp/send`,
            { celular, message },
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async analyticsReservas(token: string) {
        const res = await axios.get<ReservasAnalytics>(`${API_URL}/comercial/analytics/reservas`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async analyticsEventos(token: string) {
        const res = await axios.get<EventosAnalytics>(`${API_URL}/comercial/analytics/eventos`, {
            headers: authHeaders(token),
        });
        return res.data;
    },
};
