import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import type { DocumentosGcbCreatePayload } from '@/services/documentosGcbService';
import { documentosGcbService } from '@/services/documentosGcbService';

/** Query key base para invalidar todo el dominio Documentos GCB */
export const DOCUMENTOS_GCB_QUERY_KEY = ['documentos-gcb'] as const;

export type DocumentosGcbListFilters = {
    q: string;
    coleccion: string;
    categoria: string;
    soloActivos: boolean;
};

const DEFAULT_LIMIT = 500;

export function useDocumentosGcbList(filters: DocumentosGcbListFilters) {
    const { token } = useAuth();
    return useQuery({
        queryKey: [
            ...DOCUMENTOS_GCB_QUERY_KEY,
            'list',
            filters.q,
            filters.coleccion,
            filters.categoria,
            filters.soloActivos,
        ],
        queryFn: () =>
            documentosGcbService.list(token as string, {
                skip: 0,
                limit: DEFAULT_LIMIT,
                q: filters.q || undefined,
                coleccion: filters.coleccion || undefined,
                categoria: filters.categoria || undefined,
                solo_activos: filters.soloActivos,
            }),
        enabled: !!token,
    });
}

export function useDocumentosGcbMutations() {
    const { token } = useAuth();
    const qc = useQueryClient();

    const invalidate = () => qc.invalidateQueries({ queryKey: DOCUMENTOS_GCB_QUERY_KEY });

    const create = useMutation({
        mutationFn: (payload: DocumentosGcbCreatePayload) => documentosGcbService.create(token as string, payload),
        onSuccess: invalidate,
    });

    const update = useMutation({
        mutationFn: (args: { id: number; body: Parameters<typeof documentosGcbService.update>[2] }) =>
            documentosGcbService.update(token as string, args.id, args.body),
        onSuccess: invalidate,
    });

    const replaceFile = useMutation({
        mutationFn: (args: { id: number; file: File }) =>
            documentosGcbService.replaceFile(token as string, args.id, args.file),
        onSuccess: invalidate,
    });

    const deactivate = useMutation({
        mutationFn: (id: number) => documentosGcbService.deactivate(token as string, id),
        onSuccess: invalidate,
    });

    return { create, update, replaceFile, deactivate, invalidate };
}
