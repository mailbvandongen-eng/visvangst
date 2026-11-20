// Maakt het app-icoon: het slanke makreel-silhouet (PhyloPic, CC0), kop naar rechts, op diep water.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
const pub = new URL('../public/', import.meta.url).pathname
const svg = readFileSync(pub + 'fish/makreel.svg', 'utf8')
  .replace(/fill="#000000"/g, 'fill="#8fd6ec"')
for (const size of [180, 192, 512]) {
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="g" cx="50%" cy="30%" r="85%"><stop offset="0" stop-color="#16506b"/><stop offset=".6" stop-color="#0a2a3d"/><stop offset="1" stop-color="#071521"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`)
  const w = Math.round(size * 0.62)
  const f = await sharp(Buffer.from(svg)).resize(w).flop().png().toBuffer()
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  await sharp(bg).composite([{ input: f, gravity: 'center' }]).png().toFile(pub + name)
}
