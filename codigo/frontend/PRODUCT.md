# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three audiences, confirmed for V1:

- **General public in Ecuador** who want to understand what has happened in their canton or city. They need a fast, plain-language read of the map.
- **Journalists and researchers** who filter, compare and cite the data. They need visible sources, precise filters and traceability to the original record.
- **Authorities and NGOs** who make decisions with the data. They need comparisons between cantons and population-normalized rates.

The interface is in Spanish (Ecuador), neutral register.

## Product Purpose

ReporteEC is a geospatial platform about security incidents in Ecuador. Information about incidents is fragmented across official bulletins, press and social media; ReporteEC puts it on one map and answers the question no other map answers: **where did this record come from, and how much can it be trusted?**

V1 (the scope of the current frontend work) is a public, fast, trustworthy map of **official historical data since 2019**, with statistics and a clear explanation of where every number comes from. It works on its own, without accounts or real-time data.

## Positioning

Every record carries its provenance and a confidence level. The product never states that an event happened; it states what backs the record and who published it. Traceability is the product, not a decoration, and it is also the project's legal protection.

## Operating Context

- Data sources in V1 (Ministerio del Interior, via datosabiertos.gob.ec): intentional homicides, missing persons and detentions, each record with point coordinates. Traffic crashes come from INEC by canton only (no coordinates). Population by canton comes from INEC and is used only for rates.
- Official data is published monthly with roughly a one-month lag.
- The map starts in 2019, the first year in which all official datasets have data.
- Until the ingestion pipeline exists, the map uses a real sample exported from the official 2026 homicides file. It must never show invented records.

## Capabilities and Constraints

V1 capabilities:

- Map with points when zoomed in and a heatmap when zoomed out.
- **Marker color and shape encode incident type**; **confidence is drawn as mark style** (solid fill = Oficial, dashed outline = Verificado, hatched = Reportado, empty with dashed outline = En revisión) plus its label. Decided 2026-09-25, reversing the earlier color-by-confidence rule: in V1 every record is Oficial, so color-by-confidence painted every mark the same.
- Confidence levels (exactly four): Oficial, Verificado, Reportado, En revisión. Recency (histórico / reciente) is a separate attribute and never changes the mark.
- The reader can show their own position on the map ("Mi ubicación", browser geolocation). It stays in the browser and is never sent or stored.
- Detentions are **police activity, not insecurity**: a separate heatmap-only layer, explicitly toggled and labeled, never merged with incidents.
- Missing persons who were later located are removed from the map (they still count in statistics).
- Filters: year (2019 to today), month, province, canton, type.
- Statistics: absolute count and rate per 100,000 inhabitants, always shown together.
- A visible methodological note: the map shows reported cases, not all crime that happens.
- Pages: Home, Map, Statistics, Methodology, License and sources.
- Installable PWA, view-only.
- **Reporting incidents is V3.** In V1 a visible "Reportar" entry point exists but only explains that it arrives in a future version. It must not pretend to work.

Constraints:

- Sensitive fields (ethnicity, nationality, migratory status) never appear on the map.
- Sexual violence is only ever loaded from official sources and never with exact location; today no official source is loaded, so it does not appear.
- Robbery has no official source yet: it does not appear in V1.
- Tiles are served by Martin from PostGIS; the frontend never downloads all points at once.

Stack: React + TypeScript + Vite, Tailwind CSS, MapLibre GL JS, vite-plugin-pwa, managed with Bun.

## Brand Commitments

- Name: **ReporteEC**. No logo exists yet.
- Voice: plain, factual and calm. Never alarmist, never sensational.

## Evidence on Hand

- Official datasets verified 2026-09-22: 5,676 homicides, 5,216 missing persons and 50,553 detentions in January–August 2026, 100% with coordinates, zero out-of-country points.
- No testimonials, users, partners or press exist. Do not fabricate any.

## Product Principles

1. **Provenance before claims.** Every datum shows its source and confidence; the interface never implies certainty the data lacks.
2. **Calm over alarm.** The subject is violence; the product informs, it does not frighten or sensationalize.
3. **Honest limits.** State what the data cannot show (underreporting, lag, missing sources) as part of the product, not the fine print.
4. **Protect people.** No view may expose a victim, a reporter or a vulnerable group.
5. **Each version stands alone.** V1 is complete without accounts or real time; future features are announced, never faked.
