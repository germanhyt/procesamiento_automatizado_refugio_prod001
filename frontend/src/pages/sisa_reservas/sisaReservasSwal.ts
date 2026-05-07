import Swal from 'sweetalert2';

/** Estilo alineado al tema oscuro del módulo Sisa (misma base que otras alertas del proyecto). */
export const SISA_SWAL_BASE = {
    background: 'var(--app-panel)',
    color: 'var(--app-text)',
} as const;

export function sisaAxiosDetail(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
        const data = (err as { response?: { data?: { detail?: unknown } } }).response?.data;
        const d = data?.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) {
            return d
                .map((x) =>
                    typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x)
                )
                .join('; ');
        }
    }
    return 'No se pudo completar la operación.';
}

export type SisaSwalSuccessExtras = {
    /** Segundo botón: navega al `href` del sitio público de Sisa (u otra URL). */
    secondaryLink?: { label: string; href: string; newTab?: boolean };
};

export async function sisaSwalSuccess(
    title: string,
    text?: string,
    extras?: SisaSwalSuccessExtras
): Promise<void> {
    const link = extras?.secondaryLink;
    const result = await Swal.fire({
        icon: 'success',
        title,
        text,
        confirmButtonText: link ? 'Cerrar' : undefined,
        confirmButtonColor: 'var(--app-sisa-reservas-accent-strong)',
        ...(link
            ? {
                  showCancelButton: true,
                  cancelButtonText: link.label,
                  cancelButtonColor: '#64748b',
              }
            : {}),
        ...SISA_SWAL_BASE,
    });
    if (link && result.dismiss === Swal.DismissReason.cancel) {
        const { href } = link;
        if (link.newTab === false) {
            window.location.assign(href);
        } else {
            window.open(href, '_blank', 'noopener,noreferrer');
        }
    }
}

/** Aviso breve (p. ej. guardado de posición en el plano sin bloquear). */
export async function sisaSwalToastOk(title: string): Promise<void> {
    await Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title,
        showConfirmButton: false,
        timer: 2600,
        timerProgressBar: true,
        ...SISA_SWAL_BASE,
    });
}

export async function sisaSwalError(message: string): Promise<void> {
    await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message,
        confirmButtonColor: 'var(--app-danger)',
        ...SISA_SWAL_BASE,
    });
}

export async function sisaSwalInfo(title: string, text?: string): Promise<void> {
    await Swal.fire({
        icon: 'info',
        title,
        text,
        confirmButtonColor: 'var(--app-sisa-reservas-accent-strong)',
        ...SISA_SWAL_BASE,
    });
}
