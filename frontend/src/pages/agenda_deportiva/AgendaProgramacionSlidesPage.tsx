import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ImageIcon, Trash2, Upload } from 'lucide-react';
import Swal from 'sweetalert2';

import { formatAgendaRango, PERMISSION_AGENDA_MANAGE } from '@/constants/agendaDeportiva';
import { useAuth } from '@/context/AuthContext';
import { useAgendaMutations, useAgendaProgramacion } from '@/hooks/useAgendaDeportiva';
import { agendaDeportivaService, apiErrorDetail, type AgendaSlide } from '@/services/agendaDeportivaService';
import { formatDocumentSize, userHasCodename } from '@/utils/documentosGcbUtils';

const inputCls =
    'w-full rounded-xl bg-app-input border border-app-border px-3 py-2 text-sm text-app-text placeholder:text-app-muted';

function SlidePreview({ slide, token }: { slide: AgendaSlide; token: string }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let revoked = false;
        let objectUrl: string | null = null;
        void agendaDeportivaService.getSlideObjectUrl(token, slide.id).then((u) => {
            if (revoked) {
                URL.revokeObjectURL(u);
                return;
            }
            objectUrl = u;
            setUrl(u);
        });
        return () => {
            revoked = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [slide.id, token]);

    if (!url) {
        return (
            <div className="w-28 h-20 rounded-xl bg-app-input border border-app-border flex items-center justify-center text-app-muted">
                <ImageIcon size={24} />
            </div>
        );
    }

    return (
        <img
            src={url}
            alt={slide.alt_text || slide.archivo_nombre_original}
            className="w-28 h-20 rounded-xl object-cover border border-app-border"
        />
    );
}

const AgendaProgramacionSlidesPage: React.FC = () => {
    const { id } = useParams();
    const programacionId = Number(id);
    const { token, user } = useAuth();
    const canManage = userHasCodename(user, PERMISSION_AGENDA_MANAGE);
    const t = token ?? '';

    const [altText, setAltText] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const progQuery = useAgendaProgramacion(Number.isFinite(programacionId) ? programacionId : null);
    const { uploadSlide, updateSlide, deleteSlide, reorderSlides } = useAgendaMutations();

    const slides = useMemo(
        () => [...(progQuery.data?.slides ?? [])].sort((a, b) => a.orden - b.orden),
        [progQuery.data?.slides]
    );

    const handleUpload = async () => {
        if (!pendingFile || !Number.isFinite(programacionId)) return;
        try {
            await uploadSlide.mutateAsync({
                programacionId,
                file: pendingFile,
                altText: altText.trim() || undefined,
            });
            setPendingFile(null);
            setAltText('');
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const moveSlide = async (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= slides.length) return;
        const ids = slides.map((s) => s.id);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        try {
            await reorderSlides.mutateAsync({ programacionId, slideIds: ids });
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const toggleHabilitada = async (slide: AgendaSlide) => {
        try {
            await updateSlide.mutateAsync({
                programacionId,
                slideId: slide.id,
                payload: { habilitada: !slide.habilitada },
            });
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const handleDelete = async (slide: AgendaSlide) => {
        const confirm = await Swal.fire({
            icon: 'warning',
            title: 'Eliminar slide',
            text: `¿Eliminar #${slide.orden} — ${slide.archivo_nombre_original}?`,
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
        });
        if (!confirm.isConfirmed) return;
        try {
            await deleteSlide.mutateAsync({ programacionId, slideId: slide.id });
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    if (!Number.isFinite(programacionId)) {
        return <p className="text-app-muted">ID de programación inválido.</p>;
    }

    if (progQuery.isLoading) {
        return <p className="text-app-muted">Cargando…</p>;
    }

    if (!progQuery.data) {
        return (
            <div className="space-y-4">
                <p className="text-app-muted">Programación no encontrada.</p>
                <Link to="/agenda-deportiva/programaciones" className="text-[var(--app-agenda-accent)] text-sm">
                    ← Volver
                </Link>
            </div>
        );
    }

    const prog = progQuery.data;
    const title = prog.titulo || formatAgendaRango(prog.fecha_inicio, prog.fecha_fin);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start gap-3">
                <Link
                    to="/agenda-deportiva/programaciones"
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-app-muted hover:text-app-text"
                >
                    <ArrowLeft size={14} />
                    Programaciones
                </Link>
            </div>

            <div>
                <h1 className="text-lg font-black uppercase tracking-tight text-app-text">{title}</h1>
                <p className="text-xs text-app-muted mt-1">
                    {prog.modo} · {formatAgendaRango(prog.fecha_inicio, prog.fecha_fin)} ·{' '}
                    {prog.activa ? 'Activa' : 'Inactiva'} · {prog.categoria_lugar}
                </p>
            </div>

            {canManage && (
                <div
                    className="rounded-2xl border p-4 space-y-3"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-card)' }}
                >
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                        Subir imagen
                    </h2>
                    <div className="flex flex-wrap gap-3 items-end">
                        <label className="flex-1 min-w-[200px] space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                Archivo (PNG, JPG, WebP)
                            </span>
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className={inputCls}
                                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                            />
                        </label>
                        <label className="flex-1 min-w-[200px] space-y-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                Texto alternativo
                            </span>
                            <input
                                className={inputCls}
                                value={altText}
                                onChange={(e) => setAltText(e.target.value)}
                                placeholder="Descripción para accesibilidad"
                            />
                        </label>
                        <button
                            type="button"
                            disabled={!pendingFile || uploadSlide.isPending}
                            onClick={handleUpload}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-40"
                            style={{ backgroundColor: 'var(--app-agenda-accent)' }}
                        >
                            <Upload size={14} />
                            {uploadSlide.isPending ? 'Subiendo…' : 'Subir'}
                        </button>
                    </div>
                </div>
            )}

            {slides.length === 0 ? (
                <p className="text-sm text-app-muted">Sin slides. Sube imágenes en orden de aparición en la cartelera.</p>
            ) : (
                <div className="space-y-2">
                    {slides.map((slide, index) => (
                        <div
                            key={slide.id}
                            className="rounded-2xl border p-3 flex flex-wrap items-center gap-4"
                            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-card)' }}
                        >
                            <span
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
                                style={{
                                    backgroundColor: 'var(--app-agenda-accent-muted-bg)',
                                    color: 'var(--app-agenda-accent)',
                                }}
                            >
                                {slide.orden}
                            </span>
                            <SlidePreview slide={slide} token={t} />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-app-text truncate">
                                    {slide.alt_text || slide.archivo_nombre_original}
                                </p>
                                <p className="text-xs text-app-muted">
                                    {formatDocumentSize(slide.tamano_bytes)} ·{' '}
                                    {slide.habilitada ? 'Visible' : 'Oculto'}
                                </p>
                            </div>
                            {canManage && (
                                <div className="flex flex-wrap items-center gap-1">
                                    <button
                                        type="button"
                                        disabled={index === 0}
                                        onClick={() => moveSlide(index, -1)}
                                        className="p-2 rounded-xl border border-app-border disabled:opacity-30"
                                        aria-label="Subir orden"
                                    >
                                        <ArrowUp size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={index === slides.length - 1}
                                        onClick={() => moveSlide(index, 1)}
                                        className="p-2 rounded-xl border border-app-border disabled:opacity-30"
                                        aria-label="Bajar orden"
                                    >
                                        <ArrowDown size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleHabilitada(slide)}
                                        className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest"
                                        style={{
                                            borderColor: 'var(--app-agenda-accent-muted)',
                                            color: 'var(--app-agenda-accent)',
                                        }}
                                    >
                                        {slide.habilitada ? 'Ocultar' : 'Mostrar'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(slide)}
                                        className="p-2 rounded-xl border border-app-border text-app-danger"
                                        aria-label="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AgendaProgramacionSlidesPage;
