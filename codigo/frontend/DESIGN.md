---
name: ReporteEC
description: A public gazette register of security incidents in Ecuador — every entry carries its source and confidence, never an alarm.
colors:
  paper: "#edf0ee"
  paper-deep: "#dfe6e3"
  sheet: "#f8f9f7"
  ink: "#15212c"
  ink-2: "#384552"
  ink-3: "#56626e"
  rule-soft: "#c3cbc8"
  sello: "#1d4a73"
  sello-soft: "#d3dfe8"
  homicidio: "#b23b2a"
  sicariato: "#6d1f3b"
  femicidio: "#8a55bd"
  desaparecida: "#1d6f78"
typography:
  nameplate:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.02em"
    fontVariation: "font-stretch: 62%"
  label:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.04em"
    fontVariation: "font-stretch: 75%"
  body:
    fontFamily: "Archivo Variable, Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  none: "0px"
  full: "9999px"
components:
  button-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "32px"
  button-toggle-active:
    backgroundColor: "{colors.sello}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "32px"
  button-locate:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "32px"
  button-locate-active:
    backgroundColor: "{colors.sello}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "32px"
  field-select:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    height: "32px"
  legend-panel:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
    width: "250px"
---

# Design System: ReporteEC

## Overview

**Creative North Star: "Registro Oficial" — the state gazette.**

ReporteEC still reads as a page from Ecuador's official register, not a security dashboard — but this build recolors the world and rewrites where hue is allowed to mean something. A mineral-paper ground and night-blue ink carry the interface as before; a new registry stamp blue (**sello**, `#1d4a73`) now heads the masthead and is the single accent behind every active, selected, pressed, hovered, or focused control across the whole product. Off the map, that is the only hue in the system — paper and ink are still the entire chrome. On the map, hue changed jobs entirely: it used to mark confidence (the retired Four Inks Rule); it now marks the four incident types, and confidence is drawn as mark *style* — solid, dashed, hatched, or empty — never as a color. Two hues carry meaning, doing two different jobs, and neither is a danger color: the interface accent is a cool stamp blue, and the busiest type ink (homicidio) is a muted brick red closer to a printed seal than an alert.

**Key Characteristics:**
- Mineral paper (`#edf0ee`) and night-blue ink (`#15212c`) still carry the base interface; the stamp blue `sello` (`#1d4a73`) is the one UI accent, used only for the masthead field and for interactive state.
- Hue on the map belongs exclusively to the four incident types — homicidio, sicariato, femicidio, desaparecida — reinforced by mark shape; confidence is never a hue, only a fill/outline style (`CONFIDENCE_STYLE` in `lib/marks.ts`).
- Zero border-radius everywhere except the small circular halo behind an active mark icon; depth still comes from 1px ink borders, not shadows.
- Interface state is `sello` inversion (`bg-sello`/`text-paper`) or hatching (`.hatch`), never a decorative color change.
- A new labeled "Mi ubicación" control puts the reader's own position on the map (`sello`-colored dot, browser-only, never transmitted); one authored `.ink-in` clip-path reveal and a 150ms color crossfade remain the system's only motion.

## Colors

Paper and ink still carry the whole interface; color is now spent on exactly two, separate jobs — one accent for interaction, four inks for incident type.

### Primary — Stamp Blue
- **Stamp Blue** (`#1d4a73`): the interface's one accent. Fills the masthead's top field (`bg-sello`, `text-paper`) and every active/selected/pressed state: the active section tab, the open "Reportar" popover, active type-filter chips, the active detentions toggle, active year/month cells in the Time Rule, the selected registry row, the "Mi ubicación" button once following, and every `hover:bg-sello` button (Cerrar, Reintentar, Mostrar más). It is also the density-heatmap hue, `::selection`, and the `:focus-visible` outline color.
- **Stamp Blue, Soft** (`#d3dfe8`): the one tint of the accent, used only as the hover fill for the "Mi ubicación" button while it is off (`hover:bg-sello-soft`) and as the 14–45%-mixed wash/border of the MapLibre user-location accuracy circle.

### Tertiary — Incident-Type Inks (map only, four co-equal marks)
Grouped as one role rather than tiered, because the four are co-equal, not a hierarchy — the same treatment the retired confidence-ink group had. A `Mark`'s hue and shape are set by `TYPE_COLOR`/`markGeometry` in `lib/registry.ts` and `lib/marks.ts`, and appear wherever a case is drawn: the map, filter-type chips, registry rows, entry detail, the legend, and the methodology panel.
- **Homicidio Brick** (`#b23b2a`): a solid disc. The most common type in the data.
- **Sicariato Wine** (`#6d1f3b`): a disc inside a second outer ring.
- **Femicidio Violet** (`#8a55bd`): a disc with a paper-colored core punched into its center.
- **Desaparecida Teal** (`#1d6f78`): an open ring with no disc — the code's own comment calls it "a person who is not there."

### Neutral
- **Mineral Paper** (`#edf0ee`): the page background (`body`, `<meta name="theme-color">` is `sello`, not paper — the browser chrome matches the masthead, not the page).
- **Paper, Recessed** (`#dfe6e3`): recessed surfaces — the basemap's land fill and the registry column's methodology footer strip.
- **Sheet White** (`#f8f9f7`): raised/floating surfaces — the map legend, the "Reportar" popover, select fields, the "Mi ubicación" button at rest, MapLibre's control chrome.
- **Night-Blue Ink** (`#15212c`): primary text, every 1px structural border, and the outline color for `oficial`/`verificado` marks.
- **Ink, Secondary** (`#384552`): secondary text — subtitles, metadata rows, body copy in info panels, basemap place labels.
- **Ink, Muted** (`#56626e`): tertiary/muted text — field labels, disabled captions; also the neutral hue the `ConfidenceChip` mark is drawn in, and the detentions heatmap's base tone.
- **Soft Rule** (`#c3cbc8`): hairline dividers between list rows and table rows.

### Named Rules
**The Two-Hue Rule.** Exactly two hue systems exist and they never mix. `sello` is the interface's one accent: it marks the masthead field and every active, selected, pressed, hovered, or focused control, everywhere in the product. The four incident-type inks mark what kind of case a record is, wherever it's drawn. This **retires the old Four Inks Rule**, which spent hue on confidence instead of type — a rule the data itself broke, since V1 is entirely `oficial` and confidence-as-hue painted every mark the same color (decided 2026-09-25, see `PRODUCT.md`). Confidence is drawn only as mark style now, never a hue.

**Scoped exception: canton choropleths (decided 2026-09-26).** The canton layers are data fields, not marks or interface state. Siniestros uses a lightness ramp of `sello` and adds no hue. The extortion semáforo uses one warm-red family in four lightness steps, and fill opacity rises with the class as a cue that does not depend on color. Both appear only while their canton layer is switched on, and each has its own legend. Nothing else may reuse the extortion ramp.

## Typography

**Display/Label Font:** Archivo Variable (self-hosted via `@fontsource-variable/archivo`, the width-axis build), falling back to "Archivo", system-ui, sans-serif.
**Body Font:** the same Archivo Variable stack, at its normal (100%) width.

**Character:** One typeface carries the whole system; register shifts by pulling the variable width axis narrow (condensed) for display and label roles, never by swapping families. Unchanged by the recolor.

### Hierarchy
- **Nameplate** (weight 800, font-stretch 62%, 44px → 56px at `sm:`, line-height 0.9, letter-spacing −0.02em): the "ReporteEC" wordmark (now set in `text-paper` on the `sello` masthead field) and the entry-detail title ("Caso N.º …") at 30px; info-panel section headers reuse it at 34px.
- **Section title** (weight 600, 19px): "Registro de la vista actual," the registry column's primary heading.
- **Subsection title** (weight 600, 16px): "Casos, del más reciente" and each Methodology/Sources `Section` heading.
- **Body** (weight 400, 14–15px, line-height 1.45): filter copy, panel prose (capped at `max-w-[68ch]`/`60ch`), entry metadata.
- **Label** (weight 600, font-stretch 75%, 12px, letter-spacing 0.04em, uppercase): every field and column caption — "Provincia," "Corte de datos," "Tipo," "Clave," "Año," "Meses." Strictly a control/column label, never a decorative eyebrow.
- **Micro/meta** (weight 400–600, 11–13.5px, tabular): entry numbers, dates, coordinates, counts — always `tabular-nums`.

### Named Rules
**The Condensed Nameplate Rule.** Only two roles pull the variable width axis narrow — the nameplate (62%) and labels (75%). Everything else, including all body and panel prose, stays at normal (100%) width.

## Layout

The page is a masthead-over-plate composition. The map is full-width on every breakpoint now: there is no second column. Below `lg` the map plate is a `70svh` plate (min 340px); at `lg+` it fills the remaining height below the masthead, filter strip and time rule (`lg:flex-1`).

Structure, top to bottom: a single ~56px masthead bar (`h-14`) on a `sello` field — the nameplate, section nav (Mapa · Estadísticas · Metodología · Fuentes) with `aria-current="page"`, a compact data-cut readout and the "Reportar" notice, collapsing below `sm:` into a nameplate-plus-disclosure-menu — a horizontally-scrollable filter strip (province/canton selects, incident-type toggles, and on the map page only, the canton-layer switch and detentions toggle), the map plate with its floating overlays (the legend bottom-left; "Mi ubicación," transient notices and the case card top-right/top-left/anchored), and the time rule (year ribbon over a month ribbon) below the plate. `/estadisticas`, `/metodologia` and `/fuentes` are separate routed pages (see `lib/router.ts`), each with its own `<title>`; the two reading pages (Metodología, Fuentes) use a centered ~68ch column with a small table-of-contents box linking to `id`-anchored sections.

No custom spacing scale is defined — container padding uses Tailwind's default steps directly (`px-4` on mobile widening to `px-5`/`px-6` at `lg:`), and 1px ink borders are the layout's only structural separator.

## Elevation & Depth

Still flat by default: surfaces separate with a 1px ink border, not a shadow. The only two shadows in the build remain reserved for the two elements that float over the map plate — the map legend and the "Reportar" popover — and their exact values are unchanged by the recolor:

### Shadow Vocabulary
- **Floating chrome** (`box-shadow: 0 4px 14px -8px rgba(21,33,44,0.4)` / `0 6px 18px -8px rgba(21,33,44,0.35)`): the map legend and the "Reportar" disclosure popover, both tinted from the current night-blue ink `#15212c`.

### Named Rules
**The Bordered-Not-Shadowed Rule.** Depth is a 1px ink border by default. A shadow is earned only by floating over the map plate.

## Shapes

Every container, control, field, and card is a hard rectangle at 0 radius — including MapLibre's own control group, forced to `border-radius: 0 !important`. The one exception is `rounded-full`, the small circular halo drawn behind a `Mark` icon when its parent button is in the `sello`-inverted/active state (an incident-type toggle, a selected registry row).

The registry's marks (`lib/marks.ts`, mirrored as SVG in `Mark.tsx`) are the system's only intentional circles, and now carry two independent signals in their geometry: type is hue **and** shape (`disc` / `disc + outer ring` / `disc + paper core` / `open ring, no disc`), while confidence is drawn as fill/outline style laid on top of that shape (solid, dashed, hatched, or empty) — so both read without relying on color.

Borders come in three weights: a 1px ink rule frames every ordinary control and boundary; a 3px rule (plus the masthead's stacked double-rule) marks a major structural break; a dashed 1px border marks an affordance that is off or not-yet-active (the detentions toggle before it's switched on, the "no matches" empty state) and turns solid the moment it activates.

### Named Rules
**The Square Corner Rule.** Zero border-radius is the default everywhere; a filled circle appears only as a mark or as the small active-state halo directly behind one.

## Components

### Masthead
A single ~56px bar (`h-14`, `.double-rule` beneath it), entirely on the `sello` field: the nameplate at the left (a `Link` to `/`), inline section nav in the middle (Mapa · Estadísticas · Metodología · Fuentes; the active route inverts to `bg-paper`/`text-sello`, the rest sit at `text-paper/85`), and the compact data-cut readout plus the "Reportar" entry point at the right. Below `sm:` the nav, data cut and "Reportar" collapse behind a "Menú" disclosure button; open, they stack in a panel under the bar. "Reportar" itself is a bordered `text-paper` chip at rest (a `sello` field has no room left for the old ink-hatch texture) inverting to `bg-paper`/`text-sello` once opened, revealing the same `.ink-in`-animated popover stating plainly it arrives in a future version. The long subtitle and the separate "Fuente" line are gone; the masthead's only job now is orientation and navigation.

### Filter Strip
A horizontally-scrollable row of bordered controls: `PlaceSelect` (a bordered field with a label chip, a native `<select>`, an inline SVG chevron — unchanged, still neutral ink/sheet), incident-type pill toggles (bordered rectangle with a `Mark` icon in its type hue and a tabular count, inverting to `bg-sello`/`text-paper` when active — previously `bg-ink`). The canton-layer switch and the detentions toggle (the strip's one dashed-border control, turning solid and `bg-sello`/`text-paper` once switched on) render only on the map page (`mapControls`, `components/FilterStrip.tsx`) — Estadísticas reuses the same strip without them, since neither means anything off the map.

### Time Rule
Two segmented strips (years, months) inside a single bordered box with internal 1px dividers. Active cells are `bg-sello`/`text-paper` (previously ink); unavailable months/years are hatched, `cursor-not-allowed`, with an explanatory `title`.

### Map (`IncidentMap` + `basemap.ts` + `marks.ts`)
A gazette-grey MapLibre basemap: land is `paper-deep` (`#dfe6e3`), water is a cool wash (`#aecbd8`), province borders are dashed ink at 45% opacity, country borders solid ink, roads and place labels in ink tones — unchanged in structure, tokens updated. Below zoom 8.5 (`MARKS_ZOOM`) the map shows a heatmap; above it, individual `Mark` symbols fade in as the heatmap fades out.

The **incident density heatmap** is now a stamp-blue ramp (`rgba(29,74,115,…)`, i.e. `sello` at rising opacity) instead of the old ink-opacity ramp. Toggling "Actividad policial: detenciones" swaps in a second, visually distinct **neutral-grey ramp** (`rgba(86,98,110,…)` → `rgba(56,69,82,…)`, ink-3/ink-2 tones) that **replaces** the incident heatmap while active — the two are never shown together, and individual marks are unaffected since they're a separate always-eligible layer. A selected entry gets a solid `#15212c` stroke ring.

**"Mi ubicación"** is a new labeled button (not an icon-only control), pinned top-right under the zoom controls: `bg-sheet`/`text-ink` by default, `hover:bg-sello-soft` when off, `bg-sello`/`text-paper` while actively following the reader's position. It drives location itself; MapLibre's native `GeolocateControl` icon button is hidden (`display: none !important`) and only supplies the underlying tracking/dot behavior. The MapLibre user-location dot and its `::before` are recolored `sello`; the accuracy circle is a `sello`-tinted wash/border. Denied or unavailable states surface a bordered `bg-sheet` notice, and the location never leaves the browser (confirmed in `SourcesPanel` copy and `PRODUCT.md`). MapLibre's own controls (zoom, scale, attribution) stay reskinned to the gazette grammar: square corners, 1px ink border, sheet background.

### Map Legend ("Clave")
A floating, collapsible, sheet-background panel bottom-left of the map. Now two lists instead of one: "Color y forma: tipo" (a `Mark` per visible incident type, always rendered at `oficial` style since the legend illustrates hue/shape, not confidence) and "Trazo: confianza" (a `ConfidenceChip` per confidence level — a neutral-grey, ink-3-colored mark drawn in that level's style, with its label). A level not present in the current filtered view is shown at 55% opacity rather than hatched — a deliberate, narrower exception to the hatching convention used for disabled/unavailable controls elsewhere. Below the lists, a conditional density-gradient swatch: the stamp-blue ramp when the incident heatmap is active, or the neutral-grey ramp plus an explanatory note ("Reemplaza la concentración de casos mientras está activa") when detentions are shown instead. Two links close the legend: "Cómo leer el mapa" (still opens `IntroDialog`) and, below it, a discrete one-line methodological note ("Muestra casos registrados, no todo el delito") linking to the routed `/metodologia` page — the note that used to sit at the foot of the now-removed registry column.

### Incident Card
No registry column and no case list: clicking a mark opens `IncidentCard` instead (`components/IncidentCard.tsx`), the only way to see one case's detail in V1. Desktop: a `role="dialog"` card floats near the clicked point (positioned from `IncidentMap`'s own `map.project`, reclamped to stay inside the plate, reprojected on every pan/zoom). Mobile (`<640px`): the same card renders as a bottom sheet, `fixed inset-x-0 bottom-0`. Content, top to bottom: the type-and-confidence `Mark` plus label as the title, date/time and place, a small tabular "Caso N.º", then a `Procedencia` (provenance) definition list — source, dataset link, original row, updated date, a `ConfidenceChip` plus its meaning, historical/recent status, the raw published coordinate — closed with the fixed disclaimer. It plays the `.ink-in` reveal, moves focus to its own title on open, and returns focus to the map on close (×, Esc, or clicking empty map). Loading is hatched skeleton bars in the same shell (so the card's position never jumps once real data arrives); a failed fetch shows "No se pudo cargar este caso." with a Reintentar button that inverts to `sello` on hover.

### Reading Pages (Methodology, Sources)
`Metodologia` and `Fuentes` (`src/pages/`) are standalone routed pages now, not panel tabs — same `Section` pattern and unchanged prose, laid out for reading: a centered ~68ch column, a bordered "En esta página" table of contents linking to `id`-anchored `<h2>`s (`scroll-mt-*` keeps a jumped-to heading clear of nothing above it, since there is no longer a sticky masthead over the content), and each page sets its own `document.title`. The Methodology page's "Color y marca" section explains the current rule directly: hue and shape say the incident type; the mark's fill/outline style says how much confidence backs it (`Mark rellena` = oficial, `rellena con borde discontinuo` = verificado, `rayada` = reportado, `vacía con borde discontinuo` = en revisión), pulled live from `CONFIDENCE[c].style`.

### Estadísticas
A routed page (`src/pages/Estadisticas.tsx`) reusing the map page's own `FilterStrip` (without its map-only controls) and `TimeRule` at the top, synced to the URL. Below them: a three-figure summary row (`dl`, tabular numerals, no cards) — cases in the filtered period, its rate ×100.000, and the change against the same months of the previous year — then a sticky section index (a left rail at `lg:`, a horizontally-scrollable bar below it) linking to five `id`-anchored sections: Incidentes, Territorio, Extorsión, Siniestros de tránsito, and Actividad policial (still labeled "no es inseguridad"). Each section keeps a one-line "what this measures" caption and a "Cómo se calcula" link to the matching `/metodologia#anchor`; `MonthlyChart` and `RateTable` are unchanged.

## Do's and Don'ts

### Do:
- **Do** spend hue on exactly two things: `sello` (`#1d4a73`) for interface state, and the four type inks (`#b23b2a` homicidio, `#6d1f3b` sicariato, `#8a55bd` femicidio, `#1d6f78` desaparecida) for incident type. Nothing else introduces a third hue.
- **Do** draw confidence as mark style — solid, dashed, hatched, or empty fill/outline via `CONFIDENCE_STYLE` — never as a color.
- **Do** reinforce type with shape as well as hue: disc, disc + outer ring, disc + paper core, or open ring with no disc.
- **Do** express control state (active, selected, pressed) with `sello` inversion (`bg-sello`/`text-paper`) or hatching, never a decorative color change; the map legend's absent-confidence indicator (55% opacity) is the one deliberate exception, meaning "not present in this view," not "unavailable."
- **Do** frame surfaces with a 1px ink border by default; reserve shadow for chrome that floats over the map.
- **Do** keep body text at normal font width and reserve the condensed axis (62%/75%) for the nameplate and labels only.
- **Do** set every numeric or date column to `tabular-nums` so ledger figures stay aligned.
- **Do** replace the incident heatmap with the detentions heatmap (stamp-blue ramp → neutral-grey ramp) when police activity is toggled on — never render both at once.
- **Do** keep "Mi ubicación" a labeled button, and keep the reader's position entirely client-side.

### Don't:
- **Don't** use hue for confidence anywhere — that rule is retired; confidence is mark style only.
- **Don't** introduce a second interface accent alongside `sello`; paper and ink stay neutral everywhere off a Mark.
- **Don't** round a corner. 0 radius is the rule; a filled circle is reserved for marks and the small active-state halo behind one.
- **Don't** use `.label` (the uppercase, condensed 12px caption style) as a decorative eyebrow above a heading.
- **Don't** ship a working-looking control for a feature that isn't live yet; the "Reportar" entry point is deliberately hatched and its popover states plainly that it arrives in a future version.
- **Don't** add shadow to a card or panel that already sits in normal document flow — shadow is earned only by floating over the map plate.
