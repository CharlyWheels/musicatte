/**
 * Reading and marking up the rendered score SVG.
 *
 * Kept apart from the component so both the editor and the review screen can
 * use it, and so the component file exports only a component.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** The MEI id of a rendered element, which is stable across pages. */
export function elementIdOf(group) {
  return group?.getAttribute('data-id') || null
}

/**
 * Which staff of its system this is.
 *
 * Verovio does not emit data-n on staff groups, so position within the measure
 * is the available signal -- and within one measure it is reliable, because
 * staves are rendered top to bottom.
 */
export function staffNumberOf(group) {
  const label = group.getAttribute('data-n')
  if (label) return parseInt(label, 10)
  const measure = group.closest('g[data-class="measure"]')
  const staves = Array.from(measure?.querySelectorAll('g[data-class="staff"]') || [])
  const index = staves.indexOf(group)
  return index >= 0 ? index + 1 : 1
}

/**
 * Where a staff's lines are on screen.
 *
 * Staff lines are the only thin, wide shapes inside a staff group, which makes
 * them findable without depending on Verovio's internal markup.
 */
export function staffLineGeometry(staffGroup) {
  const ys = []
  for (const shape of staffGroup.querySelectorAll('path, line, rect')) {
    const box = shape.getBoundingClientRect()
    if (box.height <= 3 && box.width > 20) ys.push(box.top + box.height / 2)
  }
  const lines = [...new Set(ys.map((y) => Math.round(y * 2) / 2))].sort((a, b) => a - b)
  if (lines.length < 2) return null
  const top = lines[0]
  const spacing = (lines[lines.length - 1] - top) / (lines.length - 1)
  if (!spacing || !Number.isFinite(spacing)) return null
  return { top, spacing, lines }
}

export function applySelection(container, selection, className = 'is-selected') {
  if (!container) return
  for (const element of container.querySelectorAll(`.${className}`)) {
    element.classList.remove(className)
  }
  for (const id of selection) {
    const element = container.querySelector(`g[data-id="${id}"]`)
    if (element) element.classList.add(className)
  }
}

/**
 * Mark the measures whose contents do not add up.
 *
 * With a translucent band behind the bar rather than by recolouring its ink:
 * tinting the notes turned a score where every measure was still being filled
 * completely orange, which is noise, not information.
 */
export function markFlagged(container, measureIds) {
  if (!container) return
  for (const band of container.querySelectorAll('.flag-band')) band.remove()
  if (!measureIds.length) return

  const wanted = new Set(measureIds)
  for (const group of container.querySelectorAll('g[data-class="measure"]')) {
    const id = elementIdOf(group)
    if (!id || !wanted.has(id)) continue
    let box
    try {
      box = group.getBBox()
    } catch {
      continue
    }
    if (!box || !box.width) continue
    const band = document.createElementNS(SVG_NS, 'rect')
    band.setAttribute('class', 'flag-band')
    // A little breathing room so the band reads as behind the bar.
    band.setAttribute('x', String(box.x - 40))
    band.setAttribute('y', String(box.y - 120))
    band.setAttribute('width', String(box.width + 80))
    band.setAttribute('height', String(box.height + 240))
    group.insertBefore(band, group.firstChild)
  }
}

/** Bring a measure into view and flash it, for "go to measure 7". */
export function revealMeasure(container, measureId) {
  if (!container || !measureId) return false
  const group = Array.from(container.querySelectorAll('g[data-class="measure"]')).find(
    (candidate) => elementIdOf(candidate) === measureId,
  )
  if (!group) return false
  group.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  group.classList.remove('is-revealed')
  // Reflow so the animation restarts when the same measure is asked for twice.
  void group.getBoundingClientRect()
  group.classList.add('is-revealed')
  window.setTimeout(() => group.classList.remove('is-revealed'), 1400)
  return true
}
