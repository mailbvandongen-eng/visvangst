// Schermafbeelding in iPhone-formaat met een vaste locatie: node tools/shot.cjs lat lon out.png [dsf] [acties]
const { chromium } = require('/root/tools/pw/node_modules/playwright-core')
;(async () => {
  const [, , lat, lon, out, dsf = '1', ...acts] = process.argv
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: +dsf, geolocation: { latitude: +lat, longitude: +lon }, permissions: ['geolocation'], locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  p.on('console', m => m.type() !== 'log' || console.log('console:', m.text()))
  p.on('pageerror', e => console.log('pageerror:', e.message))
  await p.goto('' + (process.env.URL || "http://localhost:8795/visvangst/") + '')
  await p.waitForSelector('.hero:not(.loading)', { timeout: 30000 }).catch(() => console.log('geen hero'))
  await p.waitForTimeout(1500)
  for (const a of acts) {
    const [sel, n] = a.split('#')
    await p.locator(sel).nth(+(n || 0)).click(); await p.waitForTimeout(700)
  }
  await p.screenshot({ path: out })
  const sh = await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight])
  console.log('hoogte', sh)
  await b.close()
})()
