/**
 * Edge-fade geometry for a vertical scroll container (dashboard widget bodies).
 *
 * Given a scroll box's live metrics, decides whether to fade the TOP and/or
 * BOTTOM edge: a fade is shown on an edge only when there is content hidden in
 * that direction. So a widget whose content fits shows no fade, and one scrolled
 * to an extreme fades only the side that still has more. Pure + deterministic —
 * the component feeds it `scrollTop`/`clientHeight`/`scrollHeight` on scroll and
 * resize and maps the result to two gradient overlays.
 *
 * The 1px slack absorbs the sub-pixel `scrollTop` a browser can settle on after a
 * wheel/touch gesture, so the bottom fade cleanly disappears at the true end.
 */
export function scrollFadeState({
  scrollTop,
  clientHeight,
  scrollHeight,
}: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}): { top: boolean; bottom: boolean } {
  const maxScroll = scrollHeight - clientHeight
  const overflowing = maxScroll > 1
  return {
    top: overflowing && scrollTop > 1,
    bottom: overflowing && scrollTop < maxScroll - 1,
  }
}
