// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import {
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from '@zxing/library';
import { normalizeBarcode } from './barcodes';
const examples = [
  ['known-a', '2000000000015'],
  ['known-b', '2000000000022'],
  ['outside-list', '2000000000039'],
  ['unknown', '2000000000046'],
];
function read(width: number, height: number, luminance: Uint8ClampedArray) {
  const reader = new MultiFormatReader();
  reader.setHints(
    new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]])
  );
  return reader
    .decodeWithState(
      new BinaryBitmap(
        new HybridBinarizer(new RGBLuminanceSource(luminance, width, height))
      )
    )
    .getText();
}
describe('generated barcode fixtures', () => {
  it.each(examples)('decodes actual pixels of %s', (name, code) => {
    const png = PNG.sync.read(
      readFileSync(
        new URL(`../test/fixtures/barcodes/${name}.png`, import.meta.url)
      )
    );
    const pixels = new Uint8ClampedArray(png.width * png.height);
    for (let i = 0; i < pixels.length; i++)
      pixels[i] =
        (png.data[i * 4] + png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 3;
    expect(read(png.width, png.height, pixels)).toBe(code);
    expect(normalizeBarcode(code)).toBe(code);
  });
  it('does not invent a code from a blank image', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() =>
      read(500, 200, new Uint8ClampedArray(500 * 200).fill(255))
    ).toThrow();
    warn.mockRestore();
  });
});
