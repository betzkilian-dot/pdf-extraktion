import { imageFileName, maxImageCount } from './naming.js';

function blockToMarkdown(block, page, pageCount, imageCount) {
  if (block.type === 'heading') return `### ${block.text}`;
  if (block.type === 'paragraph') return block.text;
  const file = imageFileName(page.number, pageCount, block, imageCount).replace(/ /g, '%20');
  const alt = block.pageImage ? `Seite ${page.number}` : `Seite ${page.number}, Bild ${block.index}`;
  return `![${alt}](${file})`;
}

export function toMarkdown(doc) {
  const imageCount = maxImageCount(doc);
  const parts = [`# ${doc.name}`];
  for (const page of doc.pages) {
    parts.push(`## Seite ${page.number}`);
    if (page.ocr) parts.push('<!-- per OCR erkannt -->');
    if (page.error) parts.push(`<!-- Seite ${page.number} konnte nicht gelesen werden: ${page.error} -->`);
    for (const block of page.blocks) parts.push(blockToMarkdown(block, page, doc.pages.length, imageCount));
  }
  return parts.join('\n\n') + '\n';
}
