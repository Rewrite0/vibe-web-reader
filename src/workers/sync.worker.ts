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

// ========== 工具函数 ==========

function authHeader(user: string, password: string): Record<string, string> {
  return {
    Authorization: 'Basic ' + btoa(`${user}:${password}`),
  }
}

function joinUrl(base: string, ...parts: string[]): string {
  let result = base.endsWith('/') ? base.slice(0, -1) : base
  for (const part of parts) {
    const p = part.startsWith('/') ? part : '/' + part
    result += p
  }
  return result
}

/** 确保 PUT/MKCOL 成功 */
function isSuccess(status: number): boolean {
  return status >= 200 && status < 300 || status === 405
}

/** 清理文件名中的非法字符 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || 'untitled'
}

/** 构造远程书籍文件名: {title}_{id}.{format} */
function bookFileName(bookId: string, format: string, title?: string): string {
  const safeName = title ? sanitizeFilename(title) : bookId
  return `${safeName}_${bookId}.${format}`
}

/** 从远程文件名解析 bookId: {title}_{id}.{format} → id */
function parseBookFileName(filename: string): { id: string; format: string } | null {
  // 匹配最后一个 _ 之后到 .format 之间的部分作为 id
  const match = filename.match(/^.+_([^_]+)\.(txt|epub)$/)
  if (match) return { id: match[1], format: match[2] }
  // 兼容旧格式 {id}.{format}
  const legacy = filename.match(/^([^_]+)\.(txt|epub)$/)
  if (legacy) return { id: legacy[1], format: legacy[2] }
  return null
}

/** 递归创建远程目录 */
async function mkdirp(url: string, user: string, password: string, path: string): Promise<void> {
  const segments = path.split('/').filter(Boolean)
  let current = url
  for (const seg of segments) {
    current = joinUrl(current, seg)
    await fetch(current + '/', {
      method: 'MKCOL',
      headers: authHeader(user, password),
    }).catch(() => {})
  }
}

/** PROPFIND 列出目录内容 */
async function propfind(
  url: string,
  user: string,
  password: string,
  path: string,
): Promise<string[]> {
  console.log('[Worker] PROPFIND:', path)
  const res = await fetch(joinUrl(url, path) + '/', {
    method: 'PROPFIND',
    headers: {
      ...authHeader(user, password),
      Depth: '1',
      'Content-Type': 'application/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>',
  })
  if (!res.ok) {
    console.warn('[Worker] PROPFIND 失败:', res.status)
    return []
  }
  const xml = await res.text()
  const hrefs: string[] = []
  const regex = /<d:href>([^<]+)<\/d:href>|<D:href>([^<]+)<\/D:href>|<href>([^<]+)<\/href>/gi
  let match
  while ((match = regex.exec(xml)) !== null) {
    hrefs.push(match[1] || match[2] || match[3])
  }
  const basePath = path.endsWith('/') ? path : path + '/'
  const result = hrefs
    .map((h) => decodeURIComponent(h))
    .filter((h) => {
      const normalized = h.endsWith('/') ? h.slice(0, -1) : h
      const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
      return normalized !== base && !normalized.endsWith(base)
    })
    .map((h) => {
      const parts = h.replace(/\/$/, '').split('/')
      return parts[parts.length - 1]
    })
    .filter(Boolean)
  console.log(`[Worker] PROPFIND 结果: ${result.length} 项`, result)
  return result
}

// ========== Worker Actions ==========

const actions = defineWorkerActions({
  /** 测试 WebDAV 连接 */
  async testConnection(url: string, user: string, password: string) {
    console.group('[Worker] testConnection')
    try {
      const res = await fetch(url, {
        method: 'OPTIONS',
        headers: authHeader(user, password),
      })
      console.log('[Worker] OPTIONS 响应:', res.status)
      console.groupEnd()
      return res.ok
    } catch (err) {
      console.error('[Worker] 连接失败:', err)
      console.groupEnd()
      return false
    }
  },

  /** 确保远程目录结构存在 */
  async ensureDirectories(url: string, user: string, password: string, dir: string) {
    console.group('[Worker] ensureDirectories:', dir)
    try {
      await mkdirp(url, user, password, dir)
      await mkdirp(url, user, password, `${dir}/config`)
      await mkdirp(url, user, password, `${dir}/books`)
      await mkdirp(url, user, password, `${dir}/books/txt`)
      await mkdirp(url, user, password, `${dir}/books/epub`)
      console.log('[Worker] 目录结构创建完成')
      console.groupEnd()
      return true
    } catch (err) {
      console.error('[Worker] 创建目录失败:', err)
      console.groupEnd()
      return false
    }
  },

  /**
   * 同步配置（设置 + 书籍元信息 + 进度）
   * isInitial=true 时，远程覆盖本地；否则按 configSyncedAt 时间戳比较
   */
  async syncConfig(
    url: string,
    user: string,
    password: string,
    dir: string,
    localConfig: string,
    localMeta: string,
    localProgress: string,
    isInitial: boolean,
  ): Promise<{
    config?: string
    meta?: string
    progress?: string
    direction: 'pushed' | 'pulled' | 'none'
  }> {
    console.group(`[Worker] syncConfig (isInitial=${isInitial})`)
    sender('sync-status', 'syncing')
    try {
      const configPath = `${dir}/config`
      const headers = authHeader(user, password)

      // 尝试获取远程配置
      console.log('[Worker] 获取远程 settings.json...')
      const remoteConfigRes = await fetch(joinUrl(url, configPath, 'settings.json'), {
        method: 'GET',
        headers,
      }).catch(() => null)

      const remoteExists = remoteConfigRes && remoteConfigRes.ok
      console.log('[Worker] 远程配置存在:', remoteExists)

      if (isInitial && remoteExists) {
        console.log('[Worker] 首次同步 + 远程有数据 → 拉取覆盖本地')
        const config = await remoteConfigRes!.text()

        const metaRes = await fetch(joinUrl(url, configPath, 'books-meta.json'), {
          method: 'GET',
          headers,
        })
        const meta = metaRes.ok ? await metaRes.text() : undefined
        console.log('[Worker] 远程书籍元信息:', meta ? '有' : '无')

        const progressRes = await fetch(joinUrl(url, configPath, 'progress.json'), {
          method: 'GET',
          headers,
        })
        const progress = progressRes.ok ? await progressRes.text() : undefined
        console.log('[Worker] 远程进度:', progress ? '有' : '无')

        sender('sync-status', 'done')
        console.groupEnd()
        return { config, meta, progress, direction: 'pulled' }
      }

      if (!remoteExists) {
        console.log('[Worker] 远程无数据 → 推送本地配置')
        await Promise.all([
          fetch(joinUrl(url, configPath, 'settings.json'), {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: localConfig,
          }),
          fetch(joinUrl(url, configPath, 'books-meta.json'), {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: localMeta,
          }),
          fetch(joinUrl(url, configPath, 'progress.json'), {
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: localProgress,
          }),
        ])
        sender('sync-status', 'done')
        console.log('[Worker] 推送完成')
        console.groupEnd()
        return { direction: 'pushed' }
      }

      // 非首次同步：比较时间戳
      const remoteConfig = await remoteConfigRes!.text()
      let remoteTimestamp = 0
      try {
        const parsed = JSON.parse(remoteConfig)
        remoteTimestamp = parsed.configSyncedAt ?? 0
      } catch { /* ignore */ }

      let localTimestamp = 0
      try {
        const parsed = JSON.parse(localConfig)
        localTimestamp = parsed.configSyncedAt ?? 0
      } catch { /* ignore */ }

      console.log(`[Worker] 时间戳比较: 本地=${localTimestamp}, 远程=${remoteTimestamp}`)

      if (remoteTimestamp > localTimestamp) {
        console.log('[Worker] 远程更新 → 拉取')
        const metaRes = await fetch(joinUrl(url, configPath, 'books-meta.json'), {
          method: 'GET',
          headers,
        })
        const meta = metaRes.ok ? await metaRes.text() : undefined

        const progressRes = await fetch(joinUrl(url, configPath, 'progress.json'), {
          method: 'GET',
          headers,
        })
        const progress = progressRes.ok ? await progressRes.text() : undefined

        sender('sync-status', 'done')
        console.groupEnd()
        return { config: remoteConfig, meta, progress, direction: 'pulled' }
      }

      console.log('[Worker] 本地更新或相等 → 推送')
      await Promise.all([
        fetch(joinUrl(url, configPath, 'settings.json'), {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: localConfig,
        }),
        fetch(joinUrl(url, configPath, 'books-meta.json'), {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: localMeta,
        }),
        fetch(joinUrl(url, configPath, 'progress.json'), {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: localProgress,
        }),
      ])
      sender('sync-status', 'done')
      console.log('[Worker] 推送完成')
      console.groupEnd()
      return { direction: 'pushed' }
    } catch (err) {
      console.error('[Worker] syncConfig 失败:', err)
      sender('sync-status', 'error', (err as Error).message)
      console.groupEnd()
      return { direction: 'none' }
    }
  },

  /** 上传书籍文件 */
  async uploadBook(
    url: string,
    user: string,
    password: string,
    dir: string,
    bookId: string,
    format: string,
    data: ArrayBuffer,
    title?: string,
  ): Promise<boolean> {
    const fileName = bookFileName(bookId, format, title)
    const remotePath = `${dir}/books/${format}/${fileName}`
    console.log(`[Worker] 上传书籍: ${remotePath} (${(data.byteLength / 1024).toFixed(1)} KB)`)
    try {
      const res = await fetch(joinUrl(url, remotePath), {
        method: 'PUT',
        headers: {
          ...authHeader(user, password),
          'Content-Type': 'application/octet-stream',
        },
        body: data,
      })
      const ok = isSuccess(res.status)
      console.log(`[Worker] 上传结果: ${res.status} (${ok ? '成功' : '失败'})`)
      return ok
    } catch (err) {
      console.error(`[Worker] 上传失败:`, err)
      return false
    }
  },

  /** 下载书籍文件 */
  async downloadBook(
    url: string,
    user: string,
    password: string,
    dir: string,
    bookId: string,
    format: string,
    title?: string,
  ): Promise<ArrayBuffer | null> {
    const fileName = bookFileName(bookId, format, title)
    const remotePath = `${dir}/books/${format}/${fileName}`
    console.log(`[Worker] 下载书籍: ${remotePath}`)
    try {
      const res = await fetch(joinUrl(url, remotePath), {
        method: 'GET',
        headers: authHeader(user, password),
      })
      if (!res.ok) {
        console.warn(`[Worker] 下载失败: ${res.status}`)
        return null
      }
      const buf = await res.arrayBuffer()
      console.log(`[Worker] 下载完成: ${(buf.byteLength / 1024).toFixed(1)} KB`)
      return buf
    } catch (err) {
      console.error(`[Worker] 下载异常:`, err)
      return null
    }
  },

  /** 删除远程书籍文件 */
  async deleteRemoteBook(
    url: string,
    user: string,
    password: string,
    dir: string,
    bookId: string,
    format: string,
    title?: string,
  ): Promise<boolean> {
    const fileName = bookFileName(bookId, format, title)
    const remotePath = `${dir}/books/${format}/${fileName}`
    console.log(`[Worker] 删除远程书籍: ${remotePath}`)
    try {
      const res = await fetch(joinUrl(url, remotePath), {
        method: 'DELETE',
        headers: authHeader(user, password),
      })
      const ok = res.ok || res.status === 404
      console.log(`[Worker] 删除结果: ${res.status} (${ok ? '成功' : '失败'})`)
      return ok
    } catch (err) {
      console.error(`[Worker] 删除异常:`, err)
      return false
    }
  },

  /** 列出远程所有书籍文件 */
  async listRemoteBooks(
    url: string,
    user: string,
    password: string,
    dir: string,
  ): Promise<{ id: string; format: string }[]> {
    console.group('[Worker] listRemoteBooks')
    const results: { id: string; format: string }[] = []

    for (const format of ['txt', 'epub']) {
      try {
        const files = await propfind(url, user, password, `${dir}/books/${format}`)
        for (const filename of files) {
          const parsed = parseBookFileName(filename)
          if (parsed) {
            results.push(parsed)
          }
        }
      } catch { /* ignore */ }
    }

    console.log(`[Worker] 远程书籍: ${results.length} 本`)
    console.groupEnd()
    return results
  },

  /**
   * 批量同步书籍：上传本地独有的，标记远程独有的
   */
  async syncAllBooks(
    url: string,
    user: string,
    password: string,
    dir: string,
    localBooksJson: string,
    bookDataMap: Record<string, ArrayBuffer>,
  ): Promise<{
    uploaded: string[]
    remoteOnly: { id: string; format: string }[]
    errors: string[]
  }> {
    console.group('[Worker] syncAllBooks')
    sender('sync-status', 'syncing')
    const localBooks: { id: string; format: string; syncStatus?: string; title?: string }[] = JSON.parse(localBooksJson)
    console.log(`[Worker] 本地书籍: ${localBooks.length} 本, 待上传数据: ${Object.keys(bookDataMap).length} 本`)

    const remoteBooks = await actions.listRemoteBooks(url, user, password, dir)

    const remoteSet = new Set(remoteBooks.map((b) => b.id))
    const localSet = new Set(localBooks.map((b) => b.id))

    const uploaded: string[] = []
    const errors: string[] = []

    const toUpload = localBooks.filter((b) => !remoteSet.has(b.id) && b.syncStatus !== 'remote')
    const total = toUpload.length
    console.log(`[Worker] 需要上传: ${total} 本`)

    for (let i = 0; i < toUpload.length; i++) {
      const book = toUpload[i]
      sender('book-sync-progress', i + 1, total, book.title ?? book.id)
      console.log(`[Worker] 上传 ${i + 1}/${total}: ${book.title ?? book.id}`)

      const data = bookDataMap[book.id]
      if (!data) {
        console.warn(`[Worker] 无数据，跳过: ${book.id}`)
        errors.push(book.id)
        continue
      }

      const ok = await actions.uploadBook(url, user, password, dir, book.id, book.format, data, book.title)
      if (ok) {
        uploaded.push(book.id)
      } else {
        errors.push(book.id)
      }
    }

    const remoteOnly = remoteBooks.filter((b) => !localSet.has(b.id))
    console.log(`[Worker] 完成: 上传 ${uploaded.length}, 远程独有 ${remoteOnly.length}, 失败 ${errors.length}`)

    sender('sync-status', 'done')
    console.groupEnd()
    return { uploaded, remoteOnly, errors }
  },
})

setupWorkerActions(actions)
export type SyncActions = typeof actions
