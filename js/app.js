import { inputType } from './file-type.js';
import { zipName } from './naming.js';
import { buildZip } from './zip.js';
import { createOcr } from './ocr.js';
import { readImage } from './image-input.js';
import { readPdf } from './pdf-reader.js';
import { describeError, sizeWarning } from './messages.js';
import { fileFraction, overallProgress } from './progress.js';
import { summarize, summaryText, stripImages } from './summary.js';
import { createWakeLock } from './wake-lock.js';

const $ = id => document.getElementById(id);
const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);

const items = [];
let nextId = 1;
let busy = false;
let controller = null;
let runItems = [];
let zipBlob = null;
let zipBuilding = false;
let zipVersion = 0;
const wakeLock = createWakeLock();

// Teilen-Menü nur auf Touch-Geräten (iPad): am PC genügt der Download.
const canShareZip = (() => {
  try {
    return navigator.maxTouchPoints > 0 && !!navigator.canShare?.({ files: [new File([''], 'x.zip', { type: 'application/zip' })] });
  } catch {
    return false;
  }
})();

function addFiles(files) {
  $('notices').replaceChildren();
  for (const file of files) {
    const type = inputType(file.name);
    if (!type) {
      $('notices').append(el('p', { textContent: `„${file.name}“ wird nicht unterstützt (nur PDF, PNG, JPG)` }));
      continue;
    }
    const warning = sizeWarning(file.size, null);
    items.push({ id: nextId++, file, type, state: 'wait', status: 'Wartet', progress: 0, warnings: warning ? [warning] : [], doc: null, summary: '' });
  }
  render();
}

function itemRow(item) {
  const li = el('li');
  const head = el('div');
  head.append(el('span', { className: 'file-name', textContent: item.file.name }), el('span', { className: 'file-type', textContent: item.type === 'pdf' ? ' · PDF' : ' · Bild' }));
  const remove = el('button', { className: 'remove', type: 'button', textContent: '✕', disabled: busy });
  remove.setAttribute('aria-label', `${item.file.name} entfernen`);
  remove.addEventListener('click', () => removeItem(item));
  const status = el('div', { className: `file-status ${item.state === 'done' ? 'ok' : item.state === 'error' ? 'error' : ''}`, textContent: item.status });
  li.append(head, remove, status);
  if (item.state === 'busy') li.append(el('progress', { className: 'file-progress', max: 1, value: item.progress }));
  if (item.summary) li.append(el('div', { className: 'file-summary', textContent: item.summary }));
  for (const w of item.warnings) li.append(el('div', { className: 'file-warning', textContent: w }));
  return li;
}

function render() {
  $('files').replaceChildren(...items.map(itemRow));

  const done = items.filter(i => i.state === 'done');
  const finished = items.filter(i => i.state === 'done' || i.state === 'error');
  $('extract').disabled = busy || !items.some(i => i.state === 'wait');
  $('cancel').hidden = !busy;
  $('clear').hidden = busy || items.length === 0;
  $('text-only').disabled = busy;
  $('download').hidden = busy || !zipBlob;
  $('share').hidden = busy || !zipBlob || !canShareZip;

  $('overall').hidden = !busy;
  if (busy) {
    $('overall-bar').value = overallProgress(runItems);
    const current = runItems.findIndex(i => i.state === 'busy');
    $('overall-text').textContent = `Datei ${Math.min(Math.max(current, 0) + 1, runItems.length)} von ${runItems.length} · ${Math.round(overallProgress(runItems) * 100)} %`;
  }

  if (zipBuilding) $('summary').textContent = 'ZIP wird erstellt …';
  else if (!busy && finished.length > 0 && done.length === 0) $('summary').textContent = 'Keine Datei konnte verarbeitet werden.';
  else $('summary').textContent = '';
}

// Die ZIP wird gleich nach der Verarbeitung gebaut, damit „Herunterladen“ und „Sichern“
// sofort auf den Tipp reagieren (Safari verlangt, dass sie direkt aus dem Tipp heraus starten).
async function refreshZip() {
  const version = ++zipVersion;
  zipBlob = null;
  const docs = items.filter(i => i.state === 'done').map(i => ($('text-only').checked ? stripImages(i.doc) : i.doc));
  if (!docs.length) {
    zipBuilding = false;
    render();
    return;
  }
  zipBuilding = true;
  render();
  try {
    const blob = await buildZip(docs);
    if (version === zipVersion) zipBlob = blob;
  } catch (err) {
    if (version === zipVersion) $('notices').replaceChildren(el('p', { textContent: `ZIP konnte nicht erstellt werden: ${describeError(err)}` }));
  } finally {
    if (version === zipVersion) {
      zipBuilding = false;
      render();
    }
  }
}

function removeItem(item) {
  items.splice(items.indexOf(item), 1);
  if (item.state === 'done') refreshZip();
  render();
}

function clearAll() {
  items.length = 0;
  $('notices').replaceChildren();
  refreshZip();
}

async function extract() {
  busy = true;
  controller = new AbortController();
  const { signal } = controller;
  runItems = items.filter(i => i.state === 'wait');
  zipVersion++;
  zipBlob = null;
  render();
  await wakeLock.start();
  const ocr = createOcr({ onLoading: active => { $('loading').hidden = !active; } });
  try {
    for (const item of runItems) {
      if (signal.aborted) break;
      item.state = 'busy';
      item.progress = 0;
      item.summary = '';
      const onProgress = p => {
        item.progress = fileFraction(p);
        item.status = `Seite ${p.page} von ${p.total} · ${p.stage === 'ocr' ? 'Texterkennung …' : 'Text wird gelesen …'}`;
        render();
      };
      try {
        item.doc = item.type === 'pdf' ? await readPdf(item.file, ocr, onProgress, signal) : await readImage(item.file, ocr, onProgress, signal);
        item.state = 'done';
        item.progress = 1;
        item.status = '✓ Fertig';
        item.summary = summaryText(summarize(item.doc));
        item.warnings = [...new Set([...item.warnings, ...item.doc.warnings])];
      } catch (err) {
        if (err?.name === 'AbortError') {
          item.state = 'wait';
          item.progress = 0;
          item.status = 'Abgebrochen – kann erneut gestartet werden';
        } else {
          item.state = 'error';
          item.status = `✗ ${describeError(err)}`;
        }
      }
      render();
    }
  } finally {
    $('loading').hidden = true;
    await ocr.terminate();
    await wakeLock.stop();
    busy = false;
    controller = null;
    runItems = [];
  }
  await refreshZip();
}

function cancel() {
  if (!controller) return;
  $('cancel').disabled = true;
  $('summary').textContent = 'Wird abgebrochen …';
  controller.abort();
}

function download() {
  if (!zipBlob) return;
  const url = URL.createObjectURL(zipBlob);
  const a = el('a', { href: url, download: zipName(new Date()) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Muss ohne vorheriges await aus dem Tipp heraus aufgerufen werden (Safari).
function share() {
  if (!zipBlob) return;
  const file = new File([zipBlob], zipName(new Date()), { type: 'application/zip' });
  navigator.share({ files: [file] }).catch(err => {
    if (err?.name !== 'AbortError') $('notices').replaceChildren(el('p', { textContent: 'Teilen war nicht möglich – bitte „ZIP herunterladen“ verwenden.' }));
  });
}

const zone = $('dropzone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('over'));
zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); addFiles(e.dataTransfer.files); });
// Daneben fallengelassene Dateien sollen den Browser nicht wegnavigieren.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
// Beim Verlassen während der Verarbeitung warnen (sonst gehen die Ergebnisse verloren).
window.addEventListener('beforeunload', e => {
  if (busy) {
    e.preventDefault();
    e.returnValue = '';
  }
});
$('picker').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('text-only').addEventListener('change', refreshZip);
$('extract').addEventListener('click', extract);
$('cancel').addEventListener('click', cancel);
$('download').addEventListener('click', download);
$('share').addEventListener('click', share);
$('clear').addEventListener('click', clearAll);
render();
