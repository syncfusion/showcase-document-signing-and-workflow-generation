// The sealing pipeline behind one call (app-plan.md, "Signing"; data-contract.md, "Seal"). Framework-free:
// the Angular port calls the same function with its viewer's exported blob.
//   saved blob -> flatten + SignFlow mark -> certificate page + CMS/SHA-256 locked signature with a demo
//   timestamp -> SHA-256 + validation -> audit log.
import { finalizeSignedPdf } from './exportPdf';
import { readSignatureInfo, sealPdf, sha256Hex, SIGNATURE_DIGEST, SIGNATURE_STANDARD, validateSignedPdf, type SignatureValidation } from './secureSign';
import type { AuditEntry, PreparedDoc } from '../domain/types';

export interface SealInput {
  savedBlob: Blob;
  documentName: string;
  signer: { name: string; email?: string };
  prepared: PreparedDoc | null;
  openedAt: string | null;
  completed: { done: number; total: number };
}

export interface SealedDocument {
  bytes: Uint8Array;
  sha256: string;
  certificateSubject: string;
  validation: SignatureValidation;
  audit: AuditEntry[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function sealDocument(input: SealInput): Promise<SealedDocument> {
  const { savedBlob, documentName, signer, prepared, openedAt, completed } = input;
  const signedAt = new Date().toISOString();
  const finalized = await finalizeSignedPdf(savedBlob);
  const finalBytes = new Uint8Array(await finalized.arrayBuffer());

  const audit: AuditEntry[] = [];
  if (prepared?.preparedAt) {
    audit.push({ at: prepared.preparedAt, actor: 'Sender', action: 'Prepared and sent for signing',
      detail: `${plural(prepared.fields.length, 'field')} · recipients: ${prepared.recipients.map((r) => r.name).join(', ')}` });
  }
  if (openedAt) audit.push({ at: openedAt, actor: signer.name, email: signer.email, action: 'Opened the document' });
  audit.push({ at: signedAt, actor: signer.name, email: signer.email, action: 'Signed the document',
    detail: `Completed ${completed.done} of ${plural(completed.total, 'required field')}` });

  // Events so far are printed on the certificate page; then everything is signed, hashed and validated once.
  const bytes = await sealPdf(finalBytes, {
    documentName,
    signerName: signer.name,
    signerEmail: signer.email,
    reason: `Signed "${documentName}" with SignFlow`,
    events: audit.map(({ action, actor, email, at }) => ({ action, actor, email, at })),
  });
  const sealedAt = new Date().toISOString();
  const [sha256, validation] = await Promise.all([sha256Hex(bytes), validateSignedPdf(bytes)]);
  const certificateSubject = validation.subject ?? readSignatureInfo(bytes).subjectName ?? 'unknown';

  audit.push({ at: sealedAt, actor: 'SignFlow', action: 'Document securely signed (PKI digital signature)',
    detail: `${SIGNATURE_STANDARD} · ${SIGNATURE_DIGEST} · certificate: ${certificateSubject}${validation.issuer ? ` (issued by ${validation.issuer})` : ''} · RFC 3161 timestamp${validation.timestampTime ? ` ${validation.timestampTime.toISOString()}` : ''} · signature locked · document SHA-256: ${sha256}` });
  audit.push({ at: new Date().toISOString(), actor: 'SignFlow', action: `Signature validated: ${validation.statusLabel}`,
    detail: `Integrity: ${validation.integrity.detail}. Identity: ${validation.identity.detail}. Timestamp: ${validation.timestamp.detail}. Revocation: ${validation.revocation.detail}.${validation.trustNote ? ` ${validation.trustNote}` : ''}` });

  return { bytes, sha256, certificateSubject, validation, audit };
}
