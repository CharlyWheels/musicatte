let toolkitPromise = null

export function getToolkit() {
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const { VerovioToolkit } = await import('verovio/esm')
      const createModule = (await import('verovio/wasm')).default
      const VerovioModule = await createModule()
      const tk = new VerovioToolkit(VerovioModule)
      tk.setOptions({
        scale: 40,
        pageWidth: 2200,
        adjustPageHeight: true,
        footer: 'none',
        header: 'none',
        spacingSystem: 6,
        spacingStaff: 6,
        svgViewBox: true,
        svgHtml5: true,
        svgRemoveXlink: true,
      })
      return tk
    })()
  }
  return toolkitPromise
}

export function renderMusicXML(toolkit, musicxml) {
  toolkit.loadData(musicxml)
  return toolkit.renderToSVG(1)
}

export function getMEI(toolkit) {
  return toolkit.getMEI()
}

export function getElementAttr(toolkit, elementId) {
  return toolkit.getElementAttr(elementId)
}
