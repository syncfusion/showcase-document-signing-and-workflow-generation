import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PdfViewerComponent,
  Toolbar,
  Magnification,
  Navigation,
  FormFields,
  FormDesigner,
  Annotation,
  Inject,
} from '@syncfusion/ej2-react-pdfviewer'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, PenLine, Type, Loader2, ListChecks, Download } from 'lucide-react'
import { getDocument } from '../../data/documents'
import { RECIPIENTS } from '../../data/recipients'
import { getPreparedDoc, getSessionDocument } from '../../data/sessionStore'
import { getAssetBasePath } from '../../basePath'
import { finalizeSignedPdf } from '../../exportPdf'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MobileSheet } from '../../components/MobileSheet'
import { installSignatureDialogEnhancements } from '../../components/signatureDialog'
import {
  readSignatureWithSyncfusion,
  sealPdf,
  sha256Hex,
  toArrayBuffer,
  validateSignedPdf,
  SIGNATURE_DIGEST,
  SIGNATURE_STANDARD,
  type SignatureValidation,
} from '../../signing/secureSign'
import { SignatureReport, ValidationBadge, type AuditEntry } from './SignatureReport'
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

// The finalized, PKI-signed document: signed + hashed + validated ONCE, and the same bytes back
// the audit log, the viewer and the Download button.
interface SealedDocument {
  url: string
  fileName: string
  sha256: string
  certificateSubject: string
  validation: SignatureValidation
  audit: AuditEntry[]
}

const safeFileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document'}.pdf`

export function SignDocument() {
  const viewerRef = useRef<PdfViewerComponent>(null)
  const [fields, setFields] = useState<SignFlowFormField[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sealed, setSealed] = useState<SealedDocument | null>(null)
  const [documentReady, setDocumentReady] = useState(false)
  const seededRef = useRef(false)
  const openedAtRef = useRef<string | null>(null)
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
    if (!openedAtRef.current) openedAtRef.current = new Date().toISOString()
    if (seededRef.current) return
    seededRef.current = true
    if (prepared?.fields?.length) {
      // Recreate the fields designed in Prepare & Design (handed over via the session store).
      for (const pf of prepared.fields) {
        try {
          const opts: Record<string, unknown> = {
            name: pf.name,
            bounds: pf.bounds,
            // 1-based page (form-field-settings.md). Without it addFormField uses the page in
            // view at load time — page 1 — so fields placed on page 2+ all moved to page 1.
            pageNumber: (pf.pageIndex ?? 0) + 1,
            isRequired: pf.isRequired,
            customData: { semantic: pf.semantic, recipientId: pf.recipientId },
          }
          // Drafter-set content (Image/Label/Hyperlink) — lock it so the signer can't type into
          // what should just display the drafter's image/text, not collect signer input.
          if (pf.isReadOnly) opts.isReadOnly = true
          if (pf.value) opts.value = pf.value // drafter-set default text / date
          // Drafter-chosen typography (documented FormFieldSettings props).
          const fmt = pf.format
          if (fmt?.fontFamily) opts.fontFamily = fmt.fontFamily
          if (fmt?.fontSize) opts.fontSize = fmt.fontSize
          if (fmt?.alignment) opts.alignment = fmt.alignment
          if (fmt?.color) opts.color = fmt.color
          getFd()?.addFormField(pf.base as never, opts as never)
          // fontStyle is a bit-flag set that only updateFormField applies (addFormField stores
          // a single style name), so set it once the field exists.
          if (fmt?.fontStyle) {
            const name = pf.name
            const style = fmt.fontStyle
            setTimeout(() => {
              const ff = (getViewer()?.formFieldCollections || []).find((c: any) => c?.name === name)
              if (ff) { try { getFd()?.updateFormField(ff.id, { fontStyle: style } as never) } catch { /* best-effort */ } }
            }, 300)
          }
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

  // Submit = finalize (strip field chrome → saveAsBlob → watermark + flatten) → PKI-sign with
  // ej2-pdf in the browser → hash + validate once → audit log. The signer stays on this screen and
  // sees the sealed document; Download delivers exactly the bytes described in the audit log.
  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Field borders/backgrounds are editing chrome — clear them on the live viewer before the
      // save bakes each field's appearance in (see exportPdf.ts for why this can't happen later).
      clearFieldChrome()
      await new Promise((resolve) => setTimeout(resolve, 200))

      // saveAsBlob()'s documented return type is Blob, but treat it defensively as possibly
      // async — Promise.resolve() handles either a plain Blob or a Promise<Blob>.
      const signedBlob = await Promise.resolve(viewerRef.current?.saveAsBlob())
      if (!signedBlob) throw new Error('The viewer could not export the document.')
      const signedAt = new Date().toISOString()
      const finalized = await finalizeSignedPdf(signedBlob)
      const finalBytes = new Uint8Array(await finalized.arrayBuffer())

      const audit: AuditEntry[] = []
      if (prepared?.preparedAt) {
        audit.push({
          at: prepared.preparedAt,
          actor: 'Sender',
          action: 'Prepared and sent for signing',
          detail: `${prepared.fields.length} field${prepared.fields.length === 1 ? '' : 's'} · recipients: ${prepared.recipients.map((r) => r.name).join(', ')}`,
        })
      }
      if (openedAtRef.current) {
        audit.push({ at: openedAtRef.current, actor: signer.name, email: signer.email, action: 'Opened the document' })
      }
      audit.push({
        at: signedAt,
        actor: signer.name,
        email: signer.email,
        action: 'Signed the document',
        detail: `Completed ${completedCount} of ${gateFields.length} required field${gateFields.length === 1 ? '' : 's'}`,
      })

      // The signer events above are printed on the signing-certificate page, then everything is
      // PKI-signed, hashed and validated once; these bytes back the audit log AND the download.
      const sealedBytes = await sealPdf(finalBytes, {
        documentName: activeDocument.name,
        signerName: signer.name,
        signerEmail: signer.email,
        reason: `Signed "${activeDocument.name}" via SignFlow`,
        events: audit.map(({ action, actor, email, at }) => ({ action, actor, email, at })),
      })
      const sealedAt = new Date().toISOString()
      const [sha256, validation] = await Promise.all([sha256Hex(sealedBytes), validateSignedPdf(sealedBytes)])
      const sdk = readSignatureWithSyncfusion(sealedBytes)
      const certificateSubject = validation.subject ?? sdk.subjectName ?? 'unknown'

      audit.push({
        at: sealedAt,
        actor: 'SignFlow',
        action: 'Document securely signed (PKI digital signature)',
        detail: `${SIGNATURE_STANDARD} · ${SIGNATURE_DIGEST} · certificate: ${certificateSubject}${validation.issuer ? ` (issued by ${validation.issuer})` : ''} · RFC 3161 timestamp${validation.timestampTime ? ` ${validation.timestampTime.toISOString()}` : ''} · signature locked · document SHA-256: ${sha256}`,
      })
      audit.push({
        at: new Date().toISOString(),
        actor: 'SignFlow',
        action: `Signature validated — ${validation.statusLabel}`,
        detail: `Integrity: ${validation.integrity.detail}. Identity: ${validation.identity.detail}. Timestamp: ${validation.timestamp.detail}. Revocation: ${validation.revocation.detail}.${validation.trustNote ? ` ${validation.trustNote}` : ''}`,
      })

      const url = URL.createObjectURL(new Blob([toArrayBuffer(sealedBytes)], { type: 'application/pdf' }))
      setSealed({ url, fileName: safeFileName(activeDocument.name), sha256, certificateSubject, validation, audit })
      // Show the sealed document itself (flattened fields, watermark, visible signature block).
      getViewer()?.load(url, null)
    } catch (err) {
      console.error('Secure signing failed', err)
      setSubmitError(err instanceof Error ? err.message : 'Signing failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDownload = () => {
    if (!sealed) return
    const a = document.createElement('a')
    a.href = sealed.url
    a.download = sealed.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  useEffect(() => () => { if (sealed) URL.revokeObjectURL(sealed.url) }, [sealed])

  // Add Signature / Add Initial dialog: TYPE tab by default (no slide animation), our 4 fonts,
  // "Type here.." placeholder previews, and re-signing an already-signed field.
  useEffect(() => installSignatureDialogEnhancements('signflow-sign-viewer', Object.values(TYPE_SIGNATURE_FONTS), { allowResign: true }), [])

  return (
    <div className="workspace-page sign-document">
      <div className="sign-topbar">
        <Link to="/" className="sign-back" aria-label="Back to SignFlow">
          <ArrowLeft size={16} />
        </Link>

        <div className="sign-titleblock">
          <div className="sign-title">{activeDocument.name}</div>
          <div className="sign-title__meta">
            {sealed ? <>Signed &amp; digitally sealed &middot; {signer.name}</> : <>Waiting for your signature &middot; {signer.name}</>}
          </div>
        </div>

        <div className="sign-topbar__spacer" />

        {sealed ? (
          <ValidationBadge validation={sealed.validation} />
        ) : (
          <span className="sign-progress">
            {submitError ? <span className="sign-error">{submitError}</span> : <>{completedCount} of {gateFields.length} fields completed</>}
          </span>
        )}

        {!sealed && (
          <button
            className="sign-btn sign-btn--primary"
            disabled={!allComplete || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Signing securely…' : 'Submit'}
          </button>
        )}
        <button
          className={`sign-btn${sealed ? '' : ' sign-btn--ghost'}`}
          disabled={!sealed}
          onClick={handleDownload}
          title={sealed ? `Download ${sealed.fileName}` : 'Available after you submit'}
        >
          <Download size={14} /> Download
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
            // Signer needs to read, move between pages and zoom — nothing else. The document
            // comes from the flow (no Open), Download is the top-bar button that delivers the
            // sealed PDF (the native one would export the unsigned working copy), and the
            // right-click menu (cut/copy/paste/delete on fields) and the left navigation pane
            // (thumbnails/bookmarks) have no use case here.
            toolbarSettings={{ toolbarItems: ['PageNavigationTool', 'MagnificationTool'] }}
            contextMenuOption="None"
            enableNavigationToolbar={false}
            // The Annotation service is injected only so clearFormFields() can remove a signature
            // when re-signing; its toolbar has no use here (it otherwise popped in above the page
            // after a Cancel + re-open, shifting the document down 49px).
            enableAnnotationToolbar={false}
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
            <Inject services={[Toolbar, Magnification, Navigation, Annotation, FormFields, FormDesigner]} />
          </PdfViewerComponent>
        </div>

        {!isMobile && (
          <aside className={`sign-fields${sealed ? ' sign-fields--audit' : ''}`}>
            {sealed ? (
              <SignatureReport validation={sealed.validation} audit={sealed.audit} sha256={sealed.sha256} />
            ) : (
              <>
                <div className="sign-fields__eyebrow">Fields to complete</div>
                {fieldButtons}
              </>
            )}
          </aside>
        )}
      </div>

      {isMobile && (
        <>
          <div className="sign-mobile-bar">
            <button className="sign-mobile-bar__btn" onClick={() => setSheetOpen(true)}>
              <ListChecks size={16} />
              {sealed ? 'Audit log' : <>Fields to complete ({completedCount}/{gateFields.length})</>}
            </button>
          </div>
          <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={sealed ? 'Audit log' : 'Fields to complete'}>
            <div className="sign-fields sign-fields--sheet">{sealed ? <SignatureReport validation={sealed.validation} audit={sealed.audit} sha256={sealed.sha256} /> : fieldButtons}</div>
          </MobileSheet>
        </>
      )}
    </div>
  )
}
