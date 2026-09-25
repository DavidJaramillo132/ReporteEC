import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// MapLibre 6 derives its worker URL from a runtime variable, which bundlers
// cannot follow: the production build would ship without the worker. Vite
// bundles the worker (and the shared chunk it imports) here instead.
setWorkerUrl(workerUrl)
