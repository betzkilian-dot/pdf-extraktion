import Tesseract from 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
import { OCR_UNAVAILABLE } from './messages.js';

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

// recognize liefert {text, lines}; jede Zeile mit text, confidence, bbox {x0,y0,x1,y1} und words.
// Ein Worker für alle Seiten eines Durchgangs; er startet erst, wenn er gebraucht wird.
// Scheitert der Start, schlagen alle weiteren Aufrufe sofort fehl (kein Neustart pro Seite).
// langPath überschreibt die Herkunft der Sprachdaten (Standard: CDN von Tesseract.js).
export function createOcr({ onLoading = () => {}, langPath, startTimeout = 180000, recognizeTimeout = 120000 } = {}) {
  let workerPromise = null;
  let worker = null;

  async function start() {
    onLoading(true);
    try {
      // Tesseract.js 5 meldet Ladefehler (z. B. Sprachdaten offline) nur über errorHandler;
      // das Promise von createWorker bliebe sonst für immer offen.
      const created = new Promise((resolve, reject) => {
        const options = { errorHandler: reject, ...(langPath ? { langPath, cacheMethod: 'none' } : {}) };
        Tesseract.createWorker(['deu', 'eng'], 1, options).then(resolve, reject);
      });
      worker = await withTimeout(created, startTimeout, 'Start der Texterkennung hat zu lange gedauert');
      return worker;
    } catch (err) {
      throw Object.assign(new Error(OCR_UNAVAILABLE), { code: 'OCR_UNAVAILABLE', cause: err });
    } finally {
      onLoading(false);
    }
  }

  async function terminate() {
    const w = worker;
    workerPromise = null;
    worker = null;
    await w?.terminate();
  }

  return {
    async recognize(source) {
      workerPromise ??= start();
      const w = await workerPromise;
      try {
        const { data } = await withTimeout(w.recognize(source, {}, { blocks: true, text: true }), recognizeTimeout, 'Texterkennung hat zu lange gedauert');
        const lines = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines)).map(l => ({
          text: l.text.trim(),
          confidence: l.confidence,
          bbox: l.bbox,
          words: l.words.map(wd => ({ text: wd.text, confidence: wd.confidence })),
        }));
        return { text: data.text, lines };
      } catch (err) {
        // Hängender Worker wird verworfen; die nächste Seite startet einen neuen.
        if (err.message === 'Texterkennung hat zu lange gedauert') await terminate();
        throw err;
      }
    },
    terminate,
  };
}
