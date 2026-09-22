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
} from '@syncfusion/ej2-react-pdfviewer'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Eye, Trash2, MousePointerClick, Check, Plus, Loader2, LayoutGrid, UserSquare2,
  PenTool, PencilLine, Type, Calendar, CalendarClock, CheckSquare, CircleDot,
  User, Mail, Briefcase, Building2, Image as ImageIcon, Tag, Link2, ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { CalendarComponent } from '@syncfusion/ej2-react-calendars'
import { getDocument } from '../../data/documents'
import { RECIPIENTS, RECIPIENT_COLORS, type Recipient } from '../../data/recipients'
import { savePreparedDoc, getSessionDocument, getDraftSetup, type PreparedField } from '../../data/sessionStore'
import { getAssetBasePath } from '../../basePath'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MobileSheet } from '../../components/MobileSheet'
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

type BaseFieldType = 'SignatureField' | 'InitialField' | 'Textbox' | 'Checkbox' | 'RadioButton' | 'DropDown'
interface FieldDef {
  key: string
  label: string
  base: BaseFieldType
  semantic: string
  readOnly?: boolean
  defaultValue?: string
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
      { key: 'checkbox', label: 'Checkbox', base: 'Checkbox', semantic: 'checkbox', Icon: CheckSquare },
      { key: 'radio', label: 'Radio', base: 'RadioButton', semantic: 'radio', Icon: CircleDot },
      { key: 'dropdown', label: 'Dropdown', base: 'DropDown', semantic: 'dropdown', Icon: ChevronDown },
    ],
  },
  {
    group: 'Content',
    items: [
      { key: 'image', label: 'Image', base: 'Textbox', semantic: 'image', readOnly: true, Icon: ImageIcon },
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
  Checkbox: { W: 22, H: 22 },
  RadioButton: { W: 22, H: 22 },
  DropDown: { W: 160, H: 24 },
}
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
  const activeDocument = useMemo(() => getSessionDocument(documentId) ?? getDocument(documentId), [documentId])
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

  const [recipients, setRecipients] = useState<Recipient[]>(() => getDraftSetup(documentId)?.recipients ?? RECIPIENTS)
  const [activeRecipientId, setActiveRecipientId] = useState<string>(RECIPIENTS[0]?.id ?? '')
  const [showAddRecip, setShowAddRecip] = useState(false)

  const [fields, setFields] = useState<SignFlowFormField[]>([])
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [documentReady, setDocumentReady] = useState(false)
  // Draft-time value editor popup (date / text) and image handling.
  const [editor, setEditor] = useState<{ fieldId: string; kind: 'date' | 'text'; value: string; left: number; top: number } | null>(null)
  const selectedFieldIdRef = useRef<string | null>(null)
  const editorOpenRef = useRef(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageTargetRef = useRef<string | null>(null)
  const imageDataRef = useRef<Map<string, string>>(new Map())
  const placeholderTextRef = useRef<Map<string, string>>(new Map())
  const openEditorRef = useRef<(id: string) => void>(() => {})

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
  const activeRecipientRef = useRef<string>(activeRecipientId)
  const activeColorRef = useRef<string>('')
  useEffect(() => { activeRecipientRef.current = activeRecipientId }, [activeRecipientId])
  useEffect(() => {
    activeColorRef.current = recipients.find((r) => r.id === activeRecipientId)?.color ?? ''
  }, [recipients, activeRecipientId])
  useEffect(() => { selectedFieldIdRef.current = selectedFieldId }, [selectedFieldId])
  useEffect(() => { editorOpenRef.current = !!editor }, [editor])
  // Delete / Backspace removes the selected field (unless typing in an input).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const ae = document.activeElement as HTMLElement | null
      const tag = (ae?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || ae?.isContentEditable) return
      if (editorOpenRef.current) return
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
    const filled = !!(liveVal.trim() || entry?.value || entry?.imageData)
    lbl.style.display = filled ? 'none' : ''
  }
  useEffect(() => {
    const t = window.setInterval(() => {
      layoutRef.current.forEach((entry, id) => {
        syncFieldName(id)
        if (entry.imageData) {
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
  }, [activeDocument.id])

  const handleDocumentLoad = useCallback(() => setDocumentReady(true), [])

  const placeField = (def: FieldDef) => {
    const fd = getFd()
    if (!fd || !documentReady) return
    pendingRef.current = def
    const n = placeCounterRef.current++
    const size = DEFAULT_SIZE[def.base]
    const bounds = { X: 120 + (n % 4) * 26, Y: 300 + (n % 8) * 46, Width: size.W, Height: size.H }
    pendingBoundsRef.current = bounds
    pendingPageRef.current = 0
    try { fd.addFormField(def.base as never, { bounds, pageIndex: 0 } as never) } catch { /* best-effort */ }
    if (isMobile) setOpenSheet(null)
  }

  const handleFieldAdd = useCallback((args: { field: SignFlowFormField }) => {
    if (!args?.field?.id) return
    setFields((prev) => (prev.some((f) => f.id === args.field.id) ? prev : [...prev, args.field]))
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
    const url = imageDataRef.current.get(fieldId)
    if (!url) return
    const el = document.getElementById(fieldId)
    if (el) {
      el.style.backgroundImage = `url("${url}")`
      el.style.backgroundSize = 'contain'
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
    if (!args?.field?.id) return
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

  const selectedField = useMemo(() => fields.find((f) => f.id === selectedFieldId) ?? null, [fields, selectedFieldId])

  const fieldLabel = (f: SignFlowFormField) =>
    f.customData?.semantic ? SEMANTIC_LABEL[f.customData.semantic] ?? f.type : f.name || f.type

  const assignRecipient = (recipient: Recipient) => {
    if (!selectedField) return
    const patch: Record<string, unknown> = {
      customData: { semantic: selectedField.customData?.semantic, recipientId: recipient.id },
      borderColor: recipient.color,
      color: recipient.color,
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
    if (base === 'Checkbox') return 'checkbox'
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
    const el = document.getElementById(fieldId)
    const r = el?.getBoundingClientRect()
    const entry = layoutRef.current.get(fieldId)
    setEditor({
      fieldId,
      kind,
      value: entry?.value ?? '',
      left: Math.min(Math.max(8, (r?.left ?? 240)), window.innerWidth - 268),
      top: Math.min((r?.bottom ?? 240) + 6, window.innerHeight - 220),
    })
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

  const sendForSigning = () => {
    // Sync final positions/sizes from the live viewer (fields the user dragged or resized).
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
    })
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
    const size = DEFAULT_SIZE[def.base]
    const info: any = getViewer()?.getPageInfo?.(loc.pageIndex)
    const uw = ((info?.width as number) || 612) * (96 / 72)
    const uh = ((info?.height as number) || 792) * (96 / 72)
    const X = Math.min(Math.max(2, loc.X - size.W / 2), Math.max(2, uw - size.W - 2))
    const Y = Math.min(Math.max(2, loc.Y - size.H / 2), Math.max(2, uh - size.H - 2))
    const bounds = { X, Y, Width: size.W, Height: size.H }
    pendingBoundsRef.current = bounds
    pendingPageRef.current = loc.pageIndex
    try { getFd()?.addFormField(def.base as never, { bounds, pageIndex: loc.pageIndex } as never) } catch { /* best-effort */ }
  }

  // Pointer-based drag (not HTML5 DnD): we render our own ghost following the cursor and drop the
  // field at that exact same point, so what you see is precisely where it lands — no browser
  // drag-image offset, no dpi/zoom guesswork.
  const beginPointerDrag = (e: React.MouseEvent, def: FieldDef) => {
    if (!documentReady || e.button !== 0) return
    const startX = e.clientX, startY = e.clientY
    let dragging = false
    let ghost: HTMLDivElement | null = null
    const size = DEFAULT_SIZE[def.base]

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
        suppressClickRef.current = true
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
        style={{ height: '100%', visibility: documentReady ? 'visible' : 'hidden' }}
        documentLoad={handleDocumentLoad}
        formFieldAdd={handleFieldAdd}
        formFieldRemove={handleFieldRemove}
        formFieldSelect={handleFieldSelect}
        formFieldUnselect={handleFieldUnselect}
        formFieldPropertiesChange={handleFieldPropertiesChange}
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

          {editableKind(selectedField.id) && (
            <button
              className="prepare-btn prepare-btn--primary"
              style={{ width: '100%', marginBottom: 14 }}
              onClick={() => openFieldEditor(selectedField.id)}
            >
              {(() => {
                const k = editableKind(selectedField.id)
                return k === 'image' ? 'Add image…' : k === 'date' ? 'Set date…' : k === 'checkbox' ? 'Toggle checked' : 'Set value…'
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

  // Default the Add Signature/Initial dialog to the TYPE tab (typed signatures use our fonts).
  useEffect(() => {
    let obs: MutationObserver | null = null
    let timer: number | undefined
    const clickType = () => {
      const dd = document.getElementById('signflow-pdf-viewer_signature_window')
      if (!dd || !dd.classList.contains('e-popup-open')) return
      const items = Array.from(dd.querySelectorAll('.e-toolbar-item')) as HTMLElement[]
      const typeItem = items.find((it) => it.querySelector('.e-tab-text')?.textContent === 'TYPE')
      if (typeItem && !typeItem.classList.contains('e-active')) {
        ;(typeItem.querySelector('.e-tab-wrap') as HTMLElement | null)?.click()
      }
    }
    const selectType = () => {
      const dlg = document.getElementById('signflow-pdf-viewer_signature_window') as HTMLElement | null
      if (!dlg || !dlg.classList.contains('e-popup-open')) return
      ;[0, 120, 300, 600].forEach((d) => window.setTimeout(clickType, d))
    }
    const attach = () => {
      const dlg = document.getElementById('signflow-pdf-viewer_signature_window')
      if (!dlg) return false
      selectType()
      obs = new MutationObserver(selectType)
      obs.observe(dlg, { attributes: true, attributeFilter: ['class'] })
      return true
    }
    // Workaround: the Add INITIAL dialog ignores typeSignatureFonts (uses Helvetica/Times/
    // Courier/Symbol) even though the setting is applied — unlike Add Signature. Remap those
    // defaults to our custom signature fonts on the preview elements (the created initial picks
    // up the preview's font).
    const FONT_MAP: Record<string, string> = {
      helvetica: 'Priestacy', 'times new roman': 'Runethia', times: 'Runethia',
      courier: 'Rustic Roadway', 'courier new': 'Rustic Roadway', symbol: 'Symphonie Calligraphy',
    }
    const mapFonts = () => {
      const dlg = document.getElementById('signflow-pdf-viewer_signature_window')
      if (!dlg || !dlg.classList.contains('e-popup-open')) return
      dlg.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (el.children.length) return
        const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
        const target = FONT_MAP[fam]
        if (target) el.style.setProperty('font-family', `"${target}"`, 'important')
      })
    }
    const fontTimer = window.setInterval(mapFonts, 200)

    if (!attach()) {
      timer = window.setInterval(() => { if (attach() && timer) { clearInterval(timer); timer = undefined } }, 500)
      window.setTimeout(() => { if (timer) clearInterval(timer) }, 15000)
    }
    return () => { if (timer) clearInterval(timer); clearInterval(fontTimer); obs?.disconnect() }
  }, [])

  return (
    <div className="workspace-page prepare-design">
      {editor && editor.kind === 'date' && (
        <>
          <div className="field-editor__backdrop" onClick={() => setEditor(null)} />
          <div className="field-editor field-editor--calendar" style={{ left: editor.left, top: editor.top }}>
            <CalendarComponent
              value={editor.value ? new Date(editor.value) : undefined}
              change={(e: any) => {
                if (!e?.value) return
                const v = new Date(e.value).toLocaleDateString('en-US')
                setFieldValue(editor.fieldId, v)
                setEditor(null)
              }}
            />
          </div>
        </>
      )}
      {editor && editor.kind === 'text' && (
        <div className="field-editor" style={{ left: editor.left, top: editor.top }}>
          <div className="field-editor__label">Enter value</div>
          <input
            type="text"
            autoFocus
            value={editor.value}
            placeholder="Type a value"
            onChange={(e) => setEditor((ed) => (ed ? { ...ed, value: e.target.value } : ed))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setFieldValue(editor.fieldId, editor.value); setEditor(null) }
              if (e.key === 'Escape') setEditor(null)
            }}
          />
          <div className="field-editor__hint">Shows on the document as the field&rsquo;s value.</div>
          <div className="field-editor__row">
            <button className="prepare-btn prepare-btn--primary" onClick={() => { setFieldValue(editor.fieldId, editor.value); setEditor(null) }}>Save</button>
            <button className="prepare-btn" onClick={() => setEditor(null)}>Done</button>
          </div>
        </div>
      )}
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={onImagePicked} />
      <div className="prepare-topbar">
        <Link to="/" className="prepare-back" aria-label="Back to SignFlow"><ArrowLeft size={16} /></Link>
        <div className="prepare-titleblock">
          <div className="prepare-title">{activeDocument.name}</div>
          <div className="prepare-title__meta">Draft &middot; autosaved</div>
        </div>
        <div className="prepare-topbar__spacer" />
        {!isMobile && (
          <div className="prepare-avatarstack">
            {recipients.map((recipient) => (
              <span key={recipient.id} className="prepare-avatar prepare-avatar--stacked" style={{ background: recipient.color }} title={`${recipient.name} · ${recipient.role}`}>{recipient.initials}</span>
            ))}
            <button className="prepare-avatar prepare-avatar--add" aria-label="Add recipient" onClick={() => setShowAddRecip(true)}><Plus size={13} /></button>
          </div>
        )}
        {!isMobile && (
          <button className="prepare-icon-btn" aria-label="Preview as recipient"><Eye size={16} /></button>
        )}
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
