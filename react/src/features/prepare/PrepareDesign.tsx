import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent as ReactChangeEvent } from 'react'
import {
  PdfViewerComponent,
  Toolbar,
  Magnification,
  Navigation,
  Annotation,
  LinkAnnotation,
  BookmarkView,
  TextSelection,
  TextSearch,
  Print,
  FormFields,
  FormDesigner,
  PageOrganizer,
  ThumbnailView,
  Inject,
  FontStyle,
} from '@syncfusion/ej2-react-pdfviewer'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Trash2, MousePointerClick, Check, Plus, Loader2, LayoutGrid, UserSquare2,
  PenTool, PencilLine, Type, Calendar, CalendarClock, CheckSquare, CircleDot,
  User, Mail, Briefcase, Building2, Image as ImageIcon, Tag, Link2, ChevronDown,
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  type LucideIcon,
} from 'lucide-react'
import { DatePickerComponent } from '@syncfusion/ej2-react-calendars'
import { Internationalization } from '@syncfusion/ej2-base'
import { getSample, getSampleDraft, saveSampleDraft, resolveDocument } from '../../data/samples'
import { RECIPIENTS, RECIPIENT_COLORS, type Recipient } from '../../data/recipients'
import { savePreparedDoc, getDraftSetup, type PreparedField, type TextFormat } from '../../data/sessionStore'
import { getAssetBasePath } from '../../basePath'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MobileSheet } from '../../components/MobileSheet'
import { installSignatureDialogEnhancements } from '../../components/signatureDialog'
import './PrepareDesign.css'

interface SignFlowFieldBounds { x: number; y: number; width: number; height: number }
interface SignFlowFormField {
  id: string
  name: string
  type: string
  bounds: SignFlowFieldBounds
  isRequired?: boolean
  customData?: { recipientId?: string; semantic?: string }
}

type BaseFieldType = 'SignatureField' | 'InitialField' | 'Textbox' | 'CheckBox' | 'RadioButton' | 'DropDown'
interface FieldDef {
  key: string
  label: string
  base: BaseFieldType
  semantic: string
  readOnly?: boolean
  defaultValue?: string
  /** Overrides DEFAULT_SIZE[base] (bound units = CSS px at 100% zoom). */
  size?: { W: number; H: number }
  Icon: LucideIcon
}

const PALETTE: { group: string; items: FieldDef[] }[] = [
  {
    group: 'Signature',
    items: [
      { key: 'signature', label: 'Signature', base: 'SignatureField', semantic: 'signature', Icon: PenTool },
      { key: 'initials', label: 'Initials', base: 'InitialField', semantic: 'initials', Icon: PencilLine },
    ],
  },
  {
    group: 'Signer details',
    items: [
      { key: 'name', label: 'Name', base: 'Textbox', semantic: 'name', readOnly: true, Icon: User },
      { key: 'email', label: 'Email', base: 'Textbox', semantic: 'email', readOnly: true, Icon: Mail },
      { key: 'title', label: 'Title', base: 'Textbox', semantic: 'title', Icon: Briefcase },
      { key: 'company', label: 'Company', base: 'Textbox', semantic: 'company', Icon: Building2 },
      { key: 'dateSigned', label: 'Date signed', base: 'Textbox', semantic: 'dateSigned', readOnly: true, Icon: CalendarClock },
    ],
  },
  {
    group: 'Inputs',
    items: [
      { key: 'text', label: 'Text box', base: 'Textbox', semantic: 'text', Icon: Type },
      { key: 'date', label: 'Editable date', base: 'Textbox', semantic: 'date', Icon: Calendar },
      { key: 'checkbox', label: 'Checkbox', base: 'CheckBox', semantic: 'checkbox', Icon: CheckSquare },
      { key: 'radio', label: 'Radio', base: 'RadioButton', semantic: 'radio', Icon: CircleDot },
      { key: 'dropdown', label: 'Dropdown', base: 'DropDown', semantic: 'dropdown', Icon: ChevronDown },
    ],
  },
  {
    group: 'Content',
    items: [
      { key: 'image', label: 'Image', base: 'Textbox', semantic: 'image', readOnly: true, size: { W: 96, H: 96 }, Icon: ImageIcon },
      { key: 'label', label: 'Label', base: 'Textbox', semantic: 'label', readOnly: true, defaultValue: 'Label', Icon: Tag },
      { key: 'hyperlink', label: 'Hyperlink', base: 'Textbox', semantic: 'hyperlink', readOnly: true, defaultValue: 'https://', Icon: Link2 },
    ],
  },
]

const SEMANTIC_LABEL: Record<string, string> = {}
PALETTE.forEach((s) => s.items.forEach((i) => { SEMANTIC_LABEL[i.semantic] = i.label }))


// Which native form-designer toolbar button each base type maps to (proxy-clicked for reliable
// native placement — programmatic addFormField doesn't paint the field). Signature/Initial have no
// native tool button in this SDK build, so they fall back to addFormField.
const DEFAULT_SIZE: Record<BaseFieldType, { W: number; H: number }> = {
  SignatureField: { W: 150, H: 44 },
  InitialField: { W: 90, H: 44 },
  Textbox: { W: 160, H: 24 },
  CheckBox: { W: 22, H: 22 },
  RadioButton: { W: 22, H: 22 },
  DropDown: { W: 160, H: 24 },
}
const sizeOf = (def: FieldDef) => def.size ?? DEFAULT_SIZE[def.base]

// Placeholder shown in an Image field until the drafter adds a picture (editing affordance only —
// a CSS background on the field element, never written into the PDF).
const IMAGE_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a84b8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg>',
)

// Text typography offered in the inspector: the SDK's own standard-PDF font list
// (form-designer.js `fontFamilyItems`) minus the symbol fonts Symbol/ZapfDingbats.
const TEXT_FONTS = ['Helvetica', 'Times New Roman', 'Courier']
// Date field formats (DatePicker `format` patterns, calendars skill datepicker-date-formats).
const DATE_FORMATS = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'MMM d, yyyy', 'd MMMM yyyy']
const intl = new Internationalization()
const DEFAULT_FORMAT: Required<Omit<TextFormat, 'color'>> = { fontFamily: 'Helvetica', fontSize: 10, fontStyle: 0, alignment: 'Left' }

function tint(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
const VIEWER_ID = 'signflow-pdf-viewer'
// Web fonts (loaded in index.html), not OS-specific names — renders consistently everywhere. The
// SDK caps this at exactly 4 entries (documented: "maximum font name limit is 4 so key value
// should be 0 to 3"). Shared with SignDocument.tsx's identical constant.
const TYPE_SIGNATURE_FONTS = { 0: 'Priestacy', 1: 'Runethia', 2: 'Rustic Roadway', 3: 'Symphonie Calligraphy' }

function AddRecipientForm({ onAdd, onCancel }: { onAdd: (n: string, e: string, r: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('Signer')
  return (
    <form
      className="prepare-addrecip"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) onAdd(name, email, role) }}
    >
      <input className="prepare-input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input className="prepare-input" placeholder="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="prepare-input" placeholder="Role (e.g. Client)" value={role} onChange={(e) => setRole(e.target.value)} />
      <div className="prepare-addrecip__actions">
        <button type="button" className="prepare-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="prepare-btn prepare-btn--primary" disabled={!name.trim()}>Add recipient</button>
      </div>
    </form>
  )
}

export function PrepareDesign() {
  const { documentId } = useParams<{ documentId?: string }>()
  const activeDocument = useMemo(() => resolveDocument(documentId), [documentId])
  const viewerRef = useRef<PdfViewerComponent>(null)
  // The EJ2 React ref doesn't always expose the formDesigner sub-module; fall back to the live
  // ej2 instance on the DOM node so field methods work reliably.
  const getFd = (): any => {
    const ref: any = viewerRef.current
    if (ref?.formDesigner?.addFormField) return ref.formDesigner
    return (document.getElementById('signflow-pdf-viewer') as any)?.ej2_instances?.[0]?.formDesigner ?? null
  }
  const getViewer = (): any => {
    const ref: any = viewerRef.current
    if (ref?.exportFormFields) return ref
    return (document.getElementById(VIEWER_ID) as any)?.ej2_instances?.[0] ?? null
  }

  const [recipients, setRecipients] = useState<Recipient[]>(() => getDraftSetup(documentId)?.recipients ?? getSampleDraft(documentId)?.recipients ?? RECIPIENTS)
  const [activeRecipientId, setActiveRecipientId] = useState<string>(RECIPIENTS[0]?.id ?? '')
  const [showAddRecip, setShowAddRecip] = useState(false)

  const [fields, setFields] = useState<SignFlowFormField[]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [documentReady, setDocumentReady] = useState(false)
  // Image handling for draft-time field editing.
  const selectedFieldIdRef = useRef<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageTargetRef = useRef<string | null>(null)
  const imageDataRef = useRef<Map<string, string>>(new Map())
  const placeholderTextRef = useRef<Map<string, string>>(new Map())
  const openEditorRef = useRef<(id: string) => void>(() => {})
  const valueInputRef = useRef<HTMLInputElement>(null)
  const movingRef = useRef(false)

  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [openSheet, setOpenSheet] = useState<'palette' | 'inspector' | null>(null)

  // Refs so the SDK event handlers read live values without stale closures.
  const pendingRef = useRef<FieldDef | null>(null)
  const placeCounterRef = useRef(0)
  const nameSeqRef = useRef(0)
  const suppressClickRef = useRef(false)
  const pendingBoundsRef = useRef<{ X: number; Y: number; Width: number; Height: number } | null>(null)
  const pendingPageRef = useRef(0)
  const layoutRef = useRef<Map<string, PreparedField>>(new Map())
  // Sample drafts: fields waiting to be recreated (keyed by field name, matched in handleFieldAdd)
  // and whether the restore has been started for the current document.
  const restoreRef = useRef<Map<string, PreparedField>>(new Map())
  const restoreStartedRef = useRef(false)
  const recipientsRef = useRef<Recipient[]>(recipients)
  useEffect(() => { recipientsRef.current = recipients }, [recipients])
  const activeRecipientRef = useRef<string>(activeRecipientId)
  const activeColorRef = useRef<string>('')
  useEffect(() => { activeRecipientRef.current = activeRecipientId }, [activeRecipientId])
  useEffect(() => {
    activeColorRef.current = recipients.find((r) => r.id === activeRecipientId)?.color ?? ''
  }, [recipients, activeRecipientId])
  useEffect(() => { selectedFieldIdRef.current = selectedFieldId }, [selectedFieldId])
  // Delete / Backspace removes the selected field (unless typing in an input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const ae = document.activeElement as HTMLElement | null
      const tag = (ae?.tagName || '').toLowerCase()
      const inViewer = !!ae && !!document.getElementById(VIEWER_ID)?.contains(ae)
      if (!inViewer && (tag === 'input' || tag === 'textarea' || tag === 'select' || ae?.isContentEditable)) return
      const id = selectedFieldIdRef.current
      if (id) { e.preventDefault(); try { getFd()?.deleteFormField(id, true) } catch { /* best-effort */ } }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // Hide Syncfusion's designer name label once a field has a value/image (show only the value),
  // and re-apply images if Syncfusion re-rendered a field (zoom, scroll, paging).
  const syncFieldName = (fieldId: string) => {
    const lbl = document.getElementById(`${fieldId}_designer_name`)
    if (!lbl) return
    const entry = layoutRef.current.get(fieldId)
    const el = document.getElementById(fieldId) as HTMLElement | null
    let liveVal = ''
    if (el) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') liveVal = (el as HTMLInputElement).value
      else { const inp = el.querySelector('input, textarea') as HTMLInputElement | null; liveVal = inp?.value ?? '' }
    }
    const filled = !!(liveVal.trim() || entry?.value || entry?.imageData || entry?.semantic === 'image')
    lbl.style.display = filled ? 'none' : ''
  }
  useEffect(() => {
    const t = window.setInterval(() => {
      layoutRef.current.forEach((entry, id) => {
        syncFieldName(id)
        if (entry.imageData || entry.semantic === 'image') {
          const el = document.getElementById(id)
          if (el && !el.style.backgroundImage) paintImage(id)
        }
      })
    }, 500)
    return () => clearInterval(t)
  }, [])

  // Double-click a placed field to edit it. We intercept in the CAPTURE phase so we can block
  // Syncfusion's built-in "<type> Properties" dialog (we provide our own editors) and open ours.
  // A MutationObserver is kept as a safety net in case a native dialog ever slips through.
  useEffect(() => {
    const findFieldId = (target: EventTarget | null): string | null => {
      let el = target as HTMLElement | null
      while (el) { if (el.id && layoutRef.current.has(el.id)) return el.id; el = el.parentElement }
      return null
    }
    const onDbl = (e: MouseEvent) => {
      // Only act within the PDF canvas. Resolve the field from the target, falling back to the
      // currently-selected field (the preceding mousedown selects whatever is under the cursor).
      const canvas = document.querySelector('.prepare-canvas')
      if (!canvas || !canvas.contains(e.target as Node)) return
      const id = findFieldId(e.target) || selectedFieldIdRef.current
      if (id && layoutRef.current.has(id)) {
        e.stopImmediatePropagation()
        e.preventDefault()
        openEditorRef.current(id)
      }
    }
    document.addEventListener('dblclick', onDbl, true)

    const killDialog = () => {
      const el = document.getElementById('signflow-pdf-viewer_properties_window') as HTMLElement | null
      if (el && el.classList.contains('e-popup-open')) {
        const inst = (el as any).ej2_instances?.[0]
        if (inst?.hide) { try { inst.hide() } catch { /* ignore */ } }
        else { el.style.display = 'none'; document.querySelectorAll('.e-dlg-overlay').forEach((o) => (o as HTMLElement).remove()) }
      }
    }
    const obs = new MutationObserver(killDialog)
    obs.observe(document.body, { childList: true })
    const el0 = document.getElementById('signflow-pdf-viewer_properties_window')
    if (el0) obs.observe(el0, { attributes: true, attributeFilter: ['class'] })

    return () => { document.removeEventListener('dblclick', onDbl, true); obs.disconnect() }
  }, [])

  useEffect(() => {
    setFields([])
    setSelectedFieldId(null)
    setDocumentReady(false)
    pendingRef.current = null
    placeCounterRef.current = 0
    layoutRef.current.clear()
    restoreRef.current.clear()
    restoreStartedRef.current = false
  }, [activeDocument.id])

  const handleDocumentLoad = useCallback(() => setDocumentReady(true), [])

  // Sample drafts open with their saved progress: recreate the fields once the PDF has loaded.
  // Fresh documents (Create New Document / Template, Templates gallery) use other ids and start empty.
  useEffect(() => {
    if (!documentReady || restoreStartedRef.current) return
    restoreStartedRef.current = true
    const draft = getSampleDraft(activeDocument.id)
    const fd = getFd()
    if (!draft?.fields.length || !fd) return
    let maxSeq = 0
    for (const pf of draft.fields) {
      restoreRef.current.set(pf.name, pf)
      const seq = Number(/(\d+)$/.exec(pf.name)?.[1])
      if (seq > maxSeq) maxSeq = seq
    }
    nameSeqRef.current = Math.max(nameSeqRef.current, maxSeq)
    for (const pf of draft.fields) {
      const opts: Record<string, unknown> = {
        name: pf.name,
        bounds: pf.bounds,
        pageNumber: (pf.pageIndex ?? 0) + 1,
        isRequired: pf.isRequired,
        customData: { semantic: pf.semantic, recipientId: pf.recipientId },
      }
      if (pf.isReadOnly) opts.isReadOnly = true
      if (pf.value) opts.value = pf.value
      const fmt = pf.format
      if (fmt?.fontFamily) opts.fontFamily = fmt.fontFamily
      if (fmt?.fontSize) opts.fontSize = fmt.fontSize
      if (fmt?.alignment) opts.alignment = fmt.alignment
      if (fmt?.color) opts.color = fmt.color
      try { fd.addFormField(pf.base as never, opts as never) } catch { restoreRef.current.delete(pf.name) }
    }
  }, [documentReady, activeDocument.id])

  // Keep edits to a sample draft for the session (sessionStorage), once its restore has finished.
  useEffect(() => {
    const sample = getSample(activeDocument.id)
    if (sample?.status !== 'Draft') return
    const t = window.setInterval(() => {
      if (!restoreStartedRef.current || restoreRef.current.size > 0) return
      syncLayoutFromViewer()
      saveSampleDraft(sample.id, { fields: Array.from(layoutRef.current.values()), recipients: recipientsRef.current })
    }, 1000)
    return () => clearInterval(t)
  }, [activeDocument.id])

  const placeField = (def: FieldDef) => {
    const fd = getFd()
    if (!fd || !documentReady) return
    pendingRef.current = def
    const n = placeCounterRef.current++
    const size = sizeOf(def)
    const bounds = { X: 120 + (n % 4) * 26, Y: 300 + (n % 8) * 46, Width: size.W, Height: size.H }
    pendingBoundsRef.current = bounds
    // Click-to-place drops onto the page currently in view (1-based `pageNumber`).
    const pageNumber = Math.max(1, Number(getViewer()?.currentPageNumber) || 1)
    pendingPageRef.current = pageNumber - 1
    try { fd.addFormField(def.base as never, { bounds, pageNumber } as never) } catch { /* best-effort */ }
    if (isMobile) setOpenSheet(null)
  }

  const handleFieldAdd = useCallback((args: { field: SignFlowFormField }) => {
    if (!args?.field?.id) return
    setFields((prev) => (prev.some((f) => f.id === args.field.id) ? prev : [...prev, args.field]))
    // A field recreated from a sample draft: keep its saved name, assignment and content.
    const restored = restoreRef.current.get(args.field.name)
    if (restored) {
      restoreRef.current.delete(args.field.name)
      layoutRef.current.set(args.field.id, { ...restored })
      const color = recipientsRef.current.find((r) => r.id === restored.recipientId)?.color
      if (color) {
        const patch: Record<string, unknown> = {
          borderColor: color,
          backgroundColor: tint(color, restored.base === 'SignatureField' || restored.base === 'InitialField' ? 0.2 : 0.14),
        }
        if (!restored.format?.color) patch.color = color
        try { getFd()?.updateFormField(args.field.id, patch as never) } catch { /* best-effort */ }
      }
      if (restored.format?.fontStyle) {
        try { getFd()?.updateFormField(args.field.id, { fontStyle: restored.format.fontStyle } as never) } catch { /* best-effort */ }
      }
      if (restored.imageData) imageDataRef.current.set(args.field.id, restored.imageData)
      const customData = { semantic: restored.semantic, recipientId: restored.recipientId }
      setFields((prev) => prev.map((f) => (f.id === args.field.id ? { ...f, customData } : f)))
      setTimeout(() => { paintImage(args.field.id); syncFieldName(args.field.id) }, 0)
      return
    }
    const def = pendingRef.current
    if (def) {
      const recipId = activeRecipientRef.current
      const color = activeColorRef.current
      const fieldName = `${def.label} ${(nameSeqRef.current += 1)}`
      const patch: Record<string, unknown> = {
        name: fieldName,
        tooltip: def.label,
        isRequired: !def.readOnly,
        customData: { semantic: def.semantic, recipientId: recipId || undefined },
      }
      layoutRef.current.set(args.field.id, {
        base: def.base,
        semantic: def.semantic,
        name: fieldName,
        isRequired: !def.readOnly,
        recipientId: recipId || undefined,
        bounds: pendingBoundsRef.current ?? { X: 120, Y: 300, Width: 150, Height: 30 },
        pageIndex: pendingPageRef.current ?? 0,
        isReadOnly: def.readOnly,
      })
      if (def.readOnly) patch.isReadOnly = true
      if (def.defaultValue) patch.value = def.defaultValue
      if (color) {
        patch.borderColor = color
        patch.backgroundColor = tint(color, def.base === 'SignatureField' || def.base === 'InitialField' ? 0.2 : 0.14)
      }
      try { getFd()?.updateFormField(args.field.id, patch as never) } catch { /* patch best-effort */ }
      if (def.semantic === 'image') setTimeout(() => { paintImage(args.field.id); syncFieldName(args.field.id) }, 0)
      setFields((prev) =>
        prev.map((f) =>
          f.id === args.field.id ? { ...f, customData: { semantic: def.semantic, recipientId: recipId || undefined } } : f,
        ),
      )
    }
    if (def) {
      setSelectedFieldId(args.field.id)
      setTimeout(() => { try { getFd()?.selectFormField(args.field.id) } catch { /* select best-effort */ } }, 60)
    }
    pendingRef.current = null
  }, [])

  const handleFieldRemove = useCallback((args: { field: SignFlowFormField }) => {
    if (!args?.field?.id) return
    layoutRef.current.delete(args.field.id)
    setFields((prev) => prev.filter((f) => f.id !== args.field.id))
    setSelectedFieldId((prev) => (prev === args.field.id ? null : prev))
  }, [])

  const paintPlaceholder = (_fieldId: string) => { /* yellow placeholder reverted per user request */ }
  const clearPlaceholder = (fieldId: string) => {
    placeholderTextRef.current.delete(fieldId)
    const el = document.getElementById(fieldId)
    if (el) {
      el.querySelector('.sf-placeholder')?.remove()
      el.style.outline = ''
      el.style.color = ''
      const inner = el.querySelector('input, textarea') as HTMLElement | null
      if (inner) inner.style.removeProperty('color')
    }
  }
  const restorePlaceholder = (_fieldId: string) => { /* reverted */ }
  const paintImage = (fieldId: string) => {
    const real = imageDataRef.current.get(fieldId)
    const isImageField = layoutRef.current.get(fieldId)?.semantic === 'image'
    const url = real ?? (isImageField ? IMAGE_PLACEHOLDER : null)
    if (!url) return
    const el = document.getElementById(fieldId)
    if (el) {
      el.style.backgroundImage = `url("${url}")`
      el.style.backgroundSize = real ? 'contain' : '42%'
      el.style.backgroundRepeat = 'no-repeat'
      el.style.backgroundPosition = 'center'
      const inner = el.querySelector('input, textarea') as HTMLElement | null
      if (inner) inner.style.background = 'transparent'
    }
  }
  const handleFieldSelect = useCallback((args: { field: SignFlowFormField }) => {
    if (!args?.field?.id) return
    setSelectedFieldId(args.field.id)
    setTimeout(() => { paintImage(args.field.id); paintPlaceholder(args.field.id) }, 0)
    if (isMobile) setOpenSheet('inspector')
  }, [isMobile])

  const handleFieldUnselect = useCallback((args: { field: SignFlowFormField }) => {
    if (!args?.field?.id || movingRef.current) return
    setSelectedFieldId((prev) => (prev === args.field.id ? null : prev))
  }, [])

  const handleFieldPropertiesChange = useCallback((args: { newValue: SignFlowFormField }) => {
    const nv: any = args?.newValue
    if (!nv?.id) return
    setFields((prev) => prev.map((f) => (f.id === nv.id ? { ...f, ...nv } : f)))
    const entry = layoutRef.current.get(nv.id)
    if (entry && nv.bounds) {
      const b = nv.bounds
      entry.bounds = {
        X: b.X ?? b.x ?? entry.bounds.X,
        Y: b.Y ?? b.y ?? entry.bounds.Y,
        Width: b.Width ?? b.width ?? entry.bounds.Width,
        Height: b.Height ?? b.height ?? entry.bounds.Height,
      }
    }
    setTimeout(() => { paintImage(nv.id); paintPlaceholder(nv.id) }, 0)
  }, [])

  // Dragging or resizing a field on the page doesn't fire formFieldPropertiesChange, so the
  // inspector's X/Y kept showing the drop position. The documented formFieldMove / formFieldResize
  // events fire on mouse-up: read the field's live bounds then, mirror them into layoutRef (the
  // Sign hand-off and the draft autosave) and re-render so the inspector shows the new position.
  const handleFieldGeometryChange = useCallback((args: { field?: { id?: string }; currentPosition?: { X: number; Y: number; Width: number; Height: number } }) => {
    const id = args?.field?.id
    if (!id) return
    setTimeout(() => {
      const ff: any = (getViewer()?.formFieldCollections || []).find((c: any) => c.id === id)
      const b = ff?.bounds
      const cur = args.currentPosition
      const next = b
        ? { X: b.X ?? b.x, Y: b.Y ?? b.y, Width: b.Width ?? b.width, Height: b.Height ?? b.height }
        : cur ? { X: cur.X, Y: cur.Y, Width: cur.Width, Height: cur.Height } : null
      const entry = layoutRef.current.get(id)
      if (entry && next) entry.bounds = next
      if (entry && Number.isInteger(ff?.pageIndex) && ff.pageIndex >= 0) entry.pageIndex = ff.pageIndex
      setFields((prev) => prev.map((f) => (f.id === id ? { ...f } : f)))
    }, 0)
  }, [])

  const selectedField = useMemo(() => fields.find((f) => f.id === selectedFieldId) ?? null, [fields, selectedFieldId])

  const fieldLabel = (f: SignFlowFormField) =>
    f.customData?.semantic ? SEMANTIC_LABEL[f.customData.semantic] ?? f.type : f.name || f.type

  const assignRecipient = (recipient: Recipient) => {
    if (!selectedField) return
    const patch: Record<string, unknown> = {
      customData: { semantic: selectedField.customData?.semantic, recipientId: recipient.id },
      borderColor: recipient.color,
      color: layoutRef.current.get(selectedField.id)?.format?.color ?? recipient.color,
    }
    getFd()?.updateFormField(selectedField.id, patch as never)
    const entry = layoutRef.current.get(selectedField.id)
    if (entry) entry.recipientId = recipient.id
    setFields((prev) =>
      prev.map((f) =>
        f.id === selectedField.id
          ? { ...f, customData: { semantic: f.customData?.semantic, recipientId: recipient.id } }
          : f,
      ),
    )
  }

  const deleteSelected = () => {
    if (!selectedField) return
    getFd()?.deleteFormField(selectedField.id, true)
  }

  const renameField = (name: string) => {
    if (!selectedField) return
    try { getFd()?.updateFormField(selectedField.id, { name } as never) } catch { /* best-effort */ }
    const entry = layoutRef.current.get(selectedField.id)
    if (entry) entry.name = name
    setFields((prev) => prev.map((f) => (f.id === selectedField.id ? { ...f, name } : f)))
  }

  const toggleRequired = (isRequired: boolean) => {
    if (!selectedField) return
    try { getFd()?.updateFormField(selectedField.id, { isRequired } as never) } catch { /* best-effort */ }
    const entry = layoutRef.current.get(selectedField.id)
    if (entry) entry.isRequired = isRequired
    setFields((prev) => prev.map((f) => (f.id === selectedField.id ? { ...f, isRequired } : f)))
  }

  // ---- Draft-time field editors: make dropped fields do their job before signing ----
  const editableKind = (fieldId: string): 'date' | 'text' | 'image' | 'checkbox' | null => {
    const entry = layoutRef.current.get(fieldId)
    const sem = entry?.semantic
    const base = entry?.base
    if (sem === 'image') return 'image'
    if (sem === 'date' || sem === 'dateSigned') return 'date'
    if (base === 'CheckBox') return 'checkbox'
    if (['text', 'title', 'company', 'name', 'email', 'label', 'hyperlink'].includes(sem || '')) return 'text'
    return null
  }
  const setFieldValue = (fieldId: string, value: string) => {
    // A read-only field (e.g. "Date signed", "Name", "Email") silently rejects a value written in
    // a separate updateFormField call — the SDK only accepts value+isReadOnly together in the SAME
    // patch (label/hyperlink work today only because both are set in one call at creation time).
    // Un-lock the field in this same call so the drafter-set value actually renders.
    try { getFd()?.updateFormField(fieldId, { value, isReadOnly: false } as never) } catch { /* best-effort */ }
    const entry = layoutRef.current.get(fieldId)
    if (entry) { entry.value = value; entry.isReadOnly = false }
    if (value) clearPlaceholder(fieldId); else restorePlaceholder(fieldId)
    syncFieldName(fieldId)
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f } : f)))
  }
  const openFieldEditor = (fieldId: string) => {
    const kind = editableKind(fieldId)
    if (!kind) return
    if (kind === 'image') { imageTargetRef.current = fieldId; imageInputRef.current?.click(); return }
    if (kind === 'checkbox') {
      const coll: any[] = getViewer()?.formFieldCollections || []
      const ff = coll.find((c) => c.id === fieldId)
      const cur = !!(ff?.isChecked ?? ff?.value)
      try { getFd()?.updateFormField(fieldId, { isChecked: !cur } as never) } catch { /* best-effort */ }
      if (!cur) clearPlaceholder(fieldId); else restorePlaceholder(fieldId)
      return
    }
    // Text and date values are edited inline in the inspector — select the field and focus it.
    setSelectedFieldId(fieldId)
    if (isMobile) setOpenSheet('inspector')
    window.setTimeout(() => {
      const target = kind === 'date'
        ? document.querySelector<HTMLInputElement>('.prepare-datepicker input')
        : valueInputRef.current
      target?.focus()
      target?.select()
    }, 60)
  }
  const onImagePicked = (e: ReactChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const id = imageTargetRef.current
    imageTargetRef.current = null
    if (!file || !id) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      imageDataRef.current.set(id, url)
      const entry = layoutRef.current.get(id)
      if (entry) entry.imageData = url
      clearPlaceholder(id)
      paintImage(id)
      syncFieldName(id)
    }
    reader.readAsDataURL(file)
  }
  useEffect(() => { openEditorRef.current = openFieldEditor })

  // Live bounds of a field (CSS px at 100% zoom — Syncfusion's form-field bound units, NOT points).
  const getLiveBounds = (fieldId: string) => {
    const entry = layoutRef.current.get(fieldId)
    const ff: any = (getViewer()?.formFieldCollections || []).find((c: any) => c.id === fieldId)
    const b = ff?.bounds
    if (b) {
      return {
        X: b.X ?? b.x ?? entry?.bounds.X ?? 0,
        Y: b.Y ?? b.y ?? entry?.bounds.Y ?? 0,
        Width: b.Width ?? b.width ?? entry?.bounds.Width ?? 0,
        Height: b.Height ?? b.height ?? entry?.bounds.Height ?? 0,
      }
    }
    return entry?.bounds ?? null
  }
  // Move the field to a new X/Y (bound units), keeping its size; mirror into layoutRef for Sign.
  // updateFormField() with bounds (and some style props) deselects the field, which would unmount
  // the inspector mid-edit. Suppress that unselect, apply the patches in order, then reselect the
  // field and return focus to the control the user was using (stepper, size box, ...).
  const updateKeepingSelection = (fieldId: string, patches: Record<string, unknown>[]) => {
    const focused = document.activeElement as HTMLElement | null
    movingRef.current = true
    for (const patch of patches) {
      try { getFd()?.updateFormField(fieldId, patch as never) } catch { /* best-effort */ }
    }
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f } : f)))
    setTimeout(() => {
      try { getFd()?.selectFormField(fieldId) } catch { /* best-effort */ }
      movingRef.current = false
      focused?.focus()
      paintImage(fieldId)
      syncFieldName(fieldId)
    }, 0)
  }

  // Move the field to a new X/Y (bound units), keeping its size; mirror into layoutRef for Sign.
  const moveField = (fieldId: string, axis: 'X' | 'Y', raw: number) => {
    const cur = getLiveBounds(fieldId)
    if (!cur || !Number.isFinite(raw)) return
    const next = { ...cur, [axis]: Math.max(0, Math.round(raw)) }
    const entry = layoutRef.current.get(fieldId)
    if (entry) entry.bounds = next
    updateKeepingSelection(fieldId, [{ bounds: next }])
  }

  const formatOf = (fieldId: string) => {
    const entry = layoutRef.current.get(fieldId)
    const recipColor = recipients.find((r) => r.id === entry?.recipientId)?.color
    return { ...DEFAULT_FORMAT, color: recipColor ?? '#000000', ...(entry?.format ?? {}) }
  }

  // ---- Date fields: value comes from the inspector's DatePicker, written as text in the chosen
  // format (Internationalization.formatDate, common skill). The ISO date is kept so changing the
  // format re-formats the same date.
  const dateOf = (fieldId: string) => {
    const entry = layoutRef.current.get(fieldId)
    return { format: entry?.dateFormat ?? DATE_FORMATS[0], iso: entry?.dateISO }
  }
  const setFieldDate = (fieldId: string, date: Date | null, format = dateOf(fieldId).format) => {
    const entry = layoutRef.current.get(fieldId)
    if (entry) { entry.dateFormat = format; entry.dateISO = date ? date.toISOString() : undefined }
    setFieldValue(fieldId, date ? intl.formatDate(date, { format }) : '')
  }

  // Text typography via documented FormFieldSettings props (fontFamily, fontSize, fontStyle,
  // alignment, color). Stored on the layout entry so the Sign hand-off recreates it.
  const applyFormat = (fieldId: string, change: Partial<TextFormat>) => {
    const entry = layoutRef.current.get(fieldId)
    if (!entry) return
    entry.format = { ...(entry.format ?? {}), ...change }
    const patches: Record<string, unknown>[] = []
    const patch: Record<string, unknown> = {}
    if (change.fontFamily) patch.fontFamily = change.fontFamily
    if (change.alignment) patch.alignment = change.alignment
    if (change.color) patch.color = change.color
    if (change.fontSize) {
      patch.fontSize = change.fontSize
      // Grow the box so a larger size isn't clipped (px at 100% zoom ~ pt x 96/72).
      const need = Math.ceil(change.fontSize * (96 / 72) * 1.3 + 8)
      const bounds = getLiveBounds(fieldId)
      if (bounds && bounds.Height < need) {
        patch.bounds = { ...bounds, Height: need }
        entry.bounds = { ...bounds, Height: need }
      }
    }
    if (change.fontStyle !== undefined) {
      // The SDK only ADDS style flags; FontStyle.None is its one reset path. Clear, then apply.
      patches.push({ fontStyle: FontStyle.None })
      if (change.fontStyle) patch.fontStyle = change.fontStyle
    }
    if (Object.keys(patch).length) patches.push(patch)
    updateKeepingSelection(fieldId, patches)
  }

  const focusField = (fieldId: string) => getFd()?.selectFormField(fieldId)

  const addRecipient = (name: string, email: string, role: string) => {
    const id = 'r-' + Math.random().toString(36).slice(2, 8)
    const initials =
      name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || 'R'
    const color = RECIPIENT_COLORS[recipients.length % RECIPIENT_COLORS.length]
    const r: Recipient = { id, name: name.trim(), role: role.trim() || 'Signer', initials, color, email: email.trim() }
    setRecipients((prev) => [...prev, r])
    setActiveRecipientId(id)
    setShowAddRecip(false)
  }

  const ledger = useMemo(
    () => recipients.map((recipient) => ({ recipient, fields: fields.filter((f) => f.customData?.recipientId === recipient.id) })),
    [fields, recipients],
  )
  const unassignedFields = useMemo(() => fields.filter((f) => !f.customData?.recipientId), [fields])
  const hasSignature = fields.some((f) => f.customData?.semantic === 'signature' || f.customData?.semantic === 'drawing')

  const checklist = [
    { label: `${recipients.length} recipient${recipients.length === 1 ? '' : 's'} added`, done: recipients.length > 0 },
    { label: fields.length > 0 ? `${fields.length} field${fields.length === 1 ? '' : 's'} placed` : 'Place fields on the document', done: fields.length > 0 },
    { label: hasSignature ? 'Signature field placed' : 'Add a signature field', done: hasSignature },
    { label: unassignedFields.length === 0 && fields.length > 0 ? 'All fields assigned' : 'Assign every field to a recipient', done: fields.length > 0 && unassignedFields.length === 0 },
  ]
  const readyToSend = checklist.every((c) => c.done)

  // Sync positions/sizes/pages from the live viewer (fields the user dragged or resized).
  function syncLayoutFromViewer() {
    const coll: any[] = getViewer()?.formFieldCollections || []
    coll.forEach((ff) => {
      const entry = layoutRef.current.get(ff.id)
      const b = ff?.bounds
      if (entry && b) {
        entry.bounds = {
          X: b.X ?? b.x ?? entry.bounds.X,
          Y: b.Y ?? b.y ?? entry.bounds.Y,
          Width: b.Width ?? b.width ?? entry.bounds.Width,
          Height: b.Height ?? b.height ?? entry.bounds.Height,
        }
      }
      // The page the SDK actually placed the field on is authoritative for the hand-off.
      if (entry && Number.isInteger(ff?.pageIndex) && ff.pageIndex >= 0) entry.pageIndex = ff.pageIndex
    })
  }

  const sendForSigning = () => {
    syncLayoutFromViewer()
    const layout = Array.from(layoutRef.current.values())
    savePreparedDoc({ documentId: activeDocument.id, fields: layout, recipients, preparedAt: new Date().toISOString() })
    navigate(`/sign/${activeDocument.id}`)
  }

  // Points-per-... no: pixels-per-PDF-point for a page, measured from what's actually on screen.
  // Robust to viewer zoom, browser page zoom and hi-dpi/4K scaling (the 96dpi assumption is not).
  // Syncfusion form-field bounds are in CSS px at 100% zoom (= page point * 96/72), NOT PDF points.
  // This returns rendered px per bound-unit, measured from the real page size (robust to any zoom /
  // browser zoom / hi-dpi scaling).
  const pxPerUnit = (idx: number): number => {
    const el = document.getElementById(`${VIEWER_ID}_pageDiv_${idx}`)
    const info: any = getViewer()?.getPageInfo?.(idx)
    if (el && info?.width) {
      const w = el.getBoundingClientRect().width
      const uw = info.width * (96 / 72)
      if (w > 0 && uw > 0) return w / uw
    }
    return (getViewer()?.magnificationModule?.zoomFactor as number) || 1
  }
  // Convert a viewport point to the PDF page point (top-left origin, 72dpi) under the cursor.
  // The SDK's convertClientPointToPagePoint throws in this build, so we derive it from the page
  // element rect and the live zoom factor (verified accurate). Page index is determined purely
  // geometrically — getPageNumberFromClientPoint is NOT used: confirmed live (multi-page doc,
  // scrolled to page 2) that it always returns 1 regardless of which page the point is actually
  // over, silently placing every field on page 1 no matter where you drop it. currentPageNumber
  // was briefly considered as a substitute but only reflects the page in the viewport's center,
  // not the page under an arbitrary drop point, so it can't replace real geometric hit-testing.
  const screenToPdf = (clientX: number, clientY: number) => {
    const v = getViewer()
    const pages = Array.from(document.querySelectorAll(`[id*="${VIEWER_ID}_pageDiv_"]`)) as HTMLElement[]
    let idx = -1
    for (let i = 0; i < pages.length; i++) {
      const r = pages[i].getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) { idx = i; break }
    }
    if (idx === -1) {
      // Point fell in the gap between pages (or just past the first/last page) — snap to the
      // nearest page by vertical distance instead of silently defaulting to page 0.
      let bestDist = Infinity
      for (let i = 0; i < pages.length; i++) {
        const r = pages[i].getBoundingClientRect()
        const dist = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0
        if (dist < bestDist) { bestDist = dist; idx = i }
      }
    }
    const target = idx >= 0 ? pages[idx] : null
    if (!target) return { pageIndex: 0, X: 100, Y: 120 }
    const r = target.getBoundingClientRect()
    const info: any = v?.getPageInfo?.(idx)
    // Bound-unit page size = points * 96/72 (the px-at-100% space Syncfusion places fields in).
    const uw = ((info?.width as number) || 612) * (96 / 72)
    const uh = ((info?.height as number) || 792) * (96 / 72)
    // Fraction of the rendered page → bound units. Scale-agnostic (reads the real on-screen size),
    // and now in the SAME units addFormField expects, so placement matches the cursor everywhere.
    const fx = r.width > 0 ? (clientX - r.left) / r.width : 0
    const fy = r.height > 0 ? (clientY - r.top) / r.height : 0
    return { pageIndex: idx, X: fx * uw, Y: fy * uh }
  }
  // Actually place a field centered on a viewport point (used by pointer-drag drop).
  const placeFieldAtClient = (def: FieldDef, clientX: number, clientY: number) => {
    if (!documentReady) return
    // Only place if the point is over a rendered page.
    const loc = screenToPdf(clientX, clientY)
    const pel = document.getElementById(`${VIEWER_ID}_pageDiv_${loc.pageIndex}`)
    const r = pel?.getBoundingClientRect()
    if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return
    pendingRef.current = def
    const size = sizeOf(def)
    const info: any = getViewer()?.getPageInfo?.(loc.pageIndex)
    const uw = ((info?.width as number) || 612) * (96 / 72)
    const uh = ((info?.height as number) || 792) * (96 / 72)
    const X = Math.min(Math.max(2, loc.X - size.W / 2), Math.max(2, uw - size.W - 2))
    const Y = Math.min(Math.max(2, loc.Y - size.H / 2), Math.max(2, uh - size.H - 2))
    const bounds = { X, Y, Width: size.W, Height: size.H }
    pendingBoundsRef.current = bounds
    pendingPageRef.current = loc.pageIndex
    // addFormField reads `pageNumber` (1-based, form-field-settings.md); without it the SDK uses
    // whichever page is currently in view — so a drop on page 2 could land on page 1.
    try { getFd()?.addFormField(def.base as never, { bounds, pageNumber: loc.pageIndex + 1 } as never) } catch { /* best-effort */ }
  }

  // Pointer-based drag (not HTML5 DnD): we render our own ghost following the cursor and drop the
  // field at that exact same point, so what you see is precisely where it lands — no browser
  // drag-image offset, no dpi/zoom guesswork.
  const beginPointerDrag = (e: React.MouseEvent, def: FieldDef) => {
    if (!documentReady || e.button !== 0) return
    const startX = e.clientX, startY = e.clientY
    let dragging = false
    let ghost: HTMLDivElement | null = null
    const size = sizeOf(def)

    const move = (ev: MouseEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
        dragging = true
        const px = pxPerUnit(0)
        const gw = Math.max(40, size.W * px)
        const gh = Math.max(22, size.H * px)
        const color = activeColorRef.current || '#5b4bdb'
        ghost = document.createElement('div')
        ghost.textContent = def.label
        ghost.style.cssText =
          `position:fixed;z-index:9999;pointer-events:none;width:${gw}px;height:${gh}px;` +
          `transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;` +
          `box-sizing:border-box;font:600 12px system-ui,-apple-system,sans-serif;color:${color};` +
          `background:${tint(color, 0.16)};border:1.5px solid ${color};border-radius:6px;` +
          `overflow:hidden;white-space:nowrap;opacity:0.92;`
        document.body.appendChild(ghost)
        document.body.style.cursor = 'copy'
      }
      if (ghost) { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px` }
    }
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('keydown', onKey)
      document.body.style.cursor = ''
      if (ghost) { ghost.remove(); ghost = null }
      if (dragging) {
        // Swallow only the click that may follow THIS mouseup (it fires in the same task). When
        // the drop lands on the canvas no click reaches the palette button, so without the reset
        // the flag stayed set and ate the user's next palette click.
        suppressClickRef.current = true
        window.setTimeout(() => { suppressClickRef.current = false }, 0)
        placeFieldAtClient(def, ev.clientX, ev.clientY)
      }
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        window.removeEventListener('keydown', onKey)
        document.body.style.cursor = ''
        if (ghost) { ghost.remove(); ghost = null }
        dragging = false
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    window.addEventListener('keydown', onKey)
  }

  const renderPalette = () => (
    <aside className="prepare-palette">
      <div className="prepare-palette__eyebrow">Placing fields for</div>
      <div className="prepare-active-recips">
        {recipients.map((r) => (
          <button
            key={r.id}
            className={`prepare-active-chip${activeRecipientId === r.id ? ' is-active' : ''}`}
            style={{ ['--rc' as string]: r.color } as CSSProperties}
            onClick={() => setActiveRecipientId(r.id)}
          >
            <span className="prepare-avatar prepare-avatar--sm" style={{ background: r.color }}>{r.initials}</span>
            <span className="prepare-active-chip__name">{r.name}</span>
          </button>
        ))}
        <button className="prepare-addrecip-btn" onClick={() => setShowAddRecip((v) => !v)}>
          <Plus size={13} /> Add
        </button>
      </div>
      {showAddRecip && <AddRecipientForm onAdd={addRecipient} onCancel={() => setShowAddRecip(false)} />}
      <div className="prepare-palette__hint">Drag a field onto the document — or click it, then click where it goes.</div>

      {PALETTE.map((section) => (
        <div className="prepare-palette__group" key={section.group}>
          <div className="prepare-palette__eyebrow">{section.group}</div>
          <div className="prepare-palette__grid">
            {section.items.map((def) => (
              <button
                key={def.key}
                className="prepare-field-btn"
                onMouseDown={(e) => beginPointerDrag(e, def)}
                onClick={() => {
                  if (suppressClickRef.current) { suppressClickRef.current = false; return }
                  placeField(def)
                }}
                disabled={!documentReady}
                title={`Drag onto the document to place it exactly, or click to drop it in — ${def.label}`}
              >
                <def.Icon size={16} />
                <span>{def.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  )

  const renderCanvas = () => (
    <div className="prepare-canvas">
      {!documentReady && (
        <div className="prepare-loading">
          <Loader2 size={20} className="prepare-loading__spinner" />
          Loading document&hellip;
        </div>
      )}
      <PdfViewerComponent
        key={activeDocument.id}
        ref={viewerRef}
        id="signflow-pdf-viewer"
        documentPath={/^(blob:|https?:)/.test(activeDocument.path) ? activeDocument.path : window.location.origin + getAssetBasePath() + activeDocument.path}
        resourceUrl={window.location.origin + getAssetBasePath() + '/ej2-pdfviewer-lib'}
        isFormDesignerToolbarVisible={false}
        designerMode={true}
        // Field placement/editing is driven by SignFlow's own palette + inspector, so the viewer
        // only needs page navigation and zoom/fit. Dropped: Open (document comes from the Create
        // flow), undo/redo (would bypass the layoutRef hand-off the inspector maintains), search,
        // print, download, comments and annotation/form-designer toggles. The right-click menu
        // (cut/copy/paste/Properties — Properties is the native dialog we deliberately suppress)
        // and the left navigation pane (thumbnails/bookmarks/organize pages) are hidden entirely;
        // delete stays available via the inspector button and the Delete key.
        toolbarSettings={{ toolbarItems: ['PageNavigationTool', 'MagnificationTool'] }}
        contextMenuOption="None"
        enableNavigationToolbar={false}
        enableAnnotationToolbar={false}
        style={{ height: '100%', visibility: documentReady ? 'visible' : 'hidden' }}
        documentLoad={handleDocumentLoad}
        formFieldAdd={handleFieldAdd}
        formFieldRemove={handleFieldRemove}
        formFieldSelect={handleFieldSelect}
        formFieldUnselect={handleFieldUnselect}
        formFieldPropertiesChange={handleFieldPropertiesChange}
        formFieldMove={handleFieldGeometryChange as never}
        formFieldResize={handleFieldGeometryChange as never}
        // InitialFieldSettingsModel has no typeSignatureFonts of its own; the Add Initial
        // dialog's font list comes from handWrittenSignatureSettings instead — see
        // SignDocument.tsx for the confirmed-live finding.
        signatureFieldSettings={{ typeSignatureFonts: TYPE_SIGNATURE_FONTS }}
        initialFieldSettings={{ typeSignatureFonts: TYPE_SIGNATURE_FONTS } as never}
        handWrittenSignatureSettings={{ typeSignatureFonts: TYPE_SIGNATURE_FONTS }}
      >
        <Inject services={[Toolbar, Magnification, Navigation, Annotation, LinkAnnotation, BookmarkView, TextSelection, TextSearch, Print, FormFields, FormDesigner, PageOrganizer, ThumbnailView]} />
      </PdfViewerComponent>
    </div>
  )

  const renderInspector = () => (
    <aside className="prepare-inspector">
      <div className="prepare-rail__eyebrow">Readiness</div>
      <ul className="prepare-checklist">
        {checklist.map((item) => (
          <li key={item.label} className={`prepare-check${item.done ? ' prepare-check--done' : ''}`}>
            <span className="prepare-check__dot">{item.done && <Check size={11} />}</span>
            {item.label}
          </li>
        ))}
      </ul>

      {selectedField ? (
        <div className="prepare-inspector__section">
          <div className="prepare-inspector__title">{fieldLabel(selectedField)}</div>
          <div className="prepare-inspector__sub">{selectedField.type}</div>

          <div className="prepare-label">Field name</div>
          <input
            className="prepare-input"
            value={selectedField.name ?? ''}
            onChange={(e) => renameField(e.target.value)}
            placeholder="Field name"
          />

          <label className="prepare-toggle">
            <input
              type="checkbox"
              checked={!!selectedField.isRequired}
              onChange={(e) => toggleRequired(e.target.checked)}
            />
            <span>Required field</span>
          </label>

          {editableKind(selectedField.id) === 'text' && (
            <>
              <div className="prepare-label">Value</div>
              <input
                ref={valueInputRef}
                className="prepare-input"
                value={layoutRef.current.get(selectedField.id)?.value ?? ''}
                onChange={(e) => setFieldValue(selectedField.id, e.target.value)}
                placeholder="Type a value"
              />
            </>
          )}

          {editableKind(selectedField.id) === 'date' && (() => {
            const d = dateOf(selectedField.id)
            const id = selectedField.id
            return (
              <>
                <div className="prepare-label">Date</div>
                <div className="prepare-format__row prepare-date-row">
                  <DatePickerComponent
                    key={id}
                    cssClass="prepare-datepicker"
                    value={d.iso ? new Date(d.iso) : undefined}
                    format={d.format}
                    placeholder={d.format}
                    showClearButton
                    change={(e: any) => setFieldDate(id, e?.value ? new Date(e.value) : null)}
                  />
                </div>
                <div className="prepare-label">Date format</div>
                <select
                  className="prepare-input"
                  aria-label="Date format"
                  value={d.format}
                  onChange={(e) => setFieldDate(id, d.iso ? new Date(d.iso) : null, e.target.value)}
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f} value={f}>{f}{d.iso ? ` — ${intl.formatDate(new Date(d.iso), { format: f })}` : ''}</option>
                  ))}
                </select>
              </>
            )
          })()}

          {(editableKind(selectedField.id) === 'text' || editableKind(selectedField.id) === 'date') && (() => {
            const fmt = formatOf(selectedField.id)
            const id = selectedField.id
            const styles: Array<[number, LucideIcon, string]> = [[FontStyle.Bold, Bold, 'Bold'], [FontStyle.Italic, Italic, 'Italic'], [FontStyle.Underline, Underline, 'Underline']]
            const aligns: Array<[TextFormat['alignment'], LucideIcon, string]> = [['Left', AlignLeft, 'Align left'], ['Center', AlignCenter, 'Align center'], ['Right', AlignRight, 'Align right']]
            return (
              <div className="prepare-format">
                <div className="prepare-label">Text formatting</div>
                <div className="prepare-format__row">
                  <select
                    className="prepare-input prepare-format__family"
                    aria-label="Font family"
                    value={fmt.fontFamily}
                    onChange={(e) => applyFormat(id, { fontFamily: e.target.value })}
                  >
                    {TEXT_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <input
                    type="number"
                    className="prepare-input prepare-format__size"
                    aria-label="Font size"
                    min={6}
                    max={48}
                    step={1}
                    value={fmt.fontSize}
                    onChange={(e) => {
                      const v = e.target.valueAsNumber
                      if (Number.isFinite(v) && v >= 6 && v <= 48) applyFormat(id, { fontSize: v })
                    }}
                  />
                </div>
                <div className="prepare-format__row">
                  <div className="prepare-seg" role="group" aria-label="Font style">
                    {styles.map(([flag, Icon, label]) => {
                      const on = (fmt.fontStyle & flag) !== 0
                      return (
                        <button key={label} type="button" className={`prepare-seg__btn${on ? ' is-on' : ''}`} aria-pressed={on} title={label} aria-label={label}
                          onClick={() => applyFormat(id, { fontStyle: on ? fmt.fontStyle & ~flag : fmt.fontStyle | flag })}>
                          <Icon size={14} />
                        </button>
                      )
                    })}
                  </div>
                  <div className="prepare-seg" role="group" aria-label="Alignment">
                    {aligns.map(([value, Icon, label]) => (
                      <button key={label} type="button" className={`prepare-seg__btn${fmt.alignment === value ? ' is-on' : ''}`} aria-pressed={fmt.alignment === value} title={label} aria-label={label}
                        onClick={() => applyFormat(id, { alignment: value })}>
                        <Icon size={14} />
                      </button>
                    ))}
                  </div>
                  <input
                    type="color"
                    className="prepare-format__color"
                    aria-label="Text color"
                    title="Text color"
                    value={fmt.color}
                    onChange={(e) => applyFormat(id, { color: e.target.value })}
                  />
                </div>
              </div>
            )
          })()}

          {(() => {
            const b = getLiveBounds(selectedField.id)
            if (!b) return null
            return (
              <>
                <div className="prepare-label">Position</div>
                <div className="prepare-pos-row">
                  {(['X', 'Y'] as const).map((axis) => (
                    <label key={axis} className="prepare-pos">
                      <span>{axis}</span>
                      <input
                        type="number"
                        className="prepare-input"
                        step={5}
                        min={0}
                        value={Math.round(b[axis])}
                        onChange={(e) => moveField(selectedField.id, axis, e.target.valueAsNumber)}
                      />
                    </label>
                  ))}
                </div>
              </>
            )
          })()}

          {(editableKind(selectedField.id) === 'image' || editableKind(selectedField.id) === 'checkbox') && (
            <button
              className="prepare-btn prepare-btn--primary"
              style={{ width: '100%', marginBottom: 14 }}
              onClick={() => openFieldEditor(selectedField.id)}
            >
              {(() => {
                const k = editableKind(selectedField.id)
                return k === 'image' ? 'Add image…' : 'Toggle checked'
              })()}
            </button>
          )}

          <div className="prepare-label">Assign to</div>
          <div className="prepare-assign-row">
            {recipients.map((recipient) => {
              const active = selectedField.customData?.recipientId === recipient.id
              return (
                <button
                  key={recipient.id}
                  className={`prepare-assign-chip${active ? ' prepare-assign-chip--active' : ''}`}
                  style={active ? { borderColor: recipient.color, color: recipient.color } : undefined}
                  onClick={() => assignRecipient(recipient)}
                >
                  <span className="prepare-avatar prepare-avatar--sm" style={{ background: recipient.color }}>{recipient.initials}</span>
                  {recipient.name}
                </button>
              )
            })}
          </div>

          <button className="prepare-btn prepare-btn--danger" onClick={deleteSelected}>
            <Trash2 size={13} /> Delete field
          </button>
        </div>
      ) : (
        <div className="prepare-inspector__empty">
          <MousePointerClick size={20} />
          <p>Pick a field from the palette, click it onto the document, then select it here to assign a recipient.</p>
        </div>
      )}

      <div className="prepare-ledger">
        <div className="prepare-rail__eyebrow">Signing ledger</div>
        {ledger.map(({ recipient, fields: recipientFields }) => (
          <div className="prepare-ledger__group" key={recipient.id}>
            <div className="prepare-ledger__head">
              <span className="prepare-avatar prepare-avatar--sm" style={{ background: recipient.color }}>{recipient.initials}</span>
              <span>{recipient.name}</span>
              <span className="prepare-count">{recipientFields.length}</span>
            </div>
            {recipientFields.length > 0 && (
              <div className="prepare-ledger__chips">
                {recipientFields.map((f) => (
                  <button key={f.id} className="prepare-field-chip" onClick={() => focusField(f.id)}>{fieldLabel(f)}</button>
                ))}
              </div>
            )}
          </div>
        ))}
        {unassignedFields.length > 0 && (
          <div className="prepare-ledger__group">
            <div className="prepare-ledger__head prepare-ledger__head--muted">
              <span>Unassigned</span>
              <span className="prepare-count">{unassignedFields.length}</span>
            </div>
            <div className="prepare-ledger__chips">
              {unassignedFields.map((f) => (
                <button key={f.id} className="prepare-field-chip" onClick={() => focusField(f.id)}>{fieldLabel(f)}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )

  // Add Signature / Add Initial dialog: TYPE tab by default (no slide animation), our 4 fonts,
  // "Type here.." placeholder previews.
  useEffect(() => installSignatureDialogEnhancements('signflow-pdf-viewer', Object.values(TYPE_SIGNATURE_FONTS)), [])

  return (
    <div className="workspace-page prepare-design">
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={onImagePicked} />
      <div className="prepare-topbar">
        <Link to="/" className="prepare-back" aria-label="Back to SignFlow"><ArrowLeft size={16} /></Link>
        <div className="prepare-titleblock">
          <div className="prepare-title">{activeDocument.name}</div>
          <div className="prepare-title__meta">Draft &middot; autosaved</div>
        </div>
        <div className="prepare-topbar__spacer" />
        <button className="prepare-btn prepare-btn--primary" disabled={!readyToSend} onClick={sendForSigning}>Send for signing</button>
      </div>

      {isMobile ? (
        <>
          <div className="prepare-mobile-canvas">{renderCanvas()}</div>
          <div className="prepare-mobile-bar">
            <button className="prepare-mobile-bar__btn" onClick={() => setOpenSheet('palette')}>
              <LayoutGrid size={16} /> Fields
            </button>
            <button className="prepare-mobile-bar__btn" onClick={() => setOpenSheet('inspector')}>
              <UserSquare2 size={16} /> {selectedField ? 'Assign field' : 'Ledger'}
            </button>
          </div>
          <MobileSheet open={openSheet === 'palette'} onClose={() => setOpenSheet(null)} title="Add fields">
            {renderPalette()}
          </MobileSheet>
          <MobileSheet open={openSheet === 'inspector'} onClose={() => setOpenSheet(null)} title="Field & recipients">
            {renderInspector()}
          </MobileSheet>
        </>
      ) : (
        <div className="prepare-panes">
          <div className="prepare-panes__side prepare-panes__side--left">{renderPalette()}</div>
          <div className="prepare-panes__center">{renderCanvas()}</div>
          <div className="prepare-panes__side prepare-panes__side--right">{renderInspector()}</div>
        </div>
      )}
    </div>
  )
}
