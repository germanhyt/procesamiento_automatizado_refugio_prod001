import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import type { StylesConfig } from 'react-select';

import AppSelect from '@/components/ui/AppSelect';
import logoSisa from '@/assets/logo-sisa.svg';
import {
    SISA_BUSINESS_TIMEZONE,
    SISA_DEFAULT_CODIGO_TELEFONICO,
    SISA_MOTIVOS_RESERVA,
    SISA_SITE_URL,
    calendarDateYYYYMMDDInSisaTZ,
    fechaReservaEsHoyOFuturaSisaTZ,
} from '@/constants/sisaReservas';
import { nationalPhoneHint, onlyDigits, useCountryDialCodes } from '@/hooks/useCountryDialCodes';
import SisaPlanoMiniPicker from '@/pages/sisa_reservas/SisaPlanoMiniPicker';
import { type DialAppOption, formatDialOptionLabel } from '@/pages/sisa_reservas/sisaDialSelectFormat';
import { sisaSwalSuccess } from '@/pages/sisa_reservas/sisaReservasSwal';
import type { SisaPlanoResponse } from '@/services/sisaReservasService';
import {
    SISA_LIST_STALE_MS,
    createSisaPublicReserva,
    fetchSisaPublicPlano,
} from '@/services/sisaReservasService';

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type Motivo = (typeof SISA_MOTIVOS_RESERVA)[number];
type Errors = Partial<
    Record<
        | 'fecha'
        | 'hora'
        | 'motivo'
        | 'personas'
        | 'zona'
        | 'mesa'
        | 'nombre'
        | 'telefono'
        | 'email'
        | 'terms'
        | '_',
        string
    >
>;

function apiErr(err: unknown): string {
    if (!axios.isAxiosError(err)) return 'Sin conexión con el servidor. Intente más tarde.';
    const d = err.response?.data?.detail;
    if (typeof d === 'string') return d;
    return 'No pudimos registrar la solicitud. Revise los datos.';
}

/** Misma filosofía que `SisaReservaFormModal`: etiqueta corta + control. */
function Field(props: {
    id?: string;
    label: React.ReactNode;
    optional?: boolean;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={props.id} className="flex items-baseline gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500">{props.label}</span>
                {props.optional ? (
                    <span className="text-[9px] font-medium normal-case tracking-normal text-stone-400">Opcional</span>
                ) : null}
            </label>
            {props.children}
            {props.error ? <p className="text-[11px] font-medium text-red-700/95">{props.error}</p> : null}
        </div>
    );
}

const SisaPublicReservaPage: React.FC = () => {
    const todayLima = useMemo(() => calendarDateYYYYMMDDInSisaTZ(), []);
    const { data: dialOptions = [], isLoading: dialLoading } = useCountryDialCodes();

    const dialRows = useMemo(() => {
        if (dialOptions.length) return dialOptions;
        return [{ cca2: 'PE', name: 'Perú', dial: SISA_DEFAULT_CODIGO_TELEFONICO }];
    }, [dialOptions]);

    const dialSelectOptions = useMemo<DialAppOption[]>(
        () =>
            dialRows.map((row) => ({
                value: row.cca2,
                label: `${row.name} (${row.dial})`,
                ...(row.flagUrl ? { flagUrl: row.flagUrl } : {}),
            })),
        [dialRows]
    );

    const dialByCca = useMemo(() => {
        const m = new Map<string, (typeof dialRows)[number]>();
        for (const r of dialRows) if (!m.has(r.cca2)) m.set(r.cca2, r);
        return m;
    }, [dialRows]);

    const sisaPublicPhoneSelectStyles = useMemo<StylesConfig<DialAppOption, false>>(
        () => ({
            control: (base, state) => ({
                ...base,
                marginTop: '0.125rem',
                backgroundColor: '#fffefb',
                borderColor: state.isFocused ? 'rgba(18, 81, 40, 0.4)' : 'rgba(59, 53, 46, 0.16)',
                borderRadius: '0.8125rem',
                minHeight: 42,
                fontSize: '0.875rem',
                paddingLeft: 4,
                boxShadow: state.isFocused ? '0 0 0 3px rgba(40, 130, 72, 0.11)' : 'none',
            }),
            menu: (base) => ({
                ...base,
                borderRadius: '0.8125rem',
                backgroundColor: '#fffefb',
                border: '1px solid rgba(59, 53, 46, 0.16)',
            }),
            menuList: (base) => ({ ...base, maxHeight: 280 }),
            singleValue: (base) => ({ ...base, color: '#1c1917', marginRight: 2 }),
            placeholder: (base) => ({ ...base, color: '#78716c' }),
            input: (base) => ({ ...base, color: '#1c1917' }),
            option: (base, state) => ({
                ...base,
                backgroundColor: state.isFocused ? 'rgba(40, 130, 72, 0.1)' : 'transparent',
                color: '#1c1917',
            }),
            dropdownIndicator: (base) => ({ ...base, color: '#57534e' }),
        }),
        []
    );

    const [fecha, setFecha] = useState(todayLima);
    const [hora, setHora] = useState('13:00');
    const [motivo, setMotivo] = useState<Motivo>(() => SISA_MOTIVOS_RESERVA[0]);
    const [numPersonas, setNumPersonas] = useState(2);
    const [zonaId, setZonaId] = useState<number | ''>('');
    const [mesaId, setMesaId] = useState<number | null>(null);
    const [nombre, setNombre] = useState('');
    const [cca2, setCca2] = useState('PE');
    const [numeroTel, setNumeroTel] = useState('');
    const [email, setEmail] = useState('');
    const [comentario, setComentario] = useState('');
    const [terms, setTerms] = useState(false);
    const [err, setErr] = useState<Errors>({});

    const dialSelectValue = useMemo(
        () => dialSelectOptions.find((o) => o.value === cca2) ?? dialSelectOptions[0] ?? null,
        [dialSelectOptions, cca2]
    );

    const planoHora = hora.length >= 5 ? hora.slice(0, 5) : hora;
    const ready = fecha.length >= 10 && planoHora.length >= 4;

    const planoQ = useQuery({
        queryKey: ['sisa-public-plano', fecha, planoHora],
        queryFn: () => fetchSisaPublicPlano(fecha, planoHora),
        enabled: ready,
        staleTime: SISA_LIST_STALE_MS,
    });

    const plano: SisaPlanoResponse | null = planoQ.data ?? null;

    useEffect(() => {
        const z = planoQ.data?.zonas;
        if (!z?.length) {
            setZonaId('');
            setMesaId(null);
            return;
        }
        const ids = z.map((s) => s.zona.id);
        if (zonaId === '' || (typeof zonaId === 'number' && !ids.includes(zonaId))) {
            setZonaId(ids[0] ?? '');
            setMesaId(null);
        }
    }, [planoQ.data]); // reconciliar cuando cambia fecha/hora o API

    const zonaSlot = useMemo(() => {
        if (!plano || zonaId === '') return null;
        return plano.zonas.find((s) => s.zona.id === zonaId) ?? null;
    }, [plano, zonaId]);

    const mesasLibres = useMemo(
        () => zonaSlot?.mesas.filter(({ mesa: m, reserva: r }) => m.is_active && !r) ?? [],
        [zonaSlot]
    );
    const selectedSlot = zonaSlot?.mesas.find(({ mesa }) => mesa.id === mesaId) ?? null;

    useEffect(() => {
        if (mesaId != null && selectedSlot?.reserva) setMesaId(null);
    }, [mesaId, selectedSlot?.reserva]);

    const dial = useMemo(() => dialByCca.get(cca2)?.dial ?? SISA_DEFAULT_CODIGO_TELEFONICO, [dialByCca, cca2]);
    const phoneHint = nationalPhoneHint(cca2);

    const send = useMutation({ mutationFn: createSisaPublicReserva });

    function validate(): Errors {
        const e: Errors = {};
        if (!fecha) e.fecha = 'Indique fecha.';
        else if (!fechaReservaEsHoyOFuturaSisaTZ(fecha)) e.fecha = `Sin fechas pasadas (${SISA_BUSINESS_TIMEZONE}).`;
        if (!hora || planoHora.length < 4) e.hora = 'Indique hora.';
        if (!motivo) e.motivo = 'Elija motivo.';
        if (!Number.isFinite(numPersonas) || numPersonas < 1) e.personas = 'Al menos 1 persona.';
        if (zonaId === '') e.zona = 'Elija zona.';
        if (zonaId !== '' && mesaId != null) {
            if (!selectedSlot?.mesa || selectedSlot.mesa.zona_id !== zonaId) e.mesa = 'Mesa no válida.';
            else if (selectedSlot.reserva) e.mesa = 'Esa mesa ya está ocupada en este horario.';
            else if (
                selectedSlot.mesa.capacidad != null &&
                Number.isFinite(numPersonas) &&
                numPersonas > selectedSlot.mesa.capacidad
            ) {
                e.personas = `La mesa admite hasta ${selectedSlot.mesa.capacidad} persona(s).`;
            }
        }
        if (nombre.trim().length < 3) e.nombre = 'Nombre completo (mínimo 3 caracteres).';
        const d = onlyDigits(numeroTel);
        if (d.length < phoneHint.min || d.length > phoneHint.max) {
            e.telefono = `${phoneHint.hint} (${phoneHint.min}–${phoneHint.max} dígitos)`;
        }
        const mail = email.trim();
        if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) e.email = 'Correo no válido.';
        if (!terms) e.terms = 'Confirme para enviar.';
        return e;
    }

    async function submit(ev: React.FormEvent) {
        ev.preventDefault();
        const e = validate();
        setErr(e);
        if (Object.keys(e).length || zonaId === '') return;
        send.reset();
        try {
            const horaSend = hora.length === 5 ? `${hora}:00` : hora;
            await send.mutateAsync({
                fecha_reserva: fecha,
                hora_reserva: horaSend,
                motivo_reserva: motivo,
                numero_personas: numPersonas,
                zona_id: zonaId,
                mesa_id: mesaId,
                nombre_completo: nombre.trim(),
                codigo_telefonico: dial,
                numero_telefono: onlyDigits(numeroTel),
                email: email.trim() || null,
                comentario: comentario.trim() || null,
            });
            setErr({});
            setNombre('');
            setNumeroTel('');
            setEmail('');
            setComentario('');
            setTerms(false);
            setMesaId(null);
            await sisaSwalSuccess(
                'Solicitud enviada',
                'Su reserva quedó registrada como pendiente. Sisa Café se pondrá en contacto para confirmar disponibilidad.',
                {
                    secondaryLink: {
                        label: 'Ir a sisacoffee.pe',
                        href: SISA_SITE_URL,
                    },
                }
            );
            send.reset();
        } catch (x) {
            setErr({ _: apiErr(x) });
        }
    }

    function clearErrors() {
        setErr({});
    }

    const panelMotion = {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.26, ease: EASE_OUT },
    } as const;

    return (
        <div className="sisa-public-reserva-scope relative min-h-screen py-12 px-4 sm:py-16">
            <a
                href={SISA_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="fixed top-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-stone-300/65 bg-[#fdfbf7]/95 px-3.5 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-stone-800 shadow-sm backdrop-blur-sm hover:bg-white"
            >
                Volver
                <ExternalLink size={13} aria-hidden />
            </a>

            {/* Un solo bloque principal (sin elemento <header>) */}
            <div className="mx-auto w-full max-w-[36rem]">
                <motion.div
                    layout
                    initial={false}
                    className="overflow-hidden rounded-[1.65rem] border border-emerald-900/14 bg-[#fcf9f6]/94 shadow-[0_22px_50px_-24px_rgba(18,81,40,0.35)] backdrop-blur-md ring-1 ring-white/55"
                >
                    <div className="relative border-b border-stone-200/80 bg-gradient-to-br from-[#fdfbf9] via-white/90 to-emerald-50/45 px-5 py-6">
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_-20%,rgba(40,130,72,0.11),transparent_52%)]" />
                        <div className="relative flex items-start gap-3">
                            <img src={logoSisa} alt="" className="h-11 w-auto shrink-0 select-none opacity-95" draggable={false} />
                            <div className="min-w-0 pt-0.5 space-y-1">
                                <div className="text-[17px] font-semibold tracking-tight text-stone-900 leading-snug">Reserva Sisa Coffee</div>
                                <p className="text-[11.5px] leading-relaxed text-stone-500">
                                    {/* Reserva de mesa en Sisa Coffee. */}
                                    Experiencia gastronómica en un ambiente acogedor.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 px-5 py-6">
                        {err._ ? (
                            <p className="rounded-xl border border-red-100 bg-red-50/95 px-3.5 py-2.5 text-[12px] text-red-800">{err._}</p>
                        ) : null}

                        <form onSubmit={(e) => void submit(e)} className="space-y-5">
                            {/* Fecha / hora · como modal administrativo */}
                            <div className="grid gap-4 grid-cols-2">
                                <Field id="sisa-p-fecha" label="Fecha" error={err.fecha}>
                                    <>
                                        <input
                                            id="sisa-p-fecha"
                                            type="date"
                                            min={todayLima}
                                            value={fecha}
                                            onChange={(ev) => {
                                                clearErrors();
                                                setFecha(ev.target.value);
                                            }}
                                            className="sisa-public-control"
                                        />
                                        <p className="text-[10px] text-stone-400 normal-case">{SISA_BUSINESS_TIMEZONE}</p>
                                    </>
                                </Field>
                                <Field id="sisa-p-hora" label="Hora" error={err.hora}>
                                    <input
                                        id="sisa-p-hora"
                                        type="time"
                                        value={hora}
                                        onChange={(ev) => {
                                            clearErrors();
                                            setHora(ev.target.value);
                                        }}
                                        className="sisa-public-control"
                                    />
                                </Field>
                            </div>

                            <div className="grid gap-4 grid-cols-2">
                                <Field id="sisa-p-motivo" label="Motivo" error={err.motivo}>
                                    <select
                                        id="sisa-p-motivo"
                                        value={motivo}
                                        className="sisa-public-control font-medium normal-case"
                                        onChange={(ev) => {
                                            clearErrors();
                                            setMotivo(ev.target.value as Motivo);
                                        }}
                                    >
                                        {SISA_MOTIVOS_RESERVA.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field id="sisa-p-personas" label="Personas" error={err.personas}>
                                    <input
                                        id="sisa-p-personas"
                                        type="number"
                                        min={1}
                                        value={numPersonas}
                                        onChange={(ev) => {
                                            clearErrors();
                                            setNumPersonas(Number(ev.target.value) || 1);
                                        }}
                                        className="sisa-public-control"
                                    />
                                </Field>
                            </div>

                            {/* Zona + mesa: transiciones suaves al cambiar recinto */}
                            <div className="rounded-[1.1rem] border border-stone-200/95 bg-[#fffefb]/92 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-500">Zona y mesa</span>
                                    {!planoQ.isError ? (
                                        <span className="text-[9px] font-medium uppercase tracking-widest text-stone-400">
                                            {planoQ.isFetching ? 'Actualizando…' : ''}
                                        </span>
                                    ) : null}
                                </div>



                                {/* Plano SVG: entrada suave al cambiar horario/fecha */}
                                {ready && !planoQ.isError ? (
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={`${fecha}|${planoHora}`}
                                            initial={{ opacity: 0, scale: 0.985 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.995 }}
                                            transition={{ duration: 0.34, ease: EASE_OUT }}
                                            className="rounded-xl border border-stone-200/90 bg-white/90 "
                                        >
                                            <SisaPlanoMiniPicker
                                                data={plano}
                                                loading={planoQ.isFetching}
                                                selectedMesaId={mesaId}
                                                selectedZonaId={typeof zonaId === 'number' ? zonaId : null}
                                                onPickZona={(id) => {
                                                    clearErrors();
                                                    setZonaId(id);
                                                    setMesaId(null);
                                                }}
                                                onPickMesa={(zId, mId) => {
                                                    clearErrors();
                                                    setZonaId(zId);
                                                    setMesaId(mId);
                                                }}
                                                privacyMode
                                                tone="public"
                                            />
                                        </motion.div>
                                    </AnimatePresence>
                                ) : null}
                            </div>

                            <Field id="sisa-p-nombre" label="Nombre completo" error={err.nombre}>
                                <input
                                    id="sisa-p-nombre"
                                    autoComplete="name"
                                    value={nombre}
                                    placeholder="Ej. María Pérez"
                                    onChange={(ev) => {
                                        clearErrors();
                                        setNombre(ev.target.value);
                                    }}
                                    className="sisa-public-control font-medium normal-case"
                                />
                            </Field>

                            <div className="rounded-[1.1rem] border border-stone-200/95 bg-[#fffefb]/92 p-4 space-y-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-500">Contacto</div>
                                <Field id="sisa-p-tel" label="Teléfono" error={err.telefono}>
                                    <div className="space-y-1.5">
                                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
                                            <div className="w-full shrink-0 sm:w-[min(100%,13.5rem)] sm:max-w-[13.5rem]">
                                                <AppSelect<string>
                                                    inputId="sisa-p-dial"
                                                    aria-label="País y prefijo internacional"
                                                    size="sm"
                                                    isSearchable
                                                    options={dialSelectOptions}
                                                    value={dialSelectValue}
                                                    onChange={(opt) => {
                                                        clearErrors();
                                                        if (opt) setCca2(opt.value);
                                                    }}
                                                    formatOptionLabel={formatDialOptionLabel}
                                                    placeholder="País"
                                                    styles={sisaPublicPhoneSelectStyles}
                                                    isDisabled={dialLoading || dialSelectOptions.length === 0}
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <input
                                                    id="sisa-p-tel"
                                                    inputMode="numeric"
                                                    autoComplete="tel-national"
                                                    value={numeroTel}
                                                    placeholder="Número sin prefijo"
                                                    onChange={(ev) => {
                                                        clearErrors();
                                                        setNumeroTel(onlyDigits(ev.target.value));
                                                    }}
                                                    className="sisa-public-control font-mono"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-stone-400 normal-case">
                                            {dialLoading
                                                ? 'Cargando códigos y banderas…'
                                                : `Se aplicará ${dial} · ${phoneHint.hint}`}
                                        </p>
                                    </div>
                                </Field>
                                <Field id="sisa-p-mail" label="Correo" optional error={err.email}>
                                    <input
                                        id="sisa-p-mail"
                                        type="email"
                                        autoComplete="email"
                                        placeholder="Ej. nombre@servicio.com"
                                        value={email}
                                        onChange={(ev) => {
                                            clearErrors();
                                            setEmail(ev.target.value);
                                        }}
                                        className="sisa-public-control font-medium normal-case"
                                    />
                                </Field>
                                <Field id="sisa-p-com" label="Comentario" optional>
                                    <textarea
                                        id="sisa-p-com"
                                        placeholder="Ej. reunión equipo 6…"
                                        value={comentario}
                                        onChange={(ev) => setComentario(ev.target.value)}
                                        rows={3}
                                        className="sisa-public-control resize-y font-medium leading-relaxed normal-case min-h-[4.75rem]"
                                    />
                                </Field>
                            </div>

                            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-stone-200/95 bg-[#fffdf9]/70 px-3.5 py-3.5 text-[11.5px] font-medium leading-snug normal-case tracking-normal text-stone-700">
                                <input
                                    type="checkbox"
                                    checked={terms}
                                    onChange={(ev) => {
                                        clearErrors();
                                        setTerms(ev.target.checked);
                                    }}
                                    className="mt-[3px] size-4 rounded border-stone-300 accent-emerald-800"
                                />
                                <span>
                                    Confirmo que mis datos son correctos y que la solicitud queda pendiente de confirmación.
                                    {err.terms ? <span className="mt-1.5 block text-[11px] font-semibold text-red-700">{err.terms}</span> : null}
                                </span>
                            </label>

                            <button
                                type="submit"
                                disabled={send.isPending}
                                className="w-full rounded-2xl py-3.5 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-[0_10px_24px_-10px_rgba(18,81,40,0.55)] transition-[opacity,transform] duration-300 ease-out active:translate-y-[0.5px] disabled:opacity-45"
                                style={{ backgroundColor: 'var(--app-sisa-reservas-accent-strong)' }}
                            >
                                {send.isPending ? 'Enviando…' : 'Solicitar'}
                            </button>
                        </form>
                    </div>
                </motion.div>

                <p className="mt-8 text-center text-[10px] text-stone-500 normal-case tracking-normal">
                    <a href={SISA_SITE_URL} className="font-semibold text-stone-700 hover:underline underline-offset-2">
                        sisacoffee.pe
                    </a>
                </p>
            </div>
        </div>
    );
};

export default SisaPublicReservaPage;
