// Verdeling van de scores over drie dagen, per plek en per soort: node tools/dist.cjs
const { chromium } = require('/root/tools/pw/node_modules/playwright-core')
const PLACES = [['Voorburg (polder + vaart)', 52.0805, 4.3913], ['Jisp (polder)', 52.5078, 4.848], ['Vlissingen', 51.445, 3.58], ['Lemmer (IJsselmeer)', 52.84, 5.71], ['Nijmegen (Waal)', 51.851, 5.865]]
;(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  for (const [name, lat, lon] of PLACES) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: lat, longitude: lon }, permissions: ['geolocation'], timezoneId: 'Europe/Amsterdam' })
    const p = await ctx.newPage()
    p.on('pageerror', e => console.log('pageerror:', e.message))
    await p.goto('http://localhost:8795/visvangst/')
    await p.waitForSelector('.hero:not(.loading)', { timeout: 30000 })
    console.log(`\n=== ${name}`)
    for (const water of ['zoet', 'zout']) {
      await p.click(`[data-act=water][data-v=${water}]`); await p.waitForTimeout(300)
      const res = await p.evaluate(water => {
        const { D, CHOICES, scoreHour } = window.__vv
        const out = []
        D.waterHours.forEach((wh, wi) => {
        const b = D.waters[wi]
        out.push(`-- ${b ? b.name + ' (' + b.kind + ')' : 'onbekend'}: water nu ${wh.hours.find(h => h.t === Math.floor(Date.now() / 3600000) * 3600000)?.waterTemp?.toFixed(1)}° (${D.waterInfo[wi].src})`)
        out.push(...CHOICES.filter(c => c.water === water).map(c => {
          const days = {}
          for (const h of wh.hours) {
            const s = scoreHour(c, h)
            const d = new Intl.DateTimeFormat('nl', { timeZone: 'Europe/Amsterdam', weekday: 'short' }).format(h.t)
            ;(days[d] ??= []).push(s.fish)
          }
          return '  ' + c.name.padEnd(11) + Object.entries(days).map(([d, a]) => `${d} ${Math.min(...a)}–${Math.max(...a)} gem ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)}`).join(' | ')
        }))
        })
        return out
      }, water)
      console.log(' ' + water + ':\n   ' + res.join('\n   '))
    }
    await ctx.close()
  }
  await b.close()
})()
