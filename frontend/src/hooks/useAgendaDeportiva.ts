import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import type {
    AgendaProgramacionCreatePayload,
    AgendaProgramacionUpdatePayload,
} from '@/services/agendaDeportivaService';
import { agendaDeportivaService } from '@/services/agendaDeportivaService';

export const AGENDA_QUERY_KEY = ['agenda-deportiva'] as const;

export function useAgendaConfig() {
    const { token } = useAuth();
    return useQuery({
        queryKey: [...AGENDA_QUERY_KEY, 'config'],
        queryFn: () => agendaDeportivaService.getConfig(token as string),
        enabled: !!token,
    });
}

export function useAgendaProgramaciones() {
    const { token } = useAuth();
    return useQuery({
        queryKey: [...AGENDA_QUERY_KEY, 'programaciones'],
        queryFn: () => agendaDeportivaService.listProgramaciones(token as string),
        enabled: !!token,
    });
}

export function useAgendaProgramacion(id: number | null) {
    const { token } = useAuth();
    return useQuery({
        queryKey: [...AGENDA_QUERY_KEY, 'programacion', id],
        queryFn: () => agendaDeportivaService.getProgramacion(token as string, id as number),
        enabled: !!token && id != null,
    });
}

export function useAgendaTracks() {
    const { token } = useAuth();
    return useQuery({
        queryKey: [...AGENDA_QUERY_KEY, 'tracks'],
        queryFn: () => agendaDeportivaService.listTracks(token as string),
        enabled: !!token,
    });
}

export function useAgendaMutations() {
    const { token } = useAuth();
    const qc = useQueryClient();
    const t = token as string;

    const invalidateAll = () => qc.invalidateQueries({ queryKey: AGENDA_QUERY_KEY });

    const invalidateProgramacion = (id: number) => {
        qc.invalidateQueries({ queryKey: [...AGENDA_QUERY_KEY, 'programacion', id] });
        qc.invalidateQueries({ queryKey: [...AGENDA_QUERY_KEY, 'programaciones'] });
    };

    return {
        patchConfig: useMutation({
            mutationFn: (playlist_publica_habilitada: boolean) =>
                agendaDeportivaService.patchConfig(t, playlist_publica_habilitada),
            onSuccess: invalidateAll,
        }),
        createProgramacion: useMutation({
            mutationFn: (payload: AgendaProgramacionCreatePayload) =>
                agendaDeportivaService.createProgramacion(t, payload),
            onSuccess: invalidateAll,
        }),
        updateProgramacion: useMutation({
            mutationFn: (args: { id: number; payload: AgendaProgramacionUpdatePayload }) =>
                agendaDeportivaService.updateProgramacion(t, args.id, args.payload),
            onSuccess: (_, vars) => invalidateProgramacion(vars.id),
        }),
        deleteProgramacion: useMutation({
            mutationFn: (id: number) => agendaDeportivaService.deleteProgramacion(t, id),
            onSuccess: invalidateAll,
        }),
        activarProgramacion: useMutation({
            mutationFn: (id: number) => agendaDeportivaService.activarProgramacion(t, id),
            onSuccess: (_, id) => invalidateProgramacion(id),
        }),
        uploadSlide: useMutation({
            mutationFn: (args: { programacionId: number; file: File; altText?: string }) =>
                agendaDeportivaService.uploadSlide(t, args.programacionId, args.file, args.altText),
            onSuccess: (_, vars) => invalidateProgramacion(vars.programacionId),
        }),
        updateSlide: useMutation({
            mutationFn: (args: {
                programacionId: number;
                slideId: number;
                payload: { alt_text?: string | null; habilitada?: boolean };
            }) => agendaDeportivaService.updateSlide(t, args.slideId, args.payload),
            onSuccess: (_, vars) => invalidateProgramacion(vars.programacionId),
        }),
        deleteSlide: useMutation({
            mutationFn: (args: { programacionId: number; slideId: number }) =>
                agendaDeportivaService.deleteSlide(t, args.slideId),
            onSuccess: (_, vars) => invalidateProgramacion(vars.programacionId),
        }),
        reorderSlides: useMutation({
            mutationFn: (args: { programacionId: number; slideIds: number[] }) =>
                agendaDeportivaService.reorderSlides(t, args.programacionId, args.slideIds),
            onSuccess: (_, vars) => invalidateProgramacion(vars.programacionId),
        }),
        uploadTrack: useMutation({
            mutationFn: (args: { file: File; titulo?: string; publica?: boolean }) =>
                agendaDeportivaService.uploadTrack(t, args.file, args.titulo, args.publica ?? false),
            onSuccess: invalidateAll,
        }),
        updateTrack: useMutation({
            mutationFn: (args: {
                trackId: number;
                payload: { titulo?: string; habilitada?: boolean; publica?: boolean };
            }) => agendaDeportivaService.updateTrack(t, args.trackId, args.payload),
            onSuccess: invalidateAll,
        }),
        deleteTrack: useMutation({
            mutationFn: (trackId: number) => agendaDeportivaService.deleteTrack(t, trackId),
            onSuccess: invalidateAll,
        }),
        reorderTracks: useMutation({
            mutationFn: (trackIds: number[]) => agendaDeportivaService.reorderTracks(t, trackIds),
            onSuccess: invalidateAll,
        }),
    };
}
