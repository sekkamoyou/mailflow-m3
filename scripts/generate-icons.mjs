import { readFile, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const publicDir = new URL('../public/', import.meta.url);
const svg = await readFile(new URL('favicon.svg', publicDir), 'utf8');
async function png(source, size, name) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(await loadImage(Buffer.from(source)), 0, 0, size, size);
  await writeFile(new URL(name, publicDir), await canvas.encode('png'));
}
for (const size of [32, 72, 96, 128, 144, 152, 192, 384, 512]) await png(svg, size, `icon-${size}.png`);
await png(svg.replace('rx="8"', 'rx="0"'), 512, 'icon-maskable-512.png');
await png(await readFile(new URL('badge.svg', publicDir), 'utf8'), 96, 'badge-96.png');
