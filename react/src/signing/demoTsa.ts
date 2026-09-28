// SignFlow DEMO timestamp authority (RFC 3161), running in the browser.
//
// ej2-pdf's documented `PdfSignature.create(pfx, password, options, timestampCallback)` hands the
// callback a DER TimeStampReq (SHA-256 imprint of the CMS signature value) and expects
// `{ data: <DER TimeStampResp> }` — the installed TimestampCallback type (pdf-type.d.ts) says `data`,
// not the `response` shown in the doc-comment example; cryptographic-signer.js reads `tsResult.data`
// and unwraps the token itself. There is no TSA server in this
// client-only app, so this builds a genuine RFC 3161 response signed with a throwaway demo TSA key
// whose certificate is issued by the SignFlow Demo CA. The token is real cryptography (verifiable
// with `openssl ts -verify`), but its time comes from THIS device's clock and the TSA is a demo —
// the UI labels it that way. The bundled key is NOT secret; never use it for anything real.
import { getAssetBasePath } from '../basePath'
import {
  algId, concatBytes, ctx, generalizedTime, int, intBytes, octets, oid, parseDer, seq, set, tlv,
} from './der'

const TSA_CERT_PATH = '/certs/signflow-demo-tsa.cer'
const TSA_KEY_PATH = '/certs/signflow-demo-tsa.key' // PKCS#8 DER, throwaway demo key

export const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4'
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2'
const OID_SHA256 = '2.16.840.1.101.3.4.2.1'
const OID_SHA256_RSA = '1.2.840.113549.1.1.11'
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3'
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4'
const OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47'
/** Test/documentation policy OID — this TSA makes no real-world policy claim. */
const DEMO_TSA_POLICY = '1.2.3.4.1'

const fetchBytes = (path: string) =>
  fetch(window.location.origin + getAssetBasePath() + path).then((r) => {
    if (!r.ok) throw new Error(`Demo TSA asset missing: ${path} (${r.status})`)
    return r.arrayBuffer()
  }).then((b) => new Uint8Array(b))

let material: Promise<{ cert: Uint8Array; key: CryptoKey }> | null = null
function loadTsa() {
  if (!material) {
    material = Promise.all([fetchBytes(TSA_CERT_PATH), fetchBytes(TSA_KEY_PATH)]).then(async ([cert, pkcs8]) => ({
      cert,
      key: await crypto.subtle.importKey('pkcs8', ab(pkcs8), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']),
    }))
    material.catch(() => { material = null })
  }
  return material
}

function ab(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return buf
}
const sha256 = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', ab(b)))

/** DER SET OF: elements sorted by their encodings. */
function derSetOf(items: Uint8Array[]): Uint8Array[] {
  return [...items].sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
    return a.length - b.length
  })
}

/** RFC 3161 timestamp callback for PdfSignature.create(). */
export async function demoTimestampCallback(request: Uint8Array): Promise<{ data: Uint8Array }> {
  const { cert, key } = await loadTsa()
  const req = parseDer(request)
  const messageImprint = req.children[1].bytes // SEQ { hashAlgorithm, hashedMessage }, copied verbatim
  const nonce = req.children.slice(2).find((c) => c.tag === 0x02)

  const serial = crypto.getRandomValues(new Uint8Array(16))
  serial[0] &= 0x7f
  const tstInfo = seq(
    int(1),
    oid(DEMO_TSA_POLICY),
    messageImprint,
    intBytes(serial),
    generalizedTime(new Date()),
    ...(nonce ? [nonce.bytes] : []),
  )

  // Signer = demo TSA certificate (issuer + serial from the cert itself).
  const certNode = parseDer(cert)
  const tbs = certNode.children[0].children
  const o = tbs[0].tag === 0xa0 ? 1 : 0
  const issuerAndSerial = seq(tbs[o + 2].bytes, tbs[o].bytes)

  const attrs = derSetOf([
    seq(oid(OID_CONTENT_TYPE), set(oid(OID_TST_INFO))),
    seq(oid(OID_MESSAGE_DIGEST), set(octets(await sha256(tstInfo)))),
    // SigningCertificateV2 { certs: [ ESSCertIDv2 { certHash (SHA-256 default) } ] } — RFC 5816
    seq(oid(OID_SIGNING_CERT_V2), set(seq(seq(seq(octets(await sha256(cert))))))),
  ])
  const toSign = set(...attrs) // signature covers the attributes DER-encoded as SET OF
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, ab(toSign)))

  const signerInfo = seq(
    int(1),
    issuerAndSerial,
    algId(OID_SHA256, false),
    tlv(0xa0, ...attrs), // [0] IMPLICIT signedAttrs
    algId(OID_SHA256_RSA),
    octets(signature),
  )
  const signedData = seq(
    int(3),
    set(algId(OID_SHA256, false)),
    seq(oid(OID_TST_INFO), ctx(0, octets(tstInfo))),
    tlv(0xa0, cert), // [0] IMPLICIT certificates
    set(signerInfo),
  )
  const token = seq(oid(OID_SIGNED_DATA), ctx(0, signedData))
  const response = seq(seq(int(0)), token) // status: granted
  return { data: concatBytes(response) }
}
