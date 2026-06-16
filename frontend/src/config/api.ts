/** Host del backend en dev local (evita localhost → IPv6 y conflictos en :8080). */
function localApiHost(): string {
    return window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
}

export const API_URL =
    import.meta.env.VITE_API_URL || `http://${localApiHost()}:8080/api`;

export const WS_URL =
    import.meta.env.VITE_WS_URL || `ws://${localApiHost()}:8080`;
