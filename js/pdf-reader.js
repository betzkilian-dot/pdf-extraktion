import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
import { isTextPage, groupTextItems, imagePlacements, mergeByY, ocrTextToBlocks, renderScale, fitWithin } from './layout.js';
import { toRGBA } from './pixels.js';
import { splitName } from './naming.js';
import { describeError, sizeWarning } from './messages.js';

pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const OPS = {
  save: pdfjs.OPS.save,
  restore: pdfjs.OPS.restore,
  transform: pdfjs.OPS.transform,
  paintImageXObject: pdfjs.OPS.paintImageXObject,
};

function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function release(canvas) {
  canvas.width = canvas.height = 0;
}

// Bildobjekte liegen nach getOperatorList bereit; die Frist schützt vor Hängern.
function getImageObject(page, name) {
  const store = name.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Bild ${name} nicht verfügbar`)), 10000);
    store.get(name, obj => { clearTimeout(timer); resolve(obj); });
  });
}

// Große Bilder werden auf das Canvas-Limit verkleinert (Safari auf dem iPad).
async function imageToPng(obj) {
  const { width, height } = fitWithin(obj.width, obj.height);
  const canvas = newCanvas(width, height);
  const source = obj.bitmap ?? await createImageBitmap(new ImageData(toRGBA(obj), obj.width, obj.height));
  try {
    canvas.getContext('2d').drawImage(source, 0, 0, width, height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('PNG konnte nicht erzeugt werden');
    return blob;
  } finally {
    release(canvas);
    if (source !== obj.bitmap) source.close();
  }
}

async function recognizePage(page, ocr) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: renderScale(base.width, base.height) });
  const canvas = newCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  try {
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return ocrTextToBlocks(await ocr.recognize(canvas));
  } finally {
    release(canvas);
  }
}

async function readPage(page, number, total, ocr, onProgress, counters) {
  const result = { number, ocr: false, error: null, blocks: [] };
  onProgress({ page: number, total, stage: 'text' });
  const viewport = page.getViewport({ scale: 1 });
  const items = (await page.getTextContent()).items.filter(i => 'str' in i);
  const ops = await page.getOperatorList();

  const images = [];
  for (const p of imagePlacements(ops.fnArray, ops.argsArray, OPS, viewport.height)) {
    try {
      images.push({ type: 'image', index: 0, blob: await imageToPng(await getImageObject(page, p.name)), ext: 'png', y: p.y });
    } catch {
      counters.skipped++;
    }
  }

  if (isTextPage(items.map(i => i.str).join(''))) {
    result.blocks = mergeByY(groupTextItems(items, viewport.height), images);
  } else {
    // Scan: Bilder (meist das Seitenbild) vorn, wie bei Fotos als Eingabe.
    result.ocr = true;
    result.blocks = images;
    onProgress({ page: number, total, stage: 'ocr' });
    try {
      result.blocks = [...images, ...await recognizePage(page, ocr)];
    } catch (err) {
      result.error = describeError(err);
    }
  }
  let index = 0;
  for (const b of result.blocks) if (b.type === 'image') b.index = ++index;
  return result;
}

export async function readPdf(file, ocr, onProgress) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const doc = { name: splitName(file.name).base, pages: [], warnings: [] };
    const counters = { skipped: 0 };
    for (let n = 1; n <= pdf.numPages; n++) {
      let page = null;
      try {
        page = await pdf.getPage(n);
        doc.pages.push(await readPage(page, n, pdf.numPages, ocr, onProgress, counters));
      } catch (err) {
        doc.pages.push({ number: n, ocr: false, error: describeError(err), blocks: [] });
      } finally {
        page?.cleanup();
      }
    }
    if (counters.skipped) doc.warnings.push(counters.skipped === 1 ? '1 Bild übersprungen' : `${counters.skipped} Bilder übersprungen`);
    const big = sizeWarning(file.size, pdf.numPages);
    if (big) doc.warnings.push(big);
    return doc;
  } finally {
    await pdf.destroy();
  }
}
