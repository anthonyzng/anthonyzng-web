// Apply the theme before first paint to avoid a light/dark flash. Loaded by index.html as a
// blocking script (a file rather than inline, so the CSP needs no 'unsafe-inline').
// Keep the storage key in sync with src/theme/theme.ts.
;(function () {
  var stored = null
  try {
    stored = localStorage.getItem('theme')
  } catch {
    // Storage blocked (private mode, disabled cookies): follow the system theme.
  }
  var dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
})()
