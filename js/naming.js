export function splitName(fileName) {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1).toLowerCase() };
}

export function sanitizeName(name) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[ .]+$/, '').trim();
  return cleaned || 'datei';
}

// Windows unterscheidet Groß/Klein nicht, daher kleingeschrieben vergleichen.
export function uniqueFolderNames(names) {
  const used = new Set();
  return names.map(name => {
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function pad(n, total) {
  return String(n).padStart(total >= 100 ? 3 : 2, '0');
}

export function imageFileName(page, pageCount, block, imageCount) {
  const p = `seite-${pad(page, pageCount)}`;
  return block.pageImage ? `${p}.${block.ext}` : `${p}_bild-${pad(block.index, imageCount)}.${block.ext}`;
}

// Größte Bildanzahl auf einer Seite – bestimmt die Stellenzahl der Bildnummern.
export function maxImageCount(doc) {
  return Math.max(0, ...doc.pages.map(p => p.blocks.filter(b => b.type === 'image').length));
}

export function zipName(date) {
  const two = n => String(n).padStart(2, '0');
  return `ergebnis_${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}_${two(date.getHours())}${two(date.getMinutes())}.zip`;
}
