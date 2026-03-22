/**
 * Worker Actions / Events 类型定义
 */

export type SyncEvents = {
  'sync-status': [status: 'idle' | 'syncing' | 'error' | 'done', message?: string]
  'book-sync-progress': [current: number, total: number, bookTitle: string]
}
