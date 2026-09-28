// Signature validation + audit log panel, shared by the Sign screen (after submit) and the
// Completed view (pre-signed sample). Pure presentation — validation is done in signing/secureSign.
import { Check, Minus, ShieldAlert, ShieldCheck, ShieldX, X } from 'lucide-react'
import type { CheckResult, SignatureValidation } from '../../signing/secureSign'
import './SignatureReport.css'

// Audit log entry (session memory only — component state / a static sidecar for the sample).
export interface AuditEntry {
  at: string // ISO timestamp
  actor: string
  email?: string
  action: string
  detail?: string
}

export const localTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })

export function ValidationBadge({ validation }: { validation: SignatureValidation }) {
  const Icon = validation.status === 'valid' ? ShieldCheck : validation.status === 'invalid' ? ShieldX : ShieldAlert
  return (
    <span className={`sign-validation sign-validation--${validation.status}`} title="Digital signature validation">
      <Icon size={14} /> {validation.statusLabel}
    </span>
  )
}

function CheckRow({ label, check }: { label: string; check: CheckResult }) {
  const Icon = check.ok === true ? Check : check.ok === false ? X : Minus
  const tone = check.ok === true ? 'ok' : check.ok === false ? 'fail' : 'na'
  return (
    <li className={`sign-check sign-check--${tone}`}>
      <span className="sign-check__icon"><Icon size={11} /></span>
      <span>
        <strong>{label}</strong>
        <span className="sign-check__detail">{check.detail}</span>
      </span>
    </li>
  )
}

interface ReportProps {
  validation: SignatureValidation
  audit: AuditEntry[]
  /** SHA-256 of the bytes that were validated (and that Download delivers). */
  sha256: string
  /** Fingerprint recorded when the document was signed (sample sidecar) — compared to `sha256`. */
  recordedSha256?: string
}

export function SignatureReport({ validation: v, audit, sha256, recordedSha256 }: ReportProps) {
  return (
    <div className="sign-audit">
      <div className="sign-fields__eyebrow">Signature validation</div>
      <ValidationBadge validation={v} />
      <ul className="sign-checks">
        <CheckRow label="Document integrity" check={v.integrity} />
        <CheckRow label="Cryptographic signature" check={v.signature} />
        <CheckRow label="Signer identity & trust" check={v.identity} />
        <CheckRow label="Timestamp" check={v.timestamp} />
        <CheckRow label="Revocation" check={v.revocation} />
      </ul>
      {v.trustNote && <div className="sign-trust-note">{v.trustNote}</div>}

      <div className="sign-fields__eyebrow">Audit log</div>
      <ol className="sign-audit__list">
        {audit.map((entry, i) => (
          <li key={i} className="sign-audit__entry">
            <div className="sign-audit__action">{entry.action}</div>
            <div className="sign-audit__actor">
              {entry.actor}
              {entry.email && <> &middot; {entry.email}</>}
            </div>
            <time className="sign-audit__time" dateTime={entry.at} title={entry.at}>
              {localTime(entry.at)}
              <span className="sign-audit__iso">{entry.at}</span>
            </time>
            {entry.detail && <div className="sign-audit__detail">{entry.detail}</div>}
          </li>
        ))}
      </ol>
      <div className="sign-audit__fingerprint">
        <span>Document SHA-256</span>
        <code>{sha256}</code>
        {recordedSha256 && (
          recordedSha256 === sha256
            ? <span className="sign-audit__fingerprint-match">Matches the fingerprint recorded at signing</span>
            : <span className="sign-audit__fingerprint-mismatch">Differs from the fingerprint recorded at signing ({recordedSha256.slice(0, 12)}…)</span>
        )}
      </div>
    </div>
  )
}
