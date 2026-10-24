export const OCR_UNAVAILABLE = 'Texterkennung nicht verfügbar – bitte Internetverbindung prüfen';

const LARGE_BYTES = 100 * 1024 * 1024;
const LARGE_PAGES = 100;

export function describeError(err) {
  if (err?.name === 'PasswordException') return 'PDF ist passwortgeschützt';
  if (err?.name === 'InvalidPDFException') return 'Datei ist beschädigt oder kein gültiges PDF';
  if (err?.code === 'OCR_UNAVAILABLE') return OCR_UNAVAILABLE;
  return `Unbekannter Fehler: ${err?.message ?? err}`;
}

export function sizeWarning(bytes, pages) {
  if (bytes > LARGE_BYTES || (pages ?? 0) > LARGE_PAGES) {
    return 'Große Datei – auf dem iPad kann die Verarbeitung lange dauern oder abbrechen.';
  }
  return null;
}
