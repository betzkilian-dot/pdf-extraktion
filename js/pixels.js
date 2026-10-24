// pdf.js-Bildarten: 1 = Graustufen 1 Bit, 2 = RGB 24 Bit, 3 = RGBA 32 Bit.
export function toRGBA({ width, height, kind, data }) {
  const out = new Uint8ClampedArray(width * height * 4);
  if (kind === 3) {
    out.set(data.subarray(0, out.length));
    return out;
  }
  if (kind === 2) {
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
      out[i * 4] = data[j];
      out[i * 4 + 1] = data[j + 1];
      out[i * 4 + 2] = data[j + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  // 1 Bit: jede Zeile ist auf volle Bytes aufgefüllt, gesetztes Bit = Weiß.
  const rowBytes = Math.ceil(width / 8);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
      const o = (y * width + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = bit ? 255 : 0;
      out[o + 3] = 255;
    }
  }
  return out;
}
