import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  PdfViewerComponent,
  Toolbar,
  Magnification,
  Navigation,
  FormFields,
  FormDesigner,
  Inject,
} from '@syncfusion/ej2-react-pdfviewer'
import { ArrowLeft, Download, Loader2, History } from 'lucide-react'
import { getDocument } from '../../data/documents'
import { getCompletedSample, type CompletedSampleAudit } from '../../data/completedSamples'
import { getAssetBasePath } from '../../basePath'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MobileSheet } from '../../components/MobileSheet'
import { sha256Hex, toArrayBuffer, validateSignedPdf, type SignatureValidation } from '../../signing/secureSign'
import { SignatureReport, ValidationBadge, localTime } from '../sign/SignatureReport'
import './CompletedView.css'

const DEFAULT_SAMPLE = 'offer-letter'

interface Loaded {
  url: string
  fileName: string
  sha256: string
  validation: SignatureValidation
  audit: CompletedSampleAudit
}

/**
 * A finished, securely-signed document from the gallery: loads the pre-signed sample PDF, validates
 * its PKI signature live in the browser (same validator + demo trust settings as the Sign flow) and
 * shows the audit log recorded when it was signed.
 */
export function CompletedView() {
  const { documentId = DEFAULT_SAMPLE } = useParams<{ documentId?: string }>()
  const sample = getCompletedSample(documentId)
  const doc = getDocument(documentId)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [documentReady, setDocumentReady] = useState(false)
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (!sample) { setError('This document has no signed copy yet.'); return }
    let cancelled = false
    let url: string | null = null
    const base = window.location.origin + getAssetBasePath()
    ;(async () => {
      try {
        const [pdfRes, auditRes] = await Promise.all([fetch(base + sample.pdfPath), fetch(base + sample.auditPath)])
        if (!pdfRes.ok || !auditRes.ok) throw new Error('Signed sample not found')
        const bytes = new Uint8Array(await pdfRes.arrayBuffer())
        const audit = (await auditRes.json()) as CompletedSampleAudit
        const [sha256, validation] = await Promise.all([sha256Hex(bytes), validateSignedPdf(bytes)])
        if (cancelled) return
        url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' }))
        setLoaded({ url, fileName: `${audit.documentName}.pdf`, sha256, validation, audit })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the signed document')
      }
    })()
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [sample])

  const handleDownload = () => {
    if (!loaded) return
    const a = document.createElement('a')
    a.href = loaded.url
    a.download = loaded.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const title = loaded?.audit.documentName ?? doc.name
  const report = loaded && (
    <SignatureReport
      validation={loaded.validation}
      audit={loaded.audit.entries}
      sha256={loaded.sha256}
      recordedSha256={loaded.audit.sha256}
    />
  )

  return (
    <div className="workspace-page completed-view">
      <div className="completed-topbar">
        <Link to="/" className="completed-back" aria-label="Back to SignFlow">
          <ArrowLeft size={16} />
        </Link>

        <div className="completed-titleblock">
          <div className="completed-title">{title}</div>
          <div className="completed-title__meta">
            {loaded ? <>Signed by {loaded.audit.signerName} &middot; {localTime(loaded.audit.signedAt)}</> : 'Completed'}
          </div>
        </div>

        <div className="completed-topbar__spacer" />

        {loaded && <ValidationBadge validation={loaded.validation} />}
        <button className="completed-download" disabled={!loaded} onClick={handleDownload} title={loaded ? `Download ${loaded.fileName}` : undefined}>
          <Download size={14} /> Download
        </button>
      </div>

      <div className="completed-body">
        <div className="completed-canvas">
          {(!documentReady || error) && (
            <div className="completed-loading">
              {error ? error : <><Loader2 size={20} className="completed-loading__spinner" />Validating the signed copy&hellip;</>}
            </div>
          )}
          {loaded && (
            <PdfViewerComponent
              id="signflow-completed-viewer"
              documentPath={loaded.url}
              resourceUrl={window.location.origin + getAssetBasePath() + '/ej2-pdfviewer-lib'}
              // Read-only review: page navigation + zoom only (same pruning as Sign/Prepare).
              toolbarSettings={{ toolbarItems: ['PageNavigationTool', 'MagnificationTool'] }}
              contextMenuOption="None"
              enableNavigationToolbar={false}
              enableAnnotationToolbar={false}
              isFormDesignerToolbarVisible={false}
              style={{ height: '100%', visibility: documentReady ? 'visible' : 'hidden' }}
              documentLoad={() => setDocumentReady(true)}
            >
              <Inject services={[Toolbar, Magnification, Navigation, FormFields, FormDesigner]} />
            </PdfViewerComponent>
          )}
        </div>

        {!isMobile && <aside className="completed-audit">{report}</aside>}
      </div>

      {isMobile && (
        <>
          <div className="completed-mobile-bar">
            <button className="completed-mobile-bar__btn" onClick={() => setSheetOpen(true)}>
              <History size={16} />
              Validation &amp; audit log
            </button>
          </div>
          <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Validation & audit log">
            <div className="completed-audit completed-audit--sheet">{report}</div>
          </MobileSheet>
        </>
      )}
    </div>
  )
}
