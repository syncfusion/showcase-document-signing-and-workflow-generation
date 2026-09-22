import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PdfViewerComponent,
  Toolbar,
  Magnification,
  Navigation,
  FormFields,
  FormDesigner,
  Inject,
} from '@syncfusion/ej2-react-pdfviewer'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, PenLine, Type, Loader2, ListChecks } from 'lucide-react'
import { getDocument } from '../../data/documents'
import { RECIPIENTS } from '../../data/recipients'
import { getPreparedDoc, getSessionDocument } from '../../data/sessionStore'
import { getAssetBasePath } from '../../basePath'
import { finalizeSignedPdf } from '../../exportPdf'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MobileSheet } from '../../components/MobileSheet'
import './SignDocument.css'

interface SignFlowFieldBounds {
  X: number
  Y: number
  Width: number
  Height: number
}

interface SignFlowFormField {
  id: string
  name: string
  type: string
  value?: string
  isRequired?: boolean
  isReadOnly?: boolean
  isChecked?: boolean
  isSelected?: boolean
  bounds: SignFlowFieldBounds
}

// A field counts as "filled" differently per type: Checkbox/RadioButton don't populate `.value`
// (FormFieldModel carries isChecked/isSelected instead, per the installed .d.ts) — text/date/
// dropdown/signature/initial fields all use `.value`.
const isFieldFilled = (f: SignFlowFormField) =>
  Boolean(f.isChecked) || Boolean(f.isSelected) || Boolean(f.value && f.value.length > 0)

// Web fonts (loaded in index.html), not OS-specific names — renders consistently everywhere,
// rather than silently falling back when a font like "Brush Script MT" isn't installed. The SDK
// caps this at exactly 4 entries (documented: "maximum font name limit is 4 so key value should
// be 0 to 3").
const TYPE_SIGNATURE_FONTS = { 0: 'Priestacy', 1: 'Runethia', 2: 'Rustic Roadway', 3: 'Symphonie Calligraphy' }

const SEED_FIELDS: Array<{ type: 'SignatureField' | 'Textbox'; name: string; bounds: SignFlowFieldBounds; label: string; icon: 'pen' | 'type' }> = [
  { type: 'SignatureField', name: 'signature_1', bounds: { X: 56, Y: 690, Width: 220, Height: 56 }, label: 'Your signature', icon: 'pen' },
  { type: 'Textbox', name: 'printed_name_1', bounds: { X: 320, Y: 700, Width: 220, Height: 38 }, label: 'Printed name', icon: 'type' },
]

export function SignDocument() {
  const viewerRef = useRef<PdfViewerComponent>(null)
  const [fields, setFields] = useState<SignFlowFormField[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [documentReady, setDocumentReady] = useState(false)
  const seededRef = useRef(false)
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { documentId } = useParams<{ documentId?: string }>()
  const prepared = useMemo(() => (documentId ? getPreparedDoc(documentId) : null), [documentId])
  const activeDocument = useMemo(() => getSessionDocument(documentId) ?? getDocument(documentId), [documentId])
  const signer = prepared?.recipients?.[0] ?? RECIPIENTS[0]
  const getViewer = (): any => {
    const ref: any = viewerRef.current
    if (ref?.importFormFields) return ref
    return (document.getElementById('signflow-sign-viewer') as any)?.ej2_instances?.[0] ?? null
  }
  const getFd = (): any => {
    const ref: any = viewerRef.current
    if (ref?.formDesigner?.addFormField) return ref.formDesigner
    return (document.getElementById('signflow-sign-viewer') as any)?.ej2_instances?.[0]?.formDesigner ?? null
  }

  const refreshFields = useCallback(() => {
    const collection = getViewer()?.retrieveFormFields() as SignFlowFormField[] | undefined
    // retrieveFormFields() appears to return the same array/objects mutated in place rather than
    // fresh ones, so React's setState bails out on reference equality after the first call unless
    // we force a new reference (shallow-copy the array and each field) on every read.
    if (Array.isArray(collection)) setFields(collection.map((f) => ({ ...f })))
  }, [])

  // Strip the recipient-color field borders/backgrounds used during Prepare/Sign (editing
  // chrome, not meant to appear in the delivered document) on the LIVE viewer before saving —
  // saveAsBlob() bakes in a field's current appearance, and re-clearing colors after the fact
  // on the already-saved bytes doesn't reliably regenerate a field's cached appearance stream
  // (see exportPdf.ts's finalizeSignedPdf comment for the confirmed failure case). Runs only at
  // submit time (reverted from also running on document load) — the colored borders during
  // active signing are intentional/useful, only the exported copy needs to be clean.
  const clearFieldChrome = useCallback(() => {
    const fd = getFd()
    const currentFields = getViewer()?.retrieveFormFields() ?? []
    for (const f of currentFields) {
      if (!f?.id) continue
      try {
        fd?.updateFormField(f.id, { borderColor: 'transparent', backgroundColor: 'transparent' } as never)
      } catch {
        // Best-effort — a field that can't be restyled still gets signed and exported.
      }
    }
  }, [])

  const handleDocumentLoad = useCallback(() => {
    setDocumentReady(true)
    if (seededRef.current) return
    seededRef.current = true
    if (prepared?.fields?.length) {
      // Recreate the fields designed in Prepare & Design (handed over via the session store).
      for (const pf of prepared.fields) {
        try {
          const opts: Record<string, unknown> = {
            name: pf.name,
            bounds: pf.bounds,
            isRequired: pf.isRequired,
            customData: { semantic: pf.semantic, recipientId: pf.recipientId },
          }
          // Drafter-set content (Image/Label/Hyperlink) — lock it so the signer can't type into
          // what should just display the drafter's image/text, not collect signer input.
          if (pf.isReadOnly) opts.isReadOnly = true
          if (pf.value) opts.value = pf.value // drafter-set default text / date
          getFd()?.addFormField(pf.base as never, opts as never)
          // Drafter-added image: paint it onto the field element once rendered.
          if (pf.imageData) {
            const data = pf.imageData
            const name = pf.name
            setTimeout(() => {
              const coll: any[] = getFd()?.formFieldCollections || (viewerRef.current as any)?.formFieldCollections || []
              const ff = coll.find((c) => c?.name === name)
              const el = ff && document.getElementById(ff.id)
              if (el) {
                el.style.backgroundImage = `url("${data}")`
                el.style.backgroundSize = 'contain'
                el.style.backgroundRepeat = 'no-repeat'
                el.style.backgroundPosition = 'center'
                const inner = el.querySelector('input, textarea') as HTMLElement | null
                if (inner) inner.style.background = 'transparent'
              }
            }, 300)
          }
        } catch { /* best-effort */ }
      }
      setTimeout(refreshFields, 200)
    } else {
      for (const seed of SEED_FIELDS) {
        getFd()?.addFormField(seed.type, { name: seed.name, bounds: seed.bounds, isRequired: true } as never)
      }
      setTimeout(refreshFields, 0)
    }
  }, [refreshFields, prepared])

  // formFieldFocusOut / formFieldPropertiesChange don't reliably fire for every value commit
  // (same lesson as formDesigner.updateFormField in Prepare & Design — see CLAUDE.md). Poll the
  // authoritative field collection directly instead of trusting the event round-trip.
  useEffect(() => {
    const interval = setInterval(refreshFields, 800)
    return () => clearInterval(interval)
  }, [refreshFields])

  const requiredFields = fields.filter((f) => f.isRequired)
  const gateFields = requiredFields.length ? requiredFields : fields
  const completedCount = gateFields.filter(isFieldFilled).length
  const allComplete = gateFields.length > 0 && completedCount === gateFields.length

  const focusField = (name: string) => {
    viewerRef.current?.focusFormField(name)
  }

  // Read-only fields (Image/Label/Hyperlink — drafter-set content) need no signer action, so they
  // don't belong in a "things you still need to do" list, even though they're real fields.
  const fieldButtons = fields.filter((f) => !f.isReadOnly).map((f) => {
    const done = isFieldFilled(f)
    const isSig = /signature|initial|drawing/i.test(f.name) || /Signature/i.test(f.type || '')
    return (
      <button
        key={f.id || f.name}
        className={`sign-field${done ? ' sign-field--done' : ''}`}
        onClick={() => focusField(f.name)}
      >
        <span className="sign-field__dot">{done && <Check size={11} />}</span>
        {isSig ? <PenLine size={14} /> : <Type size={14} />}
        <span>{f.name}</span>
      </button>
    )
  })

  const handleSubmit = async () => {
    setSubmitting(true)
    // Safety net — chrome is already cleared right after seeding (see clearFieldChrome), but
    // reapply in case the SDK re-painted default styling while the signer filled fields in.
    clearFieldChrome()
    await new Promise((resolve) => setTimeout(resolve, 200))

    // saveAsBlob()'s documented return type is Blob, but treat it defensively as possibly async —
    // Promise.resolve() correctly handles either a plain Blob or a Promise<Blob>.
    const raw = viewerRef.current?.saveAsBlob()
    const signedBlob = await Promise.resolve(raw)
    const blob = signedBlob ? await finalizeSignedPdf(signedBlob) : undefined
    const blobUrl = blob ? URL.createObjectURL(blob) : undefined
    navigate('/completed', {
      state: {
        documentName: activeDocument.name,
        signerName: signer.name,
        signedAt: new Date().toISOString(),
        blobUrl,
      },
    })
  }

  // Default the Add Signature/Initial dialog to the TYPE tab (typed signatures use our fonts).
  useEffect(() => {
    let obs: MutationObserver | null = null
    let timer: number | undefined
    const clickType = () => {
      const dd = document.getElementById('signflow-sign-viewer_signature_window')
      if (!dd || !dd.classList.contains('e-popup-open')) return
      const items = Array.from(dd.querySelectorAll('.e-toolbar-item')) as HTMLElement[]
      const typeItem = items.find((it) => it.querySelector('.e-tab-text')?.textContent === 'TYPE')
      if (typeItem && !typeItem.classList.contains('e-active')) {
        ;(typeItem.querySelector('.e-tab-wrap') as HTMLElement | null)?.click()
      }
    }
    const selectType = () => {
      const dlg = document.getElementById('signflow-sign-viewer_signature_window') as HTMLElement | null
      if (!dlg || !dlg.classList.contains('e-popup-open')) return
      ;[0, 120, 300, 600].forEach((d) => window.setTimeout(clickType, d))
    }
    const attach = () => {
      const dlg = document.getElementById('signflow-sign-viewer_signature_window')
      if (!dlg) return false
      selectType()
      obs = new MutationObserver(selectType)
      obs.observe(dlg, { attributes: true, attributeFilter: ['class'] })
      return true
    }
    // Workaround: the Add INITIAL dialog ignores typeSignatureFonts (uses Helvetica/Times/
    // Courier/Symbol) even though the setting is applied — unlike Add Signature. Remap those
    // defaults to our custom signature fonts on the preview elements (the created initial picks
    // up the preview's font).
    const FONT_MAP: Record<string, string> = {
      helvetica: 'Priestacy', 'times new roman': 'Runethia', times: 'Runethia',
      courier: 'Rustic Roadway', 'courier new': 'Rustic Roadway', symbol: 'Symphonie Calligraphy',
    }
    const mapFonts = () => {
      const dlg = document.getElementById('signflow-sign-viewer_signature_window')
      if (!dlg || !dlg.classList.contains('e-popup-open')) return
      dlg.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (el.children.length) return
        const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
        const target = FONT_MAP[fam]
        if (target) el.style.setProperty('font-family', `"${target}"`, 'important')
      })
    }
    const fontTimer = window.setInterval(mapFonts, 200)

    if (!attach()) {
      timer = window.setInterval(() => { if (attach() && timer) { clearInterval(timer); timer = undefined } }, 500)
      window.setTimeout(() => { if (timer) clearInterval(timer) }, 15000)
    }
    return () => { if (timer) clearInterval(timer); clearInterval(fontTimer); obs?.disconnect() }
  }, [])

  return (
    <div className="workspace-page sign-document">
      <div className="sign-topbar">
        <Link to="/" className="sign-back" aria-label="Back to SignFlow">
          <ArrowLeft size={16} />
        </Link>

        <div className="sign-titleblock">
          <div className="sign-title">{activeDocument.name}</div>
          <div className="sign-title__meta">
            Waiting for your signature &middot; {signer.name}
          </div>
        </div>

        <div className="sign-topbar__spacer" />

        <span className="sign-progress">
          {completedCount} of {gateFields.length} fields completed
        </span>

        <button
          className="sign-btn sign-btn--primary"
          disabled={!allComplete || submitting}
          onClick={handleSubmit}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>

      <div className="sign-body">
        <div className="sign-canvas">
          {!documentReady && (
            <div className="sign-loading">
              <Loader2 size={20} className="sign-loading__spinner" />
              Loading document&hellip;
            </div>
          )}
          <PdfViewerComponent
            ref={viewerRef}
            id="signflow-sign-viewer"
            documentPath={/^(blob:|https?:)/.test(activeDocument.path) ? activeDocument.path : window.location.origin + getAssetBasePath() + activeDocument.path}
            resourceUrl={window.location.origin + getAssetBasePath() + '/ej2-pdfviewer-lib'}
            isFormDesignerToolbarVisible={false}
            style={{ height: '100%', visibility: documentReady ? 'visible' : 'hidden' }}
            documentLoad={handleDocumentLoad}
            formFieldFocusOut={refreshFields}
            formFieldPropertiesChange={refreshFields}
            // InitialFieldSettingsModel has no typeSignatureFonts of its own (checked the
            // installed .d.ts — the skill doc's "Applicable To: Signature, Initial" is wrong on
            // this point). The Add Initial dialog's font list instead comes from
            // handWrittenSignatureSettings (note capital W) — confirmed live: without this prop
            // Initials showed the default Helvetica/Times New Roman/Courier/Symbol list even
            // though signatureFieldSettings was already set.
            signatureFieldSettings={{ typeSignatureFonts: TYPE_SIGNATURE_FONTS }}
        initialFieldSettings={{ typeSignatureFonts: TYPE_SIGNATURE_FONTS } as never}
            handWrittenSignatureSettings={{ typeSignatureFonts: TYPE_SIGNATURE_FONTS }}
          >
            <Inject services={[Toolbar, Magnification, Navigation, FormFields, FormDesigner]} />
          </PdfViewerComponent>
        </div>

        {!isMobile && (
          <aside className="sign-fields">
            <div className="sign-fields__eyebrow">Fields to complete</div>
            {fieldButtons}
          </aside>
        )}
      </div>

      {isMobile && (
        <>
          <div className="sign-mobile-bar">
            <button className="sign-mobile-bar__btn" onClick={() => setSheetOpen(true)}>
              <ListChecks size={16} />
              Fields to complete ({completedCount}/{gateFields.length})
            </button>
          </div>
          <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Fields to complete">
            <div className="sign-fields sign-fields--sheet">{fieldButtons}</div>
          </MobileSheet>
        </>
      )}
    </div>
  )
}
