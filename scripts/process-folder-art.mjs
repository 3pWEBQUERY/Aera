import sharp from "sharp";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("Usage: process-folder-art <input> <output>");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const seen = new Uint8Array(width * height);
const queue = new Int32Array(width * height);
let head = 0;
let tail = 0;

function isBackground(index) {
  const p = index * channels;
  return data[p] >= 244 && data[p + 1] >= 244 && data[p + 2] >= 244;
}

function enqueue(index) {
  if (seen[index] || !isBackground(index)) return;
  seen[index] = 1;
  queue[tail++] = index;
}

for (let x = 0; x < width; x++) {
  enqueue(x);
  enqueue((height - 1) * width + x);
}
for (let y = 0; y < height; y++) {
  enqueue(y * width);
  enqueue(y * width + width - 1);
}

while (head < tail) {
  const index = queue[head++];
  const x = index % width;
  const y = Math.floor(index / width);
  if (x > 0) enqueue(index - 1);
  if (x + 1 < width) enqueue(index + 1);
  if (y > 0) enqueue(index - width);
  if (y + 1 < height) enqueue(index + width);
}

for (let index = 0; index < seen.length; index++) {
  if (seen[index]) data[index * channels + 3] = 0;
}

await sharp(data, { raw: { width, height, channels } })
  .trim({ background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .resize(1200, 1200, { fit: "contain" })
  .png({ compressionLevel: 9 })
  .toFile(output);
