// Test op Android- en Samsung-toestellen: past alles in breedte en hoogte? node tools/devices.cjs [url]
const { chromium, devices } = require('/root/tools/pw/node_modules/playwright-core')
const LIST = ['Galaxy A54 app', 'Galaxy A54', 'iPhone 14', 'iPhone 14 app', 'iPhone SE', 'Galaxy S24', 'Galaxy S24 app', 'Galaxy S8', 'Galaxy A55', 'Galaxy Z Flip 7', 'Galaxy Z Fold 7 Cover', 'Galaxy Z Fold 7', 'Galaxy S9+', 'Galaxy S5', 'Pixel 9', 'Pixel 7', 'Pixel 8 Pro']
const url = process.argv[2] || 'http://localhost:8795/visvangst/'
;(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })
  for (const name of LIST) {
    // 'app' = vanaf het beginscherm: geen adresbalk, alleen statusbalk (S24: 780 - 24; iPhone 14: 844)
    // Galaxy A54: 1080×2340 bij dpr 2,8125 = 384×832; als app ± 760 hoog, in Chrome ± 700
    const a54 = { ...devices['Galaxy S24'], deviceScaleFactor: 2.8125 }
    const d = name === 'Galaxy A54 app' ? { ...a54, viewport: { width: 384, height: 760 } } : name === 'Galaxy A54' ? { ...a54, viewport: { width: 384, height: 700 } } : name === 'iPhone 14 app' ? { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } : name === 'Galaxy S24 app' ? { ...devices['Galaxy S24'], viewport: { width: 360, height: 756 } } : name === 'Galaxy S24' ? { ...devices['Galaxy S24'], viewport: { width: 360, height: 700 } } : devices[name]
    const ctx = await b.newContext({ ...d, deviceScaleFactor: 1, geolocation: { latitude: +(process.env.LAT || 51.445), longitude: +(process.env.LON || 3.58) }, permissions: ['geolocation'], timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' })
    const p = await ctx.newPage()
    const errs = []
    p.on('pageerror', e => errs.push(e.message))
    await p.goto(url)
    await p.waitForSelector('.hero:not(.loading)', { timeout: 30000 }).catch(() => errs.push('geen hero'))
    await p.waitForTimeout(1200)
    const r = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight
      const wide = [...document.querySelectorAll('.screen *')].filter(e => {
        if (e.closest('.species, .hrow')) return false // die scrollen bewust horizontaal
        const b = e.getBoundingClientRect(); return b.width && (b.right > W + 0.5 || b.left < -0.5)
      }).map(e => e.className || e.tagName).slice(0, 5)
      // tekst die buiten zijn eigen vak valt (niet bewust afgekapt)
      const clipped = [...document.querySelectorAll('.big, .verdict, .bestline, .dayname b, .water button, .sp span, .th')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className + ':' + e.textContent.trim().slice(0, 20))
      const last = document.querySelector('.daycard')
      const empty = last ? Math.round(H - last.getBoundingClientRect().bottom) : 0
      return { W, H, scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, wide, clipped, empty }
    })
    const fits = r.scrollH > r.H ? `${r.scrollH - r.H}px te hoog` : r.empty > 40 ? `${r.empty}px leeg onderaan` : 'past'
    console.log(`${name.padEnd(22)} ${r.W}x${r.H}  ${fits}${r.scrollW > r.W ? '  TE BREED ' + r.scrollW : ''}${r.wide.length ? '  buiten beeld: ' + r.wide.join(',') : ''}${r.clipped.length ? '  afgekapt: ' + r.clipped.join(' | ') : ''}${errs.length ? '  FOUT: ' + errs.join(';') : ''}`)
    await p.screenshot({ path: `/tmp/dev-${name.replace(/\W+/g, '_')}.png` })
    await ctx.close()
  }
  await b.close()
})()
