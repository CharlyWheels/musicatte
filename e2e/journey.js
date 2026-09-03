const { chromium } = require('playwright')

const BASE = 'http://127.0.0.1:5199'
const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  const email = `e2e-${Date.now()}@example.com`

  // 1. front page
  await page.goto(BASE, { waitUntil: 'networkidle' })
  check('front page renders', await page.locator('h1', { hasText: 'Musicatte' }).isVisible())

  // 2. register + login
  await page.goto(`${BASE}/registro`, { waitUntil: 'networkidle' })
  await page.fill('input[type=email]', email)
  const pwFields = page.locator('input[type=password]')
  const pwCount = await pwFields.count()
  for (let i = 0; i < pwCount; i++) await pwFields.nth(i).fill('password123')
  await page.click('button[type=submit]')
  await page.waitForTimeout(1500)
  if (!page.url().includes('mis-partituras')) {
    await page.goto(`${BASE}/entrar`, { waitUntil: 'networkidle' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', 'password123')
    await page.click('button[type=submit]')
    await page.waitForTimeout(1500)
  }
  check('signed in', await page.locator('text=' + email).first().isVisible().catch(() => false),
        'url=' + page.url())

  // 3. editor loads a blank score
  await page.goto(`${BASE}/editor`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.score-view svg', { timeout: 25000 })
  const measures = await page.locator('.score-view g[data-class="measure"]').count()
  check('editor opens a blank score', measures === 4, `${measures} measures`)
  check('a blank score is not reported as broken',
        (await page.locator('text=/no cuadran|no cuadra/').count()) === 0)

  // 3b. enter notes by clicking on the staff at the pitch wanted
  await page.locator('button[title^="Añadir notas"]').click()
  await page.waitForTimeout(300)
  for (let i = 0; i < 4; i++) {
    const target = await page.evaluate(() => {
      const el = document.querySelectorAll('.score-view g[data-class="staff"]')[0]
      const b = el.getBoundingClientRect()
      return { x: b.x, y: b.y, w: b.width, h: b.height }
    })
    await page.mouse.click(target.x + target.w * (0.25 + i * 0.12), target.y + target.h * 0.5)
    await page.waitForTimeout(350)
  }
  await page.keyboard.press('Escape')
  const noteCount = await page.locator('.score-view g[data-class="note"]').count()
  check('notes can be entered by clicking at a pitch', noteCount === 4, `${noteCount} notes`)
  check('a filled measure is not flagged',
        (await page.locator('text=/no cuadran|no cuadra/').count()) === 0)

  // 4. select a note -> context panel shows it.
  // Clicking by coordinate, the way a person does: Playwright will not dispatch
  // on the note <g> itself because the enclosing <svg> is the topmost element
  // over most of the group's box, which is exactly why the app selects the
  // nearest note to the point rather than requiring a direct hit.
  const clickAt = async (locator, fx = 0.5, fy = 0.5) => {
    const b = await locator.boundingBox()
    await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy)
  }
  await clickAt(page.locator('.score-view g[data-class="note"]').first())
  await page.waitForTimeout(500)
  const selected = await page.locator('.score-view g.is-selected').count()
  check('clicking selects a note', selected === 1, `${selected} selected`)
  const panelText = await page.locator('aside').innerText()
  check('panel names the selected note', /Do4|Negra/.test(panelText), panelText.slice(0, 60).replace(/\n/g, ' | '))

  // 5. change duration -> document changes
  await page.locator('aside button[title="Blanca"]').click()
  await page.waitForTimeout(600)
  const panelAfter = await page.locator('aside').innerText()
  check('duration change applied', /Blanca/.test(panelAfter))

  // 6. a measure that no longer adds up is reported by number
  const warnBar = await page.locator('text=/compás 1 \\(/').count()
  check('short measure is flagged with its number', warnBar > 0)
  const band = await page.locator('.score-view .flag-band').count()
  check('the flagged measure is marked on the score', band > 0, `${band} bands`)

  // 7. undo works and the button reflects it
  const undoDisabledBefore = await page.locator('button[title^="Deshacer"]').isDisabled()
  check('undo enabled after an edit', !undoDisabledBefore)
  await page.locator('button[title^="Deshacer"]').click()
  await page.waitForTimeout(600)
  const panelUndone = await page.locator('aside').innerText()
  check('undo restored the duration', /Negra/.test(panelUndone))

  // 8. title edit does NOT crash (the old bug threw on the first keystroke)
  await page.fill('input[aria-label="Título de la partitura"]', 'Estudio de prueba')
  await page.waitForTimeout(400)
  check('editing the title does not throw', errors.filter((e) => /insertBefore|null/.test(e)).length === 0,
        errors.slice(0, 2).join(' / '))

  // 9. add a measure
  const before = await page.locator('.score-view g[data-class="measure"]').count()
  await page.locator('button[title="Añadir un compás al final"]').click()
  await page.waitForTimeout(900)
  const after = await page.locator('.score-view g[data-class="measure"]').count()
  check('adding a measure works', after === before + 1, `${before} -> ${after}`)

  // 10. insert mode reaches an empty measure further along
  const beforeInsert = await page.locator('.score-view g[data-class="note"]').count()
  await page.locator('button[title^="Añadir notas"]').click()
  await page.waitForTimeout(300)
  const target = await page.evaluate(() => {
    const staves = [...document.querySelectorAll('.score-view g[data-class="staff"]')]
    const el = staves[staves.length - 1]
    const b = el.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  })
  // Above the top line: a ledger-line note, which the old hit area could not
  // reach at all because the staff group is only its five lines tall.
  await page.mouse.click(target.x + target.w * 0.5, target.y - 10)
  await page.waitForTimeout(900)
  const notesAfterInsert = await page.locator('.score-view g[data-class="note"]').count()
  check('a note can be added above the staff', notesAfterInsert > beforeInsert,
        `${beforeInsert} -> ${notesAfterInsert}`)
  await page.keyboard.press('Escape')

  // 11. save -> the score gets an id and the URL follows
  await page.locator('button:has-text("Guardar")').first().click()
  await page.waitForTimeout(2500)
  check('save gives the score an address', /\/editor\/\d+/.test(page.url()), page.url())

  // 12. title survived the save round trip (the old bug lost it)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.score-view svg', { timeout: 25000 })
  const titleAfterReload = await page.inputValue('input[aria-label="Título de la partitura"]')
  check('title survives save and reload', titleAfterReload === 'Estudio de prueba', `"${titleAfterReload}"`)

  // 13. publish -> visible in the repository AND openable
  await page.locator('button[title*="Publicar en el repositorio"]').click()
  await page.waitForTimeout(2000)
  await page.goto(`${BASE}/repositorio`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const card = page.locator('a[href^="/partitura/"]').first()
  check('published score appears in the repository', await card.count() > 0)

  // 14. the public page renders the score -- the dead end in the old version
  await card.click()
  await page.waitForTimeout(1200)
  await page.waitForSelector('.score-view svg', { timeout: 25000 })
  const publicNotes = await page.locator('.score-view g[data-class="note"]').count()
  check('public score page renders the music', publicNotes > 0, `${publicNotes} notes`)
  check('public page shows an author, not an email',
        !(await page.locator('main').innerText()).includes('@'))

  // 15. downloading MusicXML gives real MusicXML
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 25000 }),
    page.locator('button[title*="MuseScore"]').first().click(),
  ])
  const path = await download.path()
  const content = require('fs').readFileSync(path, 'utf8')
  check('MusicXML download is really MusicXML',
        content.includes('<score-partwise'), content.slice(0, 60))
  check('download is not MEI with an xml name', !content.includes('<mei'))

  // 16. playback runs without throwing
  await page.locator('button:has-text("Escuchar")').click()
  await page.waitForTimeout(1500)
  check('playback starts', await page.locator('button:has-text("Parar")').count() > 0)

  // 17. no unexpected console errors overall
  const real = errors.filter((e) => !/favicon|AudioContext|autoplay|Failed to load resource/i.test(e))
  check('no unexpected console errors', real.length === 0, real.slice(0, 3).join(' / '))

  await page.screenshot({ path: process.env.SHOT || '/tmp/e2e.png', fullPage: false })
  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2) })
