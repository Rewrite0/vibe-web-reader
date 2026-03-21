/**
 * WebDAV 同步 Worker
 */
import {
  defineWorkerActions,
  setupWorkerActions,
  defineWorkerSendEvent,
} from '@rewrite0/typed-worker'
import type { SyncEvents } from './types'

const sender = defineWorkerSendEvent<SyncEvents>()

function authHeader(user: string, password: string): Record<string, string> {
  return {
    Authorization: 'Basic ' + btoa(`${user}:${password}`),
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base : base + '/'
  const p = path.startsWith('/') ? path.slice(1) : path
  return b + p
}

const actions = defineWorkerActions({
  /** 测试 WebDAV 连接 */
  async testConnection(url: string, user: string, password: string) {
    try {
      const res = await fetch(url, {
        method: 'OPTIONS',
        headers: authHeader(user, password),
      })
      return res.ok
    } catch {
      return false
    }
  },

  /** 上传阅读进度 JSON */
  async syncProgress(url: string, user: string, password: string, progressJson: string) {
    sender('sync-status', 'syncing')
    try {
      // 确保目录存在
      await fetch(joinUrl(url, 'web-reader/'), {
        method: 'MKCOL',
        headers: authHeader(user, password),
      })

      // 上传进度
      const res = await fetch(joinUrl(url, 'web-reader/progress.json'), {
        method: 'PUT',
        headers: {
          ...authHeader(user, password),
          'Content-Type': 'application/json',
        },
        body: progressJson,
      })

      if (res.ok || res.status === 201 || res.status === 204) {
        sender('sync-status', 'done')
        return { success: true }
      }
      sender('sync-status', 'error', `HTTP ${res.status}`)
      return { success: false, error: `HTTP ${res.status}` }
    } catch (err) {
      const msg = (err as Error).message
      sender('sync-status', 'error', msg)
      return { success: false, error: msg }
    }
  },

  /** 从远程拉取进度 */
  async pullProgress(url: string, user: string, password: string) {
    sender('sync-status', 'syncing')
    try {
      const res = await fetch(joinUrl(url, 'web-reader/progress.json'), {
        method: 'GET',
        headers: authHeader(user, password),
      })

      if (!res.ok) {
        sender('sync-status', 'error', `HTTP ${res.status}`)
        return { success: false, error: `HTTP ${res.status}` }
      }

      const data = await res.text()
      sender('sync-status', 'done')
      return { success: true, data }
    } catch (err) {
      const msg = (err as Error).message
      sender('sync-status', 'error', msg)
      return { success: false, error: msg }
    }
  },
})

setupWorkerActions(actions)
export type SyncActions = typeof actions
