/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the FastAPI backend, e.g. http://localhost:8000. Empty for same-origin in prod. */
  readonly VITE_API_URL?: string
  /** Base URL of the Martin tile server, e.g. http://localhost:3000. */
  readonly VITE_TILES_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
