import { useNavigate } from 'react-router-dom'
import { FileText, ArrowRight, Plus, Sparkles } from 'lucide-react'
import { TEMPLATES } from '../../data/templates'
import { listSessionDocuments } from '../../data/sessionStore'
import './TemplatesGallery.css'

export function TemplatesGallery() {
  const navigate = useNavigate()
  // Templates created this session (via the "+" card -> /new?mode=template). Persisted in
  // session memory (no DB), so they show up here right after creation.
  const created = listSessionDocuments('template')

  return (
    <div className="templates-page">
      <div className="templates-header">
        <h1>Templates</h1>
        <p>Predefined documents to start from, plus any you create this session. Pick one to open it in Prepare &amp; Design and place its fields.</p>
      </div>

      <div className="templates-grid">
        <button
          className="template-card template-card--create"
          onClick={() => navigate('/new?mode=template')}
        >
          <span className="template-card__plus"><Plus size={26} /></span>
          <span className="template-card__create-title">Create template</span>
          <span className="template-card__create-hint">Upload a PDF or pick a starter, add signer roles, then design fields.</span>
        </button>

        {created.map((doc) => (
          <div className="template-card" key={doc.id}>
            <div className="template-card__icon template-card__icon--created">
              <Sparkles size={18} />
            </div>
            <span className="template-card__category">Created this session</span>
            <h2 className="template-card__title">{doc.name}</h2>
            <p className="template-card__description">Your template — reopen it to place or edit its fields.</p>
            <div className="template-card__meta">{doc.pages} page{doc.pages === 1 ? '' : 's'} · {doc.sizeLabel}</div>
            <button
              className="template-card__action"
              onClick={() => navigate(`/prepare/${doc.id}`)}
            >
              Use template
              <ArrowRight size={14} />
            </button>
          </div>
        ))}

        {TEMPLATES.map((template) => (
          <div className="template-card" key={template.id}>
            <div className="template-card__icon">
              <FileText size={18} />
            </div>
            <span className="template-card__category">{template.category}</span>
            <h2 className="template-card__title">{template.name}</h2>
            <p className="template-card__description">{template.description}</p>
            <div className="template-card__meta">Suggested fields: {template.suggestedFields}</div>
            <button
              className="template-card__action"
              onClick={() => navigate(`/prepare/${template.documentId}`)}
            >
              Use template
              <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
