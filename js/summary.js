const countWords = text => text.split(/\s+/).filter(Boolean).length;

export function summarize(doc) {
  let images = 0;
  let words = 0;
  for (const page of doc.pages) {
    for (const b of page.blocks) {
      if (b.type === 'image') images++;
      else words += countWords(b.text);
    }
  }
  return {
    pages: doc.pages.length,
    images,
    words,
    ocrPages: doc.pages.filter(p => p.ocr).length,
    failedPages: doc.pages.filter(p => p.error).length,
    removedLines: doc.removedLines ?? 0,
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function summaryText(s) {
  const parts = [plural(s.pages, 'Seite', 'Seiten'), plural(s.images, 'Bild', 'Bilder'), plural(s.words, 'Wort', 'Wörter')];
  if (s.ocrPages) parts.push(`${plural(s.ocrPages, 'Seite', 'Seiten')} per OCR`);
  if (s.failedPages) parts.push(`${plural(s.failedPages, 'Seite', 'Seiten')} nicht lesbar`);
  if (s.removedLines) parts.push(`${plural(s.removedLines, 'Kopf-/Fußzeile', 'Kopf-/Fußzeilen')} entfernt`);
  return parts.join(' · ');
}

// "Nur Text": Kopie des Dokuments ohne Bilder; das Original bleibt für einen späteren Wechsel erhalten.
export function stripImages(doc) {
  return { ...doc, pages: doc.pages.map(p => ({ ...p, blocks: p.blocks.filter(b => b.type !== 'image') })) };
}
