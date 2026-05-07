import { useQuery } from '@tanstack/react-query';

export type DialCodeOption = {
    /** ISO 3166-1 alpha-2 */
    cca2: string;
    name: string;
    dial: string;
    /** Bandera (PNG/SVG) desde REST Countries; opcional si el país no trae `flags`. */
    flagUrl?: string;
};

function buildDial(idd: { root?: string; suffixes?: string[] } | undefined): string | null {
    if (!idd?.root) return null;
    const root = idd.root;
    const suf = idd.suffixes;
    if (!suf || suf.length === 0) return root;
    const first = suf[0];
    if (first === undefined || first === '') return root;
    return `${root}${first}`;
}

/**
 * Catálogo mundial de prefijos (REST Countries). CORS permitido en el navegador.
 */
export function useCountryDialCodes() {
    return useQuery({
        queryKey: ['country-dial-codes', 'v2-flags'],
        queryFn: async (): Promise<DialCodeOption[]> => {
            const res = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,idd,flags');
            if (!res.ok) throw new Error('No se pudieron cargar códigos telefónicos');
            const raw = (await res.json()) as Array<{
                name?: { common?: string };
                cca2?: string;
                idd?: { root?: string; suffixes?: string[] };
                flags?: { png?: string; svg?: string };
            }>;
            const map = new Map<string, DialCodeOption>();
            for (const row of raw) {
                const cca2 = row.cca2;
                if (!cca2) continue;
                const dial = buildDial(row.idd);
                if (!dial) continue;
                const name = row.name?.common ?? cca2;
                const flagUrl = row.flags?.png ?? row.flags?.svg;
                const key = `${dial}|${cca2}`;
                if (!map.has(key)) {
                    map.set(key, { cca2, name, dial, ...(flagUrl ? { flagUrl } : {}) });
                }
            }
            return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
        },
        staleTime: 1000 * 60 * 60 * 24,
        gcTime: 1000 * 60 * 60 * 48,
    });
}

/** Longitudes nacionales orientativas (sin contar prefijo). Por defecto ITU ~15. */
export function nationalPhoneHint(cca2: string): { min: number; max: number; hint: string } {
    const t = cca2.toUpperCase();
    if (t === 'PE') return { min: 9, max: 9, hint: '9 dígitos (ej. móvil)' };
    if (t === 'US' || t === 'CA') return { min: 10, max: 10, hint: '10 dígitos' };
    if (t === 'MX') return { min: 10, max: 10, hint: '10 dígitos' };
    if (t === 'ES') return { min: 9, max: 9, hint: '9 dígitos' };
    if (t === 'CL' || t === 'AR' || t === 'CO') return { min: 8, max: 11, hint: '8–11 dígitos' };
    return { min: 6, max: 15, hint: '6–15 dígitos' };
}

export function onlyDigits(s: string): string {
    return (s || '').replace(/\D/g, '');
}
