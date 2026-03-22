/**
 * WebDAV 同步状态管理
 */
import { createSignal } from 'solid-js'
import type { createTypedWorker } from '@rewrite0/typed-worker'
import type { SyncActions } from '~/workers/sync.worker'
import type { SyncEvents } from '~/workers/types'

export type SyncConnectionStatus = 'disconnected' | 'connected' | 'syncing' | 'error'

const [syncStatus, setSyncStatus] = createSignal<SyncConnectionStatus>('disconnected')
const [syncMessage, setSyncMessage] = createSignal('')
const [syncLock, setSyncLock] = createSignal(false)
const [bookSyncProgress, setBookSyncProgress] = createSignal<{
  current: number
  total: number
  bookTitle: string
} | null>(null)

// Worker 单例
let workerInstance: ReturnType<typeof createTypedWorker<SyncActions, SyncEvents>> | null = null

export function getSyncWorker() {
  return workerInstance
}

export function setSyncWorker(w: typeof workerInstance) {
  workerInstance = w
}

export {
  syncStatus,
  setSyncStatus,
  syncMessage,
  setSyncMessage,
  syncLock,
  setSyncLock,
  bookSyncProgress,
  setBookSyncProgress,
}
