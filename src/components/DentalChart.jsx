import { useEffect, useMemo, useRef, useState } from 'react'

// Universal Numbering System (Adult dentition 1-32)
// Upper Arch (Maxillary): 1 to 16 (Right to Left)
// Lower Arch (Mandibular): 32 to 17 (Right to Left, matching mouth orientation: 17 on left, 32 on right)
const UPPER_TEETH = [
  { id: '1', name: 'Third Molar (Wisdom)', pos: 'Upper Right' },
  { id: '2', name: 'Second Molar', pos: 'Upper Right' },
  { id: '3', name: 'First Molar', pos: 'Upper Right' },
  { id: '4', name: 'Second Premolar', pos: 'Upper Right' },
  { id: '5', name: 'First Premolar', pos: 'Upper Right' },
  { id: '6', name: 'Canine (Cuspid)', pos: 'Upper Right' },
  { id: '7', name: 'Lateral Incisor', pos: 'Upper Right' },
  { id: '8', name: 'Central Incisor', pos: 'Upper Right' },
  { id: '9', name: 'Central Incisor', pos: 'Upper Left' },
  { id: '10', name: 'Lateral Incisor', pos: 'Upper Left' },
  { id: '11', name: 'Canine (Cuspid)', pos: 'Upper Left' },
  { id: '12', name: 'First Premolar', pos: 'Upper Left' },
  { id: '13', name: 'Second Premolar', pos: 'Upper Left' },
  { id: '14', name: 'First Molar', pos: 'Upper Left' },
  { id: '15', name: 'Second Molar', pos: 'Upper Left' },
  { id: '16', name: 'Third Molar (Wisdom)', pos: 'Upper Left' },
]

const LOWER_TEETH = [
  { id: '32', name: 'Third Molar (Wisdom)', pos: 'Lower Right' },
  { id: '31', name: 'Second Molar', pos: 'Lower Right' },
  { id: '30', name: 'First Molar', pos: 'Lower Right' },
  { id: '29', name: 'Second Premolar', pos: 'Lower Right' },
  { id: '28', name: 'First Premolar', pos: 'Lower Right' },
  { id: '27', name: 'Canine (Cuspid)', pos: 'Lower Right' },
  { id: '26', name: 'Lateral Incisor', pos: 'Lower Right' },
  { id: '25', name: 'Central Incisor', pos: 'Lower Right' },
  { id: '24', name: 'Central Incisor', pos: 'Lower Left' },
  { id: '23', name: 'Lateral Incisor', pos: 'Lower Left' },
  { id: '22', name: 'Canine (Cuspid)', pos: 'Lower Left' },
  { id: '21', name: 'First Premolar', pos: 'Lower Left' },
  { id: '20', name: 'Second Premolar', pos: 'Lower Left' },
  { id: '19', name: 'First Molar', pos: 'Lower Left' },
  { id: '18', name: 'Second Molar', pos: 'Lower Left' },
  { id: '17', name: 'Third Molar (Wisdom)', pos: 'Lower Left' },
]

export const DENTAL_COLORS = [
  {
    id: 'blue',
    label: 'Restoration / Filling',
    hex: '#0284c7',
    borderClass: 'border-sky-500 bg-sky-100 text-sky-950',
    solidClass: 'bg-sky-500 border-sky-600 text-white',
    badgeClass: 'bg-sky-700 text-white',
  },
  {
    id: 'red',
    label: 'Extracted / Missing',
    hex: '#e11d48',
    borderClass: 'border-rose-500 bg-rose-100 text-rose-950',
    solidClass: 'bg-rose-500 border-rose-600 text-white',
    badgeClass: 'bg-rose-700 text-white',
  },
  {
    id: 'purple',
    label: 'Crown / Root Canal',
    hex: '#9333ea',
    borderClass: 'border-purple-500 bg-purple-100 text-purple-950',
    solidClass: 'bg-purple-600 border-purple-700 text-white',
    badgeClass: 'bg-purple-800 text-white',
  },
  {
    id: 'green',
    label: 'Healthy / Cleaned',
    hex: '#16a34a',
    borderClass: 'border-emerald-500 bg-emerald-100 text-emerald-950',
    solidClass: 'bg-emerald-600 border-emerald-700 text-white',
    badgeClass: 'bg-emerald-800 text-white',
  },
  {
    id: 'amber',
    label: 'Decay / Attention',
    hex: '#d97706',
    borderClass: 'border-amber-500 bg-amber-100 text-amber-950',
    solidClass: 'bg-amber-500 border-amber-600 text-white',
    badgeClass: 'bg-amber-800 text-white',
  },
  {
    id: 'orange',
    label: 'Orthodontics / Braces',
    hex: '#ea580c',
    borderClass: 'border-orange-500 bg-orange-100 text-orange-950',
    solidClass: 'bg-orange-500 border-orange-600 text-white',
    badgeClass: 'bg-orange-800 text-white',
  },
]

export function getToothTreatmentType(procedure = '') {
  const text = String(procedure || '').toLowerCase()
  if (text.includes('extract') || text.includes('surgery')) return 'red'
  if (text.includes('fill') || text.includes('restor') || text.includes('sealant')) return 'blue'
  if (text.includes('root canal') || text.includes('rct') || text.includes('crown') || text.includes('cap') || text.includes('veneer')) return 'purple'
  if (text.includes('clean') || text.includes('prophylaxis') || text.includes('check')) return 'green'
  if (text.includes('decay') || text.includes('caries') || text.includes('pain')) return 'amber'
  if (text.includes('brace') || text.includes('ortho')) return 'orange'
  return 'blue'
}

export function getToothSpecificTreatment(treatment, toothId, customColors = {}) {
  if (!toothId) return null

  const idStr = String(toothId).trim()
  const idNum = String(Number(idStr))

  // 1. Check record's toothColorMap
  let rawColor = null
  if (treatment?.toothColorMap) {
    const map = treatment.toothColorMap instanceof Map
      ? Object.fromEntries(treatment.toothColorMap)
      : treatment.toothColorMap
    if (typeof map === 'object' && map !== null) {
      rawColor = map[idStr] || map[idNum]
    }
  }

  // 2. Fallback to customColors currently active on the chart
  if (!rawColor && customColors && typeof customColors === 'object') {
    rawColor = customColors[idStr] || customColors[idNum]
  }

  // 3. Match against DENTAL_COLORS by id or label
  if (rawColor) {
    const directMatch = DENTAL_COLORS.find(
      (c) => c.id.toLowerCase() === String(rawColor).toLowerCase() || c.label.toLowerCase() === String(rawColor).toLowerCase(),
    )
    if (directMatch) return directMatch

    const derivedId = getToothTreatmentType(rawColor)
    const derivedMatch = DENTAL_COLORS.find((c) => c.id === derivedId)
    if (derivedMatch) return derivedMatch
  }

  // 4. If no color map, inspect procedure string
  const proc = treatment?.procedure || treatment?.treatment || treatment?.servicePerformed || ''
  if (proc) {
    if (!proc.includes(',')) {
      const derivedId = getToothTreatmentType(proc)
      const colorMatch = DENTAL_COLORS.find((c) => c.id === derivedId)
      return {
        id: colorMatch?.id || 'blue',
        label: proc,
        borderClass: colorMatch?.borderClass || 'border-sky-500 bg-sky-100 text-sky-950',
        solidClass: colorMatch?.solidClass || 'bg-sky-600 text-white',
        badgeClass: colorMatch?.badgeClass || 'bg-sky-700 text-white',
        hex: colorMatch?.hex || '#0284c7',
      }
    }
  }

  return null
}

function ToothGraphic({ tooth, treatments = [], isSelected = false, customColor, onClick, interactive = false }) {
  const hasTreatments = treatments.length > 0
  const latestTreatment = treatments[0]
  const specificTreatment = latestTreatment ? getToothSpecificTreatment(latestTreatment, tooth.id) : null
  const defaultTreatmentColorId = specificTreatment?.id || (latestTreatment ? getToothTreatmentType(latestTreatment.procedure || latestTreatment.service || latestTreatment.treatment) : null)

  // In interactive mode, only display colored treatment styling if the tooth is currently selected and has a color assigned.
  // When unselected in interactive mode, remove background color completely (neutral white card).
  const activeColorId = interactive
    ? (isSelected ? customColor : undefined)
    : (customColor || defaultTreatmentColorId)

  const colorConfig = DENTAL_COLORS.find((c) => c.id === activeColorId)

  let toothTone = 'border-slate-200 bg-white text-slate-700 hover:border-sky-400'
  let badgeColor = 'bg-slate-100 text-slate-700'
  let svgColor = '#94a3b8'

  if (colorConfig && isSelected) {
    // Boldly colored card in the treatment color
    toothTone = `${colorConfig.solidClass} ring-3 ring-sky-950 shadow-lg scale-105 font-bold`
    badgeColor = 'bg-white text-slate-900 font-black'
    svgColor = '#ffffff'
  } else if (colorConfig && !interactive) {
    // Treated tooth display: rich tinted background with colored tooth icon and border
    toothTone = `${colorConfig.borderClass} ring-1 font-semibold`
    badgeColor = colorConfig.badgeClass
    svgColor = colorConfig.hex
  } else if (isSelected) {
    // Selected without custom color yet: clear active state waiting for color choice
    toothTone = 'border-sky-500 bg-sky-50 text-sky-950 ring-2 ring-sky-400 shadow-md scale-105 font-bold'
    badgeColor = 'bg-sky-600 text-white font-bold'
    svgColor = '#0284c7'
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(tooth)}
      className={`group relative flex flex-col items-center justify-between rounded-xl border p-2 text-center transition-all ${toothTone} ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
      title={`${tooth.pos} - Tooth #${tooth.id}: ${tooth.name}${colorConfig ? ` (${colorConfig.label})` : ''}${hasTreatments ? ` · ${treatments.length} past record${treatments.length > 1 ? 's' : ''}` : ''}`}
    >
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${badgeColor}`}>
        {tooth.id}
      </span>
      {/* Visual anatomical tooth shape */}
      <svg className="my-1 h-6 w-5 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 28" style={{ color: svgColor }} fill="currentColor">
        <path d="M4 8 C4 3, 20 3, 20 8 C20 13, 17 17, 16 25 C14 27, 13 25, 12 21 C11 25, 10 27, 8 25 C7 17, 4 13, 4 8 Z" opacity={isSelected ? 1 : 0.88} />
      </svg>
      <span className="truncate text-[9px] font-medium leading-tight opacity-90">
        {tooth.name.split(' ')[0]}
      </span>
      {isSelected ? (
        <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sky-950 text-[8px] font-black text-white shadow-xs">
          ✓
        </span>
      ) : null}
      {hasTreatments && !isSelected ? (
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-white shadow-xs">
          {treatments.length}
        </span>
      ) : null}
    </button>
  )
}

function DentalChart({
  records = [],
  selectedTeeth = [],
  selectedTooth = '',
  initialProcedure = '',
  initialToothColors = null,
  onSelectTeeth,
  onSelectTooth,
  onToothColorsChange,
  interactive = true,
  title = 'Patient Dental Chart',
}) {
  const initialColor = useMemo(() => {
    return initialProcedure ? getToothTreatmentType(initialProcedure) : 'blue'
  }, [initialProcedure])

  const areColorMapsEqual = (a = {}, b = {}) => {
    const keysA = Object.keys(a || {})
    const keysB = Object.keys(b || {})
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => a[k] === b[k])
  }

  const [activeColor, setActiveColor] = useState(initialColor)
  const [toothCustomColors, setToothCustomColors] = useState(() => initialToothColors || {})
  const [inspectingToothId, setInspectingToothId] = useState(null)
  const [popoverToothId, setPopoverToothId] = useState(null)

  const lastNotifiedRef = useRef(initialToothColors || {})

  useEffect(() => {
    if (initialProcedure) {
      const derived = getToothTreatmentType(initialProcedure)
      setActiveColor(derived)
    }
  }, [initialProcedure])

  // Sync custom colors when initialToothColors prop actually changes from parent
  useEffect(() => {
    if (initialToothColors && typeof initialToothColors === 'object') {
      setToothCustomColors((prev) => {
        if (areColorMapsEqual(prev, initialToothColors)) return prev
        return { ...initialToothColors }
      })
    }
  }, [initialToothColors])

  // Notify parent whenever tooth colors change and differ from last notification
  useEffect(() => {
    if (!areColorMapsEqual(lastNotifiedRef.current, toothCustomColors)) {
      lastNotifiedRef.current = toothCustomColors
      onToothColorsChange?.(toothCustomColors)
    }
  }, [toothCustomColors, onToothColorsChange])

  // Parse currently selected teeth from either array prop or comma-separated string prop
  const currentSelectedSet = useMemo(() => {
    const set = new Set()
    if (Array.isArray(selectedTeeth)) {
      selectedTeeth.forEach((t) => set.add(String(t).trim()))
    }
    if (selectedTooth) {
      String(selectedTooth)
        .split(/[,;\s]+/)
        .map((num) => num.replace(/[^0-9]/g, '').trim())
        .filter(Boolean)
        .forEach((num) => set.add(num))
    }
    return set
  }, [selectedTeeth, selectedTooth])

  // Map tooth records by toothNumber and toothColorMap
  const toothRecordMap = useMemo(() => {
    const map = {}
    records.forEach((record) => {
      const toothSet = new Set()
      const tooth = String(record.toothNumber || '').trim()
      if (tooth) {
        tooth.split(/[,;\s]+/).map((num) => num.replace(/[^0-9]/g, '')).filter(Boolean).forEach((num) => toothSet.add(num))
      }
      const colorMap = record.toothColorMap instanceof Map
        ? Object.fromEntries(record.toothColorMap)
        : (record.toothColorMap || {})
      if (typeof colorMap === 'object' && colorMap !== null) {
        Object.keys(colorMap).forEach((num) => toothSet.add(String(num).trim()))
      }

      toothSet.forEach((num) => {
        if (!map[num]) map[num] = []
        map[num].push(record)
      })
    })
    return map
  }, [records])

  const handleToothClick = (tooth) => {
    const toothId = tooth.id

    if (!interactive) {
      setInspectingToothId(toothId)
      return
    }

    const nextSelected = new Set(currentSelectedSet)
    if (nextSelected.has(toothId)) {
      // Unselect: remove from selected set AND clear its custom color
      nextSelected.delete(toothId)
      setToothCustomColors((prev) => {
        const next = { ...prev }
        delete next[toothId]
        return next
      })
      if (inspectingToothId === toothId) setInspectingToothId(null)
      if (popoverToothId === toothId) setPopoverToothId(null)
    } else {
      // Select tooth: don't assign color yet, show popover to pick color
      nextSelected.add(toothId)
      setInspectingToothId(toothId)
      setPopoverToothId(toothId)
    }

    const nextList = Array.from(nextSelected).sort((a, b) => Number(a) - Number(b))
    onSelectTeeth?.(nextList)
    onSelectTooth?.(nextList.join(', '))
  }

  const assignColorToTooth = (toothId, colorId) => {
    setActiveColor(colorId)
    setToothCustomColors((prev) => ({ ...prev, [toothId]: colorId }))
    setPopoverToothId(null)
  }

  const handleSelectColor = (colorId) => {
    setActiveColor(colorId)
    // If a single tooth is currently being inspected/focused, assign the new color to that specific tooth
    if (inspectingToothId && currentSelectedSet.has(inspectingToothId)) {
      setToothCustomColors((prev) => ({ ...prev, [inspectingToothId]: colorId }))
    }
    setPopoverToothId(null)
  }

  const selectAllArch = (archTeeth) => {
    if (!interactive) return
    const nextSelected = new Set(currentSelectedSet)
    archTeeth.forEach((t) => {
      nextSelected.add(t.id)
      if (activeColor) {
        setToothCustomColors((prev) => ({ ...prev, [t.id]: activeColor }))
      }
    })
    const nextList = Array.from(nextSelected).sort((a, b) => Number(a) - Number(b))
    onSelectTeeth?.(nextList)
    onSelectTooth?.(nextList.join(', '))
  }

  const clearSelection = () => {
    if (!interactive) return
    onSelectTeeth?.([])
    onSelectTooth?.('')
    setToothCustomColors({})
    setInspectingToothId(null)
    setPopoverToothId(null)
  }

  const allTeeth = useMemo(() => UPPER_TEETH.concat(LOWER_TEETH), [])
  const inspectedTooth = allTeeth.find((t) => t.id === inspectingToothId)
  const inspectedTreatments = inspectedTooth ? (toothRecordMap[inspectedTooth.id] || []) : []
  const inspectedToothColorId = toothCustomColors[inspectedTooth?.id]
  const inspectedToothCondition = inspectedToothColorId
    ? DENTAL_COLORS.find((c) => c.id === inspectedToothColorId)
    : (inspectedTreatments.length ? getToothSpecificTreatment(inspectedTreatments[0], inspectedTooth?.id, toothCustomColors) : null)

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Invisible backdrop to close active popover when clicking anywhere outside */}
      {interactive && popoverToothId ? (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setPopoverToothId(null)}
        />
      ) : null}

      {/* Header and Quick Stats */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-sky-950">{title}</h3>
          <p className="text-xs text-slate-500">
            Universal Adult Dentition (1–32) · Click a tooth to select and choose its condition.
          </p>
        </div>

        {/* Selected count badge and actions */}
        {interactive ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-950 ring-1 ring-sky-200">
              {currentSelectedSet.size} Teeth Selected {currentSelectedSet.size > 0 ? `(${Array.from(currentSelectedSet).join(', ')})` : ''}
            </span>
            {currentSelectedSet.size > 0 ? (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Color Legend (non-interactive mode) */}
      {!interactive ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          {DENTAL_COLORS.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
              {c.label}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-bold text-slate-700">Treatment Legend:</span>
            <div className="flex flex-wrap items-center gap-2">
              {DENTAL_COLORS.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                  {c.label}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">Click a tooth to select it, then choose a treatment color from the popup.</p>
        </div>
      )}

      {/* Dental Arch Display */}
      <div className="mt-5 space-y-4">
        {/* Upper Arch (Maxillary) */}
        <div>
          <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold text-slate-400">
            <span>UPPER RIGHT (1–8)</span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">Maxillary Arch</span>
              {interactive ? (
                <button
                  type="button"
                  onClick={() => selectAllArch(UPPER_TEETH)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-sky-700 hover:bg-sky-50 underline font-semibold"
                >
                  Select All Upper
                </button>
              ) : null}
            </div>
            <span>UPPER LEFT (9–16)</span>
          </div>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-16">
            {UPPER_TEETH.map((tooth, idx) => {
              const isSelected = currentSelectedSet.has(tooth.id)
              const colorForTooth = toothCustomColors[tooth.id] || undefined
              return (
                <div key={tooth.id} className="relative">
                  <ToothGraphic
                    tooth={tooth}
                    isSelected={isSelected}
                    customColor={colorForTooth}
                    treatments={toothRecordMap[tooth.id] || []}
                    onClick={handleToothClick}
                    interactive={interactive}
                  />
                  {interactive && popoverToothId === tooth.id ? (
                    <div
                      className={`absolute top-full z-30 mt-1 min-w-[170px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl ${
                        idx < 3 ? 'left-0' : idx > 12 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-1.5 flex items-center justify-between border-b border-slate-100 pb-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Tooth #{tooth.id} Treatment</span>
                        <button
                          type="button"
                          onClick={() => setPopoverToothId(null)}
                          className="text-slate-400 hover:text-slate-600 text-xs leading-none"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                        {DENTAL_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => assignColorToTooth(tooth.id, c.id)}
                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition hover:scale-[1.02] ${
                              toothCustomColors[tooth.id] === c.id
                                ? `${c.solidClass} ring-2 ring-sky-400`
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="h-3 w-3 rounded-full shrink-0 ring-1 ring-white" style={{ backgroundColor: c.hex }} />
                            {c.label}
                          </button>
                        ))}
                        {toothCustomColors[tooth.id] ? (
                          <button
                            type="button"
                            onClick={() => {
                              setToothCustomColors((prev) => {
                                const next = { ...prev }
                                delete next[tooth.id]
                                return next
                              })
                              setPopoverToothId(null)
                            }}
                            className="mt-0.5 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition"
                          >
                            Clear Color
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        {/* Lower Arch (Mandibular) */}
        <div className="border-t border-dashed border-slate-200 pt-3">
          <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-bold text-slate-400">
            <span>LOWER RIGHT (32–25)</span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">Mandibular Arch</span>
              {interactive ? (
                <button
                  type="button"
                  onClick={() => selectAllArch(LOWER_TEETH)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-sky-700 hover:bg-sky-50 underline font-semibold"
                >
                  Select All Lower
                </button>
              ) : null}
            </div>
            <span>LOWER LEFT (24–17)</span>
          </div>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-16">
            {LOWER_TEETH.map((tooth, idx) => {
              const isSelected = currentSelectedSet.has(tooth.id)
              const colorForTooth = toothCustomColors[tooth.id] || undefined
              return (
                <div key={tooth.id} className="relative">
                  <ToothGraphic
                    tooth={tooth}
                    isSelected={isSelected}
                    customColor={colorForTooth}
                    treatments={toothRecordMap[tooth.id] || []}
                    onClick={handleToothClick}
                    interactive={interactive}
                  />
                  {interactive && popoverToothId === tooth.id ? (
                    <div
                      className={`absolute bottom-full z-30 mb-1 min-w-[170px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl ${
                        idx < 3 ? 'left-0' : idx > 12 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-1.5 flex items-center justify-between border-b border-slate-100 pb-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Tooth #{tooth.id} Treatment</span>
                        <button
                          type="button"
                          onClick={() => setPopoverToothId(null)}
                          className="text-slate-400 hover:text-slate-600 text-xs leading-none"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                        {DENTAL_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => assignColorToTooth(tooth.id, c.id)}
                            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition hover:scale-[1.02] ${
                              toothCustomColors[tooth.id] === c.id
                                ? `${c.solidClass} ring-2 ring-sky-400`
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="h-3 w-3 rounded-full shrink-0 ring-1 ring-white" style={{ backgroundColor: c.hex }} />
                            {c.label}
                          </button>
                        ))}
                        {toothCustomColors[tooth.id] ? (
                          <button
                            type="button"
                            onClick={() => {
                              setToothCustomColors((prev) => {
                                const next = { ...prev }
                                delete next[tooth.id]
                                return next
                              })
                              setPopoverToothId(null)
                            }}
                            className="mt-0.5 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition"
                          >
                            Clear Color
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Selected Tooth Detail Box */}
      {inspectedTooth ? (
        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-950 text-sm font-bold text-white shadow-xs">
                #{inspectedTooth.id}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-sky-950">{inspectedTooth.name}</h4>
                  {inspectedToothCondition ? (
                    <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-bold text-white shadow-xs ${inspectedToothCondition.solidClass}`}>
                      {inspectedToothCondition.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      Healthy / Intact
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{inspectedTooth.pos} quadrant · Universal #{inspectedTooth.id}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {interactive ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToothClick(inspectedTooth)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      currentSelectedSet.has(inspectedTooth.id)
                        ? 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        : 'bg-sky-950 text-white hover:bg-sky-900'
                    }`}
                  >
                    {currentSelectedSet.has(inspectedTooth.id) ? `✕ Unselect #${inspectedTooth.id}` : `+ Select #${inspectedTooth.id}`}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">Color:</span>
                    <div className="flex items-center gap-1">
                      {DENTAL_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setToothCustomColors((prev) => ({ ...prev, [inspectedTooth.id]: c.id }))}
                          className="h-5 w-5 rounded-full border border-white shadow-xs transition hover:scale-110"
                          style={{ backgroundColor: c.hex }}
                          title={c.label}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setInspectingToothId(null)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Close inspection"
                aria-label="Close tooth details"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="mt-3.5 border-t border-sky-100/80 pt-3">
            {inspectedTreatments.length ? (
              <div className="space-y-2.5">
                <p className="text-xs font-bold text-slate-700">
                  Recorded Treatments on Tooth #{inspectedTooth.id}:
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {inspectedTreatments.map((treatment, index) => {
                    const specific = getToothSpecificTreatment(treatment, inspectedTooth.id, toothCustomColors)
                    const fullProcedure = treatment.procedure || treatment.treatment || treatment.servicePerformed || ''
                    const isMulti = fullProcedure.includes(',')
                    const treatmentLabel = specific?.label || fullProcedure || 'Treated'

                    return (
                      <div key={treatment._id || index} className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs transition hover:border-sky-300">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500">Condition:</span>
                              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${specific?.solidClass || 'bg-sky-950 text-white'}`}>
                                {treatmentLabel}
                              </span>
                            </div>

                            {isMulti && specific?.label && specific.label !== fullProcedure ? (
                              <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                                <span className="font-medium text-slate-600">Visit Services:</span> {fullProcedure}
                              </p>
                            ) : null}
                          </div>

                          <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {treatment.visitDate ? new Date(treatment.visitDate).toLocaleDateString() : 'Visit'}
                          </span>
                        </div>

                        {treatment.treatmentPerformed && treatment.treatmentPerformed !== fullProcedure ? (
                          <p className="mt-2 text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
                            {treatment.treatmentPerformed}
                          </p>
                        ) : treatment.notes ? (
                          <p className="mt-2 text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
                            {treatment.notes}
                          </p>
                        ) : treatment.diagnosis ? (
                          <p className="mt-2 text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
                            {treatment.diagnosis}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                          <span>Dentist: <strong className="text-slate-700">{treatment.dentistName || treatment.createdByName || 'Clinic Provider'}</strong></span>
                          {treatment.treatmentStatus ? (
                            <span className="capitalize font-semibold text-emerald-600">{treatment.treatmentStatus.replaceAll('_', ' ')}</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : inspectedToothCondition ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">Current Condition:</span>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${inspectedToothCondition.solidClass}`}>
                    {inspectedToothCondition.label}
                  </span>
                </div>
                <p className="mt-1 text-slate-500 text-[11px]">Applied in current chart view.</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No previous treatments recorded for Tooth #{inspectedTooth.id}. Healthy / Intact.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default DentalChart
