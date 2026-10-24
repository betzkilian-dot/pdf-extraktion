// Gemeinsamer OCR-Ablauf für Fotos und Scanseiten: Text erkennen, Abbildungen ausschneiden.
import { detectFigures, linesToBlocks } from './figures.js';
import { mergeByY } from './layout.js';

const GRID_MAX_SIDE = 500;

function toGrayGrid(canvas) {
  const scale = Math.min(1, GRID_MAX_SIDE / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const small = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  small.width = small.height = 0;
  return { gray, width, height, scale: width / canvas.width };
}

async function crop(canvas, box) {
  const x = Math.floor(box.x0), y = Math.floor(box.y0);
  const width = Math.ceil(box.x1) - x, height = Math.ceil(box.y1) - y;
  const out = Object.assign(document.createElement('canvas'), { width, height });
  try {
    out.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, width, height);
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG konnte nicht erzeugt werden');
    return blob;
  } finally {
    out.width = out.height = 0;
  }
}

// Blöcke mit y in Canvas-Pixeln; Bild-index wird vom Aufrufer vergeben.
export async function ocrCanvas(canvas, ocr, signal) {
  const { lines } = await ocr.recognize(canvas, signal);
  const { figures, textLines } = detectFigures(lines, { width: canvas.width, height: canvas.height }, toGrayGrid(canvas));
  const images = [];
  for (const f of figures) images.push({ type: 'image', index: 0, blob: await crop(canvas, f), ext: 'png', y: f.y0 });
  return mergeByY(linesToBlocks(textLines, canvas.height), images);
}

export function numberImages(blocks) {
  let index = 0;
  for (const b of blocks) if (b.type === 'image') b.index = ++index;
  return blocks;
}
