import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, UploadCloud, FileText, Users, Plus, Trash2, ArrowRight, Check } from 'lucide-react'
import { DOCUMENTS, type DocumentMeta } from '../../data/documents'
import { RECIPIENTS, RECIPIENT_COLORS, type Recipient } from '../../data/recipients'
import { addSessionDocument, saveDraftSetup, type SessionDocument } from '../../data/sessionStore'
import './CreateFlow.css'

interface DraftRecipient { id: string; name: string; email: string; role: string; color: string }

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || 'R'
}

export function CreateFlow() {
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'template' ? 'template' : 'document'
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [chosen, setChosen] = useState<DocumentMeta | SessionDocument | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [recipients, setRecipients] = useState<DraftRecipient[]>(
    RECIPIENTS.map((r) => ({ id: r.id, name: r.name, email: r.email ?? '', role: r.role, color: r.color })),
  )

  const title = mode === 'template' ? 'New template' : 'New document'
  const subtitle =
    mode === 'template'
      ? 'Create a reusable template — pick a file or a starter, add signer roles, then design its fields.'
      : 'Pick a document, add recipients, then place fields and send for signing.'

  const acceptFile = (file: File | undefined) => {
    if (!file) return
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return
    const id = `upload-${Math.random().toString(36).slice(2, 8)}`
    const doc: SessionDocument = {
      id,
      name: file.name.replace(/\.pdf$/i, ''),
      path: URL.createObjectURL(file),
      pages: 1,
      sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      kind: mode,
      createdAt: new Date().toISOString(),
    }
    addSessionDocument(doc)
    setChosen(doc)
  }

  const addRecipient = () => {
    const color = RECIPIENT_COLORS[recipients.length % RECIPIENT_COLORS.length]
    setRecipients((prev) => [...prev, { id: `r-${Math.random().toString(36).slice(2, 6)}`, name: '', email: '', role: 'Signer', color }])
  }
  const updateRecipient = (id: string, patch: Partial<DraftRecipient>) =>
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeRecipient = (id: string) => setRecipients((prev) => prev.filter((r) => r.id !== id))

  const validRecipients = useMemo(() => recipients.filter((r) => r.name.trim()), [recipients])
  const canContinue = !!chosen && validRecipients.length > 0

  const onContinue = () => {
    if (!chosen) return
    const recips: Recipient[] = validRecipients.map((r) => ({
      id: r.id,
      name: r.name.trim(),
      role: r.role.trim() || 'Signer',
      initials: initials(r.name),
      color: r.color,
      email: r.email.trim(),
    }))

    // Persist the choice as a session template so it shows up in the Templates gallery.
    // Uploads are already registered (as SessionDocuments with kind 'template') by acceptFile;
    // a starter pick is a bundled DocumentMeta, so register a distinct session copy here.
    let targetId = chosen.id
    if (mode === 'template') {
      const alreadyTemplate = 'kind' in chosen && chosen.kind === 'template'
      if (!alreadyTemplate) {
        targetId = `tpl-${Math.random().toString(36).slice(2, 8)}`
        addSessionDocument({
          id: targetId,
          name: chosen.name,
          path: chosen.path,
          pages: chosen.pages,
          sizeLabel: chosen.sizeLabel,
          kind: 'template',
          createdAt: new Date().toISOString(),
        })
      }
    }

    saveDraftSetup({ documentId: targetId, recipients: recips })
    navigate(`/prepare/${targetId}`)
  }

  return (
    <div className="create-page">
      <div className="create-topbar">
        <Link to="/" className="create-back" aria-label="Back to dashboard"><ArrowLeft size={16} /></Link>
        <div className="create-titleblock">
          <div className="create-title">{title}</div>
          <div className="create-subtitle">{subtitle}</div>
        </div>
      </div>

      <div className="create-body">
        <section className="create-card">
          <div className="create-card__head"><span className="create-step">1</span> Choose a document</div>

          <div
            className={`create-drop${dragOver ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0]) }}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <UploadCloud size={26} />
            <div className="create-drop__title">Browse from your device</div>
            <div className="create-drop__hint">Drag a PDF here, or click to choose — stays in this session only.</div>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => acceptFile(e.target.files?.[0] ?? undefined)} />
          </div>

          <div className="create-or"><span>or start from a predefined document</span></div>

          <div className="create-templates">
            {DOCUMENTS.map((d) => {
              const active = chosen?.id === d.id
              return (
                <button key={d.id} className={`create-template${active ? ' is-active' : ''}`} onClick={() => setChosen(d)}>
                  <FileText size={16} />
                  <span className="create-template__name">{d.name}</span>
                  {active && <Check size={15} className="create-template__check" />}
                </button>
              )
            })}
          </div>

          {chosen && (
            <div className="create-chosen">
              <FileText size={15} />
              <span>Selected: <b>{chosen.name}</b></span>
            </div>
          )}
        </section>

        <section className="create-card">
          <div className="create-card__head">
            <span className="create-step">2</span> <Users size={15} /> Add recipients
          </div>
          <div className="create-recip-list">
            {recipients.map((r, i) => (
              <div className="create-recip" key={r.id}>
                <span className="create-recip__avatar" style={{ background: r.color }}>{initials(r.name) === 'R' ? i + 1 : initials(r.name)}</span>
                <input className="create-input" placeholder="Full name" value={r.name} onChange={(e) => updateRecipient(r.id, { name: e.target.value })} />
                <input className="create-input" placeholder="Email address" value={r.email} onChange={(e) => updateRecipient(r.id, { email: e.target.value })} />
                <input className="create-input create-input--role" placeholder="Role" value={r.role} onChange={(e) => updateRecipient(r.id, { role: e.target.value })} />
                <button className="create-recip__remove" onClick={() => removeRecipient(r.id)} aria-label="Remove recipient" disabled={recipients.length <= 1}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button className="create-add-recip" onClick={addRecipient}><Plus size={14} /> Add recipient</button>
        </section>
      </div>

      <div className="create-footer">
        <span className="create-footer__hint">{canContinue ? 'Ready — you’ll place fields next.' : 'Choose a document and add at least one recipient.'}</span>
        <button className="create-continue" disabled={!canContinue} onClick={onContinue}>
          Continue to design <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
