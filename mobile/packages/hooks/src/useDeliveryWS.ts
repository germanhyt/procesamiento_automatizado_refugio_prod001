import { useEffect, useMemo, useRef } from 'react';
import { wsUrl } from '@refugio/delivery-api';

export type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export function useDeliveryWS(opts?: { token?: string; onEvent?: (msg: any) => void; maxRetries?: number }) {
  const token = opts?.token;
  const maxRetries = opts?.maxRetries ?? 3;

  const onEventRef = useRef(opts?.onEvent);
  onEventRef.current = opts?.onEvent;

  const url = useMemo(() => wsUrl(token), [token]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const stateRef = useRef<WsState>('idle');
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const cleanup = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
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

    if (!token) {
      cleanup();
      return cleanup;
    }

    const connect = () => {
      stateRef.current = 'connecting';
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        stateRef.current = 'open';
        retryRef.current = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(String(evt.data));
          onEventRef.current?.(data);
        } catch {
          // ignore non-json
        }
      };

      ws.onerror = () => {
        stateRef.current = 'error';
      };

      ws.onclose = () => {
        stateRef.current = 'closed';
        if (retryRef.current >= maxRetries) return;
        const attempt = retryRef.current + 1;
        retryRef.current = attempt;
        const backoffMs = 500 * Math.pow(2, attempt - 1);
        reconnectTimerRef.current = setTimeout(connect, backoffMs) as unknown as number;
      };
    };

    connect();
    return cleanup;
  }, [url, maxRetries]);

  return { state: stateRef.current, attempts: retryRef.current, close: () => wsRef.current?.close() };
}

