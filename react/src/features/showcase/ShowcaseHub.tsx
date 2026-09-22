import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeGeneratorComponent } from '@syncfusion/ej2-react-barcode-generator'
import { ArrowRight, Info } from 'lucide-react'
import { EVALUATION_AREAS, type AreaCategory } from '../../data/evaluationAreas'
import './ShowcaseHub.css'

const CATEGORY_LABEL: Record<AreaCategory, string> = {
  Native: 'Native',
  Custom: 'Custom — built on SDK primitives',
  'JS Lib': 'JS PDF Library',
  'Native SDK': 'Native SDK (mobile, documented)',
}

const CATEGORY_DOT: Record<AreaCategory, string> = {
  Native: 'native',
  Custom: 'custom',
  'JS Lib': 'jslib',
  'Native SDK': 'sdk',
}

export function ShowcaseHub() {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(EVALUATION_AREAS[0].id)
  const [tab, setTab] = useState<'demo' | 'notes'>('demo')
  const [qrValue, setQrValue] = useState('https://signflow.example/verify/vendor-services-agreement')

  const selected = EVALUATION_AREAS.find((a) => a.id === selectedId) ?? EVALUATION_AREAS[0]

  const selectArea = (id: string) => {
    setSelectedId(id)
    setTab('demo')
  }

  return (
    <div className="showcase-page">
      <div className="showcase-header">
        <div className="showcase-eyebrow">Evaluation showcase</div>
        <h1>Capability Showcase</h1>
        <p>
          12 evaluation areas for the Syncfusion PDF Viewer SDK. Each card links to a live demo
          already running elsewhere in this app where one exists, or explains why it doesn't.
        </p>
        <div className="showcase-legend">
          <span><i className="showcase-dot showcase-dot--native" />Native</span>
          <span><i className="showcase-dot showcase-dot--custom" />Custom</span>
          <span><i className="showcase-dot showcase-dot--jslib" />JS Lib</span>
          <span><i className="showcase-dot showcase-dot--sdk" />Native SDK</span>
        </div>
      </div>

      <div className="showcase-grid">
        {EVALUATION_AREAS.map((area) => (
          <button
            key={area.id}
            className={`showcase-card${area.id === selectedId ? ' showcase-card--active' : ''}`}
            onClick={() => selectArea(area.id)}
          >
            <div className="showcase-card__top">
              <span className="showcase-card__number">{area.number}</span>
              <i className={`showcase-dot showcase-dot--${CATEGORY_DOT[area.category]}`} />
            </div>
            <div className="showcase-card__title">{area.title}</div>
            <p className="showcase-card__summary">{area.summary}</p>
          </button>
        ))}
      </div>

      <div className="showcase-detail">
        <div className="showcase-detail__head">
          <div>
            <div className="showcase-detail__title">
              {selected.number}. {selected.title}
            </div>
            <div className="showcase-detail__category">{CATEGORY_LABEL[selected.category]}</div>
          </div>
          <div className="showcase-tabs">
            <button className={tab === 'demo' ? 'showcase-tab showcase-tab--active' : 'showcase-tab'} onClick={() => setTab('demo')}>
              Live demo
            </button>
            <button className={tab === 'notes' ? 'showcase-tab showcase-tab--active' : 'showcase-tab'} onClick={() => setTab('notes')}>
              Implementation notes
            </button>
          </div>
        </div>

        <div className="showcase-detail__body">
          {tab === 'demo' && selected.demo.type === 'link' && (() => {
            const { to, label, note } = selected.demo as { to: string; label: string; note: string }
            return (
              <div className="showcase-demo-link">
                <p>{note}</p>
                <button className="showcase-btn" onClick={() => navigate(to)}>
                  {label}
                  <ArrowRight size={14} />
                </button>
              </div>
            )
          })()}

          {tab === 'demo' && selected.demo.type === 'qr' && (
            <div className="showcase-qr-demo">
              <div className="showcase-qr-demo__code">
                <QRCodeGeneratorComponent id="showcase-qr" value={qrValue} width="160px" height="160px" />
              </div>
              <div className="showcase-qr-demo__controls">
                <label className="showcase-label">Encoded value</label>
                <input
                  className="showcase-input"
                  value={qrValue}
                  onChange={(e) => setQrValue(e.target.value)}
                />
                <p className="showcase-qr-demo__note">
                  This is a genuine, live <code>QRCodeGeneratorComponent</code> from{' '}
                  <code>@syncfusion/ej2-react-barcode-generator</code>. In Prepare &amp; Design, this
                  would be exported as an image and placed on the page as a stamp annotation — QR
                  codes aren't a native PDF Viewer form-field type.
                </p>
              </div>
            </div>
          )}

          {tab === 'demo' && selected.demo.type === 'none' && (
            <div className="showcase-demo-none">
              <Info size={18} />
              <p>{selected.demo.note}</p>
            </div>
          )}

          {tab === 'notes' && (
            <div className="showcase-notes">
              <div className="showcase-notes__col">
                <div className="showcase-notes__label">API used</div>
                <div className="showcase-code-block">
                  {selected.api.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>

                <div className="showcase-notes__label">Customization</div>
                <ul className="showcase-notes__list">
                  {selected.customization.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="showcase-notes__col">
                <div className="showcase-notes__label">Deployment model</div>
                <p className="showcase-notes__text">{selected.deployment}</p>

                <div className="showcase-notes__label">Platform</div>
                <div className="showcase-platform-row"><strong>Web</strong> {selected.platforms.web}</div>
                <div className="showcase-platform-row"><strong>iOS</strong> {selected.platforms.ios}</div>
                <div className="showcase-platform-row"><strong>Android</strong> {selected.platforms.android}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
