// Zet de gedownloade Fluent-iconen (PNG 256px) om naar kleine WebP-bestanden.
import sharp from 'sharp'
import { readdirSync, unlinkSync } from 'node:fs'
const dir = new URL('../public/icons/', import.meta.url).pathname
for (const f of readdirSync(dir).filter(f => f.endsWith('.png'))) {
  const out = dir + f.replace('_3d.png', '.webp')
  await sharp(dir + f).resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88 }).toFile(out)
  unlinkSync(dir + f)
}
