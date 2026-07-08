/**
 * Renders the ClassPing bell logo into the PNG app icons referenced by
 * app/manifest.ts. Run with: node scripts/generate-icons.mjs
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../public/icons");

// rx=0 + smaller bell for the maskable variant (80% safe zone)
function iconSvg({ size, radius, bellScale }) {
  const s = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6c63ff"/>
      <stop offset="1" stop-color="#5045d8"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(${s},${s}) scale(${bellScale}) translate(-12,-12)">
    <path d="M12 3.2a4.8 4.8 0 00-4.8 4.8c0 4.6-1.9 5.8-1.9 5.8h13.4s-1.9-1.2-1.9-5.8A4.8 4.8 0 0012 3.2z" fill="#fff"/>
    <path d="M10.3 19.4a2 2 0 003.4 0" stroke="#fff" stroke-width="1.7" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, radius: 45, bellScale: 5 },
  { file: "icon-512.png", size: 512, radius: 120, bellScale: 13.3 },
  { file: "icon-maskable-512.png", size: 512, radius: 0, bellScale: 10.6 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, bellScale: 4.7 },
];

await mkdir(OUT, { recursive: true });
for (const t of targets) {
  await sharp(Buffer.from(iconSvg(t)))
    .png()
    .toFile(path.join(OUT, t.file));
  console.log("wrote", t.file);
}
