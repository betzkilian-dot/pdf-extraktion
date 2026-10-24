import { imageFileName, maxImageCount } from './naming.js';

// Zeichen, die in Markdown etwas auslösen, werden maskiert. Am Zeilenanfang (lineStart)
// betrifft das auch Überschrift-, Listen- und Zitatzeichen.
export function escapeMarkdown(text, { lineStart = true } = {}) {
  let t = text;
  if (lineStart) {
    t = t
      .replace(/^(#{1,6}|[>+-]|\d+[.)])(?=\s|$)/, m => (/^\d/.test(m) ? `${m.slice(0, -1)}\\${m.slice(-1)}` : `\\${m}`))
      .replace(/^(?=[-=]{3,})/, '\\');
  }
  return t
    .replace(/[*<]/g, '\\$&')
    // Unterstriche zwischen Buchstaben/Ziffern (snake_case) bleiben unverändert.
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_');
}

const two = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
const yamlString = s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function altText(block, page) {
  if (block.alt) return block.alt;
  return block.pageImage ? `Seite ${page.number}` : `Seite ${page.number}, Bild ${block.index}`;
}

function blockToMarkdown(block, page, pageCount, imageCount) {
  if (block.type === 'heading') return `### ${escapeMarkdown(block.text, { lineStart: false })}`;
  if (block.type === 'paragraph') return escapeMarkdown(block.text);
  const file = imageFileName(page.number, pageCount, block, imageCount).replace(/ /g, '%20');
  return `![${altText(block, page).replace(/[[\]]/g, '\\$&')}](${file})`;
}

export function toMarkdown(doc, date = new Date()) {
  const imageCount = maxImageCount(doc);
  const images = doc.pages.reduce((n, p) => n + p.blocks.filter(b => b.type === 'image').length, 0);
  const front = [
    '---',
    `quelle: ${yamlString(doc.source ?? doc.name)}`,
    `seiten: ${doc.pages.length}`,
    `ocr_seiten: ${doc.pages.filter(p => p.ocr).length}`,
    `bilder: ${images}`,
    `erstellt: ${isoDate(date)}`,
    '---',
  ].join('\n');

  const parts = [`# ${escapeMarkdown(doc.name, { lineStart: false })}`];
  for (const page of doc.pages) {
    parts.push(`## Seite ${page.number}`);
    if (page.ocr) parts.push('<!-- per OCR erkannt -->');
    // "-->" würde den Kommentar vorzeitig beenden.
    if (page.error) parts.push(`<!-- Seite ${page.number} konnte nicht gelesen werden: ${page.error.replace(/-->/g, '-- >')} -->`);
    for (const block of page.blocks) parts.push(blockToMarkdown(block, page, doc.pages.length, imageCount));
  }
  return `${front}\n\n${parts.join('\n\n')}\n`;
}
