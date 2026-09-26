import { Dropdown } from './Dropdown'
import { Mark } from './Mark'
import type { AdminUnitOut } from '../lib/api'
import type { CantonLayer, IncidentType } from '../lib/registry'
import { layersSummary, typesSummary } from '../lib/filterSummary'
import { INCIDENT_TYPES, TYPE_LABEL, formatCount, placeName } from '../lib/registry'

interface FilterStripProps {
  provinces: AdminUnitOut[]
  cantons: AdminUnitOut[]
  province: string | null
  canton: string | null
  types: IncidentType[]
  typeCounts: Record<string, number>
  onProvince: (value: string | null) => void
  onCanton: (value: string | null) => void
  onToggleType: (type: IncidentType) => void
  /**
   * The map-only controls below: omitted entirely on the Estadísticas page,
   * which has no layer to switch and nothing for "actividad policial" to
   * toggle on a map (see pages/Estadisticas.tsx and the plan).
   */
  mapControls?: {
    detentions: boolean
    cantonLayer: CantonLayer
    onDetentions: (value: boolean) => void
    onCantonLayer: (value: CantonLayer) => void
  }
}

const CANTON_LAYER_OPTIONS: { value: CantonLayer; label: string }[] = [
  { value: 'none', label: 'Ninguna' },
  { value: 'extorsion', label: 'Extorsión' },
  { value: 'siniestros', label: 'Siniestros de tránsito' },
]

export function FilterStrip(props: FilterStripProps) {
  const { provinces, cantons, province, canton, types, typeCounts, mapControls } = props
  return (
    <div className="relative flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-ink bg-paper px-4 py-2.5 lg:px-6">
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

      <Dropdown label="Tipos" value={typesSummary(types)}>
        <fieldset>
          <legend className="label mb-2 text-ink-3">Tipos de incidente</legend>
          <ul className="divide-y divide-rule-soft">
            {INCIDENT_TYPES.map((type) => (
              <li key={type}>
                <label className="flex cursor-pointer items-center gap-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={types.includes(type)}
                    onChange={() => props.onToggleType(type)}
                    className="size-4 accent-sello"
                  />
                  <Mark type={type} size={18} />
                  <span className="flex-1">{TYPE_LABEL[type].many}</span>
                  <span className="text-ink-3 tabular-nums">{formatCount(typeCounts[type] ?? 0)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {types.length < INCIDENT_TYPES.length && (
          <button
            type="button"
            onClick={() => INCIDENT_TYPES.filter((t) => !types.includes(t)).forEach(props.onToggleType)}
            className="mt-2 text-[13px] font-medium underline hover:no-underline"
          >
            Mostrar todos
          </button>
        )}
      </Dropdown>

      {mapControls && (
        <Dropdown
          label="Capas"
          value={layersSummary(mapControls.cantonLayer, mapControls.detentions)}
          highlighted={mapControls.cantonLayer !== 'none' || mapControls.detentions}
        >
          <fieldset>
            <legend className="label mb-2 text-ink-3">Capa por cantón</legend>
            {CANTON_LAYER_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 py-1.5">
                <input
                  type="radio"
                  name="canton-layer"
                  checked={mapControls.cantonLayer === opt.value}
                  onChange={() => mapControls.onCantonLayer(opt.value)}
                  className="size-4 accent-sello"
                />
                {opt.label}
              </label>
            ))}
          </fieldset>
          <label className="mt-2 flex cursor-pointer items-start gap-2 border-t border-ink pt-3">
            <input
              type="checkbox"
              checked={mapControls.detentions}
              onChange={() => mapControls.onDetentions(!mapControls.detentions)}
              className="mt-0.5 size-4 accent-sello"
            />
            <span>
              Detenciones
              <span className="block text-[12.5px] text-ink-3">Actividad policial, no inseguridad.</span>
            </span>
          </label>
        </Dropdown>
      )}
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
