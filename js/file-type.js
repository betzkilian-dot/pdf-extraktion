import { splitName } from './naming.js';

const TYPES = { pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image' };

export function inputType(fileName) {
  return TYPES[splitName(fileName).ext] ?? null;
}
