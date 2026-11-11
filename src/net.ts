// Thin WebSocket client for the multiplayer game server. `state` always holds the latest server snapshot.
// The browser first asks the website for a short-lived token (proves who you are) and the game server's address.
import { wsToken } from './profile';

interface Handlers {
  onOpen?: (net: Net) => void;
  onMessage?: (m: any, net: Net) => void;
  onClose?: () => void;
}
export interface Net {
  id: string | null;
  state: any;
  onState: ((s: any) => void) | null;
  onPing: ((rtt: number) => void) | null;
  rtt: number | null; // smoothed round-trip time to the server, in ms
  send: (m: any) => void;
  ping: () => void;
  close: () => void;
}

export function connect({ onOpen, onMessage, onClose }: Handlers): Net {
  let ws: WebSocket | null = null;
  let closed = false;
  const net: Net = {
    id: null,
    state: null,
    onState: null,
    onPing: null,
    rtt: null,
    send: (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
    ping: () => net.send({ t: 'ping', ts: performance.now() }),
    close: () => { closed = true; ws?.close(); },
  };

  wsToken().then(({ token, url }) => {
    if (closed) return;
    ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    ws.onopen = () => onOpen?.(net);
    ws.onclose = () => onClose?.();
    ws.onerror = () => { /* onclose follows */ };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'state') {
        net.state = m.s;
        net.onState?.(m.s);
      } else if (m.t === 'pong') {
        const sample = performance.now() - m.ts;
        net.rtt = net.rtt == null ? sample : net.rtt * 0.6 + sample * 0.4;
        net.onPing?.(net.rtt);
        net.send({ t: 'rtt', ms: Math.round(net.rtt) }); // lets the server share it with the room
      } else {
        if (m.t === 'room') net.id = m.you;
        onMessage?.(m, net);
      }
    };
  }).catch((e) => {
    if (closed) return;
    onMessage?.({ t: 'error', msg: e?.message || 'Could not reach the game server' }, net);
    onClose?.();
  });
  return net;
}
