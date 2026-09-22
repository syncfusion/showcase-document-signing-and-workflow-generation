import { PdfBitmap, PdfDocument } from '@syncfusion/ej2-pdf'
import { getAssetBasePath } from './basePath'

const WATERMARK_PATH = '/gallary/syncfusion-essential-studio-enterprise-edition.jpg'
const WATERMARK_WIDTH_PT = 112
const WATERMARK_OPACITY = 0.16
const WATERMARK_MARGIN_PT = 24

let watermarkBytesCache: Promise<Uint8Array> | null = null

function fetchWatermarkBytes(): Promise<Uint8Array> {
  if (!watermarkBytesCache) {
    const url = window.location.origin + getAssetBasePath() + WATERMARK_PATH
    watermarkBytesCache = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buf) => new Uint8Array(buf))
  }
  return watermarkBytesCache
}

/**
 * Post-processes a just-signed PDF blob (from PdfViewerComponent.saveAsBlob()) with the JS PDF
 * library: stamps the Syncfusion watermark on every page. Falls back to the original blob if
 * anything here fails, so a watermarking bug can never block the actual signing flow.
 *
 * Field border/background stripping is NOT done here — see SignDocument.tsx's handleSubmit,
 * which clears them on the *live* viewer via formDesigner.updateFormField() before saveAsBlob().
 * Doing it here (post-hoc, via @syncfusion/ej2-pdf's PdfField.borderColor/backColor setters on
 * fields loaded from already-saved bytes) does not reliably work: a field whose appearance was
 * already baked in by saveAsBlob() carries a cached appearance stream, and re-setting these
 * properties afterward doesn't reliably regenerate it — confirmed live (signature field's border
 * cleared, but the textbox field's cached blue background/border did not, across several retries
 * including re-touching `.text` to force a refresh). The ej2-pdf source itself
 * (form/field.js `_updateBackColor`) also has a suspicious-looking transparency condition
 * (`hasTransparency && _isNullOrUndefined(value) && value.isTransparent`, which can never be true
 * as written) worth re-checking against a future package version before trying this path again.
 */
export async function finalizeSignedPdf(signedBlob: Blob): Promise<Blob> {
  try {
    const [signedBytes, watermarkBytes] = await Promise.all([
      signedBlob.arrayBuffer().then((buf) => new Uint8Array(buf)),
      fetchWatermarkBytes(),
    ])

    const doc = new PdfDocument(signedBytes)
    const watermark = new PdfBitmap(watermarkBytes)
    const scale = WATERMARK_WIDTH_PT / watermark.width
    const watermarkHeight = watermark.height * scale

    for (let i = 0; i < doc.pageCount; i++) {
      const page = doc.getPage(i)
      const graphics = page.graphics
      graphics.save()
      graphics.setTransparency(WATERMARK_OPACITY)
      graphics.drawImage(watermark, {
        x: page.size.width - WATERMARK_WIDTH_PT - WATERMARK_MARGIN_PT,
        y: page.size.height - watermarkHeight - WATERMARK_MARGIN_PT,
        width: WATERMARK_WIDTH_PT,
        height: watermarkHeight,
      })
      graphics.restore()
    }

    const finalBytes = doc.save()
    doc.destroy()
    // Copy into a plain ArrayBuffer — doc.save()'s Uint8Array is typed over ArrayBufferLike
    // (which includes SharedArrayBuffer), not assignable to BlobPart directly.
    const buffer = new ArrayBuffer(finalBytes.byteLength)
    new Uint8Array(buffer).set(finalBytes)
    return new Blob([buffer], { type: 'application/pdf' })
  } catch (err) {
    console.error('finalizeSignedPdf: watermark/border post-processing failed, using unmodified signed PDF', err)
    return signedBlob
  }
}
