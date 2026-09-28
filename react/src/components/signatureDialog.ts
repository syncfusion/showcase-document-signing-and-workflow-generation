// Enhancements for the PDF Viewer's built-in Add Signature / Add Initial dialog
// (`#<viewerId>_signature_window`, Syncfusion-internal, recreated on every open). Shared by the
// Prepare and Sign viewers. Everything here runs against the live DOM / ej2 instances because the
// dialog exposes no React-level props for these behaviours (see CLAUDE.md, BATCH 3).
import { syncTypeTabPlaceholder } from './signatureTypePlaceholder'

// The Add INITIAL dialog ignores typeSignatureFonts (uses Helvetica/Times/Courier/Symbol) even
// though the setting is applied — unlike Add Signature. Remap those defaults to our custom fonts on
// the preview elements (the created initial picks up the preview's font).
const DEFAULT_FONT_MAP: Record<string, number> = {
  helvetica: 0, 'times new roman': 1, times: 1, courier: 2, 'courier new': 2, symbol: 3,
}

const NO_ANIMATION = { previous: { effect: 'None' }, next: { effect: 'None' } }

interface Options {
  /** Let a signer click an already-signed Signature/Initial field to replace it (Sign screen). */
  allowResign?: boolean
}

export function installSignatureDialogEnhancements(viewerId: string, fonts: string[], opts: Options = {}): () => void {
  const dialogId = `${viewerId}_signature_window`
  const getDialog = () => document.getElementById(dialogId)
  const isOpen = (d: HTMLElement | null): d is HTMLElement => !!d && d.classList.contains('e-popup-open')
  const getViewer = (): any => (document.getElementById(viewerId) as any)?.ej2_instances?.[0] ?? null

  // ---- TYPE tab by default, with no tab-switch animation --------------------------------------
  // Syncfusion always opens the dialog on DRAW. Clicking TYPE afterwards made the Tab component
  // slide the (intentionally white) preview panel in across the dark dialog while it faded in —
  // the dark-mode "black→white flash". Instead, as soon as the dialog's Tab instance exists (the
  // MutationObserver callback runs before the next paint), turn its animation off and select TYPE
  // via the documented Tab API (`animation` + `select(index)`).
  const handledTabs = new WeakSet<Element>()
  const selectTypeTab = () => {
    const tabEl = document.getElementById(`${viewerId}Signature_tab`)
    const tab: any = (tabEl as any)?.ej2_instances?.[0]
    if (!tabEl || !tab || handledTabs.has(tabEl)) return
    handledTabs.add(tabEl)
    tab.animation = NO_ANIMATION
    const headers = Array.from(tabEl.querySelectorAll('.e-tab-text')).map((e) => e.textContent?.trim().toUpperCase())
    const typeIndex = headers.indexOf('TYPE')
    if (typeIndex >= 0 && tab.selectedItem !== typeIndex) tab.select(typeIndex)
  }

  const mapFonts = (dlg: HTMLElement) => {
    dlg.querySelectorAll<HTMLElement>('.e-pv-font-sign').forEach((el) => {
      const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
      const idx = DEFAULT_FONT_MAP[fam]
      if (idx !== undefined && fonts[idx]) el.style.setProperty('font-family', `"${fonts[idx]}"`, 'important')
    })
  }

  // ---- Re-sign an already-signed field (Sign screen) -------------------------------------------
  // By design the SDK makes a signed field inert: form-designer.js renders it with class
  // `e-pdfviewer-signatureformfields-signature` + `pointer-events:none`, and only opens the dialog
  // for targets classed `e-pdfviewer-signatureformfields`. drawSignature() also refuses to add a
  // second `<fieldId>_content` signature. So: on click, briefly present the field as unsigned and
  // replay the pointer sequence so the SDK opens its own dialog for it (old signature stays
  // visible); only when Create is pressed clear the old value via the documented
  // `clearFormFields(field)` so the SDK draws the new one. Cancel/close leaves the old one intact.
  let resignFieldId: string | null = null
  let pendingResign: { id: string; at: number } | null = null
  const replayClick = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', o))
    el.dispatchEvent(new MouseEvent('mousedown', o))
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
    el.dispatchEvent(new MouseEvent('mouseup', { ...o, buttons: 0 }))
    el.dispatchEvent(new MouseEvent('click', { ...o, buttons: 0 }))
  }
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    const wrapper = target?.closest?.('.foreign-object') as HTMLElement | null
    if (!wrapper || !document.getElementById(viewerId)?.contains(wrapper)) return
    const signed = wrapper.querySelector<HTMLElement>('.e-pdfviewer-signatureformfields-signature')
    if (!signed?.id) return
    e.preventDefault()
    e.stopPropagation()
    signed.className = 'e-pdfviewer-signatureformfields'
    signed.style.pointerEvents = ''
    try { replayClick(signed) } finally {
      signed.className = 'e-pdfviewer-signatureformfields-signature'
      signed.style.pointerEvents = 'none'
    }
    // The dialog gets its open class a frame later; armed on the closed→open transition below.
    pendingResign = { id: signed.id, at: performance.now() }
  }
  const onDialogClick = (e: MouseEvent) => {
    if (!resignFieldId) return
    const btn = (e.target as HTMLElement | null)?.closest?.('button')
    const dlg = getDialog()
    if (!btn || !dlg?.contains(btn)) return
    if (/^\s*create\s*$/i.test(btn.textContent ?? '')) {
      const viewer = getViewer()
      const field = viewer?.retrieveFormFields?.().find((f: any) => f?.id === resignFieldId)
      if (field) viewer.clearFormFields(field)
    }
    resignFieldId = null
  }

  // Re-signing a TYPED signature: put the previous text back into the TYPE box and re-select the
  // font it was signed in, so the signer edits rather than retypes. The SDK stores a typed
  // signature as signatureType 'Text' (value = the text) with the font on its `<id>_content`
  // SignatureText annotation; drawn/uploaded ones ('Path'/'Image') leave the box empty.
  const prefillTypedSignature = (dlg: HTMLElement, fieldId: string) => {
    const viewer = getViewer()
    const field = viewer?.retrieveFormFields?.().find((f: any) => f?.id === fieldId)
    if (!field || field.signatureType !== 'Text' || !field.value) return
    const font: string | undefined = viewer.annotations?.find((a: any) => a?.id === `${fieldId}_content`)?.fontFamily
    const input = dlg.querySelector<HTMLInputElement>('input[id$="_e-pv-Signtext-box"]')
    if (!input || input.value) return
    input.value = String(field.value)
    // The SDK renders its previews from the input's keyup/input handlers.
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'End' }))
    if (!font) return
    window.setTimeout(() => {
      const previews = Array.from(dlg.querySelectorAll<HTMLElement>('[id^="_font_signature"]'))
      const norm = (f: string) => f.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
      previews.find((el) => norm(getComputedStyle(el).fontFamily) === norm(font))?.click()
    }, 60)
  }

  // ---- Wiring ---------------------------------------------------------------------------------
  let openDlg: HTMLElement | null = null
  const onChange = () => {
    const dlg = getDialog()
    if (!isOpen(dlg)) {
      if (dlg) selectTypeTab() // inserted but not yet flagged open — still before first paint
      if (openDlg) resignFieldId = null // open → closed: any re-sign in progress is over
      openDlg = null
      return
    }
    if (dlg !== openDlg) {
      // closed → open: arm a re-sign only if this open came from our replayed click just now.
      resignFieldId = pendingResign && performance.now() - pendingResign.at < 1500 ? pendingResign.id : null
      pendingResign = null
      openDlg = dlg
      selectTypeTab()
      if (resignFieldId) {
        const id = resignFieldId
        window.setTimeout(() => { if (resignFieldId === id && isOpen(getDialog())) prefillTypedSignature(dlg, id) }, 50)
      }
    }
    mapFonts(dlg)
    syncTypeTabPlaceholder(dlg, fonts)
  }
  const observer = new MutationObserver(() => { if (getDialog() || openDlg) onChange() })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  // Safety net for anything an observer batch missed.
  const timer = window.setInterval(onChange, 200)
  if (opts.allowResign) {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onDialogClick, true)
  }
  return () => {
    observer.disconnect()
    clearInterval(timer)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('click', onDialogClick, true)
  }
}
