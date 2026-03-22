/**
 * Worker Actions / Events 类型定义
 */

export type SyncEvents = {
  'sync-status': [status: 'idle' | 'syncing' | 'error' | 'done', message?: string];
  'sync-phase': [phase: 'idle' | 'planning' | 'pulling' | 'pushing' | 'files' | 'done' | 'error'];
  'sync-stats': [
    uploaded: number,
    downloaded: number,
    remoteOnly: number,
    tombstoneApplied: number,
    errors: number,
  ];
  'book-sync-progress': [current: number, total: number, bookTitle: string];
};
