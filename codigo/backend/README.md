
### Historical exposure by travel time

The route panel now integrates spatial historical intensity over native OSRM
segment minutes, without dividing by trip length. Legacy density/score fields
remain in the API for compatibility; the panel consumes `hourly[].exposure`.
Intensity uses a compact normalized spatial kernel and one-year recency half-life.
Missing incident hours follow the estimated local/national hourly pattern.

The default bandwidth is **provisional 200 m**. Do not interpret the index as an
individual probability. No levels are published without a reference of the exact
model/bandwidth metric. Old `density_per_km` and `exposure_total` rows never supply
new exposure levels. Existing incident counters and blackspots remain separate,
deduplicated historical evidence using their existing buffers.

Offline calibration requires real held-out road-location observations in JSON:

```json
[{"fold": "2025", "training_end": "2024-12-31T23:59:59Z",
  "observed_at": "2025-03-01T12:00:00Z", "training_weight_total": 1000,
  "training_neighbors": [[25, 0.8], [300, 0.5]]}]
```

Provide at least two temporal folds. Neighbor pairs are distance in meters and
recency weight from **training data only**; include neighbors out to 800 m and the
same total national training mass for every candidate radius. The tool compares
held-out spatial log likelihood for 100/200/400/800 m. Input generation and the
stability/performance evaluation require the operational PostGIS data and remain
an operator step, not synthetic calibration.

```bash
python -m app.modules.routing.exposure_reference sample pairs.json
python -m app.modules.routing.exposure_reference calibrate observations.json calibration.json
# Set ROUTE_EXPOSURE_BANDWIDTH_M to the selected radius in both job and API.
python -m app.modules.routing.exposure_reference build pairs.json calibration.json
```

The `sample` command generates the fixed national manifest from loaded mainland
cabeceras and native OSRM routes. It uses a fixed seed and eight candidate
bearings/distances per canton/urban stratum, retaining one valid pair per stratum.
Urban routes must snap within 100 m, meet their actual driving-distance bounds,
and have at least 80% of their distance below 60 km/h. This is an operational
urban-road proxy, not a land-use classification. Interurban sampling reuses the
existing nearest-canton/long-pair deterministic sampler. Missing local strata
and failed pairs are recorded; a globally missing stratum aborts. The job can
make several thousand sequential OSRM calls; it writes only the output manifest,
not reference rows. Preserve its output and the OSRM extract/version used.

The fixed, version-controlled national route manifest has this shape:

```json
{"pairs": [{"origin": [-80.7, -0.95], "destination": [-80.71, -0.95],
            "stratum": "urban_short"}]}
```

Supply all four strata: urban_short (0.5–2 km), urban_medium (2–5 km), urban_long
(5–15 km), and interurban. The generator supplies road locations across mainland cantons; preserve its
selected pairs for subsequent rebuilds.
Each urban stratum receives 1/6 of reference mass and interurban receives 1/2,
regardless of counts. Every departure hour receives equal weight within a stratum.
Routing failures or missing strata abort before a reference is committed. The
33rd/67th percentiles define relative levels, not scientific danger thresholds.
Store calibration inputs, output and route manifest together for reproducibility.
Until this operational calibration/build is completed, the panel intentionally
shows “Nivel aún no disponible”, with the provisional exposure curve.
