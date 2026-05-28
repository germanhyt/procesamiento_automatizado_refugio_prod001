import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Music, Trash2, Upload } from 'lucide-react';
import Swal from 'sweetalert2';

import { PERMISSION_AGENDA_MANAGE } from '@/constants/agendaDeportiva';
import { useAuth } from '@/context/AuthContext';
import { useAgendaConfig, useAgendaMutations, useAgendaTracks } from '@/hooks/useAgendaDeportiva';
import { apiErrorDetail, type AgendaTrack } from '@/services/agendaDeportivaService';
import { formatDocumentSize, userHasCodename } from '@/utils/documentosGcbUtils';

const inputCls =
    'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';

const AgendaMusicaPage: React.FC = () => {
    const { user } = useAuth();
    const canManage = userHasCodename(user, PERMISSION_AGENDA_MANAGE);

    const configQuery = useAgendaConfig();
    const tracksQuery = useAgendaTracks();
    const { patchConfig, uploadTrack, updateTrack, deleteTrack, reorderTracks } = useAgendaMutations();

    const [titulo, setTitulo] = useState('');
    const [publica, setPublica] = useState(false);
    const [file, setFile] = useState<File | null>(null);

    const tracks = useMemo(
        () => [...(tracksQuery.data ?? [])].sort((a, b) => a.orden - b.orden),
        [tracksQuery.data]
    );

    const playlistEnabled = configQuery.data?.playlist_publica_habilitada ?? true;

    const togglePlaylist = async () => {
        if (!canManage) return;
        try {
            await patchConfig.mutateAsync(!playlistEnabled);
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        try {
            await uploadTrack.mutateAsync({ file, titulo: titulo.trim() || undefined, publica });
            setFile(null);
            setTitulo('');
            setPublica(false);
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const moveTrack = async (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= tracks.length) return;
        const ids = tracks.map((t) => t.id);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        try {
            await reorderTracks.mutateAsync(ids);
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const patchTrack = async (track: AgendaTrack, payload: { habilitada?: boolean; publica?: boolean }) => {
        try {
            await updateTrack.mutateAsync({ trackId: track.id, payload });
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const handleDelete = async (track: AgendaTrack) => {
        const confirm = await Swal.fire({
            icon: 'warning',
            title: 'Eliminar track',
            text: track.titulo,
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
        });
        if (!confirm.isConfirmed) return;
        try {
            await deleteTrack.mutateAsync(track.id);
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center border"
                    style={{
                        borderColor: 'var(--app-agenda-accent-muted)',
                        backgroundColor: 'var(--app-agenda-accent-muted-bg)',
                        color: 'var(--app-agenda-accent)',
                    }}
                >
                    <Music size={22} />
                </div>
                <div>
                    <h1 className="text-lg font-black uppercase tracking-tight text-app-text">Música</h1>
                    <p className="text-[10px] text-app-muted uppercase tracking-widest">
                        Playlist para la cartelera pública
                    </p>
                </div>
            </div>

            <div
                className="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-4"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-card)' }}
            >
                <div>
                    <p className="text-sm font-semibold text-app-text">Playlist pública</p>
                    <p className="text-xs text-app-muted mt-0.5">
                        Si está apagada, la cartelera no reproduce audio aunque haya tracks marcados como públicos.
                    </p>
                </div>
                <button
                    type="button"
                    disabled={!canManage || patchConfig.isPending}
                    onClick={togglePlaylist}
                    className="rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest border disabled:opacity-40"
                    style={{
                        borderColor: 'var(--app-agenda-accent-muted)',
                        backgroundColor: playlistEnabled ? 'var(--app-agenda-accent-muted-bg)' : 'transparent',
                        color: 'var(--app-agenda-accent)',
                    }}
                >
                    {playlistEnabled ? 'Encendida' : 'Apagada'}
                </button>
            </div>

            {canManage && (
                <div
                    className="rounded-2xl border p-4 space-y-3"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-card)' }}
                >
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">Subir audio</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                Archivo (MP3, WAV, OGG)
                            </span>
                            <input
                                type="file"
                                accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a"
                                className={inputCls}
                                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                Título
                            </span>
                            <input
                                className={inputCls}
                                value={titulo}
                                onChange={(e) => setTitulo(e.target.value)}
                                placeholder="Nombre del track"
                            />
                        </label>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-app-text cursor-pointer">
                        <input
                            type="checkbox"
                            checked={publica}
                            onChange={(e) => setPublica(e.target.checked)}
                            className="rounded border-app-border"
                        />
                        Visible al público en cartelera
                    </label>
                    <div>
                        <button
                            type="button"
                            disabled={!file || uploadTrack.isPending}
                            onClick={handleUpload}
                            className=" inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40"
                            style={{ backgroundColor: 'var(--app-agenda-accent)' }}
                        >
                            <Upload size={14} />
                            {uploadTrack.isPending ? 'Subiendo…' : 'Subir track'}
                        </button>
                    </div>
                </div>
            )}

            {tracksQuery.isLoading && <p className="text-sm text-app-muted">Cargando tracks…</p>}

            {!tracksQuery.isLoading && tracks.length === 0 && (
                <p className="text-sm text-app-muted">No hay tracks en la playlist.</p>
            )}

            <div className="space-y-2">
                {tracks.map((track, index) => (
                    <div
                        key={track.id}
                        className="rounded-2xl border p-3 flex flex-wrap items-center gap-3"
                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-card)' }}
                    >
                        <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                            style={{
                                backgroundColor: 'var(--app-agenda-accent-muted-bg)',
                                color: 'var(--app-agenda-accent)',
                            }}
                        >
                            {track.orden}
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-app-text truncate">{track.titulo}</p>
                            <p className="text-xs text-app-muted">
                                {formatDocumentSize(track.tamano_bytes)} ·{' '}
                                {track.habilitada ? 'Habilitado' : 'Deshabilitado'} ·{' '}
                                {track.publica ? 'Público' : 'Solo admin'}
                            </p>
                        </div>
                        {canManage && (
                            <div className="flex flex-wrap items-center gap-1">
                                <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => moveTrack(index, -1)}
                                    className="p-2 rounded-xl border border-app-border disabled:opacity-30"
                                >
                                    <ArrowUp size={16} />
                                </button>
                                <button
                                    type="button"
                                    disabled={index === tracks.length - 1}
                                    onClick={() => moveTrack(index, 1)}
                                    className="p-2 rounded-xl border border-app-border disabled:opacity-30"
                                >
                                    <ArrowDown size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => patchTrack(track, { publica: !track.publica })}
                                    className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest"
                                    style={{
                                        borderColor: 'var(--app-agenda-accent-muted)',
                                        color: 'var(--app-agenda-accent)',
                                    }}
                                >
                                    {track.publica ? 'Quitar público' : 'Hacer público'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => patchTrack(track, { habilitada: !track.habilitada })}
                                    className="rounded-xl border border-app-border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-app-muted"
                                >
                                    {track.habilitada ? 'Desactivar' : 'Activar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(track)}
                                    className="p-2 rounded-xl border border-app-border text-app-danger"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AgendaMusicaPage;
