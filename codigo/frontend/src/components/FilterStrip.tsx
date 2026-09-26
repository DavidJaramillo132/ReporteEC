import { Mark } from './Mark'
import type { AdminUnitOut } from '../lib/api'
import type { CantonLayer, IncidentType } from '../lib/registry'
import { INCIDENT_TYPES, TYPE_LABEL, formatCount, placeName } from '../lib/registry'

interface FilterStripProps {
  provinces: AdminUnitOut[]
  cantons: AdminUnitOut[]
  province: string | null
  canton: string | null
  types: IncidentType[]
  typeCounts: Record<string, number>
  detentions: boolean
  cantonLayer: CantonLayer
  onProvince: (value: string | null) => void
  onCanton: (value: string | null) => void
  onToggleType: (type: IncidentType) => void
  onDetentions: (value: boolean) => void
  onCantonLayer: (value: CantonLayer) => void
}

const CANTON_LAYER_OPTIONS: { value: CantonLayer; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'extorsion', label: 'Extorsión' },
  { value: 'siniestros', label: 'Siniestros de tránsito' },
]

export function FilterStrip(props: FilterStripProps) {
  const { provinces, cantons, province, canton, types, typeCounts, detentions, cantonLayer } = props
  return (
    <div className="relative flex items-center gap-x-5 gap-y-2 overflow-x-auto border-b border-ink bg-paper px-4 py-2.5 lg:flex-wrap lg:overflow-visible lg:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <PlaceSelect
          label="Provincia"
          value={province}
          options={provinces}
          allLabel="Todo el país"
          onChange={props.onProvince}
        />
        <PlaceSelect
          label="Cantón"
          value={canton}
          options={cantons}
          allLabel={province ? 'Toda la provincia' : 'Elige una provincia'}
          disabled={!province}
          onChange={props.onCanton}
        />
      </div>

      <fieldset className="flex shrink-0 items-center gap-1.5 lg:flex-wrap">
        <legend className="sr-only">Tipos de incidente</legend>
        {INCIDENT_TYPES.map((type) => {
          const active = types.includes(type)
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => props.onToggleType(type)}
              className={`flex h-8 items-center gap-1.5 border border-ink pr-2.5 pl-1.5 text-[13px] transition-colors duration-150 ${
                active ? 'bg-sello text-paper' : 'bg-transparent text-ink-2 hover:bg-sheet'
              }`}
            >
              <span className={`grid place-items-center ${active ? 'bg-paper' : ''} rounded-full`}>
                <Mark type={type} size={20} />
              </span>
              {TYPE_LABEL[type].many}
              <span className={`tabular-nums ${active ? 'text-paper/75' : 'text-ink-3'}`}>
                {formatCount(typeCounts[type] ?? 0)}
              </span>
            </button>
          )
        })}
      </fieldset>

      <fieldset className="flex shrink-0 items-center gap-1.5 lg:flex-wrap">
        <legend className="sr-only">Capas por cantón</legend>
        {CANTON_LAYER_OPTIONS.map((opt) => {
          const active = cantonLayer === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => props.onCantonLayer(opt.value)}
              className={`flex h-8 items-center border border-ink px-2.5 text-[13px] transition-colors duration-150 ${
                active ? 'bg-sello text-paper' : 'bg-transparent text-ink-2 hover:bg-sheet'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </fieldset>

      <button
        type="button"
        aria-pressed={detentions}
        onClick={() => props.onDetentions(!detentions)}
        className={`flex h-8 shrink-0 items-center gap-2 border border-dashed lg:ml-auto border-ink px-2.5 text-[13px] transition-colors duration-150 ${
          detentions ? 'border-solid bg-sello text-paper' : 'text-ink-2 hover:bg-sheet'
        }`}
      >
        <span aria-hidden="true" className="hatch inline-block size-3 border border-current" />
        Actividad policial: detenciones
      </button>
    </div>
  )
}

interface PlaceSelectProps {
  label: string
  value: string | null
  options: AdminUnitOut[]
  allLabel: string
  disabled?: boolean
  onChange: (value: string | null) => void
}

function PlaceSelect({ label, value, options, allLabel, disabled, onChange }: PlaceSelectProps) {
  return (
    <label className={`flex h-8 items-center border border-ink ${disabled ? 'hatch text-ink-3' : 'bg-sheet'}`}>
      <span className="label border-r border-ink px-2 leading-[30px]">{label}</span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-full max-w-44 cursor-pointer appearance-none bg-transparent pr-7 pl-2 text-[13px] outline-offset-[-3px] disabled:cursor-not-allowed"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23131518' stroke-width='1.4'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 9px center',
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {placeName(o.name)}
          </option>
        ))}
      </select>
    </label>
  )
}
