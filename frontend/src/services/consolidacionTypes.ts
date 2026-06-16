/** Respuesta de POST /procesamiento/legacy/consolidar */

export type ConsolidacionEstadoLoc = 'ok' | 'omitido' | 'parcial' | 'sin_carpeta';

export interface ConsolidacionArchivoDetalle {
    nombre: string;
    estado: 'ok' | 'omitido';
    motivo: string;
    filas?: number;
    layout_fallback?: boolean;
    montos_anomalos?: number;
    fecha_min?: string;
    fecha_max?: string;
}

export interface ConsolidacionLocatarioDetalle {
    locatario: string;
    nombre?: string;
    codigo_bc?: string;
    estado: ConsolidacionEstadoLoc;
    skip?: string;
    motivo?: string;
    archivos: number;
    archivos_ok?: number;
    registros: number;
    archivos_detalle?: ConsolidacionArchivoDetalle[];
    consolidados_previos?: string[];
    duplicados_eliminados?: number;
    claves_dedup?: string[];
    archivo?: string | null;
    escrito?: boolean;
    rango_inicio?: string;
    rango_fin?: string;
    fechas_detectadas_min?: string | null;
    fechas_detectadas_max?: string | null;
    fechas_detectadas_muestra?: string[];
    fechas_en_consolidado_min?: string | null;
    fechas_en_consolidado_max?: string | null;
}

export interface ConsolidacionResponse {
    success: boolean;
    dry_run?: boolean;
    error?: string;
    etiqueta?: string;
    rango_inicio?: string;
    rango_fin?: string;
    registros_total?: number;
    message?: string | null;
    resumen?: {
        ok: number;
        omitidos: number;
        parciales: number;
        sin_carpeta: number;
    };
    locatarios?: ConsolidacionLocatarioDetalle[];
}

/** Texto operativo para motivos técnicos de archivos */
export const ARCHIVO_MOTIVO_LEGIBLE: Record<string, string> = {
    ok: 'Procesado correctamente',
    archivo_no_encontrado: 'No está en disco',
    hoja_vacia: 'Archivo vacío',
    coordenadas_sin_datos: 'BaseCarga no extrajo datos (revisar coordenadas)',
    sin_monto_ni_fecha_validos: 'Sin filas con Monto > 0 y Fecha',
    layout_fallback_ok: 'Leído por detección de encabezado (layout distinto)',
    layout_fallback_vacio: 'No se detectó tabla de ventas',
    layout_sin_columnas_fecha_monto: 'Encabezado sin columnas Fecha/Monto',
    layout_sin_ventas_validas: 'Tabla detectada pero sin ventas válidas',
};

export function legibleMotivoArchivo(motivo: string): string {
    if (!motivo) return '—';
    if (ARCHIVO_MOTIVO_LEGIBLE[motivo]) return ARCHIVO_MOTIVO_LEGIBLE[motivo];
    if (motivo.startsWith('error_lectura:')) return `Error al leer: ${motivo.slice('error_lectura:'.length)}`;
    return motivo.replace(/_/g, ' ');
}
