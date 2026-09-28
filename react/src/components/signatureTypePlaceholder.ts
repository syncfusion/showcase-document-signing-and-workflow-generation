// Add Signature / Add Initial dialog, TYPE tab: while the name input is empty, fill the font-
// preview area with "Type here.." rendered in each of the 4 signature fonts, so the signer sees the
// styles before typing. Syncfusion only creates its own previews (_font_signature0..3) once text is
// entered (and leaves them empty after clearing), so we inject look-alike placeholder boxes and swap
// them out as soon as there is text. The dialog is Syncfusion-internal, so this is called from the
// screens' while-open interval and from an input listener for an immediate swap.

export const TYPE_PLACEHOLDER_TEXT = 'Type here..'
const PH_CLASS = 'sf-type-placeholder'

export function syncTypeTabPlaceholder(dlg: HTMLElement, fonts: string[]) {
  const input = dlg.querySelector<HTMLInputElement>('input[id$="_e-pv-Signtext-box"]')
  const area = dlg.querySelector<HTMLElement>('[id$="_font_appearance"]')
  if (!input || !area) return

  if (input.placeholder !== TYPE_PLACEHOLDER_TEXT) {
    // Replace the "Enter your name" float label with a real placeholder.
    input.placeholder = TYPE_PLACEHOLDER_TEXT
    const label = dlg.querySelector<HTMLElement>(`label[for="${input.id}"]`)
    if (label) label.style.display = 'none'
  }
  if (!input.dataset.sfPlaceholderBound) {
    input.dataset.sfPlaceholderBound = '1'
    // Let Syncfusion's own input handler render its previews first, then swap.
    input.addEventListener('input', () => requestAnimationFrame(() => syncTypeTabPlaceholder(dlg, fonts)))
  }

  const empty = !input.value.trim()
  const real = Array.from(area.querySelectorAll<HTMLElement>('[id^="_font_signature"]'))
  const ours = Array.from(area.querySelectorAll<HTMLElement>(`.${PH_CLASS}`))
  real.forEach((el) => { el.style.display = empty ? 'none' : '' })
  if (!empty) { ours.forEach((el) => el.remove()); fitPreviews(area); return }
  if (ours.length === fonts.length) { fitPreviews(area); return }
  ours.forEach((el) => el.remove())
  fonts.forEach((font) => {
    const box = document.createElement('div')
    box.className = `e-pv-font-sign e-pv-signature-text ${PH_CLASS}`
    box.textContent = TYPE_PLACEHOLDER_TEXT
    box.setAttribute('aria-hidden', 'true')
    box.style.cssText = `line-height:1.5;font-family:"${font}";color:#9ca3af;pointer-events:none;`
    area.appendChild(box)
  })
  fitPreviews(area)
}

// Previews use a large base size (index.css, 28px) so typical names fill their box; a long name
// is stepped down until it fits, never below MIN_FIT_PX. Re-fitted only when the text changes.
const MIN_FIT_PX = 14
function fitPreviews(area: HTMLElement) {
  area.querySelectorAll<HTMLElement>('.e-pv-font-sign').forEach((el) => {
    if (el.style.display === 'none' || !el.clientWidth) return
    const text = el.textContent ?? ''
    if (el.dataset.sfFitText === text) return
    el.dataset.sfFitText = text
    el.style.removeProperty('font-size')
    let size = parseFloat(getComputedStyle(el).fontSize)
    while (el.scrollWidth > el.clientWidth && size > MIN_FIT_PX) {
      size -= 1
      el.style.setProperty('font-size', `${size}px`)
    }
  })
}
