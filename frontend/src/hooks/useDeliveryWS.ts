import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { deliveryService } from '@/services/deliveryService';

type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export const DELIVERY_POLLING_MS = 5000;

export function useDeliveryWS() {
    const { token } = useAuth();
    const qc = useQueryClient();

    const socketUrl = useMemo(() => (token ? deliveryService.wsUrl(token) : null), [token]);
    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef(0);
    const reconnectTimerRef = useRef<number | null>(null);
    const [state, setState] = useState<WsState>('idle');
    const [attempts, setAttempts] = useState(0);

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
            retryRef.current = 0;
            setAttempts(0);
            setState('idle');
        };

        if (!socketUrl) {
            cleanup();  
            return;
        }

        const connect = () => {
            if (!socketUrl) return;
            setState('connecting');

            const ws = new WebSocket(socketUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                retryRef.current = 0;
                setAttempts(0);
                setState('open');
            };

            ws.onmessage = async () => {
                await Promise.all([
                    qc.invalidateQueries({ queryKey: ['delivery', 'orders'] }),
                    qc.invalidateQueries({ queryKey: ['delivery', 'drivers'] }),
                    qc.invalidateQueries({ queryKey: ['delivery', 'control', 'snapshot'] }),
                    qc.invalidateQueries({ queryKey: ['delivery', 'control', 'audit'] }),
                ]);
            };

            ws.onerror = () => {
                setState('error');
            };

            ws.onclose = () => {
                setState('closed');
                if (retryRef.current >= 3) return;
                const attempt = retryRef.current + 1;
                retryRef.current = attempt;
                setAttempts(attempt);
                const backoffMs = 500 * Math.pow(2, attempt - 1);
                reconnectTimerRef.current = window.setTimeout(connect, backoffMs);
            };
        };

        connect();

        return cleanup;
    }, [socketUrl, qc]);

    return {
        state,
        attempts,
        isOpen: state === 'open',
        pollingInterval: state === 'open' ? false : DELIVERY_POLLING_MS,
        close: () => wsRef.current?.close(),
    };
}
