export type AreaCategory = 'Native' | 'Custom' | 'JS Lib' | 'Native SDK'

export interface EvaluationArea {
  id: string
  number: number
  title: string
  category: AreaCategory
  summary: string
  api: string[]
  customization: string[]
  deployment: string
  platforms: { web: string; ios: string; android: string }
  demo:
    | { type: 'link'; to: string; label: string; note: string }
    | { type: 'qr' }
    | { type: 'none'; note: string }
}

export const EVALUATION_AREAS: EvaluationArea[] = [
  {
    id: 'view-render',
    number: 1,
    title: 'Open, render & navigate PDFs',
    category: 'Native',
    summary: 'Core viewer: render, zoom, pan, page navigation, text search and selection, all client-side.',
    api: ["<PdfViewerComponent documentPath resourceUrl>", "Inject([Toolbar, Magnification, Navigation, TextSearch, TextSelection])"],
    customization: ['toolbarSettings.toolbarItems', 'zoomValue / magnification presets', 'interactionMode (Selection / Pan)'],
    deployment: 'Standalone SDK — used in this app. Server-backed and Cloud are also supported for heavier processing.',
    platforms: { web: 'This app — React PDF Viewer, standalone mode', ios: 'SfPdfViewer via .NET MAUI / Flutter / native', android: 'SfPdfViewer via .NET MAUI / Flutter / native' },
    demo: { type: 'link', to: '/prepare', label: 'Open Prepare & Design', note: 'The document you see there is the live PdfViewerComponent.' },
  },
  {
    id: 'thumbnails',
    number: 2,
    title: 'Thumbnails',
    category: 'Native',
    summary: 'A page-thumbnail rail for quick visual navigation of multi-page documents.',
    api: ['Inject([ThumbnailView])', 'toolbar icon toggles the thumbnail panel'],
    customization: ['thumbnail size', 'panel default open/closed'],
    deployment: 'Standalone SDK — used in this app.',
    platforms: { web: 'This app', ios: 'SfPdfViewer via .NET MAUI / Flutter / native', android: 'SfPdfViewer via .NET MAUI / Flutter / native' },
    demo: { type: 'link', to: '/prepare', label: 'Open Prepare & Design', note: 'Click the page-stack icon in the left toolbar rail to open the thumbnail panel.' },
  },
  {
    id: 'signature-fields',
    number: 3,
    title: 'Signature fields',
    category: 'Native',
    summary: 'Placing a signature field and the native draw / type / upload signing dialog.',
    api: ['formDesigner.addFormField("SignatureField", { bounds })', 'signatureFieldSettings', 'native Add Signature dialog on field click'],
    customization: ['typeSignatureFonts', 'hideSaveSignature', 'signatureFitMode'],
    deployment: 'Standalone SDK — used in this app.',
    platforms: { web: 'This app', ios: 'SfPdfViewer via .NET MAUI / Flutter / native', android: 'SfPdfViewer via .NET MAUI / Flutter / native' },
    demo: { type: 'link', to: '/sign', label: 'Open Sign', note: 'Click the signature box on the page — the native Add Signature dialog opens (Draw / Type / Upload).' },
  },
  {
    id: 'form-fields-native',
    number: 4,
    title: 'Form fields — text, checkbox, dropdown, initials',
    category: 'Native',
    summary: 'Native form field types placed via the Form Designer toolbar; identity carried via field customData.',
    api: ['formDesignerToolbarItems: ["TextboxTool","CheckBoxTool","DropdownTool", ...]', 'field.customData'],
    customization: ['textFieldSettings / checkBoxFieldSettings / dropdownFieldSettings', 'isRequired, backgroundColor, borderColor per field'],
    deployment: 'Standalone SDK — used in this app.',
    platforms: { web: 'This app', ios: 'SfPdfViewer via .NET MAUI / Flutter / native', android: 'SfPdfViewer via .NET MAUI / Flutter / native' },
    demo: { type: 'link', to: '/prepare', label: 'Open Prepare & Design', note: 'Place a Textbox, Checkbox, or Dropdown field from the Form Designer toolbar.' },
  },
  {
    id: 'custom-fields',
    number: 5,
    title: 'Images, stamps, QR & custom fields',
    category: 'Custom',
    summary: 'Not native form-field types — built on SDK primitives: stamp annotations, image annotations, and a QR code generated separately and placed as an image/stamp.',
    api: ['@syncfusion/ej2-react-barcode-generator — QRCodeGeneratorComponent', 'exportAsBase64Image() → PdfViewer image/stamp annotation'],
    customization: ['QR size, colors, error-correction level', 'stamp appearance (native StampAnnotation)'],
    deployment: 'Standalone SDK — QR generation is client-side; compositing onto the PDF page uses the Viewer\'s annotation APIs.',
    platforms: { web: 'This app (QR generator live below)', ios: 'Compose via native image/stamp annotation APIs', android: 'Compose via native image/stamp annotation APIs' },
    demo: { type: 'qr' },
  },
  {
    id: 'templates',
    number: 6,
    title: 'Template & document design',
    category: 'Custom',
    summary: 'A template layer (this app\'s own data + routing) on top of the native Form Designer.',
    api: ['/prepare/:documentId route param', 'formDesigner toolbar for field placement per template'],
    customization: ['Any bundled or uploaded PDF can become a template'],
    deployment: 'Standalone SDK, with an app-level template layer — not a Syncfusion-native concept.',
    platforms: { web: 'This app', ios: 'App-level template layer + SfPdfViewer', android: 'App-level template layer + SfPdfViewer' },
    demo: { type: 'link', to: '/templates', label: 'Open Templates', note: 'Pick any of the 4 bundled templates — each opens the same real Prepare & Design screen.' },
  },
  {
    id: 'field-management',
    number: 7,
    title: 'Field management & recipient assignment',
    category: 'Native',
    summary: 'Move, resize, delete fields natively; recipient assignment is a documented pattern using customData + updateFormField, with per-signer colors.',
    api: ['formDesigner.updateFormField(id, { customData, borderColor, color })', 'formDesigner.deleteFormField(id, true)', 'formDesigner.selectFormField(id)'],
    customization: ['Per-recipient border/fill colors', 'required vs optional fields'],
    deployment: 'Standalone SDK — used in this app.',
    platforms: { web: 'This app', ios: 'SfPdfViewer via .NET MAUI / Flutter / native', android: 'SfPdfViewer via .NET MAUI / Flutter / native' },
    demo: { type: 'link', to: '/prepare', label: 'Open Prepare & Design', note: 'Select a field, then assign it to a recipient in the right rail — the field recolors live.' },
  },
  {
    id: 'organize-pages',
    number: 8,
    title: 'Merge & organize pages',
    category: 'Native',
    summary: 'Import pages from another PDF, reorder, rotate, duplicate, delete, or extract pages — entirely client-side.',
    api: ['enablePageOrganizer', 'pageOrganizerSettings: { canImport, canRearrange, canRotate, ... }', 'viewer.pageOrganizer.extractPages()'],
    customization: ['Enable/disable each operation independently', 'thumbnail zoom range'],
    deployment: 'Standalone SDK — confirmed client-side; extractPages() is explicitly client-side-only per the SDK docs.',
    platforms: { web: 'This app', ios: 'SfPdfViewer via .NET MAUI / Flutter / native', android: 'SfPdfViewer via .NET MAUI / Flutter / native' },
    demo: { type: 'link', to: '/prepare', label: 'Open Prepare & Design', note: 'Click the folder/organize icon in the toolbar to open the native Organize Pages panel.' },
  },
  {
    id: 'export-flatten',
    number: 9,
    title: 'Export & flatten',
    category: 'Native',
    summary: 'Save the current document (with filled field values) as a Blob, ready to download or reload elsewhere.',
    api: ['viewer.saveAsBlob() → Blob', 'URL.createObjectURL(blob)'],
    customization: ['Native toolbar Download button also available'],
    deployment: 'Standalone SDK — used in this app for the Sign → Completed handoff.',
    platforms: { web: 'This app', ios: 'SfPdfViewer via .NET MAUI / Flutter / native', android: 'SfPdfViewer via .NET MAUI / Flutter / native' },
    demo: { type: 'link', to: '/sign', label: 'Open Sign', note: 'Complete both fields and click Submit & sign — it calls saveAsBlob() and lands you on the real flattened result.' },
  },
  {
    id: 'prepare-sign-workflow',
    number: 10,
    title: 'End-to-end prepare → sign workflow',
    category: 'Native',
    summary: "This app's whole flow: place fields, assign recipients, sign, and land on a real audit trail — not three disconnected screens.",
    api: ['React Router state to carry signedAt/signerName/blobUrl from Sign to Completed'],
    customization: ['Recipient list, field types, and document are all data-driven'],
    deployment: 'Standalone SDK, orchestrated by this app\'s own routing — no backend.',
    platforms: { web: 'This app', ios: 'Same flow, native navigation + SfPdfViewer', android: 'Same flow, native navigation + SfPdfViewer' },
    demo: { type: 'link', to: '/documents', label: 'Open Documents', note: 'Pick a draft document → Prepare → Sign → Completed is the full loop.' },
  },
  {
    id: 'mobile-crypto',
    number: 11,
    title: 'On-device cryptographic signing (mobile)',
    category: 'Native SDK',
    summary: 'Signing with a certificate stored on the device — a native mobile capability, not something a web app can do.',
    api: ['.NET MAUI / Flutter / Xamarin PDF SDKs — device keystore + PdfSignature.create(certData, password, ...)'],
    customization: ['Device keystore vs. imported PFX certificate'],
    deployment: 'Native SDK only — documented here, not runnable in this web demo.',
    platforms: { web: 'Not applicable — web apps can\'t access a device keystore', ios: '.NET MAUI / Flutter / native, device certificate store', android: '.NET MAUI / Flutter / native, device certificate store' },
    demo: { type: 'none', note: 'No web equivalent exists — this is a platform capability, not a viewer feature. Documented for completeness of the evaluation.' },
  },
  {
    id: 'validate-signatures',
    number: 12,
    title: 'Validate digital signatures',
    category: 'JS Lib',
    summary: 'Reading signature/certificate metadata from a PDF via the JS PDF library, to surface a Valid / Invalid / Not-trusted result.',
    api: ['@syncfusion/ej2-pdf — PdfSignatureField.getSignature()', 'signature.getCertificateInformation() → issuerName, subjectName, validFrom'],
    customization: ['Trust-store / revocation checking is left to the integrating app'],
    deployment: 'Standalone SDK — the check itself runs entirely client-side.',
    platforms: { web: 'ej2-pdf, in-browser', ios: 'Native PDF SDK signature APIs', android: 'Native PDF SDK signature APIs' },
    demo: { type: 'none', note: 'This app doesn\'t bundle a digitally-signed sample PDF yet, so there\'s nothing genuine to validate against — see CLAUDE.md. Rather than fake a result, this is documented, not demoed.' },
  },
]
