const VIEWPORT_MARGIN = 8
const SUBMENU_GAP = 6
const VERTICAL_OFFSET = 4

export function getSubmenuPosition(triggerRect, submenuSize, viewport) {
  const fitsRight = triggerRect.right + SUBMENU_GAP + submenuSize.width <= viewport.width - VIEWPORT_MARGIN
  const unclampedX = fitsRight
    ? triggerRect.right + SUBMENU_GAP
    : triggerRect.left - SUBMENU_GAP - submenuSize.width
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - submenuSize.width - VIEWPORT_MARGIN)
  const x = Math.min(maxX, Math.max(VIEWPORT_MARGIN, unclampedX))

  const unclampedY = triggerRect.top - VERTICAL_OFFSET
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - submenuSize.height - VIEWPORT_MARGIN)
  const y = Math.min(maxY, Math.max(VIEWPORT_MARGIN, unclampedY))

  return { x, y, side: fitsRight ? 'right' : 'left' }
}
