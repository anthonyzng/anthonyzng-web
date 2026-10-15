---
name: verify-ui
description: Check a frontend change in the browser across widths, both themes, both languages and reduced motion. Use after any change the home page, admin panel or another page renders, before shipping.
---

# Verify a UI change

1. Start the dev server with the preview tool: `preview_start {name: "frontend"}` (http://localhost:5173).
   The page shows the bundled content snapshot; start `backend` too only when the change depends on the live API.
2. For each page the change touches, cover this matrix (skip the cells the change cannot affect, and say which):

   | Axis | Values | How |
   |------|--------|-----|
   | Width | 375, 768, 1280 | `resize_window` (`mobile`, `tablet`, `desktop`) |
   | Theme | light, dark | `resize_window {colorScheme}` or the theme toggle (`localStorage.theme`) |
   | Language | `/en`, `/zh-hant` | navigate |
   | Motion | normal, reduced | DevTools emulation via `javascript_tool` is not possible: check the reduced-motion branch by reading the code path, and say so |

3. In each cell check:
   - `read_console_messages {onlyErrors: true}`: no errors or CSP violations.
   - `read_page`: the content is there, headings and landmarks are right, no English left on the Chinese page.
   - Keyboard: Tab through the changed area; focus is visible and never lands on hidden or faded content.
   - No horizontal scroll at 375 (`document.documentElement.scrollWidth <= innerWidth`).
   - Contrast stays WCAG AA (text tokens only; never raw hex in components).
4. Scroll-driven changes: scroll through the section and confirm triggers fire, nothing jumps, and
   `ScrollTrigger.getAll()` holds no trigger for a removed node after a language switch.
5. Take a screenshot of the most relevant cell as proof, reset the viewport (`resize_window {preset: "desktop"}`),
   and report the matrix with pass / skipped per cell.
