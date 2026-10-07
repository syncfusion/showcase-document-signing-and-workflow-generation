import { Link } from 'react-router-dom'
import { getCompletedSample } from '../../data/completedSamples'
import { LayoutTemplate, FileText, FilePlus2, ArrowRight, Check } from 'lucide-react'
import { DOCUMENTS } from '../../data/documents'
import { TEMPLATES } from '../../data/templates'
import { RECIPIENTS } from '../../data/recipients'
import { ACTIVITY } from '../../data/activity'
import { sampleHref } from '../../data/samples'
import './Dashboard.css'

const QUICK_ACTIONS = [
  { to: '/new', icon: FilePlus2, title: 'Create new document', description: 'Upload a PDF or pick a starter, add recipients, place fields, and send.' },
  { to: '/templates', icon: LayoutTemplate, title: 'Templates', description: 'Browse reusable templates, or create a new one from the gallery.' },
  { to: '/documents', icon: FileText, title: 'View documents', description: 'Browse documents and their status.' },
]

export function Dashboard() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <span className="dashboard-hero__eyebrow">SignFlow workspace</span>
        <h1 className="dashboard-hero__title">Prepare, place fields, and send for signature</h1>
        <p className="dashboard-hero__sub">Upload a document or start from a template, add recipients, drag fields onto the page, and send for signing — all client-side, powered by the Syncfusion PDF Viewer.</p>
      </div>

      <div className="dashboard-actions">
        {QUICK_ACTIONS.map(({ to, icon: Icon, title, description }) => (
          <Link className="dashboard-action" to={to} key={to}>
            <div className="dashboard-action__icon">
              <Icon size={18} />
            </div>
            <div className="dashboard-action__title">{title}</div>
            <p className="dashboard-action__description">{description}</p>
            <span className="dashboard-action__arrow">
              <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>

      <div className="dashboard-stats">
        <div className="dashboard-stat">
          <div className="dashboard-stat__value">{TEMPLATES.length}</div>
          <div className="dashboard-stat__label">Templates available</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__value">{DOCUMENTS.length}</div>
          <div className="dashboard-stat__label">Sample documents</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__value">{RECIPIENTS.length}</div>
          <div className="dashboard-stat__label">Recipients configured</div>
        </div>
      </div>

      <div className="dashboard-activity">
        <div className="dashboard-activity__eyebrow">Sample activity</div>
        {ACTIVITY.map((row) => {
          const doc = DOCUMENTS.find((d) => d.id === row.documentId)
          if (!doc) return null
          const interactive = row.status !== 'Completed' || !!getCompletedSample(doc.id)
          const content = (
            <>
              <div className="dashboard-activity__icon">
                <FileText size={15} />
              </div>
              <div className="dashboard-activity__name">{doc.name}</div>
              <span className={`dashboard-badge dashboard-badge--${row.status.replace(/\s+/g, '-').toLowerCase()}`}>
                {row.status === 'Completed' && <Check size={11} />}
                {row.status}
              </span>
              {interactive && <ArrowRight size={14} className="dashboard-activity__arrow" />}
            </>
          )
          return interactive ? (
            <Link className="dashboard-activity__row dashboard-activity__row--link" to={sampleHref(doc.id, row.status)} key={doc.id}>
              {content}
            </Link>
          ) : (
            <div className="dashboard-activity__row" key={doc.id}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
