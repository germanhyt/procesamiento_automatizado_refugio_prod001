import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { deliveryService } from '@/services/deliveryService';

type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export function useDeliveryWS() {
    const { token } = useAuth();
    const qc = useQueryClient();

    const socketUrl = useMemo(() => (token ? deliveryService.wsUrl(token) : null), [token]);
    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef(0);
    const stateRef = useRef<WsState>('idle');
    const reconnectTimerRef = useRef<number | null>(null);

    useEffect(() => {
        const cleanup = () => {
            if (reconnectTimerRef.current) {
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (wsRef.current) {
                try {
                    wsRef.current.close();
                } catch {
                    // ignore
                }
                wsRef.current = null;
            }
            stateRef.current = 'idle';
        };

        if (!socketUrl) {
            cleanup();
            return;
        }

        const connect = () => {
            if (!socketUrl) return;
            stateRef.current = 'connecting';

            const ws = new WebSocket(socketUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                stateRef.current = 'open';
                retryRef.current = 0;
            };

            ws.onmessage = async () => {
                // Todos los eventos relevantes implican re-sincronizar listas.
                await Promise.all([
                    qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
                    qc.invalidateQueries({ queryKey: ['delivery', 'drivers'] }),
                ]);
            };

            ws.onerror = () => {
                stateRef.current = 'error';
            };

            ws.onclose = () => {
                stateRef.current = 'closed';
                if (retryRef.current >= 3) return;
                const attempt = retryRef.current + 1;
                retryRef.current = attempt;
                const backoffMs = 500 * Math.pow(2, attempt - 1); // 500, 1000, 2000
                reconnectTimerRef.current = window.setTimeout(connect, backoffMs);
            };
        };

        connect();

        return cleanup;
    }, [socketUrl, qc]);

    return {
        state: stateRef.current,
        attempts: retryRef.current,
        close: () => wsRef.current?.close(),
    };
}

