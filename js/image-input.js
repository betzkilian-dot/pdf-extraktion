import { splitName } from './naming.js';
import { fitWithin, attachCaptions } from './layout.js';
import { describeError } from './messages.js';
import { ocrCanvas, numberImages } from './ocr-page.js';

// createImageBitmap wendet die EXIF-Ausrichtung an – wichtig für Handyfotos.
async function toCanvas(file) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

// Ergebnis: erkannter Text plus ausgeschnittene Abbildungen. Nur wenn die Texterkennung
// scheitert, wird das Originalfoto als Ganzes übernommen, damit nichts verloren geht.
export async function readImage(file, ocr, onProgress, signal) {
  const { base, ext } = splitName(file.name);
  const page = { number: 1, ocr: true, error: null, blocks: [] };
  onProgress({ page: 1, total: 1, stage: 'ocr' });
  signal?.throwIfAborted();
  let canvas = null;
  try {
    canvas = await toCanvas(file);
    page.blocks = numberImages(attachCaptions(await ocrCanvas(canvas, ocr, signal)));
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    page.error = describeError(err);
    page.blocks = [{ type: 'image', index: 1, blob: file, ext, pageImage: true }];
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
  }
  return { name: base, source: file.name, pages: [page], warnings: [] };
}
