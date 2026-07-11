import { useEffect, useRef, useState } from 'react';

/**
 * WebSocket connection to the arena hub with exponential-backoff reconnection.
 * Registers as a telão view ('arena', 'voting', ...) and dispatches every
 * parsed server message to onMessage. On register the server pushes a
 * `state_snapshot`, then keeps the client updated with `round_state`,
 * `participant_registered`, etc. — HTTP polling stays only as a slow
 * consistency fallback.
 */
export function useTelaoSocket(view: string, onMessage: (msg: any) => void): boolean {
  const [connected, setConnected] = useState(false);

  // Keep the latest callback without re-running the connection effect
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let mounted = true;
    let ws: WebSocket | null = null;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const MAX_ATTEMPTS = 30;

    const scheduleReconnect = () => {
      if (!mounted || attempts >= MAX_ATTEMPTS) return;
      attempts++;
      // Exponential backoff with jitter so dozens of phones don't reconnect in sync
      const delay = Math.min(1000 * Math.pow(2, attempts - 1), 15000) * (0.5 + Math.random());
      timer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (!mounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      try {
        ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.addEventListener('open', () => {
        if (!mounted) return;
        attempts = 0;
        setConnected(true);
        ws?.send(JSON.stringify({ type: 'telao_register', view }));
      });

      ws.addEventListener('message', (ev) => {
        if (!mounted) return;
        try {
          onMessageRef.current(JSON.parse(ev.data));
        } catch {
          // Ignore malformed frames
        }
      });

      ws.addEventListener('close', () => {
        if (!mounted) return;
        setConnected(false);
        scheduleReconnect();
      });
    };

    connect();

    return () => {
      mounted = false;
      if (timer !== null) clearTimeout(timer);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [view]);

  return connected;
}
