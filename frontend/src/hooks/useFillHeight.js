/**
 * Give an element exactly the height that is left below it.
 *
 * The editor needs the score to fill the screen, and on a phone "the screen"
 * is not a number you can write down: the header, a toolbar that is one row or
 * two, a warning strip that comes and goes, the bottom navigation, the tool
 * sheet, and an address bar that slides away as you scroll. Adding those up as
 * constants produced a frame that was tens of pixels wrong in either direction
 * -- either a dead gap under the score or part of it hidden behind the sheet.
 *
 * So it is measured. The height is written straight onto the element rather
 * than kept in state: a resize or a scroll that moves the address bar would
 * otherwise re-render the whole editor, and there is nothing else that needs
 * to know the number.
 */

import { useCallback, useLayoutEffect } from 'react'

export function useFillHeight(ref, { reserveBottom = 0, enabled = true, min = 200 } = {}) {
  const apply = useCallback(() => {
    const element = ref.current
    if (!element) return
    if (!enabled) {
      element.style.removeProperty('height')
      return
    }
    // visualViewport is the part actually visible, which is what changes when
    // a mobile address bar or an on-screen keyboard appears.
    const viewport = window.visualViewport?.height ?? window.innerHeight
    const top = element.getBoundingClientRect().top
    const height = Math.max(min, Math.round(viewport - top - reserveBottom))
    element.style.height = `${height}px`
  }, [ref, enabled, reserveBottom, min])

  useLayoutEffect(() => {
    apply()

    const onChange = () => apply()
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    window.visualViewport?.addEventListener('resize', onChange)
    window.visualViewport?.addEventListener('scroll', onChange)

    // The element's own top moves when something above it grows -- a toolbar
    // wrapping to a second row, a warning strip appearing.
    const observer = new ResizeObserver(onChange)
    const parent = ref.current?.parentElement
    if (parent) observer.observe(parent)

    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
      window.visualViewport?.removeEventListener('resize', onChange)
      window.visualViewport?.removeEventListener('scroll', onChange)
      observer.disconnect()
    }
  }, [apply, ref])
}
