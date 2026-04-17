/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MODE: string
  readonly BASE_URL: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WS_URL?: string
  readonly VITE_DEBUG?: string
  readonly VITE_APP_NAME?: string
  readonly VITE_APP_ENV?: string
  readonly VITE_OLLAMA_BASE_URL?: string
  readonly VITE_COLLAB_WS_URL?: string
  readonly VITE_COLLAB_SIGNALING_URL?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_OPENAI_BASE_URL?: string
  readonly VITE_ZHIPU_API_KEY?: string
  readonly VITE_ZHIPU_BASE_URL?: string
  readonly VITE_QWEN_API_KEY?: string
  readonly VITE_QWEN_BASE_URL?: string
  readonly VITE_DEEPSEEK_API_KEY?: string
  readonly VITE_DEEPSEEK_BASE_URL?: string
  readonly VITE_DEFAULT_THEME?: string
  readonly VITE_DEFAULT_LANGUAGE?: string
  readonly VITE_ENABLE_CRDT_COLLAB?: string
  readonly VITE_ENABLE_MCP?: string
  readonly VITE_LOG_LEVEL?: string
  readonly VITE_INDEXEDDB_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
