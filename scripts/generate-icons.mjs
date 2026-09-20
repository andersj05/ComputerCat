import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// Original 32-pixel CRT cat. Integer rectangles keep the source and every size crisp.
// The generated PNG/ICO files are committed so packaging needs no graphics dependency.
const shapes = [];
const rect = (x, y, w, h, fill) => shapes.push({ x, y, w, h, fill });
const ink = "#25334c";
rect(4, 3, 24, 2, ink);
rect(2, 5, 28, 20, ink);
rect(4, 25, 24, 2, ink);
rect(12, 26, 8, 3, ink);
rect(8, 29, 16, 2, ink);
rect(4, 5, 24, 19, "#e6dfc8");
rect(3, 6, 1, 17, "#fff8df");
rect(5, 4, 22, 1, "#fff8df");
rect(28, 6, 1, 17, "#989b95");
rect(5, 24, 22, 1, "#a4a79e");
rect(6, 7, 20, 14, ink);
rect(7, 8, 18, 12, "#357bc3");
rect(8, 9, 16, 10, "#76b9db");
// Upright ears and a broad, unmistakable cat face.
rect(9, 6, 3, 3, ink);
rect(20, 6, 3, 3, ink);
rect(9, 9, 14, 8, ink);
rect(10, 17, 12, 2, ink);
rect(12, 19, 8, 1, ink);
rect(10, 7, 1, 3, "#efb8a7");
rect(21, 7, 1, 3, "#efb8a7");
rect(11, 10, 10, 2, "#465372");
rect(10, 12, 12, 4, "#465372");
rect(12, 16, 8, 2, "#465372");
rect(11, 12, 3, 2, "#b9f58a");
rect(18, 12, 3, 2, "#b9f58a");
rect(12, 12, 1, 2, ink);
rect(19, 12, 1, 2, ink);
rect(15, 15, 2, 1, "#f2baa8");
rect(14, 17, 4, 1, "#cdd7dc");
rect(7, 15, 3, 1, "#fff0d2");
rect(22, 15, 3, 1, "#fff0d2");
rect(7, 22, 7, 1, "#929994");
rect(23, 22, 2, 1, "#479653");
rect(13, 27, 6, 2, "#b6b6aa");
rect(9, 29, 14, 1, "#e6dfc8");

const rgba = new Uint8Array(32 * 32 * 4);
for (const { x, y, w, h, fill } of shapes) {
  const rgb = fill.match(/[a-f\d]{2}/gi).map((hex) => Number.parseInt(hex, 16));
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) rgba.set([...rgb, 255], (py * 32 + px) * 4);
  }
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  body.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function png(size) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset =
        (Math.floor(((y + 0.5) * 32) / size) * 32 + Math.floor(((x + 0.5) * 32) / size)) * 4;
      rows.set(rgba.subarray(offset, offset + 4), y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const frames = sizes.map(png);
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [i, size] of sizes.entries()) {
  const entry = 6 + i * 16;
  directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frames[i].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frames[i].length;
}
const asset = (name) => new URL(`../assets/${name}`, import.meta.url);
writeFileSync(asset("app-icon.ico"), Buffer.concat([directory, ...frames]));
writeFileSync(asset("app-icon.png"), png(256));
writeFileSync(
  asset("app-icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">\n${shapes.map(({ x, y, w, h, fill }) => `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`).join("\n")}\n</svg>\n`,
);
console.log("Generated app-icon.svg, app-icon.png and nine-size app-icon.ico.");
