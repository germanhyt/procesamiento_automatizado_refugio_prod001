import React, { useState, useEffect, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RefreshCcw,
    FileCode,
    Link,
    Database,
    CloudSync,
    Trash2,
    ChevronRight,
    Upload,
    File,
    Plus,
    Search,
    Table,
    X,
    ShieldCheck,
    Layers,
    FolderOpen,
    Download,
    FileArchive,
    CalendarRange,
    Eye,
    BellRing,
    Webhook,
    Undo2,
    HelpCircle,
} from 'lucide-react';

import { LOCATARIOS } from '@/constants/locatarios';
import AppSelect from '@/components/ui/AppSelect';
import ProcessingStatusBadges from '@/components/procesamiento/ProcessingStatusBadges';
import ConsolidacionResultModal from '@/components/procesamiento/ConsolidacionResultModal';
import type { ConsolidacionResponse } from '@/services/consolidacionTypes';
import type { LocatarioArchivos } from '@/services/fuentesService';
import {
    fetchArchivosCierreCaja,
    fetchProcesadosFechas,
    fetchProcesadosArchivos,
    uploadBulkFuentes,
    deleteFuentesArchivo,
    deleteFuentesArchivosBulk,
    fetchFuentesPreview,
    zipCierreCajaUrl,
    downloadFuentesUrl,
    moveFuentesToBackup,
    restoreFuentesFromBackup,
    restoreFuentesFromProcesados,
    downloadFuentesZipSelection,
} from '@/services/fuentesService';
import type { LegacyStagingStatus, ModoRango } from '@/services/legacyService';
import {
    postLegacyConsolidar,
    postLegacyAsociar,
    postLegacyConvertir,
    postLegacyCargarVentas,
    postLegacyCargarBigQuery,
    getLegacyArchivos,
    getLegacyNegocios,
    postLegacySubir,
    postGuardarAsociacion,
    getPreviewSales,
    getPreviewRealizadas,
    getLegacyStagingStatus,
    postLegacyImportStagingExcel,
    postLegacyImportRealizadasStagingExcel,
} from '@/services/legacyService';
import {
    dispararNotificacionesN8n,
    fetchNotificacionesEnvioConfig,
    fetchPendientesSemana,
    patchNotificacionesEnvioConfig,
    type ModoPendientesNotificaciones,
    type NotificacionesEnvioConfigPatch,
    type PendientesSemanaResponse,
} from '@/services/notificacionesService';
import { useAuth } from '@/context/AuthContext';

interface CierreCajaFile {
    name: string;
    size: number;
    modified: string;
    zona?: string;
}

interface NegocioOption {
    value: string;
    label: string;
}

function conteoArchivosCierre(g: LocatarioArchivos) {
    return {
        pendientes: g.pendientes?.length ?? 0,
        consolidados: g.consolidados?.length ?? 0,
        backup: g.backup?.length ?? 0,
    };
}

function PendientesDayChips({ period, registrados }: { period: string[]; registrados: string[] }) {
    return (
        <div className="flex flex-wrap gap-1 mt-1.5">
            {period.map((iso) => {
                const ok = registrados.includes(iso);
                const parts = iso.split('-');
                const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : iso;
                return (
                    <span
                        key={iso}
                        title={iso}
                        className={`pendiente-dia-chip ${ok ? 'pendiente-dia-chip--ok' : 'pendiente-dia-chip--falta'}`}
                    >
                        {label}
                    </span>
                );
            })}
        </div>
    );
}

const LegacyFlow: React.FC = () => {
    const { token, user } = useAuth();
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [files, setFiles] = useState<CierreCajaFile[]>([]);
    const [negocios, setNegocios] = useState<NegocioOption[]>([]);

    const [selectedFile, setSelectedFile] = useState('');
    const [selectedNegocio, setSelectedNegocio] = useState<NegocioOption | null>(null);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');

    const [modoRango, setModoRango] = useState<ModoRango>('semana_actual');
    const [procesoFechaIni, setProcesoFechaIni] = useState('');
    const [procesoFechaFin, setProcesoFechaFin] = useState('');

    const [legacyUploadLoc, setLegacyUploadLoc] = useState('');
    /** Tras procesar un consolidado FileStore, mover también todos los pendientes del mismo locatario */
    const [archivarPendientesTrasConsolidado, setArchivarPendientesTrasConsolidado] = useState(false);
    const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewType, setPreviewType] = useState<'sales' | 'realizadas'>('sales');
    const [previewData, setPreviewData] = useState<any>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewLoadingMore, setPreviewLoadingMore] = useState(false);
    const [previewHasMore, setPreviewHasMore] = useState(false);
    const [previewNextOffset, setPreviewNextOffset] = useState(0);
    const [bulkUploading, setBulkUploading] = useState(false);
    const PREVIEW_PAGE_SIZE = 100;
    const FS_PREVIEW_PAGE_SIZE = 80;

    const formatMontoTotal = (value: number | null | undefined) => {
        if (value == null || Number.isNaN(value)) return '—';
        return value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
    const [filesModalTab, setFilesModalTab] = useState<'cierre' | 'procesados'>('cierre');
    const [porLocatarioModal, setPorLocatarioModal] = useState<LocatarioArchivos[]>([]);
    const [procesadosFechas, setProcesadosFechas] = useState<string[]>([]);
    const [procesadosFechaSel, setProcesadosFechaSel] = useState('');
    const [procesadosGrupos, setProcesadosGrupos] = useState<{ locatario: string; archivos: string[] }[]>([]);
    const [filesModalLoading, setFilesModalLoading] = useState(false);
    const [bulkLocatario, setBulkLocatario] = useState('');
    const [expandedCierreLocs, setExpandedCierreLocs] = useState<Record<string, boolean>>({});
    const [expandedProcesadosLocs, setExpandedProcesadosLocs] = useState<Record<string, boolean>>({});
    const [selectedBackupFiles, setSelectedBackupFiles] = useState<Record<string, boolean>>({});
    const [selectedRestoreFiles, setSelectedRestoreFiles] = useState<Record<string, boolean>>({});
    const [selectedProcesadosFiles, setSelectedProcesadosFiles] = useState<Record<string, boolean>>({});
    const [filesSearchTerm, setFilesSearchTerm] = useState('');
    /** Índice ancla en la lista visible (por locatario+zona o locatario backup) para Mayús+clic */
    const selectionAnchorBackupRef = useRef<Record<string, number>>({});
    const selectionAnchorRestoreRef = useRef<Record<string, number>>({});
    const selectionAnchorProcesadosRef = useRef<Record<string, number>>({});
    const shiftKeyDownRef = useRef(false);

    useEffect(() => {
        if (!isFilesModalOpen) return;
        const syncShift = (e: KeyboardEvent) => {
            shiftKeyDownRef.current = e.shiftKey;
        };
        window.addEventListener('keydown', syncShift);
        window.addEventListener('keyup', syncShift);
        return () => {
            window.removeEventListener('keydown', syncShift);
            window.removeEventListener('keyup', syncShift);
            shiftKeyDownRef.current = false;
            selectionAnchorBackupRef.current = {};
            selectionAnchorRestoreRef.current = {};
            selectionAnchorProcesadosRef.current = {};
            setSelectedProcesadosFiles({});
        };
    }, [isFilesModalOpen]);

    const [pendientesLoading, setPendientesLoading] = useState(false);
    const [notifModo, setNotifModo] = useState<ModoPendientesNotificaciones>('ultima_semana');
    const [notifDias, setNotifDias] = useState(7);
    const [notifFechaIni, setNotifFechaIni] = useState('');
    const [notifFechaFin, setNotifFechaFin] = useState('');

    const [isPendientesModalOpen, setIsPendientesModalOpen] = useState(false);
    const [pendientesResult, setPendientesResult] = useState<PendientesSemanaResponse | null>(null);
    const [pendientesErr, setPendientesErr] = useState<string | null>(null);
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scheduleHHMM, setScheduleHHMM] = useState('09:00');
    const [scheduleModo, setScheduleModo] = useState<ModoPendientesNotificaciones>('ultima_semana');
    const [scheduleDias, setScheduleDias] = useState(7);
    const [scheduleFechaIni, setScheduleFechaIni] = useState('');
    const [scheduleFechaFin, setScheduleFechaFin] = useState('');
    const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
    const [n8nWebhookSecret, setN8nWebhookSecret] = useState('');
    const [n8nSecretTouched, setN8nSecretTouched] = useState(false);
    const [n8nSecretConfigured, setN8nSecretConfigured] = useState(false);
    const [envioSaveBusy, setEnvioSaveBusy] = useState(false);
    const [disparoBusy, setDisparoBusy] = useState(false);
    const [isEnvioN8nModalOpen, setIsEnvioN8nModalOpen] = useState(false);

    const [consolidacionResult, setConsolidacionResult] = useState<ConsolidacionResponse | null>(null);
    const [isConsolidacionModalOpen, setIsConsolidacionModalOpen] = useState(false);

    const [stagingStatus, setStagingStatus] = useState<LegacyStagingStatus | null>(null);
    const [stagingImportBusy, setStagingImportBusy] = useState(false);

    const [fsPreviewOpen, setFsPreviewOpen] = useState(false);
    const [fsPreviewTitle, setFsPreviewTitle] = useState('');
    const [fsPreviewLoading, setFsPreviewLoading] = useState(false);
    const [fsPreviewErr, setFsPreviewErr] = useState<string | null>(null);
    const [fsPreviewTable, setFsPreviewTable] = useState<{
        columns: string[];
        rows: string[][];
        truncated: boolean;
        filename: string;
        total_rows?: number;
        has_more?: boolean;
        next_offset?: number;
        monto_column?: string | null;
        monto_total?: number | null;
    } | null>(null);
    const [fsPreviewReq, setFsPreviewReq] = useState<{
        origen: 'cierre' | 'procesados';
        locatario: string;
        filename: string;
        zona?: 'pendiente' | 'consolidado';
        fecha?: string;
    } | null>(null);
    const [fsPreviewLoadingMore, setFsPreviewLoadingMore] = useState(false);

    const fetchStagingStatus = useCallback(async () => {
        try {
            const res = await getLegacyStagingStatus();
            if (res.data?.success) setStagingStatus(res.data);
        } catch {
            /* badge opcional */
        }
    }, []);

    useEffect(() => {
        const loadInitialData = async () => {
            await fetchFiles();
            await fetchNegocios();
            await fetchStagingStatus();
        };
        loadInitialData();
    }, [fetchStagingStatus]);

    useEffect(() => {
        if (!isEnvioN8nModalOpen || !token || !user?.is_superuser) return;
        let cancelled = false;
        void (async () => {
            try {
                const cfg = await fetchNotificacionesEnvioConfig(token);
                if (cancelled) return;
                setScheduleEnabled(cfg.schedule_enabled);
                setScheduleHHMM(
                    `${String(cfg.schedule_hour).padStart(2, '0')}:${String(cfg.schedule_minute).padStart(2, '0')}`,
                );
                setScheduleModo(cfg.schedule_modo ?? 'ultima_semana');
                setScheduleDias(cfg.schedule_dias ?? 7);
                setScheduleFechaIni(cfg.schedule_fecha_inicio ?? '');
                setScheduleFechaFin(cfg.schedule_fecha_fin ?? '');
                setN8nWebhookUrl(cfg.n8n_webhook_url ?? '');
                setN8nSecretConfigured(cfg.n8n_webhook_secret_configured);
                setN8nWebhookSecret('');
                setN8nSecretTouched(false);
            } catch {
                /* defaults */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isEnvioN8nModalOpen, token, user?.is_superuser]);

    const fetchFiles = async () => {
        try {
            const res = await getLegacyArchivos();
            if (res.data.success) setFiles(res.data.files);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchNegocios = async () => {
        try {
            const res = await getLegacyNegocios();
            if (res.data.success) {
                const options = res.data.negocios.map((n: any) => ({
                    value: n.CodigoNegocio,
                    label: `${n.CodigoNegocio} - ${n.Descripcion}`,
                }));
                setNegocios(options);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const refreshCierreModal = useCallback(async () => {
        const data = await fetchArchivosCierreCaja();
        const list = data.por_locatario ?? [];
        setPorLocatarioModal(list);
        return list;
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        if (!legacyUploadLoc.trim()) {
            Swal.fire({
                title: 'Locatario',
                text: 'Selecciona locatario antes de subir desde el explorador.',
                icon: 'info',
                background: '#111',
                color: '#fff',
            });
            return;
        }
        const filesToUpload = Array.from(e.target.files);
        setLogs((prev) => [`📤 Subida FileStore (${legacyUploadLoc})…`, ...prev]);
        for (const file of filesToUpload) {
            try {
                const res = await postLegacySubir(file, legacyUploadLoc);
                if (res.data.success) setLogs((prev) => [`✅ Subido: ${file.name}`, ...prev]);
                else setLogs((prev) => [`❌ ${file.name}: ${res.data.error}`, ...prev]);
            } catch (error: any) {
                setLogs((prev) => [`❌ ${file.name}: ${error.message}`, ...prev]);
            }
        }
        e.target.value = '';
        fetchFiles();
    };

    const runLimpiezaConfirm = async () => {
        const result = await Swal.fire({
            title: 'Verificación: Limpieza',
            text: '¿Proceder con consolidación? Confirma que cierre_caja tiene los reportes listos.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#14b8a6',
            cancelButtonColor: '#71717a',
            confirmButtonText: 'Sí, proceder',
            cancelButtonText: 'Cancelar',
            background: '#111',
            color: '#fff',
        });
        if (result.isConfirmed) {
            setLogs((prev) => ['✅ Verificación OK. Ejecute Consolidación.', ...prev]);
            Swal.fire({
                title: 'Listo',
                text: 'Ejecute el paso Consolidación.',
                icon: 'success',
                background: '#111',
                color: '#fff',
                confirmButtonColor: '#2dd4bf',
            });
        }
    };

    const runConsolidacion = async (dryRun = false) => {
        if (modoRango === 'rango_libre' && (!procesoFechaIni || !procesoFechaFin)) {
            Swal.fire({ title: 'Rango', text: 'Indica fecha inicio y fin.', icon: 'warning', background: '#111', color: '#fff' });
            return;
        }
        if (!dryRun) {
            const confirm = await Swal.fire({
                title: 'Consolidar reportes',
                text: 'Se generará un CSV por local en _consolidados según el rango elegido.',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Consolidar',
                cancelButtonText: 'Cancelar',
                background: '#111',
                color: '#fff',
                confirmButtonColor: '#14b8a6',
            });
            if (!confirm.isConfirmed) return;
        }
        setIsProcessing(dryRun ? 'Simulación' : 'Consolidación');
        setLogs((prev) => [
            dryRun
                ? '⏳ Simulación de consolidación (sin escribir CSV)...'
                : '⏳ Consolidación: cierre_caja → _consolidados por locatario...',
            ...prev,
        ]);
        try {
            const res = await postLegacyConsolidar(modoRango, procesoFechaIni, procesoFechaFin, dryRun);
            const d = res.data as ConsolidacionResponse;
            if (d.success) {
                const resumen = d.resumen;
                const msg =
                    d.registros_total != null
                        ? `${dryRun ? '[Simulación] ' : ''}Total registros: ${d.registros_total}. Etiqueta: ${d.etiqueta ?? ''}${
                              resumen
                                  ? ` · OK: ${resumen.ok}, observaciones: ${resumen.omitidos + resumen.parciales}, sin carpeta: ${resumen.sin_carpeta}`
                                  : ''
                          }`
                        : d.message || 'Completado';
                setLogs((prev) => [`✅ ${dryRun ? 'Simulación' : 'Consolidación'}: ${msg}`, ...prev]);
                setConsolidacionResult(d);
                setIsConsolidacionModalOpen(true);
                if (!dryRun) fetchFiles();
            } else throw new Error(d.error);
        } catch (e: any) {
            const msg = e.response?.data?.error ?? e.message;
            setLogs((prev) => [`❌ ERROR Consolidación: ${msg}`, ...prev]);
            Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setIsProcessing(null);
        }
    };

    const runAsociacion = async () => {
        if (modoRango === 'rango_libre' && (!procesoFechaIni || !procesoFechaFin)) {
            Swal.fire({ title: 'Rango', text: 'Indica fecha inicio y fin.', icon: 'warning', background: '#111', color: '#fff' });
            return;
        }
        setIsProcessing('Asociación');
        setLogs((prev) => ['⏳ Asociación: FileStore + fuzzy...', ...prev]);
        try {
            const res = await postLegacyAsociar(modoRango, procesoFechaIni, procesoFechaFin);
            const d = res.data;
            if (d.success) {
                setLogs((prev) => [`✅ Asociación: ${d.message || `Asociados: ${d.count ?? 0}`}`, ...prev]);
                fetchFiles();
                Swal.fire({
                    title: 'Asociación',
                    text: d.message || 'Completado',
                    icon: 'success',
                    background: '#111',
                    color: '#fff',
                    confirmButtonColor: '#2dd4bf',
                });
            } else throw new Error(d.error);
        } catch (e: any) {
            const msg = e.response?.data?.error ?? e.message;
            setLogs((prev) => [`❌ ERROR Asociación: ${msg}`, ...prev]);
            Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setIsProcessing(null);
        }
    };

    const runVentasProtocol = async () => {
        const result = await Swal.fire({
            title: 'Procesar ventas',
            html:
                '<div class="text-left text-sm leading-relaxed">' +
                '<p>Elige cómo escribir las ventas asociadas en Activas.</p>' +
                '<p class="mt-2 text-xs opacity-75"><strong>Añadir sin limpiar</strong> es lo normal para una carga incremental.</p>' +
                '<p class="mt-1 text-xs opacity-75"><strong>Limpiar y cargar</strong> reinicia sales_df / Realizadas antes de procesar.</p>' +
                `<p class="mt-3 text-xs ${archivarPendientesTrasConsolidado ? 'text-amber-300' : 'opacity-60'}">` +
                `Archivado extra de pendientes del consolidado: <strong>${archivarPendientesTrasConsolidado ? 'activado' : 'desactivado'}</strong>.` +
                '</p>' +
                '</div>',
            icon: 'question',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonColor: '#d33',
            denyButtonColor: '#2dd4bf',
            cancelButtonColor: '#71717a',
            confirmButtonText: 'Limpiar y cargar',
            denyButtonText: 'Añadir sin limpiar',
            cancelButtonText: 'Cancelar',
            background: '#111',
            color: '#fff',
        });
        if (result.isDismissed) return;
        const clearBefore = result.isConfirmed === true;
        setIsProcessing('Ventas');
        setLogs((prev) => [`⏳ Ventas (${clearBefore ? 'limpiar y cargar' : 'añadir sin limpiar'})...`, ...prev]);
        try {
            const res = await postLegacyCargarVentas(clearBefore, archivarPendientesTrasConsolidado);
            const d = res.data;
            if (d.success) {
                const n = typeof d.registros === 'number' ? d.registros : 0;
                const pa = typeof d.pendientes_archivados === 'number' ? d.pendientes_archivados : 0;
                const msg = d.message ?? `Registros procesados: ${n}`;
                setLogs((prev) => [
                    `✅ Ventas: ${msg}${pa > 0 ? ` (+${pa} pendientes → procesados)` : ''}`,
                    ...prev,
                ]);
                Swal.fire({
                    title: 'Ventas procesadas',
                    text: msg,
                    icon: 'success',
                    background: '#111',
                    color: '#fff',
                    confirmButtonColor: '#2dd4bf',
                });
                fetchFiles();
                void fetchStagingStatus();
            } else throw new Error(d.error);
        } catch (e: any) {
            setLogs((prev) => [`❌ Ventas: ${e.message}`, ...prev]);
            Swal.fire({ title: 'Error', text: e.message, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setIsProcessing(null);
        }
    };

    const runImportStagingExcel = async () => {
        const sim = await Swal.fire({
            title: 'Importar sales_df → PostgreSQL',
            html:
                '<p class="text-sm">Copia histórica de Excel a <code>stg_sales</code> (upsert idempotente).</p>' +
                '<p class="text-xs mt-2 opacity-70">¿Simular primero (dry-run)?</p>',
            icon: 'question',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Importar',
            denyButtonText: 'Solo simular',
            cancelButtonText: 'Cancelar',
            background: '#111',
            color: '#fff',
            confirmButtonColor: '#2dd4bf',
            denyButtonColor: '#64748b',
        });
        if (sim.isDismissed) return;

        let clearBefore = false;
        if (sim.isConfirmed) {
            const wipe = await Swal.fire({
                title: '¿Borrar stg_sales antes?',
                text: 'TRUNCATE elimina filas actuales en PostgreSQL antes de importar.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, borrar e importar',
                cancelButtonText: 'No, solo upsert',
                confirmButtonColor: '#d33',
                cancelButtonColor: '#2dd4bf',
                background: '#111',
                color: '#fff',
            });
            if (wipe.isDismissed) return;
            clearBefore = wipe.isConfirmed === true;
        }

        setStagingImportBusy(true);
        try {
            const res = await postLegacyImportStagingExcel(clearBefore, sim.isDenied);
            const d = res.data;
            if (d.success) {
                await Swal.fire({
                    title: d.dry_run ? 'Simulación' : 'Importación',
                    text: d.message ?? 'Completado',
                    icon: 'success',
                    background: '#111',
                    color: '#fff',
                });
                void fetchStagingStatus();
            } else {
                throw new Error(d.error ?? 'Error en importación');
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error en importación';
            await Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setStagingImportBusy(false);
        }
    };

    const runImportRealizadasStagingExcel = async () => {
        const sim = await Swal.fire({
            title: 'Importar Realizadas → PostgreSQL',
            html:
                '<p class="text-sm">Copia histórica de Excel a <code>stg_realizadas</code> (upsert idempotente).</p>' +
                '<p class="text-xs mt-2 opacity-70">¿Simular primero (dry-run)?</p>',
            icon: 'question',
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: 'Importar',
            denyButtonText: 'Solo simular',
            cancelButtonText: 'Cancelar',
            background: '#111',
            color: '#fff',
            confirmButtonColor: '#2dd4bf',
            denyButtonColor: '#64748b',
        });
        if (sim.isDismissed) return;

        let clearBefore = false;
        if (sim.isConfirmed) {
            const wipe = await Swal.fire({
                title: '¿Borrar stg_realizadas antes?',
                text: 'TRUNCATE elimina filas actuales en PostgreSQL antes de importar.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, borrar e importar',
                cancelButtonText: 'No, solo upsert',
                confirmButtonColor: '#d33',
                cancelButtonColor: '#2dd4bf',
                background: '#111',
                color: '#fff',
            });
            if (wipe.isDismissed) return;
            clearBefore = wipe.isConfirmed === true;
        }

        setStagingImportBusy(true);
        try {
            const res = await postLegacyImportRealizadasStagingExcel(clearBefore, sim.isDenied);
            const d = res.data;
            if (d.success) {
                await Swal.fire({
                    title: d.dry_run ? 'Simulación' : 'Importación',
                    text: d.message ?? 'Completado',
                    icon: 'success',
                    background: '#111',
                    color: '#fff',
                });
                void fetchStagingStatus();
            } else {
                throw new Error(d.error ?? 'Error en importación');
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error en importación';
            await Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setStagingImportBusy(false);
        }
    };

    const runBigQuery = async () => {
        setIsProcessing('BigQuery');
        setLogs((prev) => [`⏳ BigQuery...`, ...prev]);
        try {
            const res = await postLegacyCargarBigQuery();
            const d = res.data;
            if (d.success) {
                const filas = typeof d.filas_insertadas === 'number' ? d.filas_insertadas : undefined;
                const msg = d.message ?? (filas != null ? `Filas insertadas en BigQuery: ${filas}` : 'Sincronización completada');
                setLogs((prev) => [`✅ BigQuery: ${msg}`, ...prev]);
                Swal.fire({
                    title: 'BigQuery',
                    text: msg,
                    icon: 'success',
                    background: '#111',
                    color: '#fff',
                    confirmButtonColor: '#2dd4bf',
                });
                void fetchStagingStatus();
            } else throw new Error(d.error);
        } catch (e: any) {
            setLogs((prev) => [`❌ BigQuery: ${e.message}`, ...prev]);
            Swal.fire({ title: 'Error', text: e.message, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setIsProcessing(null);
        }
    };

    const runConvertir = async () => {
        setIsProcessing('Conversión');
        setLogs((prev) => [`⏳ Conversión XLSX → CSV (pendientes)...`, ...prev]);
        try {
            const res = await postLegacyConvertir();
            const d = res.data;
            if (d.success) {
                setLogs((prev) => [`✅ Conversión: ${d.count ?? 0} archivos`, ...prev]);
                fetchFiles();
                Swal.fire({ title: 'OK', text: 'Conversión', icon: 'success', background: '#111', color: '#fff', confirmButtonColor: '#2dd4bf' });
            } else throw new Error(d.error);
        } catch (e: any) {
            setLogs((prev) => [`❌ Conversión: ${e.message}`, ...prev]);
            Swal.fire({ title: 'Error', text: e.message, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setIsProcessing(null);
        }
    };

    const handleManualLink = async () => {
        if (!selectedFile || !selectedNegocio || !fechaInicio || !fechaFin) {
            Swal.fire('Incompleto', 'Favor de llenar todos los campos de asociación', 'info');
            return;
        }
        setIsProcessing('Manual');
        try {
            const res = await postGuardarAsociacion(selectedFile, selectedNegocio.value, fechaInicio, fechaFin);
            if (res.data.success) {
                setLogs((prev) => [`✅ Vinculación: ${selectedFile} -> ${selectedNegocio.label}`, ...prev]);
                Swal.fire({ title: 'Vinculado', text: 'Activas actualizada', icon: 'success', background: '#111', color: '#fff' });
            }
        } catch (e: any) {
            setLogs((prev) => [`❌ Vinculación: ${e.message}`, ...prev]);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleOpenPreview = async (type: 'sales' | 'realizadas') => {
        setIsPreviewOpen(true);
        setPreviewType(type);
        setPreviewLoading(true);
        setPreviewLoadingMore(false);
        setPreviewHasMore(false);
        setPreviewNextOffset(0);
        try {
            const res =
                type === 'sales'
                    ? await getPreviewSales(PREVIEW_PAGE_SIZE, 0)
                    : await getPreviewRealizadas(PREVIEW_PAGE_SIZE);
            if (res.data.success) {
                setPreviewData(res.data);
                if (type === 'sales') {
                    setPreviewHasMore(Boolean(res.data.has_more));
                    setPreviewNextOffset(Number(res.data.next_offset ?? res.data.returned_count ?? 0));
                }
            } else {
                const err = (res.data as { error?: string }).error ?? 'Error al leer sales_df';
                setPreviewData(null);
                await Swal.fire({
                    title: 'Vista previa',
                    text: err,
                    icon: 'error',
                    background: '#111',
                    color: '#fff',
                });
            }
        } catch {
            Swal.fire('Error', 'No se pudo cargar la vista previa', 'error');
        } finally {
            setPreviewLoading(false);
        }
    };

    const loadMorePreviewSales = async () => {
        if (previewType !== 'sales' || !previewHasMore || previewLoadingMore || previewLoading || !previewData) return;
        setPreviewLoadingMore(true);
        try {
            const res = await getPreviewSales(PREVIEW_PAGE_SIZE, previewNextOffset);
            if (res.data.success) {
                const newRows = res.data.data ?? [];
                setPreviewData((prev: any) =>
                    prev ? { ...prev, data: [...newRows, ...(prev.data ?? [])] } : res.data
                );
                setPreviewHasMore(Boolean(res.data.has_more));
                setPreviewNextOffset(Number(res.data.next_offset ?? previewNextOffset + newRows.length));
            } else {
                await Swal.fire({
                    title: 'Cargar más',
                    text: (res.data as { error?: string }).error ?? 'Error',
                    icon: 'error',
                    background: '#111',
                    color: '#fff',
                });
            }
        } catch {
            Swal.fire({ title: 'Error', text: 'No se pudieron cargar más filas', icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setPreviewLoadingMore(false);
        }
    };

    const closePreview = () => {
        setIsPreviewOpen(false);
        setPreviewHasMore(false);
        setPreviewNextOffset(0);
        setPreviewLoadingMore(false);
    };

    const openFilesModal = async () => {
        setIsFilesModalOpen(true);
        setFilesModalLoading(true);
        setFilesModalTab('cierre');
        setExpandedProcesadosLocs({});
        setSelectedBackupFiles({});
        setSelectedRestoreFiles({});
        setFilesSearchTerm('');
        try {
            await refreshCierreModal();
            setExpandedCierreLocs({});
        } catch {
            setPorLocatarioModal([]);
            setExpandedCierreLocs({});
        }
        try {
            const fechas = await fetchProcesadosFechas();
            setProcesadosFechas(fechas);
            if (fechas.length) {
                const last = fechas[fechas.length - 1];
                setProcesadosFechaSel(last);
                try {
                    const arch = await fetchProcesadosArchivos(last);
                    setProcesadosGrupos(arch.grupos ?? []);
                } catch {
                    setProcesadosGrupos([]);
                }
            } else {
                setProcesadosFechaSel('');
                setProcesadosGrupos([]);
            }
        } catch {
            setProcesadosFechas([]);
            setProcesadosFechaSel('');
            setProcesadosGrupos([]);
        } finally {
            setFilesModalLoading(false);
        }
    };

    const loadProcesadosFecha = async (fecha: string) => {
        setProcesadosFechaSel(fecha);
        setFilesModalLoading(true);
        setExpandedProcesadosLocs({});
        setSelectedProcesadosFiles({});
        selectionAnchorProcesadosRef.current = {};
        try {
            const arch = await fetchProcesadosArchivos(fecha);
            setProcesadosGrupos(arch.grupos ?? []);
        } catch {
            setProcesadosGrupos([]);
        } finally {
            setFilesModalLoading(false);
        }
    };

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList?.length || !bulkLocatario.trim()) {
            Swal.fire({
                title: 'Falta locatario',
                text: 'Elige locatario en el desplegable y luego los archivos (.xlsx / .csv).',
                icon: 'warning',
                background: '#111',
                color: '#fff',
            });
            return;
        }
        const input = e.target;
        setBulkUploading(true);
        try {
            const res: any = await uploadBulkFuentes(bulkLocatario, fileList, true);
            const results: { ok?: boolean; filename?: string; error?: string }[] = res?.results ?? [];
            const okCount = results.filter((r) => r.ok).length;
            const failures = results.filter((r) => !r.ok);
            setLogs((prev) => [`✅ Bulk cierre_caja: ${okCount}/${results.length}`, ...prev]);
            if (failures.length) {
                const lines = failures.map((r) => `${r.filename ?? '?'}: ${r.error ?? 'error'}`).join('\n');
                await Swal.fire({
                    title: 'Carga parcial',
                    html: `<pre style="text-align:left;font-size:10px;max-height:220px;overflow:auto;white-space:pre-wrap">${okCount} OK / ${results.length}\n\n${lines.replace(/</g, '&lt;')}</pre>`,
                    icon: 'warning',
                    background: '#111',
                    color: '#fff',
                });
            } else {
                await Swal.fire({
                    title: 'Listo',
                    text: `${okCount} archivo(s) en uploads/cierre_caja/${bulkLocatario}/`,
                    icon: 'success',
                    background: '#111',
                    color: '#fff',
                    confirmButtonColor: '#2dd4bf',
                });
            }
            await refreshCierreModal();
        } catch (err: any) {
            const detail = err.response?.data?.detail;
            const msg =
                typeof detail === 'string'
                    ? detail
                    : Array.isArray(detail)
                        ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
                        : err.message;
            setLogs((prev) => [`❌ Bulk: ${msg}`, ...prev]);
            await Swal.fire({ title: 'Error carga en bloque', text: String(msg), icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setBulkUploading(false);
            input.value = '';
        }
    };

    const deleteFileStoreFile = async (locatario: string, filename: string, zona: 'pendiente' | 'consolidado' | 'backup') => {
        const ok = await Swal.fire({
            title: 'Eliminar archivo',
            text: `¿Eliminar ${filename}? (${zona})`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            background: '#111',
            color: '#fff',
        });
        if (!ok.isConfirmed) return;
        try {
            const token = localStorage.getItem('token');
            await deleteFuentesArchivo(token, locatario, filename, zona);
            await refreshCierreModal();
        } catch (err: any) {
            Swal.fire({ title: 'Error', text: err.response?.data?.detail ?? err.message, icon: 'error', background: '#111', color: '#fff' });
        }
    };

    const openFileStorePreview = async (
        title: string,
        req: {
            origen: 'cierre' | 'procesados';
            locatario: string;
            filename: string;
            zona?: 'pendiente' | 'consolidado';
            fecha?: string;
        }
    ) => {
        setFsPreviewOpen(true);
        setFsPreviewTitle(title);
        setFsPreviewLoading(true);
        setFsPreviewLoadingMore(false);
        setFsPreviewErr(null);
        setFsPreviewTable(null);
        setFsPreviewReq(req);
        try {
            const data = await fetchFuentesPreview({
                origen: req.origen,
                locatario_codigo: req.locatario,
                filename: req.filename,
                zona: req.zona,
                fecha: req.fecha,
                max_rows: FS_PREVIEW_PAGE_SIZE,
                offset: 0,
            });
            setFsPreviewTable({
                columns: data.columns,
                rows: data.rows,
                truncated: data.truncated,
                filename: data.filename,
                total_rows: data.total_rows,
                has_more: data.has_more,
                next_offset: data.next_offset,
                monto_column: data.monto_column,
                monto_total: data.monto_total,
            });
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
            const detail = e.response?.data?.detail;
            const msg =
                typeof detail === 'string'
                    ? detail
                    : Array.isArray(detail)
                        ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
                        : e.message ?? 'Error al cargar vista previa';
            setFsPreviewErr(String(msg));
        } finally {
            setFsPreviewLoading(false);
        }
    };

    const loadMoreFileStorePreview = async () => {
        if (!fsPreviewReq || !fsPreviewTable?.has_more || fsPreviewLoadingMore || fsPreviewLoading) return;
        setFsPreviewLoadingMore(true);
        try {
            const data = await fetchFuentesPreview({
                origen: fsPreviewReq.origen,
                locatario_codigo: fsPreviewReq.locatario,
                filename: fsPreviewReq.filename,
                zona: fsPreviewReq.zona,
                fecha: fsPreviewReq.fecha,
                max_rows: FS_PREVIEW_PAGE_SIZE,
                offset: fsPreviewTable.next_offset ?? fsPreviewTable.rows.length,
            });
            setFsPreviewTable((prev) =>
                prev
                    ? {
                          ...prev,
                          rows: [...prev.rows, ...data.rows],
                          truncated: data.truncated,
                          has_more: data.has_more,
                          next_offset: data.next_offset,
                          total_rows: data.total_rows ?? prev.total_rows,
                          monto_total: data.monto_total ?? prev.monto_total,
                          monto_column: data.monto_column ?? prev.monto_column,
                      }
                    : {
                          columns: data.columns,
                          rows: data.rows,
                          truncated: data.truncated,
                          filename: data.filename,
                          total_rows: data.total_rows,
                          has_more: data.has_more,
                          next_offset: data.next_offset,
                          monto_column: data.monto_column,
                          monto_total: data.monto_total,
                      }
            );
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
            const detail = e.response?.data?.detail;
            const msg =
                typeof detail === 'string'
                    ? detail
                    : e.message ?? 'No se pudieron cargar más filas';
            await Swal.fire({ title: 'Cargar más', text: String(msg), icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setFsPreviewLoadingMore(false);
        }
    };

    const closeFileStorePreview = () => {
        setFsPreviewOpen(false);
        setFsPreviewErr(null);
        setFsPreviewTable(null);
        setFsPreviewReq(null);
        setFsPreviewLoadingMore(false);
    };

    const backupKey = (locatario: string, zona: 'pendiente' | 'consolidado', filename: string) =>
        `${locatario}::${zona}::${filename}`;

    const isShiftSelect = (e: React.MouseEvent) => e.shiftKey || shiftKeyDownRef.current;

    const handleBackupCheckboxMouseDown = (
        e: React.MouseEvent,
        locatario: string,
        zona: 'pendiente' | 'consolidado',
        visibleNames: string[],
        index: number,
        filename: string
    ) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const anchorKey = `${locatario}::${zona}`;
        const itemKey = backupKey(locatario, zona, filename);
        const anchorIndex = selectionAnchorBackupRef.current[anchorKey];

        if (isShiftSelect(e) && anchorIndex !== undefined && visibleNames[anchorIndex] !== undefined) {
            const lo = Math.min(anchorIndex, index);
            const hi = Math.max(anchorIndex, index);
            setSelectedBackupFiles((prev) => {
                const next = { ...prev };
                for (let i = lo; i <= hi; i++) {
                    next[backupKey(locatario, zona, visibleNames[i])] = true;
                }
                return next;
            });
            return;
        }

        setSelectedBackupFiles((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }));
        selectionAnchorBackupRef.current[anchorKey] = index;
    };

    const selectedCountByZona = (locatario: string, zona: 'pendiente' | 'consolidado') =>
        Object.entries(selectedBackupFiles).filter(([k, v]) => v && k.startsWith(`${locatario}::${zona}::`)).length;

    const selectedNamesByZona = (locatario: string, zona: 'pendiente' | 'consolidado') =>
        Object.entries(selectedBackupFiles)
            .filter(([k, v]) => v && k.startsWith(`${locatario}::${zona}::`))
            .map(([k]) => k.split('::')[2])
            .filter(Boolean);

    const moveToBackup = async (locatario: string, zona: 'pendiente' | 'consolidado', filenames: string[], mode: 'single' | 'bulk') => {
        if (!filenames.length) return;
        const confirm = await Swal.fire({
            title: 'Mover a backup',
            text:
                mode === 'single'
                    ? `¿Mover ${filenames[0]} a backup_no_consolidados?`
                    : `¿Mover ${filenames.length} archivo(s) a backup_no_consolidados?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#0ea5e9',
            background: '#111',
            color: '#fff',
        });
        if (!confirm.isConfirmed) return;
        try {
            const jwt = localStorage.getItem('token');
            const res = await moveFuentesToBackup(jwt, {
                locatarioCodigo: locatario,
                filenames,
                zona,
            });
            const movedCount = Array.isArray(res.moved) ? res.moved.length : 0;
            const missingCount = Array.isArray(res.missing) ? res.missing.length : 0;
            setLogs((prev) => [
                `📦 Backup ${locatario} (${zona}): movidos ${movedCount}${missingCount ? `, omitidos ${missingCount}` : ''}`,
                ...prev,
            ]);
            if (mode === 'bulk') {
                const prefix = `${locatario}::${zona}::`;
                setSelectedBackupFiles((prev) => {
                    const next = { ...prev };
                    Object.keys(next).forEach((k) => {
                        if (k.startsWith(prefix)) delete next[k];
                    });
                    return next;
                });
            } else {
                const only = filenames[0];
                setSelectedBackupFiles((prev) => {
                    const next = { ...prev };
                    delete next[backupKey(locatario, zona, only)];
                    return next;
                });
            }
            await refreshCierreModal();
        } catch (err: any) {
            Swal.fire({
                title: 'Error',
                text: err.response?.data?.detail ?? err.message,
                icon: 'error',
                background: '#111',
                color: '#fff',
            });
        }
    };

    const restoreKey = (locatario: string, filename: string) => `${locatario}::${filename}`;
    const handleRestoreCheckboxMouseDown = (
        e: React.MouseEvent,
        locatario: string,
        visibleNames: string[],
        index: number,
        filename: string
    ) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const itemKey = restoreKey(locatario, filename);
        const anchorIndex = selectionAnchorRestoreRef.current[locatario];

        if (isShiftSelect(e) && anchorIndex !== undefined && visibleNames[anchorIndex] !== undefined) {
            const lo = Math.min(anchorIndex, index);
            const hi = Math.max(anchorIndex, index);
            setSelectedRestoreFiles((prev) => {
                const next = { ...prev };
                for (let i = lo; i <= hi; i++) {
                    next[restoreKey(locatario, visibleNames[i])] = true;
                }
                return next;
            });
            return;
        }

        setSelectedRestoreFiles((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }));
        selectionAnchorRestoreRef.current[locatario] = index;
    };
    const selectedRestoreNames = (locatario: string) =>
        Object.entries(selectedRestoreFiles)
            .filter(([k, v]) => v && k.startsWith(`${locatario}::`))
            .map(([k]) => k.split('::')[1])
            .filter(Boolean);

    const downloadSelection = async (
        locatario: string,
        zona: 'pendiente' | 'consolidado' | 'backup',
        filenames: string[]
    ) => {
        if (!filenames.length) return;
        try {
            await downloadFuentesZipSelection({
                locatarioCodigo: locatario,
                zona,
                filenames,
            });
            setLogs((prev) => [`⬇️ ZIP ${locatario} (${zona}): ${filenames.length} archivo(s)`, ...prev]);
        } catch (err: any) {
            Swal.fire({
                title: 'Error al descargar',
                text: err.response?.data?.detail ?? err.message,
                icon: 'error',
                background: '#111',
                color: '#fff',
            });
        }
    };

    const clearSelectionAfterBulk = (
        locatario: string,
        zona: 'pendiente' | 'consolidado' | 'backup',
        filenames: string[]
    ) => {
        if (zona === 'backup') {
            setSelectedRestoreFiles((prev) => {
                const next = { ...prev };
                filenames.forEach((name) => delete next[restoreKey(locatario, name)]);
                return next;
            });
        } else {
            setSelectedBackupFiles((prev) => {
                const next = { ...prev };
                filenames.forEach((name) => delete next[backupKey(locatario, zona, name)]);
                return next;
            });
        }
    };

    const deleteSelection = async (
        locatario: string,
        zona: 'pendiente' | 'consolidado' | 'backup',
        filenames: string[]
    ) => {
        if (!filenames.length) return;
        const ok = await Swal.fire({
            title: 'Eliminar archivos',
            text: `¿Eliminar ${filenames.length} archivo(s) de ${locatario} (${zona})?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            background: '#111',
            color: '#fff',
        });
        if (!ok.isConfirmed) return;
        try {
            const token = localStorage.getItem('token');
            const res = await deleteFuentesArchivosBulk(token, {
                locatarioCodigo: locatario,
                zona,
                filenames,
            });
            const deletedCount = Array.isArray(res.deleted) ? res.deleted.length : 0;
            const missingCount = Array.isArray(res.missing) ? res.missing.length : 0;
            setLogs((prev) => [
                `🗑️ Eliminados ${locatario} (${zona}): ${deletedCount}${missingCount ? `, omitidos ${missingCount}` : ''}`,
                ...prev,
            ]);
            clearSelectionAfterBulk(locatario, zona, filenames);
            await refreshCierreModal();
        } catch (err: any) {
            Swal.fire({
                title: 'Error al eliminar',
                text: err.response?.data?.detail ?? err.message,
                icon: 'error',
                background: '#111',
                color: '#fff',
            });
        }
    };

    const procesadosKey = (locatario: string, filename: string) => `${locatario}::${filename}`;

    const handleProcesadosCheckboxMouseDown = (
        e: React.MouseEvent,
        locatario: string,
        visibleNames: string[],
        index: number,
        filename: string
    ) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const itemKey = procesadosKey(locatario, filename);
        const anchorIndex = selectionAnchorProcesadosRef.current[locatario];

        if (isShiftSelect(e) && anchorIndex !== undefined && visibleNames[anchorIndex] !== undefined) {
            const lo = Math.min(anchorIndex, index);
            const hi = Math.max(anchorIndex, index);
            setSelectedProcesadosFiles((prev) => {
                const next = { ...prev };
                for (let i = lo; i <= hi; i++) {
                    next[procesadosKey(locatario, visibleNames[i])] = true;
                }
                return next;
            });
            return;
        }

        setSelectedProcesadosFiles((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }));
        selectionAnchorProcesadosRef.current[locatario] = index;
    };

    const selectedProcesadosNames = (locatario: string) =>
        Object.entries(selectedProcesadosFiles)
            .filter(([k, v]) => v && k.startsWith(`${locatario}::`))
            .map(([k]) => k.split('::')[1])
            .filter(Boolean);

    const selectedCountProcesados = (locatario: string) => selectedProcesadosNames(locatario).length;

    const restoreFromProcesados = async (locatario: string, filenames: string[], mode: 'single' | 'bulk') => {
        if (!filenames.length || !procesadosFechaSel) return;
        const confirm = await Swal.fire({
            title: 'Volver a cierre_caja',
            text:
                mode === 'single'
                    ? `¿Mover ${filenames[0]} de procesados a pendientes?`
                    : `¿Mover ${filenames.length} archivo(s) de procesados a pendientes?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#22c55e',
            background: '#111',
            color: '#fff',
        });
        if (!confirm.isConfirmed) return;
        try {
            const jwt = localStorage.getItem('token');
            const res = await restoreFuentesFromProcesados(jwt, {
                fecha: procesadosFechaSel,
                locatarioCodigo: locatario,
                filenames,
                destino: 'pendiente',
            });
            const movedCount = Array.isArray(res.moved) ? res.moved.length : 0;
            const missingCount = Array.isArray(res.missing) ? res.missing.length : 0;
            setLogs((prev) => [
                `↩️ Procesados → cierre ${locatario} (${procesadosFechaSel}): ${movedCount}${missingCount ? `, omitidos ${missingCount}` : ''}`,
                ...prev,
            ]);
            if (mode === 'bulk') {
                const prefix = `${locatario}::`;
                setSelectedProcesadosFiles((prev) => {
                    const next = { ...prev };
                    Object.keys(next).forEach((k) => {
                        if (k.startsWith(prefix)) delete next[k];
                    });
                    return next;
                });
            } else {
                const only = filenames[0];
                setSelectedProcesadosFiles((prev) => {
                    const next = { ...prev };
                    delete next[procesadosKey(locatario, only)];
                    return next;
                });
            }
            await refreshCierreModal();
            await loadProcesadosFecha(procesadosFechaSel);
        } catch (err: any) {
            Swal.fire({
                title: 'Error',
                text: err.response?.data?.detail ?? err.message,
                icon: 'error',
                background: '#111',
                color: '#fff',
            });
        }
    };

    const restoreFromBackup = async (locatario: string, filenames: string[], mode: 'single' | 'bulk') => {
        if (!filenames.length) return;
        const confirm = await Swal.fire({
            title: 'Restaurar desde backup',
            text:
                mode === 'single'
                    ? `¿Restaurar ${filenames[0]} a pendientes?`
                    : `¿Restaurar ${filenames.length} archivo(s) a pendientes?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#22c55e',
            background: '#111',
            color: '#fff',
        });
        if (!confirm.isConfirmed) return;
        try {
            const jwt = localStorage.getItem('token');
            const res = await restoreFuentesFromBackup(jwt, {
                locatarioCodigo: locatario,
                filenames,
                destino: 'pendiente',
            });
            const movedCount = Array.isArray(res.moved) ? res.moved.length : 0;
            setLogs((prev) => [`♻️ Restore ${locatario}: ${movedCount} archivo(s)`, ...prev]);
            const prefix = `${locatario}::`;
            setSelectedRestoreFiles((prev) => {
                const next = { ...prev };
                Object.keys(next).forEach((k) => {
                    if (k.startsWith(prefix)) delete next[k];
                });
                return next;
            });
            await refreshCierreModal();
        } catch (err: any) {
            Swal.fire({
                title: 'Error',
                text: err.response?.data?.detail ?? err.message,
                icon: 'error',
                background: '#111',
                color: '#fff',
            });
        }
    };

    const toggleCierreLoc = (locatario: string) => {
        setExpandedCierreLocs((prev) => ({ ...prev, [locatario]: !prev[locatario] }));
    };

    const toggleProcesadosLoc = (locatario: string) => {
        setExpandedProcesadosLocs((prev) => ({ ...prev, [locatario]: !prev[locatario] }));
    };

    const filterBySearch = (items: string[]) => {
        const q = filesSearchTerm.trim().toLowerCase();
        if (!q) return items;
        return items.filter((n) => n.toLowerCase().includes(q));
    };

    const openPendientesModal = () => {
        if (!token) {
            Swal.fire({
                title: 'Sesión requerida',
                text: 'Inicia sesión para consultar pendientes de carga en FileStore.',
                icon: 'warning',
                background: '#111',
                color: '#fff',
            });
            return;
        }
        setPendientesResult(null);
        setPendientesErr(null);
        setIsPendientesModalOpen(true);
    };

    const closePendientesModal = () => {
        setIsPendientesModalOpen(false);
        setPendientesErr(null);
    };

    const ejecutarPendientesConsulta = async () => {
        if (!token) return;
        if (notifModo === 'rango_libre' && (!notifFechaIni.trim() || !notifFechaFin.trim())) {
            setPendientesErr('Indica fecha inicio y fin para el rango libre.');
            return;
        }
        setPendientesLoading(true);
        setPendientesErr(null);
        try {
            const data = await fetchPendientesSemana(token, {
                modo: notifModo,
                dias: notifModo === 'ultimos_dias' ? notifDias : undefined,
                fecha_inicio: notifModo === 'rango_libre' ? notifFechaIni : undefined,
                fecha_fin: notifModo === 'rango_libre' ? notifFechaFin : undefined,
            });
            setPendientesResult(data);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
            const detail = e.response?.data?.detail;
            const msg =
                typeof detail === 'string'
                    ? detail
                    : Array.isArray(detail)
                      ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('; ')
                      : e.message ?? 'No se pudo consultar el API';
            setPendientesErr(msg);
        } finally {
            setPendientesLoading(false);
        }
    };

    const guardarEnvioConfig = async () => {
        if (!token || !user?.is_superuser) return;
        const [hs, ms] = scheduleHHMM.split(':');
        const schedule_hour = Number(hs);
        const schedule_minute = Number(ms);
        if (
            !Number.isFinite(schedule_hour) ||
            !Number.isFinite(schedule_minute) ||
            schedule_hour < 0 ||
            schedule_hour > 23 ||
            schedule_minute < 0 ||
            schedule_minute > 59
        ) {
            await Swal.fire({
                title: 'Hora inválida',
                text: 'Use formato HH:MM (24h).',
                icon: 'warning',
                background: '#111',
                color: '#fff',
            });
            return;
        }
        if (scheduleModo === 'rango_libre' && (!scheduleFechaIni.trim() || !scheduleFechaFin.trim())) {
            await Swal.fire({
                title: 'Rango incompleto',
                text: 'El envío programado en rango libre requiere fecha inicio y fin.',
                icon: 'warning',
                background: '#111',
                color: '#fff',
            });
            return;
        }
        setEnvioSaveBusy(true);
        try {
            const body: NotificacionesEnvioConfigPatch = {
                schedule_enabled: scheduleEnabled,
                schedule_hour,
                schedule_minute,
                schedule_modo: scheduleModo,
                schedule_dias: scheduleModo === 'ultimos_dias' ? scheduleDias : null,
                schedule_fecha_inicio: scheduleModo === 'rango_libre' ? scheduleFechaIni.trim() : null,
                schedule_fecha_fin: scheduleModo === 'rango_libre' ? scheduleFechaFin.trim() : null,
                n8n_webhook_url: n8nWebhookUrl.trim(),
            };
            if (n8nSecretTouched) {
                body.n8n_webhook_secret = n8nWebhookSecret.trim();
            }
            const saved = await patchNotificacionesEnvioConfig(token, body);
            setScheduleModo(saved.schedule_modo ?? 'ultima_semana');
            setScheduleDias(saved.schedule_dias ?? 7);
            setScheduleFechaIni(saved.schedule_fecha_inicio ?? '');
            setScheduleFechaFin(saved.schedule_fecha_fin ?? '');
            setN8nWebhookUrl(saved.n8n_webhook_url ?? '');
            setN8nSecretConfigured(saved.n8n_webhook_secret_configured);
            setN8nWebhookSecret('');
            setN8nSecretTouched(false);
            await Swal.fire({
                icon: 'success',
                title: 'Configuración guardada',
                timer: 1500,
                showConfirmButton: false,
                background: '#111',
                color: '#fff',
            });
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
            const detail = e.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail : e.message ?? 'Error al guardar';
            await Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setEnvioSaveBusy(false);
        }
    };

    const dispararEnvioN8n = async () => {
        if (!token || !user?.is_superuser) return;
        if (notifModo === 'rango_libre' && (!notifFechaIni.trim() || !notifFechaFin.trim())) {
            await Swal.fire({
                title: 'Rango incompleto',
                text: 'Indica fechas del rango (o vuelve a consultar con otro modo).',
                icon: 'warning',
                background: '#111',
                color: '#fff',
            });
            return;
        }
        const ok = await Swal.fire({
            title: 'Enviar a n8n',
            text: 'Se enviará el payload con los locatarios en alerta para el mismo periodo que elegiste al consultar.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Enviar',
            cancelButtonText: 'Cancelar',
            background: '#111',
            color: '#fff',
        });
        if (!ok.isConfirmed) return;
        setDisparoBusy(true);
        try {
            const r = await dispararNotificacionesN8n(token, {
                modo: notifModo,
                dias: notifModo === 'ultimos_dias' ? notifDias : undefined,
                fecha_inicio: notifModo === 'rango_libre' ? notifFechaIni : undefined,
                fecha_fin: notifModo === 'rango_libre' ? notifFechaFin : undefined,
            });
            await Swal.fire({
                title: r.enviado ? 'Proceso enviado' : 'Sin envío o incompleto',
                html: `<p class="text-sm">Ítems con alerta: <strong>${r.items}</strong></p>${r.error ? `<p class="text-xs text-amber-300">${r.error}</p>` : ''}${r.razon ? `<p class="text-xs">${r.razon}</p>` : ''}`,
                icon: r.ok ? 'success' : 'info',
                background: '#111',
                color: '#fff',
            });
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
            const detail = e.response?.data?.detail;
            const msg = typeof detail === 'string' ? detail : e.message ?? 'Error al disparar';
            await Swal.fire({ title: 'Error', text: msg, icon: 'error', background: '#111', color: '#fff' });
        } finally {
            setDisparoBusy(false);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 h-full">
            <div className="xl:col-span-8 space-y-8">
                <div className="bg-app-card border border-app-border rounded-[28px] p-5 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-app-accent">Panel operativo</p>
                            <p className="text-[10px] text-app-muted mt-1 leading-relaxed">
                                Trabaja de izquierda a derecha: <strong className="text-app-text">Consolidar</strong>,{' '}
                                <strong className="text-app-text">Asociar</strong>, <strong className="text-app-text">Ventas</strong> y{' '}
                                <strong className="text-app-text">BigQuery</strong>. Usa la simulación antes de escribir CSV cuando haya dudas.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setIsGuideModalOpen(true)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-app-border bg-app-input px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-muted transition-colors hover:text-app-accent"
                            >
                                <HelpCircle size={14} />
                                Ver guía
                            </button>
                            <button
                                type="button"
                                onClick={openPendientesModal}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-app-accent-muted bg-app-accent-muted-bg px-3 py-2 text-[9px] font-black uppercase tracking-widest text-app-accent transition-colors hover:bg-app-accent-muted-bg-hover"
                                title="Revisar pendientes por día (modal)"
                            >
                                <BellRing size={14} />
                                Pendientes por día
                            </button>
                        </div>
                    </div>
                    {stagingStatus?.success && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <span
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest ${
                                    stagingStatus.staging_mode === 'postgres'
                                        ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                                        : stagingStatus.staging_mode === 'dual'
                                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                          : 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                                }`}
                                title="SALES_STAGING_MODE en el servidor"
                            >
                                <Database size={10} />
                                Staging: {stagingStatus.staging_mode ?? 'excel'}
                            </span>
                            <span className="text-[8px] font-black uppercase tracking-widest text-app-muted">
                                Lectura BQ/preview:{' '}
                                <span className="text-app-text">
                                    {stagingStatus.active_source === 'postgresql' ? 'PostgreSQL' : 'Excel'}
                                </span>
                            </span>
                            <span className="text-[8px] text-app-muted">
                                sales: Excel {stagingStatus.excel?.rows ?? 0} · PG {stagingStatus.postgresql?.rows ?? 0}
                            </span>
                            {stagingStatus.realizadas && (
                                <span className="text-[8px] text-app-muted">
                                    realizadas ({stagingStatus.realizadas.staging_mode ?? 'excel'}): Excel{' '}
                                    {stagingStatus.realizadas.excel?.rows ?? 0} · PG{' '}
                                    {stagingStatus.realizadas.postgresql?.rows ?? 0}
                                    {(stagingStatus.realizadas.postgresql?.pendientes_bq ?? 0) > 0
                                        ? ` · ${stagingStatus.realizadas.postgresql?.pendientes_bq} pend. BQ`
                                        : ''}
                                </span>
                            )}
                            {user?.is_superuser && stagingStatus.staging_mode !== 'excel' && (
                                <button
                                    type="button"
                                    onClick={() => void runImportStagingExcel()}
                                    disabled={stagingImportBusy}
                                    className="inline-flex items-center gap-1 rounded-lg border border-app-border bg-app-input px-2 py-1 text-[8px] font-black uppercase tracking-widest text-app-muted hover:text-app-accent transition-colors disabled:opacity-40"
                                >
                                    <CloudSync size={10} />
                                    {stagingImportBusy ? '…' : 'sales → PG'}
                                </button>
                            )}
                            {user?.is_superuser && stagingStatus.realizadas?.staging_mode !== 'excel' && (
                                <button
                                    type="button"
                                    onClick={() => void runImportRealizadasStagingExcel()}
                                    disabled={stagingImportBusy}
                                    className="inline-flex items-center gap-1 rounded-lg border border-app-border bg-app-input px-2 py-1 text-[8px] font-black uppercase tracking-widest text-app-muted hover:text-app-accent transition-colors disabled:opacity-40"
                                >
                                    <CloudSync size={10} />
                                    {stagingImportBusy ? '…' : 'realizadas → PG'}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Rango para consolidar / asociar */}
                <div className="bg-app-card border border-app-border rounded-[28px] p-6 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-app-accent flex items-center gap-2">
                            <CalendarRange size={14} /> Rango de proceso (Consolidar / Asociar)
                        </h3>
                    </div>
                    <div className="flex flex-wrap gap-4 items-center">
                        {(['semana_actual', 'ultima_semana', 'rango_libre'] as ModoRango[]).map((m) => (
                            <label key={m} className="flex items-center gap-2 text-[10px] text-app-muted cursor-pointer">
                                <input
                                    type="radio"
                                    name="modoRango"
                                    checked={modoRango === m}
                                    onChange={() => setModoRango(m)}
                                    className="accent-teal-500"
                                />
                                {m === 'semana_actual' && 'Semana actual'}
                                {m === 'ultima_semana' && 'Última semana completa'}
                                {m === 'rango_libre' && 'Rango libre'}
                            </label>
                        ))}
                    </div>
                    {modoRango === 'rango_libre' && (
                        <div className="grid grid-cols-2 gap-4 max-w-md">
                            <div>
                                <label className="text-[9px] font-black text-app-muted uppercase">Desde</label>
                                <input
                                    type="date"
                                    value={procesoFechaIni}
                                    onChange={(e) => setProcesoFechaIni(e.target.value)}
                                    className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-app-muted uppercase">Hasta</label>
                                <input
                                    type="date"
                                    value={procesoFechaFin}
                                    onChange={(e) => setProcesoFechaFin(e.target.value)}
                                    className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 xl:gap-4">
                    <StepButton
                        icon={<Layers />}
                        title="1. Consolidar"
                        desc="Pendientes → CSV consolidados"
                        onClick={() => void runConsolidacion(false)}
                        loading={isProcessing === 'Consolidación'}
                    />
                    <StepButton icon={<Link />} title="2. Asociar" desc="Consolidados → Activas" onClick={runAsociacion} loading={isProcessing === 'Asociación'} />
                    <StepButton icon={<Database />} title="3. Ventas" desc="→ ConfiguracionWeb" onClick={runVentasProtocol} loading={isProcessing === 'Ventas'} />
                    <StepButton icon={<CloudSync />} title="4. BigQuery" desc="MERGE → stg_sales_silver" onClick={runBigQuery} loading={isProcessing === 'BigQuery'} />
                    <StepButton
                        icon={<FileCode />}
                        title="Extra: Convertir"
                        desc="XLSX → CSV (opcional)"
                        onClick={runConvertir}
                        loading={isProcessing === 'Conversión'}
                        isExtra
                    />
                </div>

                <div className="flex flex-wrap items-center gap-3 px-1 -mt-2">
                    <button
                        type="button"
                        onClick={() => void runConsolidacion(true)}
                        disabled={isProcessing === 'Simulación' || isProcessing === 'Consolidación'}
                        className="text-[9px] font-black uppercase tracking-widest text-app-accent border border-app-accent-muted rounded-xl px-3 py-2 hover:bg-app-accent-muted-bg disabled:opacity-50"
                    >
                        {isProcessing === 'Simulación' ? 'Simulando…' : 'Simular antes de consolidar'}
                    </button>
                    <span className="text-[9px] text-app-muted max-w-md leading-snug">
                        Abre el resumen por local y archivo sin guardar CSV; desde el resultado puedes ejecutar la consolidación real.
                    </span>
                </div>

                <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 px-4 py-3">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded border-app-border accent-amber-500"
                            checked={archivarPendientesTrasConsolidado}
                            onChange={(e) => setArchivarPendientesTrasConsolidado(e.target.checked)}
                        />
                        <span className="text-[10px] text-app-muted leading-snug">
                            <strong className="text-amber-300">Opción avanzada:</strong> al procesar un{' '}
                            <strong className="text-app-text">consolidado</strong>, mover también los pendientes del mismo locatario a Procesados.
                            Déjalo apagado salvo que ya verificaste que esos pendientes están absorbidos en el CSV consolidado.
                        </span>
                    </label>
                </div>

                <div className="bg-app-card p-6 sm:p-10 rounded-[40px] border border-app-border grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12">
                    <div className="space-y-6">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-app-accent flex items-center gap-3">
                                <Search size={14} /> Explorador CierreCaja (FileStore)
                            </h3>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <AppSelect<string>
                                    options={LOCATARIOS.map((l) => ({ value: l.codigo, label: `${l.name}` }))}
                                    value={
                                        legacyUploadLoc
                                            ? { value: legacyUploadLoc, label: LOCATARIOS.find((l) => l.codigo === legacyUploadLoc)?.name ?? legacyUploadLoc }
                                            : null
                                    }
                                    onChange={(opt) => setLegacyUploadLoc(opt?.value ?? '')}
                                    placeholder="Locatario (subir)"
                                    className="min-w-[140px]"
                                    size="sm"
                                />
                                <button
                                    type="button"
                                    onClick={openFilesModal}
                                    className="bg-app-input hover:bg-app-accent-muted-bg text-app-muted hover:text-app-accent px-3 py-1.5 rounded-xl transition-all flex items-center gap-2 border border-app-border"
                                >
                                    <FolderOpen size={12} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Gestionar archivos</span>
                                </button>
                                <label className="cursor-pointer bg-app-accent-muted-bg hover:bg-app-accent-muted-bg-hover text-app-accent px-3 py-1.5 rounded-xl transition-all flex items-center gap-2 border border-app-accent-muted group">
                                    <Upload size={12} className="group-hover:scale-110 transition-transform" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Subir</span>
                                    <input type="file" className="hidden" onChange={handleUpload} multiple accept=".xlsx,.csv" />
                                </label>
                            </div>
                        </div>
                        <div className="bg-app-input rounded-3xl border border-app-border h-64 overflow-y-auto scrollbar-hide">
                            {files.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-app-muted opacity-70">
                                    <File size={32} className="mb-2" />
                                    <span className="text-[10px]">Sin archivos en cierre_caja</span>
                                </div>
                            ) : (
                                files.map((f, i) => (
                                    <button
                                        key={`${f.name}-${i}`}
                                        onClick={() => setSelectedFile(f.name)}
                                        className={`w-full p-4 flex items-center justify-between transition-all border-b border-app-border last:border-0 ${selectedFile === f.name ? 'bg-app-accent-muted-bg' : 'hover:bg-app-surface'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            <FileCode
                                                className={`w-5 h-5 shrink-0 ${f.name.endsWith('.xlsx') ? 'text-emerald-600' : 'text-blue-500'}`}
                                            />
                                            <div className="text-left min-w-0">
                                                <div className="text-[10px] font-black truncate text-app-text">{f.name}</div>
                                                <div className="text-[8px] text-app-muted font-mono">{f.modified}</div>
                                                {f.zona ? (
                                                    <div className="text-[7px] uppercase text-teal-600/80">{f.zona}</div>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="text-[8px] font-mono text-app-muted shrink-0">{(f.size / 1024).toFixed(1)} KB</div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-app-accent flex items-center gap-3">
                            <Plus size={14} /> Asociación manual
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-app-muted ml-1 uppercase">Negocio destino</label>
                                <AppSelect<string>
                                    options={negocios}
                                    value={selectedNegocio}
                                    onChange={setSelectedNegocio}
                                    placeholder="Buscar por código..."
                                    isSearchable
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-app-muted ml-1 uppercase">Inicio</label>
                                    <input
                                        type="date"
                                        value={fechaInicio}
                                        onChange={(e) => setFechaInicio(e.target.value)}
                                        className="w-full bg-app-input border border-app-border rounded-xl p-3 text-[10px] text-app-text focus:border-app-accent outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-app-muted ml-1 uppercase">Fin</label>
                                    <input
                                        type="date"
                                        value={fechaFin}
                                        onChange={(e) => setFechaFin(e.target.value)}
                                        className="w-full bg-app-input border border-app-border rounded-xl p-3 text-[10px] text-app-text focus:border-app-accent outline-none transition-all"
                                    />
                                </div>
                            </div>
                            <button
                                onClick={handleManualLink}
                                disabled={!selectedFile || !selectedNegocio || isProcessing !== null}
                                className="w-full py-4 bg-app-input hover:bg-teal-500 hover:text-black transition-all rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-20 flex items-center justify-center gap-3 text-app-text"
                            >
                                Vincular registro
                            </button>
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <button
                                    type="button"
                                    onClick={() => handleOpenPreview('sales')}
                                    className="py-3 bg-app-input hover:bg-app-surface border border-app-border rounded-xl text-[9px] font-black uppercase text-app-muted hover:text-app-text transition-all flex items-center justify-center gap-2"
                                >
                                    <Table size={12} className="text-app-accent" />
                                    Ver sales_df
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleOpenPreview('realizadas')}
                                    className="py-3 bg-app-input hover:bg-app-surface border border-app-border rounded-xl text-[9px] font-black uppercase text-app-muted hover:text-app-text transition-all flex items-center justify-center gap-2"
                                >
                                    <Database size={12} className="text-blue-500" />
                                    Ver resumen
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="xl:col-span-4 h-full flex flex-col min-h-[300px] sm:min-h-[500px]">
                <div className="flex-1 bg-app-card border border-app-border rounded-[40px] flex flex-col overflow-hidden shadow-2xl">
                    <div className="p-8 border-b border-app-border flex flex-wrap items-start justify-between gap-4 bg-app-input">
                        <div className="flex min-w-0 flex-col gap-2 items-start">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-app-accent">
                                Flujo procesos
                            </h3>
                            <button
                                type="button"
                                onClick={() => setLogs([])}
                                className=" text-[8px] font-black uppercase text-app-muted hover:text-app-text transition-colors cursor-pointer"
                            >
                                Limpiar
                            </button>
                        </div>
                        <div className="shrink-0">
                            <ProcessingStatusBadges className="justify-end" />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 space-y-4 scrollbar-hide font-mono">
                        <AnimatePresence initial={false}>
                            {logs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-app-muted opacity-50 italic text-[10px]">
                                    {/* Awaiting system signals... */}
                                    Esperando señales...
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="p-4 rounded-2xl bg-app-surface border border-app-border text-[10px] flex gap-4 leading-relaxed"
                                    >
                                        <ChevronRight size={14} className="shrink-0 text-app-muted mt-0.5" />
                                        <span
                                            className={
                                                log.includes('✅') ? 'text-emerald-600' : log.includes('❌') ? 'text-rose-500' : 'text-app-muted'
                                            }
                                        >
                                            {log}
                                        </span>
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {isGuideModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10050 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl"
                        onClick={() => setIsGuideModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="bg-app-panel border border-app-border w-full max-w-2xl rounded-[30px] overflow-hidden shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-app-border flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-app-accent">Guía rápida del proceso</p>
                                    <p className="text-[10px] text-app-muted mt-1">
                                        Pensada para operación diaria: revisar, consolidar, asociar, procesar y sincronizar.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsGuideModalOpen(false)}
                                    className="p-2 rounded-lg text-app-muted hover:bg-app-input"
                                    aria-label="Cerrar guía"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <ol className="space-y-3 text-[11px] text-app-muted leading-relaxed">
                                    <li>
                                        <strong className="text-app-text">1. Subir reportes:</strong> quedan en Pendientes por locatario.
                                    </li>
                                    <li>
                                        <strong className="text-app-text">2. Simular:</strong> revisa qué locales entran, cuáles se omiten y qué archivos
                                        tienen observaciones sin escribir CSV.
                                    </li>
                                    <li>
                                        <strong className="text-app-text">3. Consolidar:</strong> genera un CSV por local en _consolidados para el rango elegido.
                                    </li>
                                    <li>
                                        <strong className="text-app-text">4. Asociar:</strong> vincula los consolidados con su CodigoNegocio en Activas.
                                    </li>
                                    <li>
                                        <strong className="text-app-text">5. Ventas:</strong> procesa Activas y escribe sales_df
                                        {stagingStatus?.staging_mode === 'postgres'
                                            ? ' en PostgreSQL.'
                                            : stagingStatus?.staging_mode === 'dual'
                                              ? ' en Excel y PostgreSQL.'
                                              : ' en ConfiguracionWeb.'}
                                    </li>
                                    <li>
                                        <strong className="text-app-text">6. BigQuery:</strong> envía solo Realizadas pendientes con MERGE idempotente.
                                    </li>
                                </ol>
                                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[10px] text-app-muted leading-relaxed">
                                    Usa <strong className="text-app-text">Limpiar y cargar</strong> solo para reprocesos controlados. Para carga diaria,
                                    lo normal es <strong className="text-app-text">Añadir sin limpiar</strong>.
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {isFilesModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10050 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xl"
                        onClick={() => setIsFilesModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            className="bg-app-panel border border-app-border w-full max-w-4xl max-h-[90vh] rounded-[30px] flex flex-col overflow-hidden shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-app-border flex items-center justify-between flex-wrap gap-2">
                                <h3 className="text-sm font-black uppercase tracking-widest text-app-accent flex items-center gap-2">
                                    <FolderOpen size={20} /> Gestionar archivos
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsFilesModalOpen(false)}
                                    className="p-2 hover:bg-app-card-hover rounded-xl text-app-muted hover:text-app-accent"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="px-6 pt-4 flex gap-2 border-b border-app-border">
                                <button
                                    type="button"
                                    onClick={() => setFilesModalTab('cierre')}
                                    className={`px-4 py-2 text-[10px] font-black uppercase rounded-t-lg ${filesModalTab === 'cierre' ? 'bg-teal-500/20 text-teal-400' : 'text-app-muted'
                                        }`}
                                >
                                    Cierre caja
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilesModalTab('procesados')}
                                    className={`px-4 py-2 text-[10px] font-black uppercase rounded-t-lg ${filesModalTab === 'procesados' ? 'bg-teal-500/20 text-teal-400' : 'text-app-muted'
                                        }`}
                                >
                                    Procesados (histórico)
                                </button>
                            </div>
                            <div className="px-6 pt-3 flex flex-wrap gap-3 text-[9px] text-app-muted border-b border-app-border pb-3">
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Pendientes (reportes subidos)
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Consolidados (paso 1)
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-sky-500" /> Respaldo
                                </span>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1 space-y-6">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                    <div className="flex items-center gap-2 flex-1">
                                        <Search size={14} className="text-app-muted shrink-0" />
                                        <input
                                            type="text"
                                            value={filesSearchTerm}
                                            onChange={(e) => setFilesSearchTerm(e.target.value)}
                                            placeholder="Filtrar archivos por nombre..."
                                            className="w-full sm:max-w-md bg-app-input border border-app-border rounded-xl px-3 py-2 text-[10px] text-app-text"
                                        />
                                    </div>
                                    <p className="text-[8px] text-app-muted sm:max-w-xs leading-snug">
                                        Clic en la fila = marcar/desmarcar. <strong className="text-app-text">Mayús + clic</strong> en otra fila marca
                                        todo el rango (lista visible); primero haz un clic normal que fije el inicio del rango.
                                    </p>
                                </div>
                                {filesModalTab === 'cierre' && (
                                    <>
                                        <div className="flex flex-wrap items-center gap-4">
                                            <button
                                                type="button"
                                                onClick={() => window.open(zipCierreCajaUrl(), '_blank')}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/20 text-teal-500 hover:bg-teal-500/30 text-[10px] font-black uppercase"
                                            >
                                                <FileArchive size={14} /> ZIP todo cierre_caja
                                            </button>
                                        </div>
                                        {filesModalLoading ? (
                                            <div className="flex items-center justify-center py-12">
                                                <RefreshCcw size={32} className="animate-spin text-teal-500" />
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                {porLocatarioModal.map((grupo) => {
                                                    const counts = conteoArchivosCierre(grupo);
                                                    return (
                                                    <div key={grupo.locatario} className="bg-app-input rounded-2xl border border-app-border p-4">
                                                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleCierreLoc(grupo.locatario)}
                                                                className="flex items-center gap-2 text-[10px] font-black uppercase text-teal-500 text-left"
                                                            >
                                                                <ChevronRight size={14} className={`transition-transform shrink-0 ${expandedCierreLocs[grupo.locatario] ? 'rotate-90' : ''}`} />
                                                                <span>
                                                                    {grupo.locatario}
                                                                    <span className="block text-[8px] font-medium text-app-muted normal-case mt-0.5">
                                                                        {counts.pendientes} pend. · {counts.consolidados} cons. · {counts.backup} resp.
                                                                    </span>
                                                                </span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => window.open(zipCierreCajaUrl(grupo.locatario), '_blank')}
                                                                className="text-[9px] font-black uppercase text-app-muted hover:text-app-accent flex items-center gap-1"
                                                            >
                                                                <Download size={12} /> ZIP locatario
                                                            </button>
                                                        </div>
                                                        {expandedCierreLocs[grupo.locatario] ? (
                                                            <>
                                                        {grupo.pendientes?.length ? (
                                                            <div className="flex items-center justify-between mb-2">
                                                                <p className="text-[8px] font-bold text-app-muted uppercase">Pendientes</p>
                                                                {selectedCountByZona(grupo.locatario, 'pendiente') > 0 ? (
                                                                    <span className="flex flex-wrap items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void downloadSelection(
                                                                                    grupo.locatario,
                                                                                    'pendiente',
                                                                                    selectedNamesByZona(grupo.locatario, 'pendiente')
                                                                                )
                                                                            }
                                                                            className="text-[8px] font-black uppercase text-blue-400 hover:text-blue-300"
                                                                        >
                                                                            Descargar seleccionados ({selectedCountByZona(grupo.locatario, 'pendiente')})
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void moveToBackup(
                                                                                    grupo.locatario,
                                                                                    'pendiente',
                                                                                    selectedNamesByZona(grupo.locatario, 'pendiente'),
                                                                                    'bulk'
                                                                                )
                                                                            }
                                                                            className="text-[8px] font-black uppercase text-sky-400 hover:text-sky-300"
                                                                        >
                                                                            Mover seleccionados a backup_no_consolidados ({selectedCountByZona(grupo.locatario, 'pendiente')})
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void deleteSelection(
                                                                                    grupo.locatario,
                                                                                    'pendiente',
                                                                                    selectedNamesByZona(grupo.locatario, 'pendiente')
                                                                                )
                                                                            }
                                                                            className="text-[8px] font-black uppercase text-red-400 hover:text-red-300"
                                                                        >
                                                                            Eliminar seleccionados ({selectedCountByZona(grupo.locatario, 'pendiente')})
                                                                        </button>
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        ) : null}
                                                                <ul className="space-y-2 mb-4">
                                                                    {(() => {
                                                                        const pendientesVisible = filterBySearch(grupo.pendientes || []);
                                                                        return pendientesVisible.map((nombre, index) => (
                                                                <li
                                                                    key={`p-${nombre}`}
                                                                    className="flex items-center justify-between py-2 border-b border-app-border last:border-0 text-[10px]"
                                                                >
                                                                    <label
                                                                        className="flex items-center gap-2 text-app-text min-w-0 cursor-pointer select-none"
                                                                        title="Clic para marcar; Mayús+clic para seleccionar un rango"
                                                                        onMouseDown={(e) =>
                                                                            handleBackupCheckboxMouseDown(
                                                                                e,
                                                                                grupo.locatario,
                                                                                'pendiente',
                                                                                pendientesVisible,
                                                                                index,
                                                                                nombre
                                                                            )
                                                                        }
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            readOnly
                                                                            tabIndex={-1}
                                                                            checked={!!selectedBackupFiles[backupKey(grupo.locatario, 'pendiente', nombre)]}
                                                                            className="accent-teal-500 pointer-events-none"
                                                                        />
                                                                        <FileCode size={14} className="text-emerald-500/80 shrink-0" />{' '}
                                                                        <span className="truncate">{nombre}</span>
                                                                    </label>
                                                                    <span className="flex items-center gap-1 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void moveToBackup(grupo.locatario, 'pendiente', [nombre], 'single')}
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-sky-500/20 hover:text-sky-400"
                                                                            title="Mover a backup"
                                                                        >
                                                                            <FolderOpen size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                window.open(
                                                                                    downloadFuentesUrl({
                                                                                        origen: 'cierre',
                                                                                        locatario_codigo: grupo.locatario,
                                                                                        filename: nombre,
                                                                                        zona: 'pendiente',
                                                                                    }),
                                                                                    '_blank'
                                                                                )
                                                                            }
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-blue-500/20 hover:text-blue-400"
                                                                            title="Descargar"
                                                                        >
                                                                            <Download size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void openFileStorePreview(`${grupo.locatario} · ${nombre}`, {
                                                                                    origen: 'cierre',
                                                                                    locatario: grupo.locatario,
                                                                                    filename: nombre,
                                                                                    zona: 'pendiente',
                                                                                })
                                                                            }
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-teal-500/20 hover:text-teal-400"
                                                                            title="Vista previa"
                                                                        >
                                                                            <Eye size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => deleteFileStoreFile(grupo.locatario, nombre, 'pendiente')}
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-red-500/20 hover:text-red-500"
                                                                            title="Eliminar"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </span>
                                                                </li>
                                                                        ));
                                                                    })()}
                                                        </ul>
                                                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 mb-4">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <p className="text-[9px] font-black text-amber-400/90 uppercase tracking-widest">
                                                                    Consolidados
                                                                </p>
                                                                {counts.consolidados === 0 ? (
                                                                    <span className="text-[8px] text-app-muted italic">Vacío — ejecute paso 1 Consolidar</span>
                                                                ) : (selectedCountByZona(grupo.locatario, 'consolidado') > 0) ? (
                                                                    <span className="flex flex-wrap items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void downloadSelection(
                                                                                    grupo.locatario,
                                                                                    'consolidado',
                                                                                    selectedNamesByZona(grupo.locatario, 'consolidado')
                                                                                )
                                                                            }
                                                                            className="text-[8px] font-black uppercase text-blue-400 hover:text-blue-300"
                                                                        >
                                                                            Descargar seleccionados ({selectedCountByZona(grupo.locatario, 'consolidado')})
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void moveToBackup(
                                                                                    grupo.locatario,
                                                                                    'consolidado',
                                                                                    selectedNamesByZona(grupo.locatario, 'consolidado'),
                                                                                    'bulk'
                                                                                )
                                                                            }
                                                                            className="text-[8px] font-black uppercase text-sky-400 hover:text-sky-300"
                                                                        >
                                                                            Mover seleccionados ({selectedCountByZona(grupo.locatario, 'consolidado')})
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void deleteSelection(
                                                                                    grupo.locatario,
                                                                                    'consolidado',
                                                                                    selectedNamesByZona(grupo.locatario, 'consolidado')
                                                                                )
                                                                            }
                                                                            className="text-[8px] font-black uppercase text-red-400 hover:text-red-300"
                                                                        >
                                                                            Eliminar seleccionados ({selectedCountByZona(grupo.locatario, 'consolidado')})
                                                                        </button>
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <ul className="space-y-2">
                                                                {(() => {
                                                                    const consolidadosVisible = filterBySearch(grupo.consolidados || []);
                                                                    if (consolidadosVisible.length === 0) {
                                                                        return (
                                                                            <li className="text-[9px] text-app-muted py-2 italic">
                                                                                Sin archivos en _consolidados
                                                                            </li>
                                                                        );
                                                                    }
                                                                    return consolidadosVisible.map((nombre, index) => (
                                                                <li
                                                                    key={`c-${nombre}`}
                                                                    className="flex items-center justify-between py-2 border-b border-app-border last:border-0 text-[10px]"
                                                                >
                                                                    <label
                                                                        className="flex items-center gap-2 text-app-text opacity-90 min-w-0 cursor-pointer select-none"
                                                                        title="Clic para marcar; Mayús+clic para seleccionar un rango"
                                                                        onMouseDown={(e) =>
                                                                            handleBackupCheckboxMouseDown(
                                                                                e,
                                                                                grupo.locatario,
                                                                                'consolidado',
                                                                                consolidadosVisible,
                                                                                index,
                                                                                nombre
                                                                            )
                                                                        }
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            readOnly
                                                                            tabIndex={-1}
                                                                            checked={!!selectedBackupFiles[backupKey(grupo.locatario, 'consolidado', nombre)]}
                                                                            className="accent-teal-500 pointer-events-none"
                                                                        />
                                                                        <FileCode size={14} className="text-amber-500/80 shrink-0" />{' '}
                                                                        <span className="truncate">{nombre}</span>
                                                                    </label>
                                                                    <span className="flex items-center gap-1 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => void moveToBackup(grupo.locatario, 'consolidado', [nombre], 'single')}
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-sky-500/20 hover:text-sky-400"
                                                                            title="Mover a backup"
                                                                        >
                                                                            <FolderOpen size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                window.open(
                                                                                    downloadFuentesUrl({
                                                                                        origen: 'cierre',
                                                                                        locatario_codigo: grupo.locatario,
                                                                                        filename: nombre,
                                                                                        zona: 'consolidado',
                                                                                    }),
                                                                                    '_blank'
                                                                                )
                                                                            }
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-blue-500/20 hover:text-blue-400"
                                                                            title="Descargar"
                                                                        >
                                                                            <Download size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void openFileStorePreview(`${grupo.locatario} · ${nombre}`, {
                                                                                    origen: 'cierre',
                                                                                    locatario: grupo.locatario,
                                                                                    filename: nombre,
                                                                                    zona: 'consolidado',
                                                                                })
                                                                            }
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-teal-500/20 hover:text-teal-400"
                                                                            title="Vista previa"
                                                                        >
                                                                            <Eye size={14} />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => deleteFileStoreFile(grupo.locatario, nombre, 'consolidado')}
                                                                            className="p-1.5 rounded-lg text-app-muted hover:bg-red-500/20 hover:text-red-500"
                                                                            title="Eliminar consolidado"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </span>
                                                                </li>
                                                                    ));
                                                                })()}
                                                            </ul>
                                                        </div>
                                                                {grupo.backup?.length ? (
                                                                    <div className="flex items-center justify-between mt-4 mb-2">
                                                                        <p className="text-[8px] font-bold text-app-muted uppercase">Respaldo (backup_no_consolidados)</p>
                                                                        {selectedRestoreNames(grupo.locatario).length > 0 ? (
                                                                            <span className="flex flex-wrap items-center gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        void downloadSelection(
                                                                                            grupo.locatario,
                                                                                            'backup',
                                                                                            selectedRestoreNames(grupo.locatario)
                                                                                        )
                                                                                    }
                                                                                    className="text-[8px] font-black uppercase text-blue-400 hover:text-blue-300"
                                                                                >
                                                                                    Descargar seleccionados ({selectedRestoreNames(grupo.locatario).length})
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        void restoreFromBackup(
                                                                                            grupo.locatario,
                                                                                            selectedRestoreNames(grupo.locatario),
                                                                                            'bulk'
                                                                                        )
                                                                                    }
                                                                                    className="text-[8px] font-black uppercase text-emerald-400 hover:text-emerald-300"
                                                                                >
                                                                                    Restaurar seleccionados ({selectedRestoreNames(grupo.locatario).length})
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        void deleteSelection(
                                                                                            grupo.locatario,
                                                                                            'backup',
                                                                                            selectedRestoreNames(grupo.locatario)
                                                                                        )
                                                                                    }
                                                                                    className="text-[8px] font-black uppercase text-red-400 hover:text-red-300"
                                                                                >
                                                                                    Eliminar seleccionados ({selectedRestoreNames(grupo.locatario).length})
                                                                                </button>
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                ) : null}
                                                                <ul className="space-y-2">
                                                                    {(() => {
                                                                        const backupVisible = filterBySearch(grupo.backup || []);
                                                                        return backupVisible.map((nombre, index) => (
                                                                        <li
                                                                            key={`b-${nombre}`}
                                                                            className="flex items-center justify-between py-2 border-b border-app-border last:border-0 text-[10px]"
                                                                        >
                                                                            <label
                                                                                className="flex items-center gap-2 text-app-text opacity-80 min-w-0 cursor-pointer select-none"
                                                                                title="Clic para marcar; Mayús+clic para seleccionar un rango"
                                                                                onMouseDown={(e) =>
                                                                                    handleRestoreCheckboxMouseDown(
                                                                                        e,
                                                                                        grupo.locatario,
                                                                                        backupVisible,
                                                                                        index,
                                                                                        nombre
                                                                                    )
                                                                                }
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    readOnly
                                                                                    tabIndex={-1}
                                                                                    checked={!!selectedRestoreFiles[restoreKey(grupo.locatario, nombre)]}
                                                                                    className="accent-emerald-500 pointer-events-none"
                                                                                />
                                                                                <FileCode size={14} className="text-sky-500/80 shrink-0" />
                                                                                <span className="truncate">{nombre}</span>
                                                                            </label>
                                                                            <span className="flex items-center gap-1 shrink-0">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => void restoreFromBackup(grupo.locatario, [nombre], 'single')}
                                                                                    className="p-1.5 rounded-lg text-app-muted hover:bg-emerald-500/20 hover:text-emerald-400"
                                                                                    title="Restaurar a pendientes"
                                                                                >
                                                                                    <RefreshCcw size={14} />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        window.open(
                                                                                            downloadFuentesUrl({
                                                                                                origen: 'cierre',
                                                                                                locatario_codigo: grupo.locatario,
                                                                                                filename: nombre,
                                                                                                zona: 'backup',
                                                                                            }),
                                                                                            '_blank'
                                                                                        )
                                                                                    }
                                                                                    className="p-1.5 rounded-lg text-app-muted hover:bg-blue-500/20 hover:text-blue-400"
                                                                                    title="Descargar"
                                                                                >
                                                                                    <Download size={14} />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => deleteFileStoreFile(grupo.locatario, nombre, 'backup')}
                                                                                    className="p-1.5 rounded-lg text-app-muted hover:bg-red-500/20 hover:text-red-500"
                                                                                    title="Eliminar backup"
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            </span>
                                                                        </li>
                                                                        ));
                                                                    })()}
                                                                </ul>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                    );
                                                })}
                                                {porLocatarioModal.length === 0 && !filesModalLoading && (
                                                    <p className="text-app-muted text-sm text-center py-8">No hay archivos en cierre_caja.</p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                                {filesModalTab === 'procesados' && (
                                    <div className="space-y-4">
                                        <AppSelect<string>
                                            options={procesadosFechas.map((f) => ({ value: f, label: f }))}
                                            value={procesadosFechaSel ? { value: procesadosFechaSel, label: procesadosFechaSel } : null}
                                            onChange={(opt) => opt?.value && loadProcesadosFecha(opt.value)}
                                            placeholder="Fecha de carga"
                                            className="min-w-[200px]"
                                            styles={{
                                                menuPortal: (base) => ({ ...base, zIndex: 10060 }),
                                            }}
                                        />
                                        {filesModalLoading ? (
                                            <div className="flex justify-center py-8">
                                                <RefreshCcw className="animate-spin text-teal-500" size={28} />
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {procesadosGrupos.map((g) => (
                                                    <div key={g.locatario} className="bg-app-input rounded-xl border border-app-border p-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleProcesadosLoc(g.locatario)}
                                                            className="flex items-center gap-2 text-[10px] font-black text-teal-500 mb-2"
                                                        >
                                                            <ChevronRight size={14} className={`transition-transform ${expandedProcesadosLocs[g.locatario] ? 'rotate-90' : ''}`} />
                                                            {g.locatario}
                                                        </button>
                                                        {expandedProcesadosLocs[g.locatario] ? (
                                                            <>
                                                                {procesadosFechaSel && selectedCountProcesados(g.locatario) > 0 ? (
                                                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void restoreFromProcesados(
                                                                                    g.locatario,
                                                                                    selectedProcesadosNames(g.locatario),
                                                                                    'bulk'
                                                                                )
                                                                            }
                                                                            className="text-[8px] font-black uppercase text-emerald-400 hover:text-emerald-300"
                                                                        >
                                                                            Volver a cierre seleccionados ({selectedCountProcesados(g.locatario)})
                                                                        </button>
                                                                    </div>
                                                                ) : null}
                                                                <ul className="text-[10px] text-app-muted space-y-1">
                                                                    {(() => {
                                                                        const archivosVisible = filterBySearch(g.archivos);
                                                                        return archivosVisible.map((a, index) => (
                                                                            <li
                                                                                key={a}
                                                                                className="flex items-center justify-between gap-2 py-0.5 border-b border-app-border/50 last:border-0"
                                                                            >
                                                                                <label
                                                                                    className="flex items-center gap-2 text-app-text min-w-0 cursor-pointer select-none"
                                                                                    title="Clic para marcar; Mayús+clic para seleccionar un rango"
                                                                                    onMouseDown={(e) =>
                                                                                        handleProcesadosCheckboxMouseDown(
                                                                                            e,
                                                                                            g.locatario,
                                                                                            archivosVisible,
                                                                                            index,
                                                                                            a
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        readOnly
                                                                                        tabIndex={-1}
                                                                                        checked={!!selectedProcesadosFiles[procesadosKey(g.locatario, a)]}
                                                                                        className="accent-teal-500 pointer-events-none"
                                                                                    />
                                                                                    <span className="truncate">{a}</span>
                                                                                </label>
                                                                                {procesadosFechaSel ? (
                                                                                    <span className="flex items-center gap-1 shrink-0">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                void restoreFromProcesados(g.locatario, [a], 'single')
                                                                                            }
                                                                                            className="p-1 rounded-lg text-app-muted hover:bg-emerald-500/20 hover:text-emerald-400"
                                                                                            title="Volver a cierre_caja (pendientes)"
                                                                                        >
                                                                                            <Undo2 size={14} />
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                window.open(
                                                                                                    downloadFuentesUrl({
                                                                                                        origen: 'procesados',
                                                                                                        locatario_codigo: g.locatario,
                                                                                                        filename: a,
                                                                                                        fecha: procesadosFechaSel,
                                                                                                    }),
                                                                                                    '_blank'
                                                                                                )
                                                                                            }
                                                                                            className="p-1 rounded-lg text-app-muted hover:bg-blue-500/20 hover:text-blue-400"
                                                                                            title="Descargar"
                                                                                        >
                                                                                            <Download size={14} />
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() =>
                                                                                                void openFileStorePreview(
                                                                                                    `${procesadosFechaSel} · ${g.locatario} · ${a}`,
                                                                                                    {
                                                                                                        origen: 'procesados',
                                                                                                        locatario: g.locatario,
                                                                                                        filename: a,
                                                                                                        fecha: procesadosFechaSel,
                                                                                                    }
                                                                                                )
                                                                                            }
                                                                                            className="p-1 rounded-lg text-app-muted hover:bg-teal-500/20 hover:text-teal-400"
                                                                                            title="Vista previa"
                                                                                        >
                                                                                            <Eye size={14} />
                                                                                        </button>
                                                                                    </span>
                                                                                ) : null}
                                                                            </li>
                                                                        ));
                                                                    })()}
                                                                </ul>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                ))}
                                                {procesadosGrupos.length === 0 && (
                                                    <p className="text-app-muted text-sm text-center py-6">Sin archivos para esta fecha.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="border-t border-app-border pt-6">
                                    <h4 className="text-[10px] font-black uppercase text-app-muted mb-1">Cargar en bloque (cierre_caja)</h4>
                                    {/* <p className="text-[9px] text-app-muted mb-3 max-w-xl leading-relaxed">
                                        1) Abre el desplegable <strong className="text-app-text">Locatario</strong> (lista encima del backdrop). 2) Luego
                                        elige archivos. Código válido: constantes del sistema (ej. A03_BARRIO_MANCORA).
                                    </p> */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <AppSelect<string>
                                            options={LOCATARIOS.map((l) => ({ value: l.codigo, label: `${l.name} (${l.codigo})` }))}
                                            value={
                                                bulkLocatario
                                                    ? {
                                                        value: bulkLocatario,
                                                        label: LOCATARIOS.find((l) => l.codigo === bulkLocatario)?.name ?? bulkLocatario,
                                                    }
                                                    : null
                                            }
                                            onChange={(opt) => setBulkLocatario(opt?.value ?? '')}
                                            placeholder="— Locatario —"
                                            className="min-w-[220px]"
                                            isDisabled={bulkUploading}
                                            styles={{
                                                menuPortal: (base) => ({ ...base, zIndex: 10060 }),
                                            }}
                                        />
                                        <label
                                            className={`cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/20 text-teal-500 hover:bg-teal-500/30 text-[10px] font-black uppercase ${bulkUploading || !bulkLocatario ? 'opacity-50' : ''
                                                }`}
                                        >
                                            {bulkUploading ? <RefreshCcw size={14} className="animate-spin" /> : <Upload size={14} />}
                                            {bulkUploading ? 'Subiendo…' : 'Archivos (reemplaza si existe)'}
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept=".xlsx,.csv"
                                                multiple
                                                disabled={bulkUploading || !bulkLocatario}
                                                onChange={handleBulkUpload}
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isPendientesModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10058 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
                        onClick={closePendientesModal}
                    >
                        <motion.div
                            initial={{ scale: 0.96, y: 8 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.96, y: 8 }}
                            className="bg-app-panel border border-app-border w-full max-w-3xl max-h-[92vh] rounded-[28px] flex flex-col overflow-hidden shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 sm:p-5 border-b border-app-border flex items-center justify-between gap-2">
                                <h3 className="text-xs font-black uppercase tracking-widest text-teal-400 flex items-center gap-2">
                                    <BellRing size={18} /> Pendientes por día (FileStore)
                                </h3>
                                <div className="flex items-center gap-1 shrink-0">
                                    {user?.is_superuser ? (
                                        <button
                                            type="button"
                                            onClick={() => setIsEnvioN8nModalOpen(true)}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border border-app-accent-muted text-app-accent hover:bg-app-accent-muted-bg"
                                        >
                                            <Webhook size={16} aria-hidden /> Envío de notificaciones (n8n)
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={closePendientesModal}
                                        className="p-2 hover:bg-app-card-hover rounded-xl text-app-muted hover:text-app-accent"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 min-h-0">
                                {!pendientesResult ? (
                                    <>
                                        <p className="text-[10px] text-app-muted leading-relaxed">
                                            Elija el <strong className="text-app-text">periodo</strong> y pulse <strong className="text-app-text">Consultar</strong>.
                                            Se exige que <strong className="text-app-text">cada día calendario</strong> del rango aparezca como fecha de operación en los
                                            pendientes (columna <strong className="text-app-text">Fecha</strong>; si no hay columna, una fecha por archivo). Solo si están
                                            todos los días se considera <strong className="text-app-text">al día</strong>.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                                            {(
                                                [
                                                    ['ultima_semana', 'Última semana completa (recomendado)'],
                                                    ['semana_actual', 'Semana en curso (lun–dom)'],
                                                    ['ultimos_dias', 'Últimos N días naturales'],
                                                    ['rango_libre', 'Rango libre (desde / hasta)'],
                                                ] as const
                                            ).map(([value, label]) => (
                                                <label key={value} className="flex items-start gap-2 text-[10px] text-app-muted cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="notifModoModal"
                                                        checked={notifModo === value}
                                                        onChange={() => setNotifModo(value)}
                                                        className="accent-teal-500 mt-0.5"
                                                    />
                                                    <span>{label}</span>
                                                </label>
                                            ))}
                                        </div>
                                        {notifModo === 'ultimos_dias' && (
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-sm">
                                                <label className="text-[9px] font-black text-app-muted uppercase whitespace-nowrap">Cantidad de días</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={366}
                                                    value={notifDias}
                                                    onChange={(e) =>
                                                        setNotifDias(Math.max(1, Math.min(366, Number(e.target.value) || 7)))
                                                    }
                                                    className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                                />
                                            </div>
                                        )}
                                        {notifModo === 'rango_libre' && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                                                <div>
                                                    <label className="text-[9px] font-black text-app-muted uppercase">Desde</label>
                                                    <input
                                                        type="date"
                                                        value={notifFechaIni}
                                                        onChange={(e) => setNotifFechaIni(e.target.value)}
                                                        className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] font-black text-app-muted uppercase">Hasta</label>
                                                    <input
                                                        type="date"
                                                        value={notifFechaFin}
                                                        onChange={(e) => setNotifFechaFin(e.target.value)}
                                                        className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        {pendientesErr ? <p className="text-sm text-rose-400">{pendientesErr}</p> : null}
                                        <div className="flex flex-wrap gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => void ejecutarPendientesConsulta()}
                                                disabled={pendientesLoading}
                                                className="px-5 py-2.5 bg-teal-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                                            >
                                                {pendientesLoading ? 'Consultando…' : 'Consultar'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={closePendientesModal}
                                                className="px-5 py-2.5 border border-app-border rounded-xl text-[10px] font-black uppercase text-app-muted hover:bg-app-input"
                                            >
                                                Cerrar
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-1 text-[10px] text-app-muted">
                                            <p>
                                                <strong className="text-app-text">Evaluación:</strong> {pendientesResult.fecha_evaluacion} ·{' '}
                                                <strong className="text-app-text">{pendientesResult.semana}</strong>
                                            </p>
                                            <p>
                                                {pendientesResult.ventana_rodante ? (
                                                    <>
                                                        <strong className="text-app-text">Ventana rodante:</strong> últimos{' '}
                                                        {pendientesResult.umbral_dias ?? notifDias} días ({pendientesResult.periodo_inicio} →{' '}
                                                        {pendientesResult.periodo_fin})
                                                    </>
                                                ) : (
                                                    <>
                                                        <strong className="text-app-text">Periodo cerrado:</strong> {pendientesResult.periodo_inicio} →{' '}
                                                        {pendientesResult.periodo_fin} · {pendientesResult.dias_periodo?.length ?? 0} día(s)
                                                    </>
                                                )}
                                            </p>
                                            <p>
                                                Total {pendientesResult.resumen.total} ·{' '}
                                                <span className="text-amber-600">con alerta {pendientesResult.resumen.con_alerta}</span> ·{' '}
                                                <span className="text-emerald-600">al día {pendientesResult.resumen.al_dia}</span>
                                            </p>
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase text-amber-400 mb-2">
                                                Con alerta ({pendientesResult.locatarios_con_alerta.length}) — verde = con registro, rojo = falta
                                            </h4>
                                            <div className="space-y-4 max-h-[42vh] overflow-y-auto pr-1">
                                                {pendientesResult.locatarios_con_alerta.length === 0 ? (
                                                    <p className="text-[10px] text-app-muted">Ninguno.</p>
                                                ) : (
                                                    pendientesResult.locatarios_con_alerta.map((a) => (
                                                        <div
                                                            key={a.codigo}
                                                            className="pb-4 border-b border-app-border/60 last:border-0 last:pb-0"
                                                        >
                                                            <div className="text-[11px] font-bold text-app-text">
                                                                {a.nombre}{' '}
                                                                <span className="text-app-muted font-medium text-[10px]">{a.codigo}</span>
                                                            </div>
                                                            {(pendientesResult.dias_periodo?.length ?? 0) > 0 ? (
                                                                <PendientesDayChips
                                                                    period={pendientesResult.dias_periodo}
                                                                    registrados={a.dias_con_registro ?? []}
                                                                />
                                                            ) : (
                                                                <p className="text-[10px] text-app-muted mt-1">Sin lista de días en respuesta.</p>
                                                            )}
                                                            {a.sugerencia_notificacion ? (
                                                                <p className="text-[10px] text-app-muted mt-2 pl-2 border-l-2 border-teal-500/50 leading-relaxed">
                                                                    {a.sugerencia_notificacion}
                                                                </p>
                                                            ) : null}
                                                            {(a.emails_notificacion?.length ?? 0) > 0 ? (
                                                                <p className="text-[10px] text-app-muted mt-1">
                                                                    Correos en BD: {a.emails_notificacion!.length}
                                                                </p>
                                                            ) : null}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase text-emerald-400 mb-2">
                                                Al día ({pendientesResult.locatarios_al_dia.length}) — todos los días del periodo tienen registro
                                            </h4>
                                            <div className="space-y-4 max-h-[36vh] overflow-y-auto pr-1">
                                                {pendientesResult.locatarios_al_dia.length === 0 ? (
                                                    <p className="text-[10px] text-app-muted">Ninguno.</p>
                                                ) : (
                                                    pendientesResult.locatarios_al_dia.map((a) => {
                                                        const diasP = pendientesResult.dias_periodo ?? [];
                                                        const reg = a.dias_con_registro ?? [];
                                                        const incompleto =
                                                            diasP.length > 0 && diasP.some((d) => !reg.includes(d));
                                                        return (
                                                            <div
                                                                key={a.codigo}
                                                                className="pb-4 border-b border-app-border/60 last:border-0 last:pb-0"
                                                            >
                                                                <div className="text-[11px] font-bold text-app-text">
                                                                    {a.nombre}{' '}
                                                                    <span className="text-app-muted font-medium text-[10px]">{a.codigo}</span>
                                                                </div>
                                                                {diasP.length > 0 ? (
                                                                    <PendientesDayChips period={diasP} registrados={reg} />
                                                                ) : null}
                                                                <p className="text-[10px] text-app-muted mt-1">
                                                                    Último en periodo: {a.ultimo_upload ?? '—'} · hace {a.dias_sin_subir ?? '—'} día(s){' '}
                                                                    desde última fecha en archivos
                                                                </p>
                                                                {incompleto ? (
                                                                    <p className="text-[10px] text-amber-400 mt-1">
                                                                        Aviso: hay días del periodo sin marcar en datos; no debería listarse como al día —
                                                                        revise API o archivos.
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-app-border">
                                            <button
                                                type="button"
                                                onClick={() => setPendientesResult(null)}
                                                className="px-5 py-2.5 bg-teal-500/20 text-teal-400 rounded-xl text-[10px] font-black uppercase border border-teal-500/30 hover:bg-teal-500/30"
                                            >
                                                Nueva consulta
                                            </button>
                                            <button
                                                type="button"
                                                onClick={closePendientesModal}
                                                className="px-5 py-2.5 border border-app-border rounded-xl text-[10px] font-black uppercase text-app-muted hover:bg-app-input"
                                            >
                                                Cerrar
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isEnvioN8nModalOpen && user?.is_superuser ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10059 flex items-center justify-center px-4 pb-10 bg-black/40 backdrop-blur-xs"
                        onClick={() => setIsEnvioN8nModalOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: -28 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                            className="bg-app-panel border border-app-border w-full max-w-lg max-h-[min(85vh,calc(100vh-4rem))] rounded-[24px] flex flex-col overflow-hidden shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 sm:p-5 border-b border-app-border flex items-center justify-between gap-2 shrink-0">
                                <h3 className="text-xs font-black uppercase tracking-widest text-app-accent flex items-center gap-2">
                                    <Webhook size={18} /> Envío automático (n8n) · America/Lima
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsEnvioN8nModalOpen(false)}
                                    className="p-2 hover:bg-app-card-hover rounded-xl text-app-muted hover:text-app-accent shrink-0"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
                                <p className="text-[10px] text-app-muted leading-relaxed">
                                    A la hora programada (America/Lima) el servidor evalúa pendientes y hace POST al Webhook con el{' '}
                                    <strong className="text-app-text">periodo configurado abajo</strong> (misma lógica que “Pendientes por día”). URL y
                                    secreto se guardan en base de datos.
                                </p>
                                <div>
                                    <p className="text-[9px] font-black text-app-muted uppercase tracking-wide mb-2">Periodo del envío programado</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                                        {(
                                            [
                                                ['ultima_semana', 'Última semana completa (recomendado)'],
                                                ['semana_actual', 'Semana en curso (lun–dom)'],
                                                ['ultimos_dias', 'Últimos N días naturales'],
                                                ['rango_libre', 'Rango libre (desde / hasta)'],
                                            ] as const
                                        ).map(([value, label]) => (
                                            <label key={value} className="flex items-start gap-2 text-[10px] text-app-muted cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="scheduleEnvioModo"
                                                    checked={scheduleModo === value}
                                                    onChange={() => setScheduleModo(value)}
                                                    className="accent-teal-500 mt-0.5"
                                                />
                                                <span>{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {scheduleModo === 'ultimos_dias' && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-sm mt-3">
                                            <label className="text-[9px] font-black text-app-muted uppercase whitespace-nowrap">Cantidad de días</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={366}
                                                value={scheduleDias}
                                                onChange={(e) =>
                                                    setScheduleDias(Math.max(1, Math.min(366, Number(e.target.value) || 7)))
                                                }
                                                className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                            />
                                        </div>
                                    )}
                                    {scheduleModo === 'rango_libre' && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mt-3">
                                            <div>
                                                <label className="text-[9px] font-black text-app-muted uppercase">Desde</label>
                                                <input
                                                    type="date"
                                                    value={scheduleFechaIni}
                                                    onChange={(e) => setScheduleFechaIni(e.target.value)}
                                                    className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[9px] font-black text-app-muted uppercase">Hasta</label>
                                                <input
                                                    type="date"
                                                    value={scheduleFechaFin}
                                                    onChange={(e) => setScheduleFechaFin(e.target.value)}
                                                    className="w-full bg-app-input border border-app-border rounded-xl p-2 text-[10px] text-app-text"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {scheduleModo === 'rango_libre' ? (
                                        <p className="text-[9px] text-app-muted mt-2 leading-relaxed">
                                            El rango es fijo hasta que lo cambie y guarde de nuevo; no se desplaza solo con el calendario.
                                        </p>
                                    ) : null}
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-black text-app-muted uppercase block">
                                        URL Webhook n8n (POST)
                                    </label>
                                    <input
                                        type="url"
                                        value={n8nWebhookUrl}
                                        onChange={(e) => setN8nWebhookUrl(e.target.value)}
                                        placeholder="https://…/webhook/…"
                                        className="w-full bg-app-input border border-app-border rounded-xl px-3 py-2 text-[11px] text-app-text"
                                    />
                                    <label className="text-[9px] font-black text-app-muted uppercase block pt-1">
                                        Secreto compartido (opcional)
                                    </label>
                                    <input
                                        type="password"
                                        value={n8nWebhookSecret}
                                        onChange={(e) => {
                                            setN8nWebhookSecret(e.target.value);
                                            setN8nSecretTouched(true);
                                        }}
                                        placeholder={
                                            n8nSecretConfigured
                                                ? 'Vacío = no cambiar; borrar todo y guardar = quitar secreto'
                                                : 'Bearer para n8n'
                                        }
                                        autoComplete="new-password"
                                        className="w-full bg-app-input border border-app-border rounded-xl px-3 py-2 text-[11px] text-app-text"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-[10px] text-app-text cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={scheduleEnabled}
                                        onChange={(e) => setScheduleEnabled(e.target.checked)}
                                        className="accent-teal-500"
                                    />
                                    Activar envío programado
                                </label>
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="text-[9px] font-black text-app-muted uppercase">Hora</label>
                                    <input
                                        type="time"
                                        value={scheduleHHMM}
                                        onChange={(e) => setScheduleHHMM(e.target.value)}
                                        className="bg-app-input border border-app-border rounded-xl px-3 py-2 text-[11px] text-app-text"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void guardarEnvioConfig()}
                                        disabled={envioSaveBusy}
                                        className="px-4 py-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/40 text-[10px] font-black uppercase disabled:opacity-50"
                                    >
                                        {envioSaveBusy ? 'Guardando…' : 'Guardar configuración'}
                                    </button>
                                </div>
                                <div className="pt-3 border-t border-app-border space-y-2">
                                    <p className="text-[10px] text-app-muted leading-relaxed">
                                        {pendientesResult ? (
                                            <>
                                                Envío manual usará el <strong className="text-app-text">mismo periodo</strong> que la
                                                consulta actual: <strong className="text-app-text">{pendientesResult.semana}</strong> (
                                                {pendientesResult.periodo_inicio} → {pendientesResult.periodo_fin}).
                                            </>
                                        ) : (
                                            <>
                                                Para enviar con un periodo concreto, ejecute antes una{' '}
                                                <strong className="text-app-text">consulta de pendientes</strong> en el otro modal (mismo
                                                modo y fechas que desee usar).
                                            </>
                                        )}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void dispararEnvioN8n()}
                                        disabled={
                                            disparoBusy ||
                                            !pendientesResult ||
                                            (notifModo === 'rango_libre' && (!notifFechaIni.trim() || !notifFechaFin.trim()))
                                        }
                                        className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/40 text-[10px] font-black uppercase disabled:opacity-50"
                                    >
                                        {disparoBusy ? 'Enviando…' : 'Enviar notificaciones ahora (periodo de la consulta)'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {fsPreviewOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10060 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl"
                        onClick={closeFileStorePreview}
                    >
                        <motion.div
                            initial={{ scale: 0.96, y: 8 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.96, y: 8 }}
                            className="bg-app-panel border border-app-border w-full max-w-6xl max-h-[88vh] rounded-[28px] flex flex-col overflow-hidden shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 sm:p-5 border-b border-app-border flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-teal-400 flex items-center gap-2">
                                        <Eye size={18} /> Vista previa (FileStore)
                                    </h3>
                                    <p className="text-[10px] text-app-muted truncate mt-1">{fsPreviewTitle}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeFileStorePreview}
                                    className="p-2 hover:bg-app-card-hover rounded-xl text-app-muted hover:text-app-accent shrink-0"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-3 sm:p-4 min-h-[200px]">
                                {fsPreviewLoading ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-app-muted">
                                        <RefreshCcw className="animate-spin text-teal-500" size={28} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Leyendo archivo…</span>
                                    </div>
                                ) : fsPreviewErr ? (
                                    <p className="text-sm text-rose-400 text-center py-12 px-4">{fsPreviewErr}</p>
                                ) : fsPreviewTable && fsPreviewTable.columns.length ? (
                                    <div className="overflow-x-auto rounded-xl border border-app-border">
                                        <table className="w-full text-left border-collapse text-[10px] min-w-max">
                                            <thead>
                                                <tr className="bg-app-input sticky top-0 z-10">
                                                    {fsPreviewTable.columns.map((col) => (
                                                        <th
                                                            key={col}
                                                            className="p-2 sm:p-3 font-black uppercase tracking-tighter text-app-accent border-b border-app-border whitespace-nowrap max-w-[220px]"
                                                            title={col}
                                                        >
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="text-app-muted">
                                                {fsPreviewTable.rows.map((row, ri) => (
                                                    <tr key={ri} className="border-b border-app-border/60 hover:bg-app-surface/80">
                                                        {fsPreviewTable.columns.map((_, ci) => (
                                                            <td
                                                                key={ci}
                                                                className="p-2 sm:p-3 font-mono align-top max-w-[240px] truncate"
                                                                title={row[ci] ?? ''}
                                                            >
                                                                {row[ci] ?? ''}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-app-muted text-sm text-center py-12">Sin datos para mostrar.</p>
                                )}
                            </div>
                            <div className="p-3 sm:p-4 border-t border-app-border flex flex-wrap items-center justify-between gap-2 bg-app-input/50">
                                <div className="text-[9px] text-app-muted space-y-1">
                                    {fsPreviewTable ? (
                                        <>
                                            <p>
                                                {fsPreviewTable.filename} · {fsPreviewTable.rows.length}
                                                {fsPreviewTable.total_rows != null ? ` / ${fsPreviewTable.total_rows}` : ''} fila(s)
                                            </p>
                                            {fsPreviewTable.monto_total != null ? (
                                                <p>
                                                    Total {fsPreviewTable.monto_column ?? 'Monto'}:{' '}
                                                    <span className="text-app-text font-mono">S/ {formatMontoTotal(fsPreviewTable.monto_total)}</span>
                                                </p>
                                            ) : null}
                                        </>
                                    ) : (
                                        <p>CSV / XLSX · paginado · archivos hasta 25 MB</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    {fsPreviewTable?.has_more ? (
                                        <button
                                            type="button"
                                            onClick={() => void loadMoreFileStorePreview()}
                                            disabled={fsPreviewLoadingMore}
                                            className="px-4 py-2 bg-app-surface border border-app-border text-app-text rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-teal-500/50 disabled:opacity-40 flex items-center gap-2"
                                        >
                                            {fsPreviewLoadingMore ? (
                                                <>
                                                    <RefreshCcw className="animate-spin" size={14} /> Cargando…
                                                </>
                                            ) : (
                                                'Cargar más'
                                            )}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={closeFileStorePreview}
                                        className="px-5 py-2 bg-teal-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isPreviewOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10000 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            className="bg-app-panel border border-app-border w-full max-w-7xl h-[90vh] sm:h-[80vh] rounded-[30px] sm:rounded-[40px] flex flex-col overflow-hidden shadow-2xl"
                        >
                            <div className="p-8 border-b border-app-border flex items-center justify-between bg-app-input">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-teal-500 rounded-2xl text-black">
                                        <Table size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black uppercase tracking-widest">
                                            Vista previa: {previewType === 'sales' ? 'sales_df' : 'Realizadas'}
                                        </h3>
                                        <p className="text-[10px] text-app-muted truncate max-w-md" title={previewData?.config_source}>
                                            {previewData?.staging_source
                                                ? `Fuente: ${
                                                      previewData.staging_source === 'postgresql'
                                                          ? previewType === 'sales'
                                                              ? 'PostgreSQL (stg_sales)'
                                                              : 'PostgreSQL (stg_realizadas)'
                                                          : 'Excel'
                                                  }`
                                                : previewData?.config_source
                                                  ? previewData.config_source.replace(/\\/g, '/').split('/').slice(-3).join('/')
                                                  : 'ConfiguracionWeb.xlsx'}
                                            {previewData?.staging_mode ? ` · modo ${previewData.staging_mode}` : ''}
                                            {previewType === 'realizadas' &&
                                            (previewData?.pendientes_bq ?? 0) > 0
                                                ? ` · ${previewData.pendientes_bq} pend. BQ`
                                                : ''}
                                            {previewType === 'sales' && previewData?.total_rows != null
                                                ? ` · ${previewData?.data?.length ?? 0} / ${previewData.total_rows}`
                                                : previewData?.total_rows != null
                                                  ? ` · ${previewData.total_rows} fila(s)`
                                                  : ''}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closePreview}
                                    className="p-3 hover:bg-app-card-hover rounded-2xl transition-colors text-app-muted hover:text-app-accent"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-x-auto p-4 sm:p-8 scrollbar-hide">
                                {previewLoading ? (
                                    <div className="h-full flex flex-col items-center justify-center gap-4 opacity-50">
                                        <RefreshCcw className="animate-spin text-teal-500" size={32} />
                                        <span className="text-[10px] uppercase font-black tracking-widest">Cargando...</span>
                                    </div>
                                ) : (
                                    <table className="w-full text-left border-collapse min-w-[1200px]">
                                        <thead className="sticky top-0 bg-app-input backdrop-blur-md">
                                            <tr>
                                                {(previewData?.columns ?? []).map((col: string) => (
                                                    <th
                                                        key={col}
                                                        className="p-4 text-[9px] font-black uppercase tracking-tighter text-app-accent border-b border-app-border"
                                                    >
                                                        {col}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="text-[10px]">
                                            {(previewData?.data ?? []).map((row: any, i: number) => (
                                                <tr key={i} className="border-b border-app-border hover:bg-app-surface transition-colors">
                                                    {(previewData?.columns ?? []).map((col: string) => (
                                                        <td key={`${i}-${col}`} className="p-4 text-app-muted font-mono italic">
                                                            {String(row[col])}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            <div className="p-4 sm:p-6 border-t border-app-border bg-app-input flex flex-col sm:flex-row gap-4 justify-between items-center px-6 sm:px-10 flex-wrap">
                                <div className="text-[10px] text-app-muted font-mono">
                                    Total filas en hoja: <span className="text-app-text">{previewData?.total_rows ?? 0}</span>
                                    {previewType === 'sales' && previewData?.monto_total != null ? (
                                        <span className="block mt-1">
                                            Total {previewData?.monto_column ?? 'Monto'}:{' '}
                                            <span className="text-app-text">S/ {formatMontoTotal(previewData.monto_total)}</span>
                                        </span>
                                    ) : null}
                                    {previewType === 'sales' && !previewLoading && previewData && !previewHasMore && (previewData.total_rows ?? 0) > 0 ? (
                                        <span className="block text-[9px] mt-1 text-app-muted max-w-md">
                                            Sin más bloques hacia atrás. El botón &quot;Cargar más&quot; solo aparece si hay más de {PREVIEW_PAGE_SIZE}{' '}
                                            filas o aún quedan filas anteriores por traer.
                                        </span>
                                    ) : null}
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    {previewType === 'sales' && previewHasMore ? (
                                        <button
                                            type="button"
                                            onClick={() => void loadMorePreviewSales()}
                                            disabled={previewLoadingMore}
                                            className="px-6 py-3 bg-app-surface border border-app-border text-app-text rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-teal-500/50 disabled:opacity-40 flex items-center gap-2"
                                        >
                                            {previewLoadingMore ? (
                                                <>
                                                    <RefreshCcw className="animate-spin" size={14} /> Cargando…
                                                </>
                                            ) : (
                                                <>Cargar más (filas anteriores)</>
                                            )}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={closePreview}
                                        className="px-8 py-3 bg-teal-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ConsolidacionResultModal
                open={isConsolidacionModalOpen}
                data={consolidacionResult}
                onRunConsolidation={() => {
                    setIsConsolidacionModalOpen(false);
                    setConsolidacionResult(null);
                    void runConsolidacion(false);
                }}
                onClose={() => {
                    setIsConsolidacionModalOpen(false);
                    setConsolidacionResult(null);
                }}
            />
        </div>
    );
};

const StepButton = ({ icon, title, desc, onClick, loading, isExtra, fullWidth }: any) => (
    <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`group p-8 rounded-[35px] border text-left transition-all relative overflow-hidden h-full flex flex-col ${fullWidth ? 'w-full' : ''} ${loading ? 'bg-app-accent-muted-bg border-app-accent-muted' : isExtra ? 'bg-blue-500/5 border-blue-500/10 hover:border-blue-500/40' : 'bg-app-card border-app-border hover:border-app-accent-muted'
            }`}
    >
        <div
            className={`p-4 rounded-2xl mb-6 w-fit scale-110 ${loading ? 'bg-teal-500 text-black animate-spin' : isExtra ? 'bg-blue-500/20 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all' : 'bg-app-icon text-app-accent group-hover:bg-teal-500 group-hover:text-black transition-all'
                }`}
        >
            {loading ? <RefreshCcw size={20} /> : icon}
        </div>
        <h4 className="font-black text-[10px] uppercase tracking-widest mb-1 text-app-text">{title}</h4>
        <p className="text-[9px] text-app-muted font-medium leading-tight">{desc}</p>
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight size={14} className={isExtra ? 'text-blue-500' : 'text-app-accent-muted'} />
        </div>
    </button>
);

export default LegacyFlow;
