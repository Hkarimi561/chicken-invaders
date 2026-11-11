'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { reloadApp, watchForUpdate } from './pwa';

// The game uses canvas, WebAudio and localStorage everywhere, so it is rendered in the browser only.
const App = dynamic(() => import('./App'), { ssr: false });

export default function ClientApp() {
  const [update, setUpdate] = useState(false);

  // Installable + offline: only on secure origins (https or localhost) and only in production builds.
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      return watchForUpdate(() => setUpdate(true));
    } else if ('serviceWorker' in navigator) {
      // development: a worker left over from a production build would serve stale files
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
    return undefined;
  }, []);

  // The "Reload" app shortcut (long-press the home-screen icon) opens /?reload=1: fetch the latest version once.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('reload') === '1') {
      q.delete('reload');
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
      reloadApp(true);
    }
  }, []);

  return (
    <>
      <App />
      {update && (
        <div className="updatebar" role="status">
          <span>A new version is ready.</span>
          <button className="small" onClick={() => reloadApp()}>↻ Reload</button>
          <button className="ghost small" onClick={() => setUpdate(false)} aria-label="Dismiss">✕</button>
        </div>
      )}
    </>
  );
}
