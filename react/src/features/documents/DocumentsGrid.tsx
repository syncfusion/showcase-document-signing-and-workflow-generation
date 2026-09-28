import { useNavigate } from 'react-router-dom'
import { getCompletedSample } from '../../data/completedSamples'
import { ColumnDirective, ColumnsDirective, GridComponent, Inject, Sort } from '@syncfusion/ej2-react-grids'
import { FileText, ArrowRight, Check } from 'lucide-react'
import { DOCUMENTS, type DocumentMeta } from '../../data/documents'
import { ACTIVITY } from '../../data/activity'
import './DocumentsGrid.css'

interface DocumentRow extends DocumentMeta {
  status: string
}

const ROWS: DocumentRow[] = DOCUMENTS.map((doc) => ({
  ...doc,
  status: ACTIVITY.find((a) => a.documentId === doc.id)?.status ?? 'Draft',
}))

function NameCell(row: DocumentRow) {
  return (
    <div className="documents-name-cell">
      <span className="documents-name-cell__icon">
        <FileText size={14} />
      </span>
      {row.name}
    </div>
  )
}

function StatusCell(row: DocumentRow) {
  const key = row.status.replace(/\s+/g, '-').toLowerCase()
  return (
    <span className={`documents-badge documents-badge--${key}`}>
      {row.status === 'Completed' && <Check size={11} />}
      {row.status}
    </span>
  )
}

function ActionsCell(row: DocumentRow) {
  const navigate = useNavigate()
  if (row.status === 'Completed') {
    return getCompletedSample(row.id) ? (
      <button className="documents-actions-cell documents-actions-cell--link" onClick={() => navigate(`/completed/${row.id}`)}>
        View signed copy
        <ArrowRight size={13} />
      </button>
    ) : (
      <span className="documents-actions-cell documents-actions-cell--muted">No action needed</span>
    )
  }
  return (
    <button className="documents-actions-cell documents-actions-cell--link" onClick={() => navigate(`/prepare/${row.id}`)}>
      Open in Prepare
      <ArrowRight size={13} />
    </button>
  )
}

export function DocumentsGrid() {
  return (
    <div className="documents-page">
      <div className="documents-header">
        <h1>Documents</h1>
        <p>All bundled sample documents, sortable by column.</p>
      </div>

      <div className="documents-grid-wrap">
        <GridComponent dataSource={ROWS} allowSorting={true}>
          <ColumnsDirective>
            <ColumnDirective field="name" headerText="Document" template={NameCell} width="260" />
            <ColumnDirective field="pages" headerText="Pages" width="90" textAlign="Right" />
            <ColumnDirective field="sizeLabel" headerText="Size" width="100" />
            <ColumnDirective field="status" headerText="Status" template={StatusCell} width="140" />
            <ColumnDirective headerText="" template={ActionsCell} width="160" textAlign="Right" />
          </ColumnsDirective>
          <Inject services={[Sort]} />
        </GridComponent>
      </div>
    </div>
  )
}
