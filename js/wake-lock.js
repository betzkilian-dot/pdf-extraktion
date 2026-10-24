// Hält den Bildschirm während einer Verarbeitung an (sonst pausiert Safari auf dem iPad die Seite).
// Nicht unterstützt oder abgelehnt? Dann passiert einfach nichts.
export function createWakeLock() {
  let lock = null;
  let wanted = false;

  async function acquire() {
    try {
      lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      lock = null;
    }
  }

  // Der Browser gibt die Sperre frei, wenn die Seite verdeckt wird; beim Zurückkehren erneut anfordern.
  const onVisible = () => { if (wanted && document.visibilityState === 'visible') acquire(); };

  return {
    async start() {
      wanted = true;
      document.addEventListener('visibilitychange', onVisible);
      await acquire();
    },
    async stop() {
      wanted = false;
      document.removeEventListener('visibilitychange', onVisible);
      try { await lock?.release(); } catch { /* bereits freigegeben */ }
      lock = null;
    },
  };
}
