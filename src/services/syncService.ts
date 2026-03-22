/**
 * WebDAV 同步服务
 * 主线程侧的同步逻辑编排
 */
import { createTypedWorker } from '@rewrite0/typed-worker'
import type { SyncActions } from '~/workers/sync.worker'
import type { SyncEvents } from '~/workers/types'
import { settings, updateSettings } from '~/stores/settings'
import {
  setSyncWorker,
  getSyncWorker,
  setSyncStatus,
  setSyncMessage,
  syncLock,
  setSyncLock,
  setBookSyncProgress,
} from '~/stores/sync'
import { loadBooks } from '~/stores/books'
import { getAllBooks, getAllProgress, saveBook, saveProgress } from '~/utils/bookDB'
import { readBookFile } from '~/utils/bookStorage'
import type { BookMeta, ReadProgress } from '~/utils/bookDB'
import { snackbar } from 'mdui'
import SyncWorker from '~/workers/sync.worker?worker'

let configSyncTimer: ReturnType<typeof setTimeout> | null = null
let bookSyncTimer: ReturnType<typeof setTimeout> | null = null

/** 初始化同步 Worker */
export function initSyncWorker(): void {
  console.group('[Sync] 初始化 Worker')
  const worker = createTypedWorker<SyncActions, SyncEvents>(
    () => new SyncWorker(),
  )

  worker.onEvent('sync-status', (status, message) => {
    console.log('[Sync] Worker 事件 sync-status:', status, message ?? '')
    if (status === 'syncing') setSyncStatus('syncing')
    else if (status === 'done') setSyncStatus('connected')
    else if (status === 'error') {
      setSyncStatus('error')
      setSyncMessage(message ?? '同步出错')
    } else {
      setSyncStatus('connected')
    }
  })

  worker.onEvent('book-sync-progress', (current, total, bookTitle) => {
    console.log(`[Sync] 书籍同步进度: ${current}/${total} - ${bookTitle}`)
    setBookSyncProgress({ current, total, bookTitle })
    if (current >= total) {
      setTimeout(() => setBookSyncProgress(null), 2000)
    }
  })

  setSyncWorker(worker)
  console.log('[Sync] Worker 初始化完成')
  console.groupEnd()
}

/** 获取 WebDAV 凭据 */
function getCredentials() {
  const s = settings()
  return {
    url: s.webdavUrl,
    user: s.webdavUser,
    password: s.webdavPassword,
    dir: s.webdavDir || 'web-reader',
  }
}

/** 检查 WebDAV 是否已配置 */
export function isWebDAVConfigured(): boolean {
  const s = settings()
  return !!(s.webdavUrl && s.webdavUser && s.webdavPassword)
}

/** 准备配置数据用于同步（去除 WebDAV 凭据） */
function prepareConfigForSync(): string {
  const s = { ...settings() }
  const { webdavUrl, webdavUser, webdavPassword, ...safeConfig } = s
  return JSON.stringify({ ...safeConfig, configSyncedAt: Date.now() })
}

/** 执行配置同步 */
export async function doConfigSync(isInitial = false): Promise<void> {
  const worker = getSyncWorker()
  if (!worker || !isWebDAVConfigured()) return

  console.group(`[Sync] 配置同步 (isInitial=${isInitial})`)
  const { url, user, password, dir } = getCredentials()
  console.log('[Sync] 远程目录:', dir)

  console.log('[Sync] 确保远程目录结构...')
  await worker.ensureDirectories(url, user, password, dir)
  console.log('[Sync] 目录结构已就绪')

  const allBooks = await getAllBooks()
  const allProgress = await getAllProgress()
  console.log(`[Sync] 本地数据: ${allBooks.length} 本书, ${allProgress.length} 条进度`)

  const localConfig = prepareConfigForSync()
  const localMeta = JSON.stringify(allBooks)
  const localProgress = JSON.stringify(
    Object.fromEntries(allProgress.map((p) => [p.bookId, p])),
  )

  console.log('[Sync] 调用 syncConfig...')
  const result = await worker.syncConfig(
    url, user, password, dir,
    localConfig, localMeta, localProgress,
    isInitial,
  )
  console.log('[Sync] syncConfig 结果:', result.direction)

  if (result.direction === 'pulled') {
    console.group('[Sync] 拉取远程数据覆盖本地')

    if (result.config) {
      try {
        const remoteSettings = JSON.parse(result.config)
        console.log('[Sync] 应用远程设置')
        await updateSettings({
          ...remoteSettings,
          webdavUrl: settings().webdavUrl,
          webdavUser: settings().webdavUser,
          webdavPassword: settings().webdavPassword,
        })
      } catch (err) {
        console.error('[Sync] 解析远程设置失败:', err)
      }
    }

    if (result.meta) {
      try {
        const remoteMeta: BookMeta[] = JSON.parse(result.meta)
        const localIds = new Set((await getAllBooks()).map((b) => b.id))
        console.log(`[Sync] 远程书籍: ${remoteMeta.length} 本, 本地已有: ${localIds.size} 本`)
        for (const book of remoteMeta) {
          if (localIds.has(book.id)) {
            await saveBook(book)
          } else {
            console.log(`[Sync] 新增远程书籍: ${book.title} (${book.id})`)
            await saveBook({ ...book, syncStatus: 'remote' })
          }
        }
      } catch (err) {
        console.error('[Sync] 解析远程书籍元信息失败:', err)
      }
    }

    if (result.progress) {
      try {
        const remoteProgress: Record<string, ReadProgress> = JSON.parse(result.progress)
        console.log(`[Sync] 恢复 ${Object.keys(remoteProgress).length} 条阅读进度`)
        for (const [, p] of Object.entries(remoteProgress)) {
          await saveProgress(p)
        }
      } catch (err) {
        console.error('[Sync] 解析远程进度失败:', err)
      }
    }

    await loadBooks()
    if (isInitial) {
      snackbar({ message: '已从远程同步配置和书籍信息', placement: 'bottom' })
    }
    console.groupEnd()
  } else if (result.direction === 'pushed') {
    console.log('[Sync] 本地数据已推送到远程')
    await updateSettings({ configSyncedAt: Date.now() })
  } else {
    console.log('[Sync] 无需同步 (direction: none)')
  }

  console.groupEnd()
}

/** 执行书籍文件同步 */
export async function doBookSync(): Promise<void> {
  const worker = getSyncWorker()
  if (!worker || !isWebDAVConfigured()) return

  console.group('[Sync] 书籍文件同步')
  const { url, user, password, dir } = getCredentials()
  const allBooks = await getAllBooks()

  // 只收集未同步(local)的书籍数据，跳过已同步(synced)和仅远程(remote)的
  const bookDataMap: Record<string, ArrayBuffer> = {}
  let skippedSynced = 0
  let skippedRemote = 0
  for (const book of allBooks) {
    if (!book.syncStatus || book.syncStatus === 'local') {
      const data = await readBookFile(book.id)
      if (data) bookDataMap[book.id] = data
    } else if (book.syncStatus === 'synced') {
      skippedSynced++
    } else if (book.syncStatus === 'remote') {
      skippedRemote++
    }
  }
  console.log(`[Sync] 待上传: ${Object.keys(bookDataMap).length} 本, 跳过已同步: ${skippedSynced}, 跳过仅远程: ${skippedRemote}`)

  const localBooksInfo = allBooks.map((b) => ({
    id: b.id,
    format: b.format,
    syncStatus: b.syncStatus,
    title: b.title,
  }))

  console.log('[Sync] 调用 syncAllBooks...')
  const result = await worker.syncAllBooks(
    url, user, password, dir,
    JSON.stringify(localBooksInfo),
    bookDataMap,
  )
  console.log(`[Sync] 结果: 上传 ${result.uploaded.length} 本, 远程独有 ${result.remoteOnly.length} 本, 失败 ${result.errors.length} 本`)

  if (result.uploaded.length > 0) {
    console.log('[Sync] 已上传:', result.uploaded)
  }
  if (result.remoteOnly.length > 0) {
    console.log('[Sync] 远程独有:', result.remoteOnly)
  }
  if (result.errors.length > 0) {
    console.warn('[Sync] 上传失败:', result.errors)
  }

  // 更新已上传书籍的状态
  for (const id of result.uploaded) {
    const book = allBooks.find((b) => b.id === id)
    if (book) {
      await saveBook({ ...book, syncStatus: 'synced' })
    }
  }

  // 标记远程独有的书籍
  for (const remote of result.remoteOnly) {
    const book = allBooks.find((b) => b.id === remote.id)
    if (book && book.syncStatus !== 'remote') {
      await saveBook({ ...book, syncStatus: 'remote' })
    }
  }

  if (result.uploaded.length > 0 || result.remoteOnly.length > 0) {
    await loadBooks()
    console.log('[Sync] 书籍同步后推送元信息...')
    await doConfigSync()
  }

  console.groupEnd()
}

/** 手动触发完整同步 */
export async function doManualSync(): Promise<void> {
  if (syncLock() || !isWebDAVConfigured()) return
  console.group('[Sync] 手动同步')
  setSyncLock(true)
  try {
    await doConfigSync()
    await doBookSync()
    console.log('[Sync] 手动同步完成')
    snackbar({ message: '同步完成', placement: 'bottom' })
  } catch (err) {
    console.error('[Sync] 手动同步失败:', err)
    snackbar({ message: `同步失败: ${(err as Error).message}`, placement: 'bottom' })
  } finally {
    setSyncLock(false)
    console.groupEnd()
  }
}

/** 启动配置自动同步（防抖 5s） */
export function scheduleConfigSync(): void {
  if (configSyncTimer) clearTimeout(configSyncTimer)
  console.log('[Sync] 配置自动同步已排程 (5s 防抖)')
  configSyncTimer = setTimeout(() => {
    doConfigSync()
  }, 5000)
}

/** 启动/停止书籍自动同步定时器 */
export function updateBookSyncTimer(): void {
  if (bookSyncTimer) {
    clearTimeout(bookSyncTimer)
    bookSyncTimer = null
    console.log('[Sync] 书籍自动同步定时器已停止')
  }

  if (settings().autoSyncBooks && isWebDAVConfigured()) {
    const interval = (settings().bookSyncInterval || 10) * 60 * 1000
    console.log(`[Sync] 书籍自动同步定时器已启动, 间隔 ${interval / 60000} 分钟`)
    const scheduleNext = () => {
      bookSyncTimer = setTimeout(async () => {
        if (!syncLock()) await doBookSync()
        scheduleNext()
      }, interval)
    }
    scheduleNext()
  }
}

/** 首次连接 WebDAV 时执行的初始同步 */
export async function doInitialSync(): Promise<void> {
  if (!isWebDAVConfigured()) return
  console.group('[Sync] 首次连接初始同步')
  setSyncStatus('syncing')
  try {
    await doConfigSync(true)
    setSyncStatus('connected')
    console.log('[Sync] 初始同步完成')
  } catch (err) {
    console.error('[Sync] 初始同步失败:', err)
    setSyncStatus('error')
  }
  console.groupEnd()
}

/** 清理定时器 */
export function cleanupSync(): void {
  console.log('[Sync] 清理定时器')
  if (configSyncTimer) clearTimeout(configSyncTimer)
  if (bookSyncTimer) clearTimeout(bookSyncTimer)
}
