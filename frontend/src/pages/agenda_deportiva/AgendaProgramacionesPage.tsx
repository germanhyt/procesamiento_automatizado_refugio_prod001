import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, ChevronRight, Copy, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

import {
    AGENDA_MODO_OPTIONS,
    agendaModoLabel,
    formatAgendaRango,
    PERMISSION_AGENDA_MANAGE,
} from '@/constants/agendaDeportiva';
import { useAgendaMutations, useAgendaProgramaciones } from '@/hooks/useAgendaDeportiva';
import AgendaProgramacionFormModal from '@/pages/agenda_deportiva/AgendaProgramacionFormModal';
import { apiErrorDetail, type AgendaProgramacion } from '@/services/agendaDeportivaService';
import { userHasCodename } from '@/utils/documentosGcbUtils';
import { useAuth } from '@/context/AuthContext';

const AgendaProgramacionesPage: React.FC = () => {
    const { user } = useAuth();
    const canManage = userHasCodename(user, PERMISSION_AGENDA_MANAGE);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRow, setEditingRow] = useState<AgendaProgramacion | null>(null);

    const listQuery = useAgendaProgramaciones();
    const { createProgramacion, updateProgramacion, deleteProgramacion, activarProgramacion, duplicateProgramacion } =
        useAgendaMutations();

    const rows = listQuery.data ?? [];

    const handleCreate = async (payload: Parameters<typeof createProgramacion.mutateAsync>[0]) => {
        try {
            const created = await createProgramacion.mutateAsync(payload);
            setModalOpen(false);
            void Swal.fire({
                icon: 'success',
                title: 'Programación creada',
                text: `ID ${created.id}. Ahora puedes subir imágenes.`,
                timer: 2200,
                showConfirmButton: false,
            });
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const handleEdit = async (payload: Parameters<typeof createProgramacion.mutateAsync>[0]) => {
        if (!editingRow) return;
        try {
            await updateProgramacion.mutateAsync({ id: editingRow.id, payload });
            setEditingRow(null);
            setModalOpen(false);
            void Swal.fire({
                icon: 'success',
                title: 'Programación actualizada',
                timer: 1800,
                showConfirmButton: false,
            });
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const handleDelete = async (id: number, label: string) => {
        const confirm = await Swal.fire({
            icon: 'warning',
            title: 'Eliminar programación',
            text: `¿Eliminar "${label}" y todas sus imágenes?`,
            showCancelButton: true,
            confirmButtonText: 'Eliminar',
            cancelButtonText: 'Cancelar',
        });
        if (!confirm.isConfirmed) return;
        try {
            await deleteProgramacion.mutateAsync(id);
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const handleActivar = async (id: number) => {
        try {
            await activarProgramacion.mutateAsync(id);
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    const handleDuplicar = async (id: number, modoActual: Parameters<typeof duplicateProgramacion.mutateAsync>[0]['payload']['modo']) => {
        const now = new Date().toISOString().slice(0, 10);
        const optionsHtml = AGENDA_MODO_OPTIONS.map(
            (item) =>
                `<option value="${item.value}" ${item.value === modoActual ? 'selected' : ''}>${item.label}</option>`
        ).join('');
        const result = await Swal.fire({
            title: 'Duplicar programación',
            html: `
                <div style="display:grid;gap:10px;text-align:left;">
                  <label style="font-size:12px;">Modo</label>
                  <select id="agenda-dup-modo" class="swal2-input" style="margin:0;">${optionsHtml}</select>
                  <label style="font-size:12px;">Fecha de referencia</label>
                  <input id="agenda-dup-fecha" type="date" class="swal2-input" style="margin:0;" value="${now}" />
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Duplicar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const fecha = (document.getElementById('agenda-dup-fecha') as HTMLInputElement | null)?.value;
                const modo = (document.getElementById('agenda-dup-modo') as HTMLSelectElement | null)?.value;
                if (!fecha || !modo) {
                    Swal.showValidationMessage('Completa modo y fecha');
                    return null;
                }
                return { fecha_referencia: fecha, modo };
            },
        });
        if (!result.isConfirmed || !result.value) return;
        try {
            await duplicateProgramacion.mutateAsync({ id, payload: result.value });
            void Swal.fire({
                icon: 'success',
                title: 'Programación duplicada',
                timer: 1800,
                showConfirmButton: false,
            });
        } catch (error) {
            void Swal.fire({ icon: 'error', title: 'Error', text: apiErrorDetail(error) });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center border"
                        style={{
                            borderColor: 'var(--app-agenda-accent-muted)',
                            backgroundColor: 'var(--app-agenda-accent-muted-bg)',
                            color: 'var(--app-agenda-accent)',
                        }}
                    >
                        <CalendarRange size={22} />
                    </div>
                    <div>
                        <h1 className="text-lg font-black uppercase tracking-tight text-app-text">Programaciones</h1>
                        <p className="text-[10px] text-app-muted uppercase tracking-widest">
                            Imágenes ordenadas · modo día, semana o mes
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => listQuery.refetch()}
                        className="inline-flex items-center gap-2 rounded-xl border border-app-border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover"
                    >
                        <RefreshCw size={14} className={listQuery.isFetching ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => {
                                setEditingRow(null);
                                setModalOpen(true);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black"
                            style={{ backgroundColor: 'var(--app-agenda-accent)' }}
                        >
                            <Plus size={14} />
                            Nueva
                        </button>
                    )}
                </div>
            </div>

            {listQuery.isLoading && (
                <p className="text-sm text-app-muted">Cargando programaciones…</p>
            )}

            {!listQuery.isLoading && rows.length === 0 && (
                <div
                    className="rounded-2xl border border-dashed p-10 text-center"
                    style={{ borderColor: 'var(--app-border)' }}
                >
                    <p className="text-sm text-app-muted">No hay programaciones. Crea la primera para la cartelera.</p>
                </div>
            )}

            <div className="grid gap-3">
                {rows.map((row) => {
                    const label = row.titulo || formatAgendaRango(row.fecha_inicio, row.fecha_fin);
                    const modoLabel = agendaModoLabel(row.modo);
                    return (
                        <div
                            key={row.id}
                            className="rounded-2xl border p-4 flex flex-wrap items-center gap-4 justify-between"
                            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-card)' }}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span
                                        className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border"
                                        style={{
                                            borderColor: 'var(--app-agenda-accent-muted)',
                                            color: 'var(--app-agenda-accent)',
                                        }}
                                    >
                                        {modoLabel}
                                    </span>
                                    {row.activa ? (
                                        <span className="text-[10px] font-black uppercase tracking-widest text-app-success">
                                            Activa
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                            Inactiva
                                        </span>
                                    )}
                                    <span className="text-[10px] text-app-muted">
                                        {row.slides?.length ?? 0} slide(s)
                                    </span>
                                </div>
                                <p className="font-semibold text-app-text truncate">{label}</p>
                                <p className="text-xs text-app-muted mt-0.5">
                                    {formatAgendaRango(row.fecha_inicio, row.fecha_fin)}
                                </p>
                                <p className="text-xs text-app-muted mt-0.5">Lugar: {row.categoria_lugar}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {canManage && !row.activa && (
                                    <button
                                        type="button"
                                        onClick={() => handleActivar(row.id)}
                                        className="rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest"
                                        style={{
                                            borderColor: 'var(--app-agenda-accent-muted)',
                                            color: 'var(--app-agenda-accent)',
                                        }}
                                    >
                                        Activar
                                    </button>
                                )}
                                <Link
                                    to={`/agenda-deportiva/programaciones/${row.id}`}
                                    className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black"
                                    style={{ backgroundColor: 'var(--app-agenda-accent)' }}
                                >
                                    Gestionar
                                    <ChevronRight size={14} />
                                </Link>
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingRow(row);
                                            setModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-xl border border-app-border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover"
                                    >
                                        <Pencil size={14} />
                                        Editar
                                    </button>
                                )}
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => handleDuplicar(row.id, row.modo)}
                                        className="inline-flex items-center gap-1 rounded-xl border border-app-border px-3 py-2 text-[10px] font-black uppercase tracking-widest text-app-muted hover:bg-app-card-hover"
                                    >
                                        <Copy size={14} />
                                        Duplicar
                                    </button>
                                )}
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(row.id, label)}
                                        className="p-2 rounded-xl border border-app-border text-app-danger hover:bg-app-danger-muted"
                                        aria-label="Eliminar"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <AgendaProgramacionFormModal
                open={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingRow(null);
                }}
                onSubmit={editingRow ? handleEdit : handleCreate}
                busy={createProgramacion.isPending || updateProgramacion.isPending}
                title={editingRow ? 'Editar programación' : 'Nueva programación'}
                submitLabel={editingRow ? 'Actualizar' : 'Crear'}
                initialData={
                    editingRow
                        ? {
                              titulo: editingRow.titulo,
                              categoria_lugar: editingRow.categoria_lugar,
                              modo: editingRow.modo,
                              fecha_inicio: editingRow.fecha_inicio,
                              fecha_fin: editingRow.fecha_fin,
                              activa: editingRow.activa,
                          }
                        : null
                }
            />
        </div>
    );
};

export default AgendaProgramacionesPage;
