// Buienradar: opent het venster, controleert dat de beelden laden, de animatie loopt en de schuif werkt. node tools/radar.cjs [url]
const { chromium } = require('/root/tools/pw/node_modules/playwright-core')
const url = process.argv[2] || 'http://localhost:8795/visvangst/'
;(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 52.09, longitude: 5.12 }, permissions: ['geolocation'], locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  let fail = 0
  const ok = (c, m) => { console.log((c ? 'ok   ' : 'FOUT ') + m); if (!c) fail++ }
  await p.goto(url)
  await p.waitForSelector('.hero:not(.loading)', { timeout: 30000 })
  const line = await p.locator('.rainline').innerText().catch(() => '')
  ok(/^(Droog tot|.* vanaf|.* tot na|.*, droog vanaf)/.test(line.trim()), `regel: "${line.trim()}"`)
  await p.click('.rainline')
  await p.waitForSelector('.rctl', { timeout: 20000 })
  await p.waitForTimeout(2500)
  const st = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('.rmap img')]
    return { n: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length, frames: window.__vv.D.radar.length }
  })
  ok(st.frames >= 6, `${st.frames} radarbeelden`)
  ok(st.loaded === st.n && st.n >= 6, `kaarttegels geladen: ${st.loaded}/${st.n}`)
  const t1 = await p.locator('.rtime').innerText()
  await p.waitForTimeout(1500)
  const t2 = await p.locator('.rtime').innerText()
  ok(t1 !== t2, `animatie loopt (${t1.split('\n')[0]} → ${t2.split('\n')[0]})`)
  await p.locator('[data-act=radar-frame]').fill('0')
  await p.waitForTimeout(1200)
  const t3 = await p.locator('.rtime').innerText(), t4 = await p.locator('.rtime').innerText()
  ok(t3 === t4 && /min geleden/.test(t3), `schuif stopt op het oudste beeld: ${t3.replace('\n', ' ')}`)
  await p.click('.detail [data-act=close-detail]')
  await p.waitForTimeout(600)
  ok(!(await p.locator('.rmap').count()), 'venster dicht')
  ok(!errs.length, 'geen fouten ' + errs.join(';'))
  await b.close()
  process.exit(fail ? 1 : 0)
})()
