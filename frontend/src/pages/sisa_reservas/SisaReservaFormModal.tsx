import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import AppSelect, { type AppSelectOption } from '@/components/ui/AppSelect';
import {
    PERMISSION_SISA_RESERVAS_MANAGE,
    SISA_DEFAULT_CODIGO_TELEFONICO,
    SISA_ESTADOS_RESERVA,
    SISA_MOTIVOS_RESERVA,
    sisaEstadoLabel,
} from '@/constants/sisaReservas';
import { useCountryDialCodes, nationalPhoneHint, onlyDigits } from '@/hooks/useCountryDialCodes';
import { type DialAppOption, formatDialOptionLabel } from '@/pages/sisa_reservas/sisaDialSelectFormat';
import SisaPlanoMiniPicker from '@/pages/sisa_reservas/SisaPlanoMiniPicker';
import {
    getSisaPlano,
    listSisaMesas,
    listSisaZonas,
    SISA_LIST_STALE_MS,
} from '@/services/sisaReservasService';
import type { SisaMesa, SisaReservaPayload, SisaReservaRegistro, SisaZona } from '@/services/sisaReservasService';
import { userHasCodename } from '@/utils/documentosGcbUtils';
import type { useAuth } from '@/context/AuthContext';

export type SisaReservaFormModalProps = {
    open: boolean;
    onClose: () => void;
    token: string;
    user: ReturnType<typeof useAuth>['user'];
    mode: 'create' | 'edit';
    initial: SisaReservaRegistro | null;
    zonas: SisaZona[];
    onSave: (body: SisaReservaPayload) => Promise<void>;
};

const EMPTY_SISA_MESAS: SisaMesa[] = [];

function timeInputValue(horaApi: string): string {
    if (!horaApi) return '12:00';
    const p = horaApi.slice(0, 5);
    return /^\d{2}:\d{2}$/.test(p) ? p : '12:00';
}

const SisaReservaFormModal: React.FC<SisaReservaFormModalProps> = ({
    open,
    onClose,
    token,
    user,
    mode,
    initial,
    zonas,
    onSave,
}) => {
    const qc = useQueryClient();
    const canManage = userHasCodename(user, PERMISSION_SISA_RESERVAS_MANAGE);
    const { data: dialOptions = [], isLoading: dialLoading } = useCountryDialCodes();

    const { data: zonasQ, isFetching: fetchingZonas } = useQuery({
        queryKey: ['sisa-zonas'],
        queryFn: () => listSisaZonas(token),
        enabled: open && !!token,
        staleTime: SISA_LIST_STALE_MS,
        placeholderData: () => {
            const cache = qc.getQueryData<SisaZona[]>(['sisa-zonas']);
            return cache != null && cache.length > 0 ? cache : undefined;
        },
    });

    const zonasEff = zonasQ !== undefined ? zonasQ : zonas;
    const loadingZonas = !!open && !!token && fetchingZonas && zonasEff.length === 0;

    const { data: allMesasQ, isPending: mesasPending } = useQuery({
        queryKey: ['sisa-mesas-all'],
        queryFn: () => listSisaMesas(token),
        enabled: open && !!token,
        staleTime: SISA_LIST_STALE_MS,
        placeholderData: () => {
            const cache = qc.getQueryData<Awaited<ReturnType<typeof listSisaMesas>>>(['sisa-mesas-all']);
            return cache != null && cache.length > 0 ? cache : undefined;
        },
    });

    const allMesas = allMesasQ ?? EMPTY_SISA_MESAS;
    const mesasFetched = !mesasPending || allMesasQ !== undefined;

    const dialSelectOptions: DialAppOption[] = useMemo(
        () =>
            dialOptions.map((o) => ({
                value: o.cca2,
                label: `${o.name} (${o.dial})`,
                ...(o.flagUrl ? { flagUrl: o.flagUrl } : {}),
            })),
        [dialOptions]
    );

    const [cca2, setCca2] = useState('PE');
    const [fecha, setFecha] = useState('');
    const [hora, setHora] = useState('12:00');
    const [motivo, setMotivo] = useState<string>(SISA_MOTIVOS_RESERVA[0]);
    const [numPersonas, setNumPersonas] = useState(2);
    const [zonaId, setZonaId] = useState<number | ''>('');
    const [mesaId, setMesaId] = useState<number | '' | null>(null);
    const [nombre, setNombre] = useState('');
    const [numeroTel, setNumeroTel] = useState('');
    const [email, setEmail] = useState('');
    const [comentario, setComentario] = useState('');
    const [estado, setEstado] = useState<string>('pendiente');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const planoHoraKey = hora.length >= 5 ? hora.slice(0, 5) : hora;
    const {
        data: planoData,
        isFetching: planoFetching,
        isPending: planoPending,
        isError: planoError,
    } = useQuery({
        queryKey: ['sisa-plano', token, fecha, planoHoraKey],
        queryFn: () => getSisaPlano(token, fecha, planoHoraKey),
        enabled: open && !!token && !!fecha,
        staleTime: SISA_LIST_STALE_MS,
    });

    const mesasZona = useMemo(() => {
        if (zonaId === '') return [];
        return allMesas.filter((m) => m.zona_id === zonaId);
    }, [allMesas, zonaId]);

    const selectedDial = useMemo(() => {
        const row = dialOptions.find((d) => d.cca2 === cca2);
        return row?.dial ?? SISA_DEFAULT_CODIGO_TELEFONICO;
    }, [dialOptions, cca2]);

    const phoneHint = nationalPhoneHint(cca2);

    const mesaOptions: AppSelectOption<number | null>[] = useMemo(() => {
        const base: AppSelectOption<number | null>[] = [
            { value: null, label: 'Sin mesa' },
            ...mesasZona.filter((m) => m.is_active).map((m) => ({ value: m.id, label: `Mesa ${m.numero}` })),
        ];
        if (mode === 'edit' && initial?.mesa_id != null && !base.some((o) => o.value === initial.mesa_id)) {
            const fromAny = allMesas.find((m) => m.id === initial.mesa_id);
            base.push({
                value: initial.mesa_id,
                label: fromAny ? `Mesa ${fromAny.numero}` : `Mesa #${initial.mesa_id}`,
            });
        }
        return base;
    }, [mesasZona, mode, initial, allMesas]);

    const zonaOptions: AppSelectOption<number>[] = useMemo(
        () => zonasEff.map((z) => ({ value: z.id, label: z.nombre })),
        [zonasEff]
    );

    const motivoOptions: AppSelectOption<string>[] = useMemo(() => {
        const base = SISA_MOTIVOS_RESERVA.map((m) => ({ value: m, label: m }));
        if (mode === 'edit' && initial?.motivo_reserva && !base.some((o) => o.value === initial.motivo_reserva)) {
            return [...base, { value: initial.motivo_reserva, label: initial.motivo_reserva }];
        }
        return base;
    }, [mode, initial]);

    const estadoOptions: AppSelectOption<string>[] = useMemo(() => {
        const base = SISA_ESTADOS_RESERVA.map((s) => ({ value: s, label: sisaEstadoLabel(s) }));
        if (mode === 'edit' && initial?.estado && !base.some((o) => o.value === initial.estado)) {
            return [...base, { value: initial.estado, label: sisaEstadoLabel(initial.estado) }];
        }
        return base;
    }, [mode, initial]);

    const zonasEffKey = useMemo(() => zonasEff.map((z) => z.id).join(','), [zonasEff]);

    useEffect(() => {
        if (!open) return;
        setError(null);
        if (mode === 'edit' && initial) {
            setFecha(initial.fecha_reserva);
            setHora(timeInputValue(initial.hora_reserva));
            setMotivo(initial.motivo_reserva);
            setNumPersonas(initial.numero_personas);
            setZonaId(initial.zona_id);
            setMesaId(initial.mesa_id);
            setNombre(initial.nombre_completo);
            setNumeroTel(initial.numero_telefono);
            setEmail(initial.email ?? '');
            setComentario(initial.comentario ?? '');
            setEstado(initial.estado);
        } else {
            const today = new Date().toISOString().slice(0, 10);
            setFecha(today);
            setHora('13:00');
            setMotivo(SISA_MOTIVOS_RESERVA[0]);
            setNumPersonas(2);
            setZonaId(zonasEff[0]?.id ?? '');
            setMesaId(null);
            setNombre('');
            setNumeroTel('');
            setEmail('');
            setComentario('');
            setEstado('pendiente');
            setCca2('PE');
        }
    }, [open, mode, initial, zonasEffKey]);

    useEffect(() => {
        if (!open || mode !== 'create') return;
        if (zonaId === '' && zonasEff[0]) setZonaId(zonasEff[0].id);
    }, [open, mode, zonaId, zonasEffKey]);

    useEffect(() => {
        if (!open || dialOptions.length === 0) return;
        if (mode === 'edit' && initial) {
            const match = dialOptions.find((d) => d.dial === initial.codigo_telefonico);
            setCca2(match?.cca2 ?? 'PE');
        }
    }, [open, mode, initial, dialOptions]);

    const selectedZonaOpt = zonaOptions.find((o) => o.value === zonaId) ?? null;
    const selectedMesaOpt = useMemo(() => {
        const v = mesaId === '' ? null : mesaId;
        const found = mesaOptions.find((o) => o.value === v);
        if (found) return found;
        if (!mesasFetched && v != null && mode === 'edit' && initial?.mesa_id === v) {
            const fromAny = allMesas.find((m) => m.id === v);
            return { value: v, label: fromAny ? `Mesa ${fromAny.numero}` : `Mesa #${v}` };
        }
        return mesaOptions[0] ?? null;
    }, [mesaOptions, mesaId, mesasFetched, mode, initial, allMesas]);
    const selectedCca2Opt = dialSelectOptions.find((o) => o.value === cca2) ?? dialSelectOptions[0] ?? null;
    const selectedMotivoOpt = useMemo(() => {
        const found = motivoOptions.find((o) => o.value === motivo);
        return found ?? motivoOptions[0] ?? null;
    }, [motivoOptions, motivo]);
    const selectedEstadoOpt = useMemo(() => {
        const found = estadoOptions.find((o) => o.value === estado);
        return found ?? estadoOptions[0] ?? null;
    }, [estadoOptions, estado]);

    if (!open) return null;

    const submit = async () => {
        if (!canManage) return;
        setError(null);
        const digits = onlyDigits(numeroTel);
        if (digits.length < phoneHint.min || digits.length > phoneHint.max) {
            setError(`Teléfono: se esperan ${phoneHint.hint} (${phoneHint.min}–${phoneHint.max} dígitos).`);
            return;
        }
        if (zonasEff.length === 0) {
            setError('Cree una zona primero.');
            return;
        }
        if (!nombre.trim() || zonaId === '') {
            setError('Complete nombre y zona.');
            return;
        }
        const horaSend = hora.length === 5 ? `${hora}:00` : hora;
        const body: SisaReservaPayload = {
            fecha_reserva: fecha,
            hora_reserva: horaSend,
            motivo_reserva: motivo,
            numero_personas: numPersonas,
            zona_id: zonaId as number,
            mesa_id: mesaId === '' || mesaId === null ? null : mesaId,
            nombre_completo: nombre.trim(),
            codigo_telefonico: selectedDial,
            numero_telefono: digits,
            email: email.trim() || null,
            comentario: comentario.trim() || null,
            estado: estado as SisaReservaPayload['estado'],
        };
        setSubmitting(true);
        try {
            await onSave(body);
            onClose();
        } catch {
            /* error: SweetAlert desde onError de la mutación en la lista */
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Cerrar" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative z-10 w-full max-w-xl rounded-2xl border border-app-border bg-app-modal-solid p-6 shadow-2xl my-8"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-tight text-[var(--app-sisa-reservas-accent)]">
                        {mode === 'create' ? 'Nueva reserva' : 'Editar reserva'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl text-app-muted hover:bg-app-card-hover">
                        <X size={20} />
                    </button>
                </div>

                {error && <p className="mb-3 text-xs text-app-danger">{error}</p>}
                {zonasEff.length === 0 && (
                    <p className="mb-3 text-xs text-app-warning">
                        No hay zonas. Use «Zonas y mesas» en la lista para crear al menos una zona antes de guardar.
                    </p>
                )}

                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="text-[9px] font-black uppercase text-app-muted">
                            Fecha
                            <input
                                type="date"
                                className="mt-1 w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm"
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                            />
                        </label>
                        <label className="text-[9px] font-black uppercase text-app-muted">
                            Hora
                            <input
                                type="time"
                                className="mt-1 w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm"
                                value={hora}
                                onChange={(e) => setHora(e.target.value)}
                            />
                        </label>
                    </div>

                    <div>
                        <label
                            htmlFor="sisa-reserva-motivo-select"
                            className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1"
                        >
                            Motivo
                        </label>
                        <AppSelect<string>
                            inputId="sisa-reserva-motivo-select"
                            options={motivoOptions}
                            value={selectedMotivoOpt}
                            onChange={(o) => o && setMotivo(o.value)}
                            isSearchable
                            size="sm"
                        />
                    </div>

                    <label className="text-[9px] font-black uppercase text-app-muted block">
                        Personas
                        <input
                            type="number"
                            min={1}
                            className="mt-1 w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm"
                            value={numPersonas}
                            onChange={(e) => setNumPersonas(Number(e.target.value) || 1)}
                        />
                    </label>

                    <div>
                        <label
                            htmlFor="sisa-reserva-zona-select"
                            className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1"
                        >
                            Zona
                            {loadingZonas && zonasEff.length === 0 && (
                                <span className="ml-2 font-normal normal-case text-[9px] text-app-muted">(cargando…)</span>
                            )}
                        </label>
                        <AppSelect<number>
                            inputId="sisa-reserva-zona-select"
                            options={zonaOptions}
                            value={selectedZonaOpt}
                            onChange={(o) => {
                                setZonaId(o?.value ?? '');
                                setMesaId(null);
                            }}
                            isSearchable
                            size="sm"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="sisa-reserva-mesa-select"
                            className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1"
                        >
                            Mesa <span className="font-normal normal-case text-[9px] text-app-muted">(opcional)</span>
                        </label>
                        <AppSelect<number | null>
                            inputId="sisa-reserva-mesa-select"
                            options={mesaOptions}
                            value={selectedMesaOpt}
                            onChange={(o) => setMesaId(o?.value ?? null)}
                            isSearchable={false}
                            size="sm"
                            isDisabled={zonaId === ''}
                        />
                    </div>

                    {!!token && !!fecha && zonasEff.length > 0 && (
                        <div
                            className="rounded-xl border border-app-border p-3 space-y-2"
                            style={{ backgroundColor: 'var(--app-input-bg)' }}
                        >
                            <p className="text-[10px] font-black uppercase tracking-widest text-app-muted">
                                Plano · toque una mesa libre
                            </p>
                            {planoError ? (
                                <p className="text-xs text-app-danger">
                                    No se pudo cargar el plano. Use los selectores de zona y mesa arriba.
                                </p>
                            ) : (
                                <SisaPlanoMiniPicker
                                    data={planoData ?? null}
                                    loading={!planoData && (planoPending || planoFetching)}
                                    selectedMesaId={typeof mesaId === 'number' ? mesaId : null}
                                    excludeReservaId={mode === 'edit' && initial ? initial.id : null}
                                    onPickMesa={(zonaIdP, mesaIdP) => {
                                        setZonaId(zonaIdP);
                                        setMesaId(mesaIdP);
                                    }}
                                />
                            )}
                        </div>
                    )}

                    <label className="text-[9px] font-black uppercase text-app-muted block">
                        Nombre completo
                        <input
                            className="mt-1 w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                        />
                    </label>

                    <div className="rounded-xl border  border-app-border bg-app-input/30 p-3 space-y-2">
                        <p className="text-[9px] font-normal normal-case text-app-muted">
                            {dialLoading ? 'Cargando códigos y banderas…' : `Se aplicará ${selectedDial} · ${phoneHint.hint}`}
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-3">
                            <div className="sm:w-[min(100%,13.5rem)] sm:shrink-0 min-w-0">
                                <label
                                    htmlFor="sisa-reserva-pais-select"
                                    className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1"
                                >
                                    País / prefijo
                                </label>
                                <AppSelect<string>
                                    inputId="sisa-reserva-pais-select"
                                    options={dialSelectOptions}
                                    value={selectedCca2Opt}
                                    onChange={(o) => o && setCca2(o.value)}
                                    formatOptionLabel={formatDialOptionLabel}
                                    isSearchable
                                    size="sm"
                                    isDisabled={dialLoading || dialSelectOptions.length === 0}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <label
                                    htmlFor="sisa-reserva-numero-input"
                                    className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1"
                                >
                                    Número (solo dígitos)
                                </label>
                                <input
                                    id="sisa-reserva-numero-input"
                                    className="w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm font-mono min-h-[42px] sm:min-h-[36px]"
                                    inputMode="numeric"
                                    autoComplete="tel-national"
                                    value={numeroTel}
                                    onChange={(e) => setNumeroTel(onlyDigits(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>

                    <label className="text-[9px] font-black uppercase text-app-muted block">
                        Email (opcional)
                        <input
                            type="email"
                            className="mt-1 w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </label>

                    <label className="text-[9px] font-black uppercase text-app-muted block">
                        Comentario (opcional)
                        <textarea
                            className="mt-1 w-full rounded-xl border border-app-border bg-app-input px-3 py-2 text-sm min-h-[72px]"
                            value={comentario}
                            onChange={(e) => setComentario(e.target.value)}
                        />
                    </label>

                    <div>
                        <label
                            htmlFor="sisa-reserva-estado-select"
                            className="block text-[10px] font-black uppercase tracking-widest text-app-muted mb-1"
                        >
                            Estado
                        </label>
                        <AppSelect<string>
                            inputId="sisa-reserva-estado-select"
                            options={estadoOptions}
                            value={selectedEstadoOpt}
                            onChange={(o) => o && setEstado(o.value)}
                            isSearchable
                            size="sm"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase text-app-muted hover:bg-app-card-hover"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={!canManage || submitting || zonas.length === 0}
                        onClick={() => void submit()}
                        className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase text-white disabled:opacity-40"
                        style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                    >
                        {submitting ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default SisaReservaFormModal;
