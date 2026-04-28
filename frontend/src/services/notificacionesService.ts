import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

export type ModoPendientesNotificaciones =
    | 'ultima_semana'
    | 'semana_actual'
    | 'rango_libre'
    | 'ultimos_dias';

export interface LocatarioPendienteItem {
    codigo: string;
    nombre: string;
    ultimo_upload: string | null;
    dias_sin_subir: number | null;
    alerta: boolean;
    fuente_fecha?: string | null;
    dias_con_registro?: string[];
    dias_faltantes?: string[];
    sugerencia_notificacion?: string | null;
    emails_notificacion?: string[];
}

export interface NotificacionesEnvioConfig {
    schedule_enabled: boolean;
    schedule_hour: number;
    schedule_minute: number;
    schedule_modo: ModoPendientesNotificaciones;
    schedule_dias: number | null;
    schedule_fecha_inicio: string | null;
    schedule_fecha_fin: string | null;
    timezone: string;
    n8n_webhook_url: string | null;
    n8n_webhook_secret_configured: boolean;
}

export interface NotificacionesEnvioConfigPatch {
    schedule_enabled?: boolean;
    schedule_hour?: number;
    schedule_minute?: number;
    schedule_modo?: ModoPendientesNotificaciones;
    schedule_dias?: number | null;
    schedule_fecha_inicio?: string | null;
    schedule_fecha_fin?: string | null;
    n8n_webhook_url?: string;
    /** Omitir = no cambiar; cadena vacía = borrar secreto guardado */
    n8n_webhook_secret?: string;
}

export interface NotificacionesDisparoResult {
    ok: boolean;
    enviado: boolean;
    items: number;
    error?: string | null;
    razon?: string | null;
}

export interface PendientesSemanaResponse {
    fecha_evaluacion: string;
    modo: ModoPendientesNotificaciones;
    periodo_inicio: string;
    periodo_fin: string;
    dias_periodo: string[];
    ventana_rodante: boolean;
    umbral_dias: number | null;
    semana: string;
    resumen: {
        total: number;
        con_alerta: number;
        al_dia: number;
    };
    locatarios_con_alerta: LocatarioPendienteItem[];
    locatarios_al_dia: LocatarioPendienteItem[];
}

export interface FetchPendientesParams {
    modo?: ModoPendientesNotificaciones;
    dias?: number;
    fecha_inicio?: string;
    fecha_fin?: string;
}

/** GET /api/notificaciones/pendientes-semana — requiere JWT. */
export async function fetchPendientesSemana(token: string, params: FetchPendientesParams = {}) {
    const { modo = 'ultima_semana', dias, fecha_inicio, fecha_fin } = params;
    const query: Record<string, string | number> = { modo };
    if (modo === 'ultimos_dias' && dias != null) query.dias = dias;
    if (modo === 'rango_libre') {
        if (fecha_inicio) query.fecha_inicio = fecha_inicio;
        if (fecha_fin) query.fecha_fin = fecha_fin;
    }
    const { data } = await axios.get<PendientesSemanaResponse>(`${API_URL}/notificaciones/pendientes-semana`, {
        params: query,
        headers: { Authorization: `Bearer ${token}` },
    });
    return data;
}

export async function fetchNotificacionesEnvioConfig(token: string) {
    const { data } = await axios.get<NotificacionesEnvioConfig>(`${API_URL}/notificaciones/envio-config`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return data;
}

export async function patchNotificacionesEnvioConfig(token: string, body: NotificacionesEnvioConfigPatch) {
    const { data } = await axios.patch<NotificacionesEnvioConfig>(`${API_URL}/notificaciones/envio-config`, body, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return data;
}

export async function dispararNotificacionesN8n(token: string, params: FetchPendientesParams = {}) {
    const { modo = 'ultima_semana', dias, fecha_inicio, fecha_fin } = params;
    const query: Record<string, string | number> = { modo };
    if (modo === 'ultimos_dias' && dias != null) query.dias = dias;
    if (modo === 'rango_libre') {
        if (fecha_inicio) query.fecha_inicio = fecha_inicio;
        if (fecha_fin) query.fecha_fin = fecha_fin;
    }
    const { data } = await axios.post<NotificacionesDisparoResult>(
        `${API_URL}/notificaciones/disparar-envio-n8n`,
        null,
        { params: query, headers: { Authorization: `Bearer ${token}` } }
    );
    return data;
}
