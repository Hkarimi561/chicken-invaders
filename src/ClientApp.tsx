'use client';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';

// The game uses canvas, WebAudio and localStorage everywhere, so it is rendered in the browser only.
const App = dynamic(() => import('./App'), { ssr: false });

export default function ClientApp() {
  // Installable + offline: only on secure origins (https or localhost) and only in production builds.
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else if ('serviceWorker' in navigator) {
      // development: a worker left over from a production build would serve stale files
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    }
  }, []);
  return <App />;
}
