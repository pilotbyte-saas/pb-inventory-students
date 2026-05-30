import type { IpcApi } from '@shared/types'

// Typed wrapper over the preload bridge. window.api is declared in
// src/preload/index.d.ts and implemented in src/preload/index.ts.
export const api: IpcApi = window.api
