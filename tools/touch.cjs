// Vingertest: schuiven over de dag-grafiek, venster openen, schuiven in het getij, vegen om te sluiten
const { chromium, devices } = require('/root/tools/pw/node_modules/playwright-core')
;(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ ...devices['Galaxy S24'], viewport: { width: 360, height: 700 }, deviceScaleFactor: 1, geolocation: { latitude: 51.445, longitude: 3.58 }, permissions: ['geolocation'], timezoneId: 'Europe/Amsterdam' })
  const p = await ctx.newPage()
  const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.goto(process.env.URL || 'http://localhost:8795/visvangst/')
  await p.waitForSelector('.hero:not(.loading)'); await p.waitForTimeout(800)
  const ok = (name, cond) => console.log((cond ? 'goed ' : 'FOUT ') + name)
  // 1. schuiven over de dag-grafiek
  const box = await p.locator('.daycard .plot').boundingBox()
  const before = await p.textContent('.meta')
  await p.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2); await p.mouse.down()
  for (let k = 3; k <= 8; k++) { await p.mouse.move(box.x + box.width * k / 10, box.y + box.height / 2); await p.waitForTimeout(60) }
  await p.mouse.up(); await p.waitForTimeout(200)
  const after = await p.textContent('.meta')
  ok(`dag-grafiek kiest uur ("${before.trim()}" → "${after.trim()}")`, after !== before && /Om \d\d:00/.test(after))
  const h = Number(after.match(/Om (\d\d)/)[1]), blk = Number(await p.locator('.hb.sel .ht').textContent())
  ok(`blok volgt (${h}:00 valt in blok ${blk})`, h >= blk && h < blk + 3)
  // 2. getij-venster openen en schuiven
  await p.click('.tile[data-v=tide]'); await p.waitForSelector('.detail'); await p.waitForTimeout(500)
  const tb = await p.locator('.detail .plot').boundingBox()
  await p.mouse.move(tb.x + tb.width * 0.5, tb.y + 50); await p.mouse.down(); await p.mouse.move(tb.x + tb.width * 0.62, tb.y + 50, { steps: 5 }); await p.mouse.up()
  const bubble = await p.textContent('.detail .bubble')
  ok(`getij-label bij schuiven: "${bubble}"`, /cm/.test(bubble))
  // 3. vegen naar beneden sluit
  const hb = await p.locator('.dtop').boundingBox()
  await p.mouse.move(hb.x + 60, hb.y + 20); await p.mouse.down(); await p.mouse.move(hb.x + 60, hb.y + 220, { steps: 8 }); await p.mouse.up()
  await p.waitForTimeout(700)
  ok('vegen sluit venster', (await p.locator('.detail').count()) === 0)
  // 4. naast tikken sluit
  await p.click('.tile[data-v=pressure]'); await p.waitForSelector('.detail'); await p.waitForTimeout(400)
  await p.mouse.click(180, 20); await p.waitForTimeout(700)
  ok('naast tikken sluit', (await p.locator('.detail').count()) === 0)
  // 5. maan-schuif
  await p.click('.tile[data-v=moon]'); await p.waitForSelector('.slider'); await p.waitForTimeout(400)
  const d0 = await p.textContent('.mdate')
  await p.locator('.slider').fill('7'); await p.waitForTimeout(300)
  const d7 = await p.textContent('.mdate')
  ok(`maan-schuif: "${d0}" → "${d7}", foto ${await p.getAttribute('.moonview img', 'src')}`, d0 !== d7)
  await p.click('.detail [data-act=close-detail]'); await p.waitForTimeout(600)
  // 6. alle vensters zonder fouten
  for (const k of ['score', 'temp', 'hours']) {
    await p.click(k === 'score' ? '.hero' : k === 'hours' ? '.dmore' : `.tile[data-v=${k}]`); await p.waitForSelector('.detail'); await p.waitForTimeout(400)
    ok(`venster ${k} open`, (await p.locator('.detail .dbody').count()) === 1)
    await p.keyboard.press('Escape'); await p.waitForTimeout(500)
  }
  ok('geen fouten in de pagina' + (errs.length ? ': ' + errs.join('; ') : ''), errs.length === 0)
  await b.close()
})()
