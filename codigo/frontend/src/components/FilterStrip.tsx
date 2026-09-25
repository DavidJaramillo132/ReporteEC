import { Mark } from './Mark'
import type { IncidentType } from '../lib/registry'
import { INCIDENT_TYPES, TYPE_LABEL, formatCount, placeName } from '../lib/registry'

interface FilterStripProps {
  provinces: string[]
  cantons: string[]
  provincia: string | null
  canton: string | null
  types: IncidentType[]
  typeCounts: Record<IncidentType, number>
  detentions: boolean
  detentionsState: 'idle' | 'loading' | 'error'
  onProvincia: (value: string | null) => void
  onCanton: (value: string | null) => void
  onToggleType: (type: IncidentType) => void
  onDetentions: (value: boolean) => void
}

export function FilterStrip(props: FilterStripProps) {
  const { provinces, cantons, provincia, canton, types, typeCounts, detentions, detentionsState } = props
  return (
    <div className="relative flex items-center gap-x-5 gap-y-2 overflow-x-auto border-b border-ink bg-paper px-4 py-2.5 lg:flex-wrap lg:overflow-visible lg:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <PlaceSelect
          label="Provincia"
          value={provincia}
          options={provinces}
          allLabel="Todo el país"
          onChange={props.onProvincia}
        />
        <PlaceSelect
          label="Cantón"
          value={canton}
          options={cantons}
          allLabel={provincia ? 'Toda la provincia' : 'Elige una provincia'}
          disabled={!provincia}
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
                {formatCount(typeCounts[type])}
              </span>
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
        {detentionsState === 'loading' && <span className="text-[12px] opacity-80">cargando…</span>}
        {detentionsState === 'error' && <span className="text-[12px] font-semibold">no se pudo cargar</span>}
      </button>
    </div>
  )
}

interface PlaceSelectProps {
  label: string
  value: string | null
  options: string[]
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
          <option key={o} value={o}>
            {placeName(o)}
          </option>
        ))}
      </select>
    </label>
  )
}
