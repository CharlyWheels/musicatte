/**
 * What kind of device is this, as far as the interface needs to care.
 *
 * Two questions, and they are not the same one. **Size** decides the layout:
 * a tablet held in portrait has room for a side panel, a phone does not.
 * **Pointer** decides how big things have to be and which affordances make
 * sense: a keyboard shortcut hint is noise on a touch screen, and a 33px icon
 * button is a miss.
 *
 * Asking about size alone gets both wrong -- a touch laptop is wide, and a
 * desktop window dragged narrow is not suddenly a phone.
 */

import { useCallback, useSyncExternalStore } from 'react'

/** Matches the layout breakpoints used in the components. */
const QUERIES = {
  // Below this, one column and a bottom sheet.
  phone: '(max-width: 767px)',
  // A tablet in portrait lands here: room for a side panel, still touch.
  tablet: '(min-width: 768px) and (max-width: 1179px)',
  // Fingers rather than a mouse: bigger targets, no hover-only affordances.
  coarse: '(pointer: coarse)',
  // No hover means tooltips never appear, so they cannot carry information.
  noHover: '(hover: none)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
}

function match(query) {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(query).matches
}

/**
 * Subscribe to one media query.
 *
 * Through useSyncExternalStore rather than an effect that copies the value
 * into state: matchMedia *is* an external store, and reading it during render
 * means the first paint is already correct instead of being corrected a frame
 * later -- which for a layout switch is a visible flash of the wrong layout.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => match(query), [query])
  // Server rendering has no viewport; the desktop layout is the safe default.
  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * @returns {{isPhone: boolean, isTablet: boolean, isTouch: boolean,
 *   hasHover: boolean, isCompact: boolean, reducedMotion: boolean}}
 */
export function useDevice() {
  const isPhone = useMediaQuery(QUERIES.phone)
  const isTablet = useMediaQuery(QUERIES.tablet)
  const isTouch = useMediaQuery(QUERIES.coarse)
  const noHover = useMediaQuery(QUERIES.noHover)
  const reducedMotion = useMediaQuery(QUERIES.reducedMotion)

  return {
    isPhone,
    isTablet,
    isTouch,
    hasHover: !noHover,
    // "Compact" is about the layout only: a phone, or a narrow window.
    isCompact: isPhone,
    reducedMotion,
  }
}

export { QUERIES }
