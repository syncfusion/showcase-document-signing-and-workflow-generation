// Client-side PKI signing + validation for the finalized SignFlow PDF.
//
// Signing uses @syncfusion/ej2-pdf exactly as documented (syncfusion-javascript-pdf skill,
// references/digital-signatures.md): PdfSignatureField + PdfSignature.create(pfx, password,
// { cryptographicStandard: cms, digestAlgorithm: sha256, isLocked }) + field.getAppearance().
// Everything runs in the browser — no server, no flatten/sign web service.
//
// Validation: ej2-pdf 34.2.8 has no public signature-validation API (only getSignedDate /
// getCertificateInformation / getSignatureOptions on an existing signature), so the checks are
// done here with WebCrypto against the PDF's /ByteRange + CMS blob. Cross-checked against
// `openssl cms -verify` on the same bytes (see CLAUDE.md, BATCH 3).
import {
  CryptographicStandard,
  DigestAlgorithm,
  PdfBitmap,
  PdfBrush,
  PdfDocument,
  PdfFontFamily,
  PdfFontStyle,
  PdfMargins,
  PdfPageSettings,
  PdfPen,
  PdfSignature,
  PdfSignatureField,
} from '@syncfusion/ej2-pdf'
import { getAssetBasePath } from '../basePath'
import { drawWatermark, fetchWatermarkBytes } from '../exportPdf'
import { bytesEqual, decodeName, decodeOid, decodeTime, parseDer, toHex, type DerNode } from './der'
import { demoTimestampCallback, OID_TST_INFO } from './demoTsa'

// DEMO PKI (public/certs, generated with OpenSSL — fictional identities, throwaway keys):
//   SignFlow Demo CA (root, trust anchor) ─┬─ Alex Norman <alex@northstar.example>  (signing, .pfx)
//                                          └─ SignFlow Demo TSA                      (timestamps)
//   + an empty CRL signed by the demo CA.
// The leaf private key ships to the browser and is extractable — it must never be a real identity.
// Exported with `openssl pkcs12 -export -legacy`: ej2-pdf 34.2.8 can't read OpenSSL 3's default
// AES-256/PBKDF2 PKCS#12 ("Octet string cannot be constructed"); the legacy 3DES format works.
const TEST_PFX_PATH = '/certs/signflow-demo-signer.pfx'
const TEST_PFX_PASSWORD = 'signflow-demo'
const DEMO_CA_PATH = '/certs/signflow-demo-ca.cer'
const DEMO_CRL_PATH = '/certs/signflow-demo-ca.crl'
export const DEMO_TRUST_NOTE = 'Validated against the SignFlow demo CA (demo trust settings) — not a publicly trusted (AATL) certificate.'
export const SIGNATURE_STANDARD = 'CMS / PKCS#7'
export const SIGNATURE_DIGEST = 'SHA-256'
const SEAL_FIELD_NAME = 'SignFlowDigitalSeal'

let pfxCache: Promise<Uint8Array> | null = null
function fetchTestPfx(): Promise<Uint8Array> {
  if (!pfxCache) {
    pfxCache = fetch(window.location.origin + getAssetBasePath() + TEST_PFX_PATH)
      .then((res) => {
        if (!res.ok) throw new Error(`Signing certificate not found (${res.status})`)
        return res.arrayBuffer()
      })
      .then((buf) => new Uint8Array(buf))
    pfxCache.catch(() => { pfxCache = null })
  }
  return pfxCache
}

/** Fresh ArrayBuffer copy — WebCrypto/Blob typings reject Uint8Array<ArrayBufferLike>. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return buf
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))))
}

export interface SealMeta {
  documentName: string
  signerName: string
  signerEmail?: string
  reason: string
  /** Signing events recorded so far, printed on the certificate page. */
  events: Array<{ action: string; actor: string; email?: string; at: string }>
}

const PURPLE = { r: 91, g: 75, b: 219 }
const INK = { r: 31, g: 41, b: 55 }
const MUTED = { r: 107, g: 114, b: 128 }
const LINE = { r: 229, g: 231, b: 235 }

const fmtLocal = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })

/**
 * Applies the PKI signature to already-finalized bytes (all edits, watermark and flattening must
 * be done BEFORE this — any later edit invalidates the signature). The signature is locked.
 *
 * The visible signature lives on an appended "Signing certificate" page (like BoldSign/DocuSign
 * completion certificates) rather than on the document's own last page: a fixed spot on arbitrary
 * content always risks covering something (it covered the NDA's footer). The page is added in the
 * same save as the signature, so the signature covers it too.
 */
export async function sealPdf(finalBytes: Uint8Array, meta: SealMeta): Promise<Uint8Array> {
  const [pfx, watermarkBytes] = await Promise.all([fetchTestPfx(), fetchWatermarkBytes().catch(() => null)])
  const doc = new PdfDocument(finalBytes)
  try {
    const last = doc.getPage(doc.pageCount - 1)
    const originalPages = doc.pageCount
    const page = doc.addPage(new PdfPageSettings({ size: { width: last.size.width, height: last.size.height }, margins: new PdfMargins(0) }))
    const pw = page.size.width
    const left = 56
    const width = pw - left * 2
    const pg = page.graphics
    const f = (size: number, style = PdfFontStyle.regular) => doc.embedFont(PdfFontFamily.helvetica, size, style)
    const text = (s: string, font: ReturnType<typeof f>, x: number, y: number, w: number, color = INK) =>
      pg.drawString(s, font, { x, y, width: w, height: font.size * 1.6 }, new PdfBrush(color))

    // Header
    text('SIGNFLOW', f(8, PdfFontStyle.bold), left, 52, width, PURPLE)
    text('Signing certificate', f(20, PdfFontStyle.bold), left, 66, width)
    pg.drawRectangle({ x: left, y: 98, width, height: 1.2 }, new PdfPen(PURPLE, 0.1), new PdfBrush(PURPLE))

    // Document summary
    let y = 116
    const row = (label: string, value: string) => {
      text(label, f(8.5, PdfFontStyle.bold), left, y, 130, MUTED)
      text(value, f(9), left + 130, y, width - 130)
      y += 18
    }
    row('Document', meta.documentName)
    row('Pages', `${originalPages} document page${originalPages === 1 ? '' : 's'} + this certificate`)
    row('Signer', meta.signerEmail ? `${meta.signerName} (${meta.signerEmail})` : meta.signerName)
    row('Signature', `${SIGNATURE_STANDARD}, ${SIGNATURE_DIGEST}, locked after signing`)

    // Events
    y += 10
    text('Signing events', f(11, PdfFontStyle.bold), left, y, width)
    y += 22
    for (const ev of meta.events) {
      pg.drawRectangle({ x: left, y: y - 6, width, height: 0.6 }, new PdfPen(LINE, 0.1), new PdfBrush(LINE))
      text(ev.action, f(9, PdfFontStyle.bold), left, y, width * 0.55)
      text(ev.email ? `${ev.actor} · ${ev.email}` : ev.actor, f(8), left, y + 12, width * 0.55, MUTED)
      text(fmtLocal(new Date(ev.at)), f(8.5), left + width * 0.58, y, width * 0.42)
      text(ev.at, f(7.5), left + width * 0.58, y + 12, width * 0.42, MUTED)
      y += 32
    }

    // Visible digital signature (field appearance, customize-signature-appearance flow).
    y += 12
    text('Digital signature', f(11, PdfFontStyle.bold), left, y, width)
    y += 20
    const W = 300
    const H = 78
    const field = new PdfSignatureField(page, SEAL_FIELD_NAME, { x: left, y, width: W, height: H })
    const g = field.getAppearance().normal.graphics
    g.drawRectangle({ x: 0.5, y: 0.5, width: W - 1, height: H - 1 }, new PdfPen(PURPLE, 0.8), new PdfBrush({ r: 246, g: 245, b: 255 }))
    g.drawRectangle({ x: 0.5, y: 0.5, width: 4, height: H - 1 }, new PdfPen(PURPLE, 0.1), new PdfBrush(PURPLE))
    const seal = (s: string, font: ReturnType<typeof f>, sy: number, color = INK) =>
      g.drawString(s, font, { x: 14, y: sy, width: W - 22, height: font.size * 1.6 }, new PdfBrush(color))
    seal(`Digitally signed by ${meta.signerName}`, f(10, PdfFontStyle.bold), 8)
    seal(meta.signerEmail ?? 'SignFlow signer', f(8), 23, MUTED)
    seal(`Reason: ${meta.reason}`, f(8), 35)
    seal(`Date: ${fmtLocal(new Date())}`, f(8), 47)
    seal(`${SIGNATURE_STANDARD} · ${SIGNATURE_DIGEST} · timestamped · issued by SignFlow Demo CA`, f(7), 61, PURPLE)
    y += H + 18

    const note =
      'The digital signature covers every page of this file, including this certificate. Any change made after ' +
      'signing invalidates it. The signing certificate is issued by the SignFlow Demo CA, a demo trust anchor that ' +
      'SignFlow trusts but general PDF readers do not; the timestamp comes from the SignFlow demo TSA.'
    pg.drawString(note, f(8), { x: left, y, width: Math.min(width, 420), height: 60 }, new PdfBrush(MUTED))
    if (watermarkBytes) drawWatermark(page, new PdfBitmap(watermarkBytes))

    doc.form.add(field)
    const signature = PdfSignature.create(pfx, TEST_PFX_PASSWORD, {
      cryptographicStandard: CryptographicStandard.cms,
      digestAlgorithm: DigestAlgorithm.sha256,
      reason: meta.reason,
      contactInfo: meta.signerEmail,
      locationInfo: 'SignFlow (client-side, browser)',
      signedName: meta.signerName,
      isLocked: true,
    }, demoTimestampCallback) // RFC 3161 token from the in-browser demo TSA (documented overload)
    field.setSignature(signature)
    // saveAsync() is required for the timestamp callback to run (pdf-document.d.ts).
    return await doc.saveAsync()
  } finally {
    doc.destroy()
  }
}

// ---- Validation -------------------------------------------------------------------------------

export interface CheckResult {
  /** true = passed, false = failed, null = not performed / not applicable. */
  ok: boolean | null
  detail: string
}

export interface SignatureValidation {
  status: 'valid' | 'invalid' | 'unknown'
  statusLabel: string
  integrity: CheckResult
  signature: CheckResult
  identity: CheckResult
  timestamp: CheckResult
  revocation: CheckResult
  subject?: string
  issuer?: string
  selfSigned?: boolean
  validFrom?: Date
  validTo?: Date
  signingTime?: Date
  timestampTime?: Date
  digestAlgorithm?: string
  /** Set when trust resolved through a configured demo trust anchor (shown as a footnote). */
  trustNote?: string
}

/** Trust settings: root certificates the validator trusts + CRLs it may use. */
export interface TrustConfig {
  anchors: Uint8Array[]
  crls: Uint8Array[]
  note: string
}

let demoTrust: Promise<TrustConfig> | null = null
/** The SignFlow demo trust settings: the demo root CA as the only anchor + its CRL. */
export function loadDemoTrust(): Promise<TrustConfig> {
  if (!demoTrust) {
    const get = (p: string) => fetch(window.location.origin + getAssetBasePath() + p).then((r) => {
      if (!r.ok) throw new Error(`Trust asset missing: ${p}`)
      return r.arrayBuffer()
    }).then((b) => new Uint8Array(b))
    demoTrust = Promise.all([get(DEMO_CA_PATH), get(DEMO_CRL_PATH)]).then(([ca, crl]) => ({ anchors: [ca], crls: [crl], note: DEMO_TRUST_NOTE }))
    demoTrust.catch(() => { demoTrust = null })
  }
  return demoTrust
}

const OID = {
  signedData: '1.2.840.113549.1.7.2',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  timeStampToken: '1.2.840.113549.1.9.16.2.14',
  rsaEncryption: '1.2.840.113549.1.1.1',
  ekuTimeStamping: '1.3.6.1.5.5.7.3.8',
}
const DIGESTS: Record<string, string> = {
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
  '1.3.14.3.2.26': 'SHA-1',
}
const RSA_SIG_HASH: Record<string, string> = {
  '1.2.840.113549.1.1.11': 'SHA-256',
  '1.2.840.113549.1.1.12': 'SHA-384',
  '1.2.840.113549.1.1.13': 'SHA-512',
  '1.2.840.113549.1.1.5': 'SHA-1',
}

const notDone = (detail: string): CheckResult => ({ ok: null, detail })

function invalid(detail: string): SignatureValidation {
  return {
    status: 'invalid',
    statusLabel: 'Invalid',
    integrity: { ok: false, detail },
    signature: notDone('Not evaluated'),
    identity: notDone('Not evaluated'),
    timestamp: notDone('Not evaluated'),
    revocation: notDone('Not evaluated'),
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '')
  const out = new Uint8Array(clean.length >> 1)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

function findAttr(attrs: DerNode | null, oid: string): DerNode | null {
  if (!attrs) return null
  for (const attr of attrs.children) {
    if (decodeOid(attr.children[0].value) === oid) return attr.children[1]?.children[0] ?? null
  }
  return null
}

const sha = async (name: string, data: Uint8Array) => new Uint8Array(await crypto.subtle.digest(name, toArrayBuffer(data)))

// ---- X.509 helpers ----
interface Cert {
  node: DerNode
  serial: Uint8Array
  issuer: DerNode
  subject: DerNode
  spki: DerNode
  validFrom: Date
  validTo: Date
}
function readCert(bytesOrNode: Uint8Array | DerNode): Cert {
  const node = bytesOrNode instanceof Uint8Array ? parseDer(bytesOrNode) : bytesOrNode
  const t = node.children[0].children
  const o = t[0].tag === 0xa0 ? 1 : 0
  return {
    node, serial: t[o].value, issuer: t[o + 2], subject: t[o + 4], spki: t[o + 5],
    validFrom: decodeTime(t[o + 3].children[0]), validTo: decodeTime(t[o + 3].children[1]),
  }
}
const sameName = (a: DerNode, b: DerNode) => bytesEqual(a.bytes, b.bytes)
const certHasOid = (c: Cert, oid: string) => {
  // extension scan: look for the OID's DER bytes anywhere in the TBS (EKU values)
  const needle = new TextEncoder().encode('') // placeholder to keep types simple
  void needle
  const hay = c.node.children[0].bytes
  const want = oidBytes(oid)
  outer: for (let i = 0; i + want.length <= hay.length; i++) {
    for (let j = 0; j < want.length; j++) if (hay[i + j] !== want[j]) continue outer
    return true
  }
  return false
}
function oidBytes(dotted: string): Uint8Array {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const out = [a * 40 + b]
  for (const n of rest) {
    const chunk: number[] = [n & 0x7f]
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift((v & 0x7f) | 0x80)
    out.push(...chunk)
  }
  return new Uint8Array([0x06, out.length, ...out])
}

/** RSA signature over `signed` by `key`, algorithm from an X.509/CRL signatureAlgorithm OID. */
async function rsaVerify(spki: DerNode, sigAlgOid: string, signature: Uint8Array, signed: Uint8Array): Promise<boolean> {
  const hash = RSA_SIG_HASH[sigAlgOid]
  if (!hash || decodeOid(spki.children[0].children[0].value) !== OID.rsaEncryption) return false
  const key = await crypto.subtle.importKey('spki', toArrayBuffer(spki.bytes), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify'])
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, toArrayBuffer(signature), toArrayBuffer(signed))
}
/** Is `cert` signed by `issuer`? (TBS + signatureAlgorithm + BIT STRING signatureValue) */
function certSignedBy(cert: Cert, issuer: Cert): Promise<boolean> {
  const [tbs, alg, sig] = cert.node.children
  return rsaVerify(issuer.spki, decodeOid(alg.children[0].value), sig.value.subarray(1), tbs.bytes)
}

/** Walks issuer links from `leaf` through `pool` until a configured anchor; every link verified. */
async function chainToAnchor(leaf: Cert, pool: Cert[], anchors: Cert[]): Promise<{ trusted: boolean; path: string[]; anchor?: Cert; detail: string }> {
  const path = [decodeName(leaf.subject)]
  let cur = leaf
  for (let depth = 0; depth < 6; depth++) {
    const anchor = anchors.find((a) => sameName(a.subject, cur.issuer))
    if (anchor) {
      const ok = (await certSignedBy(cur, anchor)) && (await certSignedBy(anchor, anchor))
      return ok
        ? { trusted: true, path: [...path, decodeName(anchor.subject)], anchor, detail: '' }
        : { trusted: false, path, detail: 'Certificate signature does not verify against the trust anchor' }
    }
    const next = pool.find((c) => c !== cur && sameName(c.subject, cur.issuer))
    if (!next || !(await certSignedBy(cur, next))) break
    path.push(decodeName(next.subject))
    cur = next
  }
  return { trusted: false, path, detail: '' }
}

/** CRL check for a certificate issued by `issuer`. null = no CRL from that issuer configured. */
async function crlStatus(cert: Cert, issuer: Cert, crls: Uint8Array[], at: Date): Promise<CheckResult | null> {
  for (const bytes of crls) {
    const crl = parseDer(bytes)
    const [tbs, alg, sig] = crl.children
    const t = tbs.children
    let i = t[0].tag === 0x02 ? 1 : 0
    i++ // signature algorithm
    const crlIssuer = t[i++]
    if (!sameName(crlIssuer, issuer.subject)) continue
    const thisUpdate = decodeTime(t[i++])
    const nextUpdate = t[i] && (t[i].tag === 0x17 || t[i].tag === 0x18) ? decodeTime(t[i++]) : undefined
    const revoked = t[i] && t[i].tag === 0x30 ? t[i].children : []
    if (!(await rsaVerify(issuer.spki, decodeOid(alg.children[0].value), sig.value.subarray(1), tbs.bytes))) {
      return { ok: false, detail: 'Revocation list signature does not verify' }
    }
    if (at < thisUpdate || (nextUpdate && at > nextUpdate)) {
      return { ok: false, detail: 'Revocation list is outside its validity period' }
    }
    if (revoked.some((r) => bytesEqual(r.children[0].value, cert.serial))) {
      return { ok: false, detail: 'Certificate has been REVOKED by its issuer' }
    }
    return { ok: true, detail: `Not revoked — checked against ${decodeName(issuer.subject).split(',')[0].replace('CN=', '')} CRL (valid until ${nextUpdate?.toLocaleDateString() ?? 'n/a'})` }
  }
  return null
}

/** Parses + verifies an RFC 3161 timestamp token covering `signatureValue`. */
async function checkTimestamp(tokenCI: DerNode, signatureValue: Uint8Array, anchors: Cert[], crls: Uint8Array[]): Promise<{ check: CheckResult; time?: Date }> {
  try {
    const sd = tokenCI.children[1].children[0]
    const encap = sd.children[2]
    if (decodeOid(encap.children[0].value) !== OID_TST_INFO) return { check: { ok: false, detail: 'Timestamp token has no TSTInfo' } }
    const tstDer = encap.children[1].children[0].value
    const tst = parseDer(tstDer)
    const imprint = tst.children[2]
    const hashName = DIGESTS[decodeOid(imprint.children[0].children[0].value)]
    const genTime = decodeTime(tst.children[4])
    if (!hashName || !bytesEqual(imprint.children[1].value, await sha(hashName, signatureValue))) {
      return { check: { ok: false, detail: 'Timestamp does not cover this signature (message imprint mismatch)' } }
    }
    const tsaCerts = (sd.children.find((n) => n.tag === 0xa0)?.children ?? []).map(readCert)
    const si = sd.children[sd.children.length - 1].children[0].children
    const sidSerial = si[1].children[1]?.value
    const tsa = tsaCerts.find((c) => sidSerial && bytesEqual(c.serial, sidSerial)) ?? tsaCerts[0]
    if (!tsa) return { check: { ok: false, detail: 'Timestamp authority certificate missing' } }
    const tsDigest = DIGESTS[decodeOid(si[2].children[0].value)]
    const attrs = si[3].tag === 0xa0 ? si[3] : null
    const md = findAttr(attrs, OID.messageDigest)
    if (!attrs || !md || !tsDigest || !bytesEqual(md.value, await sha(tsDigest, tstDer))) {
      return { check: { ok: false, detail: 'Timestamp token content digest mismatch' } }
    }
    const signed = new Uint8Array(attrs.bytes)
    signed[0] = 0x31
    const sigAlgIdx = 4
    const sigOk = await rsaVerify(tsa.spki, decodeOid(si[sigAlgIdx].children[0].value) === OID.rsaEncryption ? Object.keys(RSA_SIG_HASH).find((k) => RSA_SIG_HASH[k] === tsDigest)! : decodeOid(si[sigAlgIdx].children[0].value), si[5].value, signed)
    if (!sigOk) return { check: { ok: false, detail: 'Timestamp token signature does not verify' } }
    const chain = await chainToAnchor(tsa, tsaCerts, anchors)
    const tsaName = decodeName(tsa.subject).split(',')[0].replace('CN=', '')
    if (!chain.trusted) return { check: { ok: null, detail: `Timestamp by ${tsaName} (${genTime.toLocaleString()}) — TSA not trusted` }, time: genTime }
    if (!certHasOid(tsa, OID.ekuTimeStamping)) return { check: { ok: false, detail: 'TSA certificate lacks the timeStamping key usage' } }
    const rev = chain.anchor ? await crlStatus(tsa, chain.anchor, crls, genTime) : null
    if (rev && rev.ok === false) return { check: { ok: false, detail: `TSA certificate: ${rev.detail}` } }
    return { check: { ok: true, detail: `Trusted timestamp ${genTime.toLocaleString()} from ${tsaName} (RFC 3161; demo TSA uses this device's clock)` }, time: genTime }
  } catch (err) {
    return { check: { ok: false, detail: `Timestamp could not be read: ${err instanceof Error ? err.message : String(err)}` } }
  }
}

/**
 * Validates the last digital signature in `bytes`: integrity, signature math, chain to a trust
 * anchor, RFC 3161 timestamp and CRL revocation. `trust` defaults to the SignFlow demo trust.
 */
export async function validateSignedPdf(bytes: Uint8Array, trust?: TrustConfig): Promise<SignatureValidation> {
  try {
    const trustCfg = trust ?? await loadDemoTrust().catch(() => ({ anchors: [], crls: [], note: '' }))
    const anchors = trustCfg.anchors.map((a) => readCert(a))
    const text = new TextDecoder('latin1').decode(bytes)
    const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
    let match: RegExpExecArray | null
    let last: RegExpExecArray | null = null
    while ((match = re.exec(text))) last = match
    if (!last) return invalid('No digital signature found in this document')
    const [a, b, c, d] = last.slice(1, 5).map(Number)
    if (a !== 0 || a + b > c || c + d > bytes.length) return invalid('Malformed signature byte range')
    const gap = text.slice(a + b, c).trim()
    if (!gap.startsWith('<') || !gap.endsWith('>')) return invalid('Malformed signature contents')

    // CMS SignedData
    const cms = parseDer(hexToBytes(gap.slice(1, -1)))
    if (decodeOid(cms.children[0].value) !== OID.signedData) return invalid('Signature is not CMS SignedData')
    const signedData = cms.children[1].children[0]
    const certs = (signedData.children.find((n) => n.tag === 0xa0)?.children ?? []).map(readCert)
    const si = signedData.children[signedData.children.length - 1].children[0].children
    const sidSerial = si[1].tag === 0x30 ? si[1].children[1]?.value : null
    const digestName = DIGESTS[decodeOid(si[2].children[0].value)] ?? 'unknown'
    let k = 3
    const signedAttrs = si[k].tag === 0xa0 ? si[k++] : null
    k++ // signatureAlgorithm
    const sigValue = si[k++]
    const unsignedAttrs = si[k]?.tag === 0xa1 ? si[k] : null
    if (digestName === 'unknown') return invalid('Unsupported digest algorithm')

    // 1. Integrity
    const signedContent = new Uint8Array(b + d)
    signedContent.set(bytes.subarray(a, a + b), 0)
    signedContent.set(bytes.subarray(c, c + d), b)
    const contentDigest = await sha(digestName, signedContent)
    const md = findAttr(signedAttrs, OID.messageDigest)
    const digestOk = md ? bytesEqual(md.value, contentDigest) : true
    const coversFile = c + d === bytes.length
    const integrity: CheckResult = !digestOk
      ? { ok: false, detail: 'Document bytes changed after signing (digest mismatch)' }
      : !coversFile
        ? { ok: false, detail: 'Document was modified after signing (content appended outside the signed range)' }
        : { ok: true, detail: `${digestName} digest of the signed byte range matches — unchanged since signing` }

    // 2. Signer certificate + signature math
    const leaf = certs.find((ct) => sidSerial && bytesEqual(ct.serial, sidSerial)) ?? certs[0]
    if (!leaf) return invalid('Signer certificate missing from the signature')
    const subject = decodeName(leaf.subject)
    const issuer = decodeName(leaf.issuer)
    const selfSigned = sameName(leaf.issuer, leaf.subject)
    let signature: CheckResult
    if (decodeOid(leaf.spki.children[0].children[0].value) !== OID.rsaEncryption) {
      signature = notDone('Signer key type not supported by this validator')
    } else {
      let signedBytes: Uint8Array
      if (signedAttrs) { signedBytes = new Uint8Array(signedAttrs.bytes); signedBytes[0] = 0x31 } else signedBytes = signedContent
      const algOid = Object.keys(RSA_SIG_HASH).find((key) => RSA_SIG_HASH[key] === digestName)!
      const ok = await rsaVerify(leaf.spki, algOid, sigValue.value, signedBytes)
      signature = ok
        ? { ok: true, detail: `RSA signature verifies with the signer's public key (${SIGNATURE_STANDARD})` }
        : { ok: false, detail: 'Signature does not verify with the signer certificate' }
    }

    // 4. Timestamp (checked before trust so the chain can be judged at the timestamped time)
    const signingTimeNode = findAttr(signedAttrs, OID.signingTime)
    const signingTime = signingTimeNode ? decodeTime(signingTimeNode) : undefined
    const tokenCI = findAttr(unsignedAttrs, OID.timeStampToken)
    const ts = tokenCI
      ? await checkTimestamp(tokenCI, sigValue.value, anchors, trustCfg.crls)
      : { check: notDone("No trusted timestamp — signing time comes from the signer's clock"), time: undefined }
    const at = ts.check.ok ? ts.time! : new Date()

    // 3. Identity & trust: chain to a configured anchor, every link verified, valid at signing time
    const chain = await chainToAnchor(leaf, certs, anchors)
    const inValidity = at >= leaf.validFrom && at <= leaf.validTo
    let identity: CheckResult
    if (chain.trusted && inValidity) {
      identity = { ok: true, detail: `Chain verified: ${chain.path.map((n) => n.split(',')[0].replace('CN=', '')).join(' → ')} (demo trust anchor)` }
    } else if (chain.trusted) {
      identity = { ok: false, detail: 'Certificate chains to the trust anchor but was not valid at signing time' }
    } else {
      identity = {
        ok: false,
        detail: selfSigned
          ? 'Self-signed certificate — not issued by a trusted certificate authority'
          : 'Certificate does not chain to a trusted root configured in this validator',
      }
    }

    // 5. Revocation (CRL from the issuing CA)
    let revocation: CheckResult = notDone('Not checked — no revocation information for this issuer')
    if (chain.trusted && chain.anchor) {
      const issuerCert = certs.find((ct) => sameName(ct.subject, leaf.issuer)) ?? chain.anchor
      revocation = (await crlStatus(leaf, issuerCert, trustCfg.crls, at)) ?? revocation
    }

    const trustedAll = identity.ok === true && revocation.ok !== false
    const status: SignatureValidation['status'] =
      integrity.ok === false || signature.ok === false || revocation.ok === false ? 'invalid' : trustedAll ? 'valid' : 'unknown'
    return {
      status,
      statusLabel: status === 'valid' ? 'Valid' : status === 'invalid' ? 'Invalid' : 'Unknown — Not Trusted',
      integrity, signature, identity, timestamp: ts.check, revocation,
      subject, issuer, selfSigned, validFrom: leaf.validFrom, validTo: leaf.validTo, signingTime,
      timestampTime: ts.time, digestAlgorithm: digestName,
      trustNote: chain.trusted ? trustCfg.note : undefined,
    }
  } catch (err) {
    return invalid(`Signature could not be read: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Reads the signature back through ej2-pdf's documented getters (signed date, certificate info). */
export function readSignatureWithSyncfusion(bytes: Uint8Array): { signedDate?: Date; subjectName?: string; issuerName?: string } {
  const doc = new PdfDocument(bytes)
  try {
    for (let i = 0; i < doc.form.count; i++) {
      const field = doc.form.fieldAt(i)
      if (field instanceof PdfSignatureField && field.name === SEAL_FIELD_NAME) {
        const sig = field.getSignature()
        const info = sig.getCertificateInformation()
        return { signedDate: sig.getSignedDate(), subjectName: info.subjectName, issuerName: info.issuerName }
      }
    }
    return {}
  } catch {
    return {}
  } finally {
    doc.destroy()
  }
}
