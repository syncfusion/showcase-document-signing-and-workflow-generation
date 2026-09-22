import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  PdfViewerComponent,
  Toolbar,
  Magnification,
  Navigation,
  FormFields,
  FormDesigner,
  Inject,
} from '@syncfusion/ej2-react-pdfviewer'
import { ArrowLeft, Check, FileCheck, Send, PenLine, Loader2, History } from 'lucide-react'
import { DOCUMENTS } from '../../data/documents'
import { RECIPIENTS } from '../../data/recipients'
import { getAssetBasePath } from '../../basePath'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MobileSheet } from '../../components/MobileSheet'
import './CompletedView.css'

interface CompletedState {
  documentName?: string
  signerName?: string
  signedAt?: string
  blobUrl?: string
}

const fallbackDocument = DOCUMENTS[0]
const fallbackSigner = RECIPIENTS[0]

export function CompletedView() {
  const location = useLocation()
  const state = (location.state ?? {}) as CompletedState
  const [documentReady, setDocumentReady] = useState(false)
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)

  const documentName = state.documentName ?? fallbackDocument.name
  const signerName = state.signerName ?? fallbackSigner.name
  const signedAt = state.signedAt ?? new Date().toISOString()
  const documentPath = state.blobUrl ?? window.location.origin + getAssetBasePath() + fallbackDocument.path

  const signedAtLabel = useMemo(
    () =>
      new Date(signedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [signedAt],
  )

  const timeline = [
    { icon: Send, label: 'Sent for signature', meta: documentName },
    { icon: PenLine, label: `Signed by ${signerName}`, meta: signedAtLabel },
    { icon: FileCheck, label: 'Your part is complete', meta: 'Flattened via PdfViewer.saveAsBlob()' },
  ]

  const auditContent = (
    <>
      <div className="completed-audit__eyebrow">Audit trail</div>
      <ol className="completed-timeline">
        {timeline.map((item) => (
          <li key={item.label} className="completed-timeline__item">
            <span className="completed-timeline__dot">
              <item.icon size={12} />
            </span>
            <div>
              <div className="completed-timeline__label">{item.label}</div>
              <div className="completed-timeline__meta">{item.meta}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="completed-note">
        Use the viewer&apos;s own toolbar to download or print the signed copy — this is the
        actual document produced by <code>saveAsBlob()</code> after signing, not a mock.
      </div>
    </>
  )

  return (
    <div className="workspace-page completed-view">
      <div className="completed-topbar">
        <Link to="/" className="completed-back" aria-label="Back to SignFlow">
          <ArrowLeft size={16} />
        </Link>

        <div className="completed-titleblock">
          <div className="completed-title">{documentName}</div>
          <div className="completed-title__meta">Signed {signedAtLabel}</div>
        </div>

        <div className="completed-topbar__spacer" />

        <span className="completed-badge">
          <Check size={13} />
          Completed
        </span>
      </div>

      <div className="completed-body">
        <div className="completed-canvas">
          {!documentReady && (
            <div className="completed-loading">
              <Loader2 size={20} className="completed-loading__spinner" />
              Preparing your signed copy&hellip;
            </div>
          )}
          <PdfViewerComponent
            id="signflow-completed-viewer"
            documentPath={documentPath}
            resourceUrl={window.location.origin + getAssetBasePath() + '/ej2-pdfviewer-lib'}
            style={{ height: '100%', visibility: documentReady ? 'visible' : 'hidden' }}
            documentLoad={() => setDocumentReady(true)}
          >
            <Inject services={[Toolbar, Magnification, Navigation, FormFields, FormDesigner]} />
          </PdfViewerComponent>
        </div>

        {!isMobile && <aside className="completed-audit">{auditContent}</aside>}
      </div>

      {isMobile && (
        <>
          <div className="completed-mobile-bar">
            <button className="completed-mobile-bar__btn" onClick={() => setSheetOpen(true)}>
              <History size={16} />
              Audit trail
            </button>
          </div>
          <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Audit trail">
            <div className="completed-audit completed-audit--sheet">{auditContent}</div>
          </MobileSheet>
        </>
      )}
    </div>
  )
}
