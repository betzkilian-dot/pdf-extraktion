// Abbildungen auf Fotos und Scans finden – aus den OCR-Zeilen und einem verkleinerten Graustufenraster.
// Koordinaten sind Bildpixel; Boxen haben die Form {x0, y0, x1, y1}.
import { groupTextItems } from './layout.js';

const MIN_TEXT_CONFIDENCE = 60;
const MIN_REAL_RATIO = 0.5;
const PHOTO_MIN_AREA = 0.04; // Anteil der Bildfläche für Abbildungen ohne Text
const PHOTO_MIN_DENSITY = 0.3;
const LINK_RADIUS = 2; // Rasterzellen; überbrückt kleine Lücken in Linienzeichnungen

export function isRealWord(text) {
  return /^[„"'‚(]*\p{L}{3,}(?:-\p{L}+)*[.,;:!?)"“'‘-]*$/u.test(text);
}

function isTextLine(line) {
  const words = line.words.filter(w => w.text.trim());
  if (!words.length) return false;
  const real = words.filter(w => isRealWord(w.text)).length;
  return line.confidence >= MIN_TEXT_CONFIDENCE && real / words.length >= MIN_REAL_RATIO;
}

// Zeilen müssen nach y sortiert sein. Eine Textzeile zwischen zwei Kauderwelsch-Zeilen
// gehört zur Abbildung (z. B. eine sicher erkannte Beschriftung "330k").
export function classifyLines(lines) {
  const raw = lines.map(isTextLine);
  return raw.map((t, i) => t && !(i > 0 && !raw[i - 1] && i < raw.length - 1 && !raw[i + 1]));
}

const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    const wF = gray.length - wB;
    if (!wB || !wF) continue;
    sumB += t * hist[t];
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

// Zusammenhängende Tintenzellen ab den Startzellen (Nachbarschaft mit LINK_RADIUS).
function flood(ink, visited, w, h, starts) {
  const queue = [...starts];
  starts.forEach(i => { visited[i] = 1; });
  let x0 = w, y0 = h, x1 = -1, y1 = -1, count = 0;
  while (queue.length) {
    const i = queue.pop();
    const x = i % w, y = (i - x) / w;
    count++;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    for (let dy = -LINK_RADIUS; dy <= LINK_RADIUS; dy++) {
      for (let dx = -LINK_RADIUS; dx <= LINK_RADIUS; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (ink[j] && !visited[j]) { visited[j] = 1; queue.push(j); }
      }
    }
  }
  return { box: { x0, y0, x1, y1 }, count };
}

// Tinte außerhalb der Textzeilen; Abbildungen wachsen entlang dieser Tinte.
function growWithInk(seeds, textBoxes, grid) {
  const { gray, width: w, height: h, scale } = grid;
  const threshold = otsu(gray);
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) ink[i] = gray[i] <= threshold ? 1 : 0;
  for (const b of textBoxes) {
    for (let y = Math.max(0, Math.floor(b.y0 * scale)); y <= Math.min(h - 1, Math.ceil(b.y1 * scale)); y++) {
      for (let x = Math.max(0, Math.floor(b.x0 * scale)); x <= Math.min(w - 1, Math.ceil(b.x1 * scale)); x++) ink[y * w + x] = 0;
    }
  }
  const toImage = b => ({ x0: b.x0 / scale, y0: b.y0 / scale, x1: (b.x1 + 1) / scale, y1: (b.y1 + 1) / scale });
  const visited = new Uint8Array(w * h);
  const figures = seeds.map(seed => {
    const starts = [];
    for (let y = Math.max(0, Math.floor(seed.y0 * scale)); y <= Math.min(h - 1, Math.floor(seed.y1 * scale)); y++) {
      for (let x = Math.max(0, Math.floor(seed.x0 * scale)); x <= Math.min(w - 1, Math.floor(seed.x1 * scale)); x++) {
        const i = y * w + x;
        if (ink[i] && !visited[i]) starts.push(i);
      }
    }
    return starts.length ? union(seed, toImage(flood(ink, visited, w, h, starts).box)) : seed;
  });
  // Große, dichte Flächen ohne Text (Fotos); was den Rand berührt, ist meist Schatten.
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i] || visited[i]) continue;
    const { box, count } = flood(ink, visited, w, h, [i]);
    const area = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1);
    const touchesEdge = box.x0 === 0 || box.y0 === 0 || box.x1 === w - 1 || box.y1 === h - 1;
    if (!touchesEdge && area >= PHOTO_MIN_AREA * w * h && count / area >= PHOTO_MIN_DENSITY) figures.push(toImage(box));
  }
  return figures;
}

// Abbildung darf keine Textzeile anschneiden: oben bzw. unten bis zur Zeile kürzen.
function clipToText(box, textBoxes) {
  const b = { ...box };
  for (const t of textBoxes) {
    if (!overlaps(b, t)) continue;
    if ((t.y0 + t.y1) / 2 < (b.y0 + b.y1) / 2) b.y0 = Math.max(b.y0, t.y1);
    else b.y1 = Math.min(b.y1, t.y0);
  }
  return b;
}

function mergeOverlapping(boxes) {
  const result = [];
  for (const box of boxes) {
    let merged = box;
    for (let i = result.length - 1; i >= 0; i--) {
      if (overlaps(merged, result[i])) { merged = union(merged, result[i]); result.splice(i, 1); }
    }
    result.push(merged);
  }
  return result;
}

const hasContent = w => /[\p{L}\p{N}]/u.test(w.text);

export function detectFigures(lines, image, grid) {
  const sorted = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const isText = classifyLines(sorted);
  const textBoxes = sorted.filter((_, i) => isText[i]).map(l => l.bbox);

  // Mindestens zwei aufeinanderfolgende Kauderwelsch-Zeilen bilden den Kern einer Abbildung.
  const seeds = [];
  let group = [];
  sorted.forEach((line, i) => {
    if (!isText[i]) group.push(line);
    if (isText[i] || i === sorted.length - 1) {
      if (group.length >= 2) seeds.push(group.map(l => l.bbox).reduce(union));
      group = [];
    }
  });

  const pad = 0.01 * Math.max(image.width, image.height);
  const grown = grid ? growWithInk(seeds, textBoxes, grid) : seeds;
  const figures = mergeOverlapping(grown.map(b => clipToText({
    x0: Math.max(0, b.x0 - pad), y0: Math.max(0, b.y0 - pad),
    x1: Math.min(image.width, b.x1 + pad), y1: Math.min(image.height, b.y1 + pad),
  }, textBoxes))).filter(b => b.x1 > b.x0 && b.y1 > b.y0);

  const inFigure = l => figures.some(f => {
    const cx = (l.bbox.x0 + l.bbox.x1) / 2, cy = (l.bbox.y0 + l.bbox.y1) / 2;
    return cx >= f.x0 && cx <= f.x1 && cy >= f.y0 && cy <= f.y1;
  });
  const textLines = sorted
    .filter((l, i) => isText[i] && !inFigure(l))
    .map(l => {
      const words = l.words.filter(hasContent);
      return { ...l, words, text: words.map(w => w.text).join(' ') };
    })
    .filter(l => l.text);
  return { figures, textLines };
}

// OCR-Zeilen laufen durch dieselbe Absatz- und Überschriftenlogik wie PDF-Text.
// Zeilenhöhen von Fotos schwanken (Flecken, Unterlängen); nur deutlich höhere Zeilen
// (≥ 1,5 × Median) behalten ihre Höhe, alle anderen gelten als normale Schrift.
export function linesToBlocks(lines, imageHeight) {
  const heights = lines.map(l => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
  const normal = heights[Math.floor(heights.length / 2)] ?? 0;
  return groupTextItems(lines.map(l => {
    const height = l.bbox.y1 - l.bbox.y0;
    const size = height >= 1.5 * normal ? height : normal;
    return { str: l.text, transform: [size, 0, 0, size, l.bbox.x0, imageHeight - l.bbox.y1], width: l.bbox.x1 - l.bbox.x0, height: size, hasEOL: true };
  }), imageHeight);
}
