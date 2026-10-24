// Kopf-, Fuß- und Seitenzahlzeilen: Text, der im oberen oder unteren Zehntel auf den meisten Seiten
// gleich steht. Ziffern zählen zum Text ("Aufgabe 1" ≠ "Aufgabe 2"), nur echte Seitenzahlen
// ("Seite 3 von 12", "- 4 -", "5") werden als gleich behandelt.
const ZONE = 0.1;
const PAGE_NUMBER = /^(?:(?:seite|page|s\.)\s*)?[-–]?\s*\d+\s*[-–]?(?:\s*(?:von|of|\/)\s*\d+)?$/;

const keyOf = text => {
  const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return PAGE_NUMBER.test(t) ? '#seitenzahl' : t;
};

const inZone = (page, block) => block.y < ZONE * page.height || block.y > (1 - ZONE) * page.height;
const isRemovable = (page, block) => block.type !== 'image' && typeof block.y === 'number' && inZone(page, block);

// Entfernt die Zeilen aus doc und gibt ihre Anzahl zurück.
export function removeRepeatedLines(doc) {
  const pages = doc.pages.filter(p => p.height && !p.error);
  if (pages.length < 2) return 0;
  const needed = Math.max(2, Math.ceil(pages.length * 0.6));

  const counts = new Map();
  for (const page of pages) {
    const keys = new Set(page.blocks.filter(b => isRemovable(page, b)).map(b => keyOf(b.text)));
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let removed = 0;
  for (const page of pages) {
    const before = page.blocks.length;
    page.blocks = page.blocks.filter(b => !(isRemovable(page, b) && counts.get(keyOf(b.text)) >= needed));
    removed += before - page.blocks.length;
  }
  return removed;
}
