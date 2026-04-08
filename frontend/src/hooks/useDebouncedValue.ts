import { useEffect, useState } from 'react';

/** Valor que solo se actualiza tras `delayMs` sin cambios (útil para filtros y búsqueda). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(id);
    }, [value, delayMs]);
    return debounced;
}
