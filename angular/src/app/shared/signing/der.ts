// Minimal DER (ASN.1) reader — just enough to read a PDF signature's CMS/PKCS#7 blob and the
// signer's X.509 certificate for client-side validation. @syncfusion/ej2-pdf 34.2.8 can *create*
// CMS signatures but exposes no public validation API, so validation reads the structures directly.

export interface DerNode {
  tag: number
  /** Full TLV bytes (header + value). */
  bytes: Uint8Array
  /** Value bytes only. */
  value: Uint8Array
  children: DerNode[]
}

export function parseDer(buf: Uint8Array, offset = 0): DerNode & { end: number } {
  const tag = buf[offset]
  let p = offset + 1
  let len = buf[p++]
  if (len & 0x80) {
    const n = len & 0x7f
    if (n === 0 || n > 4) throw new Error('Unsupported DER length encoding')
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + buf[p++]
  }
  const end = p + len
  if (end > buf.length) throw new Error('Truncated DER data')
  const node = { tag, bytes: buf.subarray(offset, end), value: buf.subarray(p, end), children: [] as DerNode[], end }
  if (tag & 0x20) {
    let q = p
    while (q < end) {
      const child = parseDer(buf, q)
      node.children.push(child)
      q = child.end
    }
  }
  return node
}

export function decodeOid(value: Uint8Array): string {
  const parts = [Math.floor(value[0] / 40), value[0] % 40]
  let acc = 0
  for (let i = 1; i < value.length; i++) {
    acc = acc * 128 + (value[i] & 0x7f)
    if (!(value[i] & 0x80)) { parts.push(acc); acc = 0 }
  }
  return parts.join('.')
}

const NAME_OIDS: Record<string, string> = {
  '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST',
  '1.2.840.113549.1.9.1': 'E',
}

/** RDNSequence → "CN=…, O=…, …". */
export function decodeName(name: DerNode): string {
  const out: string[] = []
  for (const rdn of name.children) {
    for (const atv of rdn.children) {
      const [oid, val] = atv.children
      const key = NAME_OIDS[decodeOid(oid.value)] ?? decodeOid(oid.value)
      out.push(`${key}=${new TextDecoder().decode(val.value)}`)
    }
  }
  return out.join(', ')
}

/** UTCTime (0x17) / GeneralizedTime (0x18) → Date. */
export function decodeTime(node: DerNode): Date {
  const s = new TextDecoder().decode(node.value)
  const m = node.tag === 0x17
    ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(s)
    : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(s)
  if (!m) return new Date(NaN)
  let year = Number(m[1])
  if (node.tag === 0x17) year += year < 50 ? 2000 : 1900
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)))
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// ---- Minimal DER encoder (used by the demo TSA to build RFC 3161 responses) -------------------

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export function tlv(tag: number, ...content: Uint8Array[]): Uint8Array {
  const body = concatBytes(...content)
  const n = body.length
  let len: number[]
  if (n < 0x80) len = [n]
  else {
    const bytes: number[] = []
    for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
    len = [0x80 | bytes.length, ...bytes]
  }
  return concatBytes(new Uint8Array([tag, ...len]), body)
}

export const seq = (...c: Uint8Array[]) => tlv(0x30, ...c)
export const set = (...c: Uint8Array[]) => tlv(0x31, ...c)
export const octets = (b: Uint8Array) => tlv(0x04, b)
export const ctx = (n: number, ...c: Uint8Array[]) => tlv(0xa0 + n, ...c) // [n] constructed

/** INTEGER from unsigned big-endian bytes (adds a 0x00 pad when the high bit is set). */
export function intBytes(b: Uint8Array): Uint8Array {
  let i = 0
  while (i < b.length - 1 && b[i] === 0) i++
  const v = b.subarray(i)
  return tlv(0x02, v[0] & 0x80 ? concatBytes(new Uint8Array([0]), v) : v)
}
export const int = (n: number) => {
  const bytes: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return intBytes(new Uint8Array(bytes.length ? bytes : [0]))
}

export function oid(dotted: string): Uint8Array {
  const [a, b, ...rest] = dotted.split('.').map(Number)
  const out = [a * 40 + b]
  for (const n of rest) {
    const chunk: number[] = [n & 0x7f]
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift((v & 0x7f) | 0x80)
    out.push(...chunk)
  }
  return tlv(0x06, new Uint8Array(out))
}

export const nullDer = () => new Uint8Array([0x05, 0x00])
export const algId = (dotted: string, withNull = true) => (withNull ? seq(oid(dotted), nullDer()) : seq(oid(dotted)))

/** GeneralizedTime "YYYYMMDDHHMMSSZ" (UTC, whole seconds). */
export function generalizedTime(d: Date): Uint8Array {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const s = `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  return tlv(0x18, new TextEncoder().encode(s))
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
