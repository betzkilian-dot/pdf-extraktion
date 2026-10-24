// Fortschritt einer Datei (0..1) aus den Meldungen der Leser; eine Seite zählt nach der
// Textphase als begonnen, nach der Erkennung (OCR) als halb fertig.
export function fileFraction({ page, total, stage }) {
  if (!total) return 0;
  return Math.min(1, Math.max(0, (page - 1 + (stage === 'ocr' ? 0.5 : 0)) / total));
}

// Gesamtfortschritt über die Dateien eines Durchgangs: fertige und fehlgeschlagene zählen voll.
export function overallProgress(items) {
  if (!items.length) return 0;
  const sum = items.reduce((s, i) => s + (i.state === 'busy' ? (i.progress ?? 0) : i.state === 'wait' ? 0 : 1), 0);
  return sum / items.length;
}
