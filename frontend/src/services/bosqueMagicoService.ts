import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8080/api`;

function authHeaders(token: string | null) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface BosqueMagicoConfigRow {
    id: number;
    config_key: string;
    value: unknown;
    description: string | null;
    updated_at: string | null;
}

export interface BosqueMagicoLead {
    id: number;
    created_at: string;
    updated_at: string | null;
    contact_name: string;
    phone: string;
    email: string | null;
    channel: string;
    source_detail: string | null;
    tentative_event_date: string | null;
    shift: string | null;
    estimated_children: number | null;
    status: string;
    notes: string | null;
    payload_snapshot: Record<string, unknown> | null;
}

export interface BosqueMagicoLeadListResponse {
    items: BosqueMagicoLead[];
    total: number;
}

export const bosqueMagicoService = {
    async listConfig(token: string) {
        const res = await axios.get<BosqueMagicoConfigRow[]>(`${API_URL}/bosque-magico/config`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async patchConfig(token: string, items: { config_key: string; value: unknown }[]) {
        const res = await axios.patch<BosqueMagicoConfigRow[]>(
            `${API_URL}/bosque-magico/config`,
            { items },
            { headers: authHeaders(token) }
        );
        return res.data;
    },

    async listLeads(
        token: string,
        params: { skip?: number; limit?: number; status?: string; channel?: string; buscar?: string }
    ) {
        const res = await axios.get<BosqueMagicoLeadListResponse>(`${API_URL}/bosque-magico/leads`, {
            headers: authHeaders(token),
            params,
        });
        return res.data;
    },

    async getLead(token: string, id: number) {
        const res = await axios.get<BosqueMagicoLead>(`${API_URL}/bosque-magico/leads/${id}`, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async patchLead(token: string, id: number, body: Partial<Pick<BosqueMagicoLead, 'status' | 'notes'>>) {
        const res = await axios.patch<BosqueMagicoLead>(`${API_URL}/bosque-magico/leads/${id}`, body, {
            headers: authHeaders(token),
        });
        return res.data;
    },

    async createLeadManual(
        token: string,
        body: Pick<BosqueMagicoLead, 'contact_name' | 'phone' | 'email' | 'channel' | 'source_detail' | 'status' | 'notes'> & {
            tentative_event_date?: string | null;
            shift?: string | null;
            estimated_children?: number | null;
            payload_snapshot?: Record<string, unknown> | null;
        }
    ) {
        const res = await axios.post<BosqueMagicoLead>(`${API_URL}/bosque-magico/leads`, body, {
            headers: authHeaders(token),
        });
        return res.data;
    },
};
