// PWA helpers: an installed fullscreen app has no browser reload button, so the game offers its own.

/** True when the game runs as an installed app (home-screen icon) rather than in a browser tab. */
export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || (navigator as any).standalone === true);

/**
 * Reload the app. With `hard`, the service worker is asked for a newer version and the offline caches are emptied first,
 * so the reload always fetches fresh files (sign-in, profile and settings live elsewhere and are kept).
 */
export async function reloadApp(hard = false) {
  try {
    if (hard) {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
      for (const r of regs) r.waiting?.postMessage({ type: 'SKIP_WAITING' });
      if (window.caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    }
  } catch { /* offline or unsupported: a plain reload still works */ }
  location.reload();
}

/** Calls `onUpdate` when a newer version of the app has taken over (so the player can reload into it). */
export function watchForUpdate(onUpdate: () => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  let hadController = !!navigator.serviceWorker.controller; // the first install is not an "update"
  const onChange = () => { if (hadController) onUpdate(); hadController = true; };
  navigator.serviceWorker.addEventListener('controllerchange', onChange);
  // check for a new version whenever the app comes back to the front, and every 30 minutes
  const check = () => navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
  const vis = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', vis);
  const timer = setInterval(check, 30 * 60 * 1000);
  return () => { navigator.serviceWorker.removeEventListener('controllerchange', onChange); document.removeEventListener('visibilitychange', vis); clearInterval(timer); };
}
