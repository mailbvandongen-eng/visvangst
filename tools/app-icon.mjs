// Maakt het app-icoon: het 3D-visje van Fluent Emoji op een diepe watergradiënt.
import sharp from 'sharp'
const pub = new URL('../public/', import.meta.url).pathname
const fish = Buffer.from(await (await fetch('https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Fish/3D/fish_3d.png')).arrayBuffer())
for (const size of [180, 192, 512]) {
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="g" cx="50%" cy="28%" r="85%"><stop offset="0" stop-color="#1b6f8f"/><stop offset=".55" stop-color="#0a3550"/><stop offset="1" stop-color="#061420"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`)
  const f = await sharp(fish).resize(Math.round(size * 0.66)).toBuffer()
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  await sharp(bg).composite([{ input: f, gravity: 'center' }]).png().toFile(pub + name)
}
