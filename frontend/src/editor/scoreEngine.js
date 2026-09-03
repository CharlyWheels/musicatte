/**
 * A Verovio engine per editor, rendering one page at a time.
 *
 * Two problems this fixes.
 *
 * **A shared toolkit.** `getToolkit()` returned a module-level singleton, so
 * the editor and the score preview on the detail page loaded different
 * documents into the same instance and overwrote each other. The WebAssembly
 * module is genuinely expensive and is still shared; the toolkit built on top
 * of it is not, and each engine gets its own.
 *
 * **Rendering everything on every keystroke.** The old canvas rebuilt the
 * innerHTML of every page after each edit, so dragging one note through a
 * ten-page score re-rendered ten pages of SVG per pointer step. Pages are
 * cached here and only the ones affected by an edit are thrown away.
 */

let modulePromise = null

/** The WebAssembly module, loaded once for the whole application. */
function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [{ VerovioToolkit }, moduleFactory] = await Promise.all([
        import('verovio/esm'),
        import('verovio/wasm').then((wasm) => wasm.default),
      ])
      const instance = await moduleFactory()
      return { VerovioToolkit, instance }
    })()
  }
  return modulePromise
}

/**
 * Convert a container width in CSS pixels to Verovio's page width units.
 *
 * Verovio renders a page of a fixed width and the SVG is then scaled to fit
 * its container, so a page much wider than the music leaves the notes tiny in
 * a sea of white. Deriving the page width from the container is what makes the
 * engraving come out at a readable size.
 */
export function pageWidthFor(containerPx, scale) {
  const usable = Math.max(320, containerPx - 24)
  return Math.round((usable * 100) / Math.max(20, scale))
}

export const DEFAULT_OPTIONS = {
  scale: 50,
  pageWidth: 2100,
  pageMarginLeft: 50,
  pageMarginRight: 50,
  pageMarginTop: 30,
  pageMarginBottom: 30,
  adjustPageHeight: true,
  breaks: 'auto',
  footer: 'none',
  header: 'none',
  spacingSystem: 8,
  spacingStaff: 8,
  svgViewBox: true,
  svgHtml5: true,
  svgRemoveXlink: true,
  // Ids on every element, which is what makes selection and playback
  // highlighting possible.
  svgAdditionalAttribute: ['note@pname', 'note@oct'],
}

export class ScoreEngine {
  constructor(toolkit) {
    this.toolkit = toolkit
    this.pageCache = new Map()
    this.pageCount = 0
    this.zoom = 1
    this.containerWidth = 0
    this.lastError = ''
    this.destroyed = false
  }

  /**
   * Whether this engine is still usable.
   *
   * Navigating away destroys the engine, and a ResizeObserver or a pending
   * timer can still call into it afterwards. Every entry point checks, rather
   * than throwing "cannot read properties of null" into the console.
   */
  get alive() {
    return !this.destroyed && Boolean(this.toolkit)
  }

  static async create(options = {}) {
    const { VerovioToolkit, instance } = await loadModule()
    const toolkit = new VerovioToolkit(instance)
    const engine = new ScoreEngine(toolkit)
    engine.setOptions(options)
    return engine
  }

  setOptions(options = {}) {
    if (!this.alive) return
    this.toolkit.setOptions({ ...DEFAULT_OPTIONS, ...options })
  }

  setZoom(zoom) {
    if (!this.alive) return false
    const next = Math.max(0.5, Math.min(2.5, zoom))
    if (Math.abs(next - this.zoom) < 0.01) return false
    this.zoom = next
    this.#applyLayout()
    this.relayout()
    return true
  }

  /**
   * Fit the engraving to the width it is being displayed at.
   *
   * Called whenever the container is resized, so the music reflows instead of
   * being scaled down to a thumbnail inside a wide panel.
   */
  setContainerWidth(containerPx) {
    if (!this.alive) return false
    const width = Math.round(containerPx)
    if (!width || Math.abs(width - (this.containerWidth || 0)) < 24) return false
    this.containerWidth = width
    this.#applyLayout()
    this.relayout()
    return true
  }

  #applyLayout() {
    if (!this.alive) return
    const scale = Math.round(DEFAULT_OPTIONS.scale * this.zoom)
    const options = { scale }
    if (this.containerWidth) {
      options.pageWidth = pageWidthFor(this.containerWidth, scale)
    }
    this.setOptions(options)
  }

  /**
   * Load a document. Returns whether Verovio accepted it.
   *
   * `loadData` returning falsy used to go unnoticed, leaving the previous
   * score on screen with no indication that the new one had failed.
   */
  load(data) {
    if (!this.alive) return false
    const accepted = this.toolkit.loadData(data)
    this.pageCache.clear()
    this.pageCount = accepted ? this.toolkit.getPageCount() : 0
    this.lastError = accepted ? '' : this.readLog()
    return Boolean(accepted) && this.pageCount > 0
  }

  readLog() {
    if (!this.alive) return ''
    try {
      return (this.toolkit.getLog() || '').trim()
    } catch {
      return ''
    }
  }

  relayout() {
    if (!this.alive) return
    this.toolkit.redoLayout()
    this.pageCache.clear()
    this.pageCount = this.toolkit.getPageCount()
  }

  /**
   * Recompute only vertical note placement.
   *
   * The fast path for dragging a note up and down: Verovio keeps the existing
   * horizontal layout, so there is no full relayout per pointer step.
   */
  relayoutPitchesOnly() {
    if (!this.alive) return
    this.toolkit.redoPagePitchPosLayout()
    this.pageCache.clear()
  }

  renderPage(page) {
    if (!this.alive) return ''
    if (page < 1 || page > this.pageCount) return ''
    const cached = this.pageCache.get(page)
    if (cached) return cached
    const svg = this.toolkit.renderToSVG(page)
    this.pageCache.set(page, svg)
    return svg
  }

  invalidatePage(page) {
    this.pageCache.delete(page)
  }

  invalidateAll() {
    this.pageCache.clear()
  }

  getMEI() {
    if (!this.alive) return ''
    return this.toolkit.getMEI()
  }

  pageWithElement(id) {
    if (!id || !this.alive) return 0
    try {
      return this.toolkit.getPageWithElement(id) || 0
    } catch {
      return 0
    }
  }

  elementAttributes(id) {
    if (!this.alive) return {}
    try {
      return this.toolkit.getElementAttr(id) || {}
    } catch {
      return {}
    }
  }

  /**
   * Playback schedule: when each note starts and stops.
   *
   * Verovio can also emit a MIDI file, but the timemap keeps the note ids,
   * which is what lets the score highlight what is sounding.
   */
  timemap() {
    if (!this.alive) return []
    try {
      const raw = this.toolkit.renderToTimemap({ includeMeasures: true, includeRests: true })
      return typeof raw === 'string' ? JSON.parse(raw) : raw || []
    } catch {
      return []
    }
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.pageCache.clear()
    // The toolkit holds WebAssembly memory; releasing it matters when the
    // editor is opened and closed repeatedly in one session.
    try {
      this.toolkit.destroy?.()
    } catch {
      /* older builds have no destroy */
    }
    this.toolkit = null
  }
}
