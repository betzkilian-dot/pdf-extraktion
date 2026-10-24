import { splitName } from './naming.js';
import { fitWithin, ocrTextToBlocks } from './layout.js';
import { describeError } from './messages.js';

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

export async function readImage(file, ocr, onProgress) {
  const { base, ext } = splitName(file.name);
  const page = { number: 1, ocr: true, error: null, blocks: [{ type: 'image', index: 1, blob: file, ext, pageImage: true }] };
  onProgress({ page: 1, total: 1, stage: 'ocr' });
  let canvas = null;
  try {
    canvas = await toCanvas(file);
    page.blocks.push(...ocrTextToBlocks(await ocr.recognize(canvas)));
  } catch (err) {
    page.error = describeError(err);
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
  }
  return { name: base, pages: [page], warnings: [] };
}
