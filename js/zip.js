import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
import { uniqueFolderNames, sanitizeName, imageFileName, maxImageCount } from './naming.js';
import { toMarkdown } from './markdown.js';

export async function buildZip(docs) {
  const zip = new JSZip();
  const folders = uniqueFolderNames(docs.map(d => sanitizeName(d.name)));
  docs.forEach((doc, i) => {
    const folder = folders[i];
    zip.file(`${folder}/${folder}.md`, toMarkdown(doc));
    const imageCount = maxImageCount(doc);
    for (const page of doc.pages) {
      for (const block of page.blocks) {
        if (block.type !== 'image') continue;
        // Bilder sind bereits komprimiert – erneutes Packen kostet nur Zeit.
        zip.file(`${folder}/${imageFileName(page.number, doc.pages.length, block, imageCount)}`, block.blob, { compression: 'STORE' });
      }
    }
  });
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
