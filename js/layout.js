// Reine Layout-Logik: aus pdf.js-Rohdaten werden Blöcke im Zwischenformat.

export const MIN_IMAGE_SIZE = 32;
export const MAX_CANVAS_SIDE = 4096;

const nonSpace = s => s.replace(/\s/g, '').length;

export function isTextPage(text) {
  return nonSpace(text) >= 20;
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Median der Schriftgröße, gewichtet nach Anzahl sichtbarer Zeichen.
function weightedMedianSize(pieces) {
  const sorted = pieces.filter(p => nonSpace(p.str) > 0).sort((a, b) => a.size - b.size);
  const total = sorted.reduce((sum, p) => sum + nonSpace(p.str), 0);
  let acc = 0;
  for (const p of sorted) {
    acc += nonSpace(p.str);
    if (acc >= total / 2) return p.size;
  }
  return 0;
}

// Zeilen verbinden; Silbentrennung "Verarbei-" + "tung" wird aufgehoben.
function joinLines(a, b) {
  if (a.endsWith('-') && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}

function lineText(pieces) {
  let text = '';
  let prev = null;
  for (const p of [...pieces].sort((a, b) => a.x - b.x)) {
    if (prev) {
      const gap = p.x - (prev.x + prev.width);
      if (gap > 0.15 * p.size && !prev.str.endsWith(' ') && !p.str.startsWith(' ')) text += ' ';
    }
    text += p.str;
    prev = p;
  }
  return text.replace(/\s+/g, ' ').trim();
}

// Die Reihenfolge der Textstücke im PDF ist fast immer die Lesereihenfolge
// (auch bei Spalten); sie wird daher nicht umsortiert.
export function groupTextItems(items, pageHeight) {
  const pieces = items
    .filter(i => i.str !== '')
    .map(i => ({
      str: i.str,
      size: Math.hypot(i.transform[2], i.transform[3]) || i.height,
      x: i.transform[4],
      baseline: i.transform[5],
      width: i.width,
      eol: i.hasEOL,
    }));

  const lines = [];
  let prevPiece = null;
  for (const p of pieces) {
    const line = lines[lines.length - 1];
    if (line && !prevPiece.eol && Math.abs(p.baseline - line.baseline) < 0.5 * p.size) line.pieces.push(p);
    else lines.push({ baseline: p.baseline, pieces: [p] });
    prevPiece = p;
  }
  for (const line of lines) {
    line.text = lineText(line.pieces);
    line.size = Math.max(...line.pieces.map(p => p.size));
  }
  const visible = lines.filter(l => l.text);

  const medianSize = weightedMedianSize(pieces);
  const gaps = visible.slice(1).map((l, i) => visible[i].baseline - l.baseline).filter(g => g > 0);
  const medianGap = gaps.length >= 2 ? median(gaps) : null;

  const blocks = [];
  let current = null;
  let prevLine = null;
  for (const line of visible) {
    const heading = line.size >= 1.3 * medianSize;
    const gap = prevLine ? prevLine.baseline - line.baseline : 0;
    // Bei wenig Text ist der mittlere Abstand riesig; mehr als 3 Zeilenhöhen trennen immer.
    const limit = Math.min(medianGap !== null ? 1.5 * medianGap : 2 * line.size, 3 * line.size);
    const startNew = !current
      || current.heading !== heading
      || (heading && Math.abs(current.size - line.size) > 0.5)
      || gap > limit
      || gap < 0; // Sprung nach oben = neue Spalte
    const left = Math.min(...line.pieces.map(p => p.x));
    const right = Math.max(...line.pieces.map(p => p.x + p.width));
    const top = pageHeight - (line.baseline + line.size);
    const bottom = pageHeight - line.baseline;
    if (startNew) {
      current = { heading, size: line.size, text: line.text, y: top, top, bottom, left, right };
      blocks.push(current);
    } else {
      current.text = joinLines(current.text, line.text);
      Object.assign(current, {
        top: Math.min(current.top, top), bottom: Math.max(current.bottom, bottom),
        left: Math.min(current.left, left), right: Math.max(current.right, right),
      });
    }
    prevLine = line;
  }
  return xyCut(blocks, 1.5 * medianSize).map(b => ({ type: b.heading ? 'heading' : 'paragraph', text: b.text, y: b.y }));
}

// Erste Stelle, an der eine Lücke von mindestens minGap alle Blöcke in zwei Gruppen trennt.
function findCut(blocks, start, end, minGap) {
  const sorted = [...blocks].sort((a, b) => a[start] - b[start]);
  let reach = sorted[0][end];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][start] - reach >= minGap) return [sorted.slice(0, i), sorted.slice(i)];
    reach = Math.max(reach, sorted[i][end]);
  }
  return null;
}

// Lesereihenfolge per XY-Cut: zuerst an Spaltenlücken trennen (links vor rechts),
// sonst an waagerechten Lücken (oben vor unten); ohne Lücke bleibt die PDF-Reihenfolge.
function xyCut(blocks, columnGap) {
  if (blocks.length <= 1) return blocks;
  const keepOrder = group => group.sort((a, b) => blocks.indexOf(a) - blocks.indexOf(b));
  const cut = findCut(blocks, 'left', 'right', columnGap) ?? findCut(blocks, 'top', 'bottom', 0.01);
  if (!cut) return blocks;
  return cut.flatMap(group => xyCut(keepOrder(group), columnGap));
}

// PDF-Matrizen [a b c d e f]; Ergebnis entspricht m × n.
function multiply(m, n) {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

// cover = Anteil der Seitenfläche, den das Bild bedeckt (1 = ganze Seite, typisch für Scans).
export function imagePlacements(fnArray, argsArray, ops, pageWidth, pageHeight) {
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const seen = new Set();
  const result = [];
  fnArray.forEach((fn, i) => {
    const args = argsArray[i];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === ops.transform) ctm = multiply(args, ctm);
    else if (fn === ops.paintImageXObject) {
      const [name, width, height] = args;
      if (seen.has(name)) return;
      seen.add(name);
      if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) return;
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
      const xs = corners.map(([x, y]) => ctm[0] * x + ctm[2] * y + ctm[4]);
      const ys = corners.map(([x, y]) => ctm[1] * x + ctm[3] * y + ctm[5]);
      const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      result.push({ name, y: pageHeight - Math.max(...ys), width, height, cover: area / (pageWidth * pageHeight) });
    }
  });
  return result;
}

// Textreihenfolge bleibt; jedes Bild kommt vor den ersten Textblock, der tiefer beginnt.
export function mergeByY(textBlocks, imageBlocks) {
  const result = [...textBlocks];
  for (const img of [...imageBlocks].sort((a, b) => a.y - b.y)) {
    const at = result.findIndex(b => b.type !== 'image' && b.y > img.y);
    result.splice(at === -1 ? result.length : at, 0, img);
  }
  return result;
}

// Faktor 3 ≈ 216 dpi: liest kleine Schrift deutlich besser als 2, braucht aber noch moderate Zeit auf dem iPad.
export function renderScale(width, height) {
  return Math.min(3, MAX_CANVAS_SIDE / Math.max(width, height));
}

const CAPTION = /^((?:Abb(?:ildung)?|Bild|Fig(?:ure)?|Tab(?:elle)?)\.?\s*\d+[a-z]?\s*[:.\-–]?\s*)(.*)$/is;

// Erster Satz einer Bildunterschrift ("Abb. 3: Schaltplan."), höchstens 120 Zeichen.
function captionOf(block) {
  if (block?.type !== 'paragraph') return null;
  const m = CAPTION.exec(block.text);
  if (!m) return null;
  const rest = m[2].match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? m[2];
  const alt = (m[1] + rest).trim();
  return alt.length > 120 ? alt.slice(0, 120).replace(/\s+\S*$/, '') : alt;
}

// Setzt image.alt aus der direkt darunter (sonst darüber) stehenden Bildunterschrift.
export function attachCaptions(blocks) {
  blocks.forEach((b, i) => {
    if (b.type !== 'image') return;
    const alt = captionOf(blocks[i + 1]) ?? captionOf(blocks[i - 1]);
    if (alt) b.alt = alt;
  });
  return blocks;
}

export function fitWithin(width, height, max = MAX_CANVAS_SIDE) {
  const s = Math.min(1, max / Math.max(width, height));
  return { width: Math.floor(width * s), height: Math.floor(height * s) };
}
