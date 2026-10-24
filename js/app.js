import { inputType } from './file-type.js';
import { zipName } from './naming.js';
import { buildZip } from './zip.js';
import { createOcr } from './ocr.js';
import { readImage } from './image-input.js';
import { readPdf } from './pdf-reader.js';
import { describeError, sizeWarning } from './messages.js';

const $ = id => document.getElementById(id);
const items = [];
let busy = false;
let nextId = 1;

function addFiles(files) {
  $('notices').replaceChildren();
  for (const file of files) {
    const type = inputType(file.name);
    if (!type) {
      const p = document.createElement('p');
      p.textContent = `„${file.name}“ wird nicht unterstützt (nur PDF, PNG, JPG)`;
      $('notices').append(p);
      continue;
    }
    const warning = sizeWarning(file.size, null);
    items.push({ id: nextId++, file, type, state: 'wait', status: 'Wartet', warnings: warning ? [warning] : [], doc: null });
  }
  render();
}

function render() {
  const list = $('files');
  list.replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    const name = Object.assign(document.createElement('span'), { className: 'file-name', textContent: item.file.name });
    const type = Object.assign(document.createElement('span'), { className: 'file-type', textContent: item.type === 'pdf' ? ' · PDF' : ' · Bild' });
    const head = document.createElement('div');
    head.append(name, type);
    const status = Object.assign(document.createElement('div'), { className: `file-status ${item.state === 'done' ? 'ok' : item.state === 'error' ? 'error' : ''}`, textContent: item.status });
    const remove = Object.assign(document.createElement('button'), { className: 'remove', type: 'button', textContent: '✕', disabled: busy });
    remove.setAttribute('aria-label', `${item.file.name} entfernen`);
    remove.addEventListener('click', () => { items.splice(items.indexOf(item), 1); render(); });
    li.append(head, remove, status);
    for (const w of item.warnings) li.append(Object.assign(document.createElement('div'), { className: 'file-warning', textContent: w }));
    return li;
  }));

  const done = items.filter(i => i.state === 'done');
  const finished = items.filter(i => i.state === 'done' || i.state === 'error');
  $('extract').disabled = busy || !items.some(i => i.state === 'wait');
  $('download').hidden = busy || done.length === 0;
  $('summary').textContent = !busy && finished.length > 0 && done.length === 0 ? 'Keine Datei konnte verarbeitet werden.' : '';
}

function progressText({ page, total, stage }) {
  return `Seite ${page} von ${total} · ${stage === 'ocr' ? 'Texterkennung …' : 'Text wird gelesen …'}`;
}

async function extract() {
  busy = true;
  render();
  const ocr = createOcr({ onLoading: active => { $('loading').hidden = !active; } });
  for (const item of items.filter(i => i.state === 'wait')) {
    item.state = 'busy';
    const onProgress = p => { item.status = progressText(p); render(); };
    try {
      item.doc = item.type === 'pdf' ? await readPdf(item.file, ocr, onProgress) : await readImage(item.file, ocr, onProgress);
      item.state = 'done';
      item.status = '✓ Fertig';
      item.warnings = item.doc.warnings;
    } catch (err) {
      item.state = 'error';
      item.status = `✗ ${describeError(err)}`;
    }
    render();
  }
  await ocr.terminate();
  busy = false;
  render();
}

async function download() {
  const blob = await buildZip(items.filter(i => i.state === 'done').map(i => i.doc));
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: zipName(new Date()) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const zone = $('dropzone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('over'));
zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('over'); addFiles(e.dataTransfer.files); });
// Daneben fallengelassene Dateien sollen den Browser nicht wegnavigieren.
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
$('picker').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('extract').addEventListener('click', extract);
$('download').addEventListener('click', download);
render();
