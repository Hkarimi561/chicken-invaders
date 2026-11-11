// Thin WebSocket client. `state` always holds the latest server snapshot.
export function connect({ onOpen, onMessage, onClose }) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  const net = {
    id: null,
    state: null,
    onState: null,
    send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)),
    close: () => ws.close(),
  };
  ws.onopen = () => onOpen?.(net);
  ws.onclose = () => onClose?.();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'state') {
      net.state = m.s;
      net.onState?.(m.s);
    } else {
      if (m.t === 'room') net.id = m.you;
      onMessage?.(m, net);
    }
  };
  return net;
}
