/**
 * Frosted glass behind a section's text (`.reading-glass` in index.css), shown while the section is
 * the one being read (`useReadingGlass` marks it `data-glass-active`): clearer while the page moves,
 * denser once it rests, so the words stand off the backdrop's stars or bamboo. Decorative. It must
 * never sit inside an element whose opacity drops below 1 (a backdrop root): it would then blur only
 * that element, not the backdrop. So the section fades its `[data-fade]` siblings instead, and the
 * glass follows through `--section-fade` (`useSectionFades`). `className` sets where it reaches.
 */
export function ReadingGlass({ className }: { className: string }) {
  return <span aria-hidden="true" data-glass className={`reading-glass ${className}`} />
}
