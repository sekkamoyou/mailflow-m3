import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

async function pixels(name) {
  const image = await loadImage(await readFile(new URL(`../../public/${name}`, import.meta.url)));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
}

test('PWA glyph is centered and entirely inside the 40% maskable safe circle', async () => {
  const { width, height, data } = await pixels('icon-maskable-512.png');
  assert.equal(width, 512); assert.equal(height, 512);
  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    assert.equal(data[i + 3], 255, 'maskable background must be opaque');
    if (data[i] === 103 && data[i + 1] === 80 && data[i + 2] === 164) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      assert.ok(Math.hypot(x - 255.5, y - 255.5) <= width * .4);
    }
  }
  assert.equal((minX + maxX) / 2, 255.5);
  assert.equal((minY + maxY) / 2, 255.5);
});

test('normal app icon has its own rounded transparent corners', async () => {
  const { data, width } = await pixels('icon-512.png');
  assert.equal(data[3], 0);
  assert.equal(data[((256 * width) + 256) * 4 + 3], 255);
});
