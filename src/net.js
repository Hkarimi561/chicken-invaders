// Thin WebSocket client. `state` always holds the latest server snapshot.
export function connect({ onOpen, onMessage, onClose }) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  const net = {
    id: null,
    state: null,
    onState: null,
    onPing: null,
    rtt: null, // smoothed round-trip time to the server, in ms
    send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)),
    ping: () => net.send({ t: 'ping', ts: performance.now() }),
    close: () => ws.close(),
  };
  ws.onopen = () => onOpen?.(net);
  ws.onclose = () => onClose?.();
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
  return net;
}
