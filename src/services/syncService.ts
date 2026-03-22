/**
 * WebDAV 同步服务
 * 主线程侧的同步逻辑编排
 */
import { createTypedWorker } from '@rewrite0/typed-worker';
import type { SyncActions } from '~/workers/sync.worker';
import type { SyncEvents } from '~/workers/types';
import { settings, updateSettings } from '~/stores/settings';
import {
  setSyncWorker,
  getSyncWorker,
  setSyncStatus,
  setSyncMessage,
  syncLock,
  setSyncLock,
  setSyncPhase,
  setSyncStats,
  setBookSyncProgress,
} from '~/stores/sync';
import { loadBooks } from '~/stores/books';
import {
  getAllBooks,
  getAllProgress,
  saveBook,
  saveProgress,
  getAllBookDeletions,
  saveBookDeletion,
  getBookDeletion,
  deleteBook,
  deleteProgress,
  getBook,
} from '~/utils/bookDB';
import { readBookFile, deleteBookFile, bookFileExists } from '~/utils/bookStorage';
import type { BookMeta, BookDeletionTombstone, ReadProgress } from '~/utils/bookDB';
import { showSnackbar } from '~/utils/snackbar';
import SyncWorker from '~/workers/sync.worker?worker';

let configSyncTimer: ReturnType<typeof setTimeout> | null = null;
let bookSyncTimer: ReturnType<typeof setTimeout> | null = null;
let syncRunner: Promise<void> | null = null;
let pendingConfigSync = false;
let pendingBookSync = false;
let pendingInitialSync = false;

type SyncJobType = 'config' | 'books' | 'full' | 'initial';

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 初始化同步 Worker */
export function initSyncWorker(): void {
  console.group('[Sync] 初始化 Worker');
  const worker = createTypedWorker<SyncActions, SyncEvents>(() => new SyncWorker());

  worker.onEvent('sync-status', (status, message) => {
    console.log('[Sync] Worker 事件 sync-status:', status, message ?? '');
    if (status === 'syncing') setSyncStatus('syncing');
    else if (status === 'done') setSyncStatus('connected');
    else if (status === 'error') {
      setSyncStatus('error');
      setSyncMessage(message ?? '同步出错');
    } else {
      setSyncStatus('connected');
    }
  });

  worker.onEvent('sync-phase', (phase) => {
    setSyncPhase(phase);
  });

  worker.onEvent('sync-stats', (uploaded, downloaded, remoteOnly, tombstoneApplied, errors) => {
    setSyncStats({ uploaded, downloaded, remoteOnly, tombstoneApplied, errors });
  });

  worker.onEvent('book-sync-progress', (current, total, bookTitle) => {
    console.log(`[Sync] 书籍同步进度: ${current}/${total} - ${bookTitle}`);
    setBookSyncProgress({ current, total, bookTitle });
    if (current >= total) {
      setTimeout(() => setBookSyncProgress(null), 2000);
    }
  });

  setSyncWorker(worker);
  console.log('[Sync] Worker 初始化完成');
  console.groupEnd();
}

/** 获取 WebDAV 凭据 */
function getCredentials() {
  const s = settings();
  return {
    url: s.webdavUrl,
    user: s.webdavUser,
    password: s.webdavPassword,
    dir: s.webdavDir || 'web-reader',
  };
}

/** 检查 WebDAV 是否已配置 */
export function isWebDAVConfigured(): boolean {
  const s = settings();
  return !!(s.webdavUrl && s.webdavUser && s.webdavPassword);
}

/** 准备配置数据用于同步（去除 WebDAV 凭据） */
function prepareConfigForSync(): string {
  const s = { ...settings() };
  const { webdavUrl, webdavUser, webdavPassword, ...safeConfig } = s;
  return JSON.stringify({
    ...safeConfig,
    configSyncedAt: safeConfig.configSyncedAt ?? 0,
  });
}

function mergeRemoteBook(local: BookMeta | undefined, remote: BookMeta): BookMeta {
  if (!local) {
    return { ...remote, syncStatus: remote.syncStatus ?? 'remote' };
  }

  const localBookmarks = local.bookmarks;
  const remoteBookmarks = remote.bookmarks;
  const localBookmarkUpdatedAt = local.bookmarksUpdatedAt ?? 0;
  const remoteBookmarkUpdatedAt = remote.bookmarksUpdatedAt ?? 0;

  // 避免把刚同步为 synced 的本地状态被远程旧值覆盖回 local
  const keepSynced = local.syncStatus === 'synced' && remote.syncStatus === 'local';
  const merged: BookMeta = {
    ...local,
    ...remote,
    syncStatus: keepSynced ? 'synced' : (remote.syncStatus ?? local.syncStatus),
  };

  // 书签使用独立时间戳合并，避免 syncStatus 等无关更新覆盖书签。
  if (remoteBookmarks == null) {
    merged.bookmarks = localBookmarks;
    merged.bookmarksUpdatedAt = localBookmarkUpdatedAt || undefined;
    return merged;
  }

  if (localBookmarks == null) {
    merged.bookmarks = remoteBookmarks;
    merged.bookmarksUpdatedAt = remoteBookmarkUpdatedAt || undefined;
    return merged;
  }

  if (localBookmarkUpdatedAt > remoteBookmarkUpdatedAt) {
    merged.bookmarks = localBookmarks;
    merged.bookmarksUpdatedAt = localBookmarkUpdatedAt;
    return merged;
  }

  if (remoteBookmarkUpdatedAt > localBookmarkUpdatedAt) {
    merged.bookmarks = remoteBookmarks;
    merged.bookmarksUpdatedAt = remoteBookmarkUpdatedAt;
    return merged;
  }

  // 旧数据缺少书签时间戳时，尽量保留非空书签，避免无意清空。
  if (localBookmarks.length > 0 && remoteBookmarks.length === 0) {
    merged.bookmarks = localBookmarks;
    merged.bookmarksUpdatedAt = localBookmarkUpdatedAt || undefined;
  }

  return merged;
}

async function applyDeletionTombstones(
  tombstones: BookDeletionTombstone[],
): Promise<{ appliedCount: number; deletedTitles: string[] }> {
  let appliedCount = 0;
  const deletedTitles: string[] = [];
  for (const tombstone of tombstones) {
    const existing = await getBookDeletion(tombstone.bookId);
    if (!existing || tombstone.deletedAt > existing.deletedAt) {
      await saveBookDeletion(tombstone);
    }

    const localBook = await getBook(tombstone.bookId);
    if (localBook) {
      deletedTitles.push(localBook.title);
      await Promise.all([
        deleteBookFile(tombstone.bookId),
        deleteBook(tombstone.bookId),
        deleteProgress(tombstone.bookId),
      ]);
      appliedCount += 1;
    }
  }
  return { appliedCount, deletedTitles };
}

/** 记录完全删除墓碑并触发配置同步 */
export async function recordBookDeletion(
  book: Pick<BookMeta, 'id' | 'format' | 'title'>,
): Promise<void> {
  await saveBookDeletion({
    bookId: book.id,
    deletedAt: Date.now(),
    format: book.format,
    title: book.title,
  });
  await enqueueSync('config');
}

/** 执行配置同步 */
async function runConfigSync(isInitial = false): Promise<void> {
  const worker = getSyncWorker();
  if (!worker || !isWebDAVConfigured()) return;
  let shouldReloadBooks = false;

  console.group(`[Sync] 配置同步 (isInitial=${isInitial})`);
  const { url, user, password, dir } = getCredentials();
  console.log('[Sync] 远程目录:', dir);

  console.log('[Sync] 确保远程目录结构...');
  await worker.ensureDirectories(url, user, password, dir);
  console.log('[Sync] 目录结构已就绪');

  const allBooks = await getAllBooks();
  const allProgress = await getAllProgress();
  const allDeletions = (await getAllBookDeletions()).filter(
    (d) => d.deletedAt >= Date.now() - TOMBSTONE_TTL_MS,
  );
  console.log(`[Sync] 本地数据: ${allBooks.length} 本书, ${allProgress.length} 条进度`);

  const localConfig = prepareConfigForSync();
  const localMeta = JSON.stringify(allBooks);
  const localProgress = JSON.stringify(Object.fromEntries(allProgress.map((p) => [p.bookId, p])));
  const localDeletions = JSON.stringify(allDeletions);

  console.log('[Sync] 调用 syncConfig...');
  const result = await worker.syncConfig(
    url,
    user,
    password,
    dir,
    localConfig,
    localMeta,
    localProgress,
    localDeletions,
    TOMBSTONE_TTL_MS,
    isInitial,
  );
  console.log('[Sync] syncConfig 结果:', result.direction);

  // 设置 & 元信息：按方向处理
  if (result.direction === 'pulled') {
    console.group('[Sync] 拉取远程设置和元信息');

    if (result.config) {
      try {
        const remoteSettings = JSON.parse(result.config);
        console.log('[Sync] 应用远程设置');
        await updateSettings({
          ...remoteSettings,
          webdavUrl: settings().webdavUrl,
          webdavUser: settings().webdavUser,
          webdavPassword: settings().webdavPassword,
        });
      } catch (err) {
        console.error('[Sync] 解析远程设置失败:', err);
      }
    }

    if (result.meta) {
      try {
        const remoteMeta: BookMeta[] = JSON.parse(result.meta);
        const localBooks = await getAllBooks();
        const localMap = new Map(localBooks.map((b) => [b.id, b]));
        const deletionMap = new Map((await getAllBookDeletions()).map((d) => [d.bookId, d]));
        console.log(`[Sync] 远程书籍: ${remoteMeta.length} 本, 本地已有: ${localBooks.length} 本`);
        for (const book of remoteMeta) {
          const tombstone = deletionMap.get(book.id);
          if (tombstone && tombstone.deletedAt >= (book.updatedAt ?? 0)) {
            continue;
          }
          const localBook = localMap.get(book.id);
          const hasLocalFile = await bookFileExists(book.id);
          const merged = mergeRemoteBook(localBook, book);

          // 以本地文件存在性作为最终事实，避免新设备误显示为 local/synced。
          if (!hasLocalFile) {
            merged.syncStatus = 'remote';
          } else if (merged.syncStatus === 'remote') {
            merged.syncStatus = 'synced';
          }

          await saveBook(merged);
        }
      } catch (err) {
        console.error('[Sync] 解析远程书籍元信息失败:', err);
      }
    }

    await loadBooks();
    shouldReloadBooks = false;
    if (isInitial) {
      showSnackbar({ message: '已从远程同步配置和书籍信息', placement: 'bottom' });
    }
    console.groupEnd();
  } else if (result.direction === 'pushed') {
    console.log('[Sync] 本地设置和元信息已推送到远程');
    await updateSettings({ configSyncedAt: Date.now() });
  } else {
    console.log('[Sync] 无需同步 (direction: none)');
  }

  // 阅读进度：独立于方向，始终应用合并结果
  if (result.progress) {
    try {
      const progressUpdates: Record<string, ReadProgress> = JSON.parse(result.progress);
      console.log(`[Sync] 应用 ${Object.keys(progressUpdates).length} 条远程更新的阅读进度`);
      for (const [, p] of Object.entries(progressUpdates)) {
        await saveProgress(p);
      }
      if (Object.keys(progressUpdates).length > 0) {
        // 书架进度依赖 books 信号触发重算，这里在仅进度更新时也强制刷新一次。
        shouldReloadBooks = true;
      }
    } catch (err) {
      console.error('[Sync] 解析进度更新失败:', err);
    }
  }

  if (result.deletions) {
    try {
      const deletionUpdates: BookDeletionTombstone[] = JSON.parse(result.deletions);
      const { appliedCount, deletedTitles } = await applyDeletionTombstones(deletionUpdates);
      console.log(`[Sync] 应用 ${deletionUpdates.length} 条删除墓碑，本地删除 ${appliedCount} 本`);
      if (appliedCount > 0) {
        await loadBooks();
        shouldReloadBooks = false;
        const summary = deletedTitles.slice(0, 2).join('、');
        const more = deletedTitles.length > 2 ? ` 等 ${deletedTitles.length} 本` : '';
        showSnackbar({
          message: summary
            ? `已同步其他设备删除：${summary}${more}`
            : `已同步其他设备删除 ${appliedCount} 本书`,
          placement: 'bottom',
        });
      }
    } catch (err) {
      console.error('[Sync] 解析删除墓碑失败:', err);
    }
  }

  if (shouldReloadBooks) {
    await loadBooks();
  }

  console.groupEnd();
}

/** 执行书籍文件同步 */
async function runBookSync(): Promise<boolean> {
  const worker = getSyncWorker();
  if (!worker || !isWebDAVConfigured()) return false;

  console.group('[Sync] 书籍文件同步');
  const { url, user, password, dir } = getCredentials();
  const allBooks = await getAllBooks();
  const tombstones = await getAllBookDeletions();
  const deletedSet = new Set(tombstones.map((t) => t.bookId));

  // 只收集未同步(local)的书籍数据，跳过已同步(synced)和仅远程(remote)的
  const bookDataMap: Record<string, ArrayBuffer> = {};
  let skippedSynced = 0;
  let skippedRemote = 0;
  for (const book of allBooks) {
    if (deletedSet.has(book.id)) continue;
    if (!book.syncStatus || book.syncStatus === 'local') {
      const data = await readBookFile(book.id);
      if (data) bookDataMap[book.id] = data;
    } else if (book.syncStatus === 'synced') {
      skippedSynced++;
    } else if (book.syncStatus === 'remote') {
      skippedRemote++;
    }
  }
  console.log(
    `[Sync] 待上传: ${Object.keys(bookDataMap).length} 本, 跳过已同步: ${skippedSynced}, 跳过仅远程: ${skippedRemote}`,
  );

  const localBooksInfo = allBooks.map((b) => ({
    id: b.id,
    format: b.format,
    syncStatus: b.syncStatus,
    title: b.title,
  }));

  console.log('[Sync] 调用 syncAllBooks...');
  const result = await worker.syncAllBooks(
    url,
    user,
    password,
    dir,
    JSON.stringify(localBooksInfo),
    bookDataMap,
    JSON.stringify(tombstones),
  );
  console.log(
    `[Sync] 结果: 上传 ${result.uploaded.length} 本, 远程独有 ${result.remoteOnly.length} 本, 失败 ${result.errors.length} 本`,
  );

  if (result.uploaded.length > 0) {
    console.log('[Sync] 已上传:', result.uploaded);
  }
  if (result.remoteOnly.length > 0) {
    console.log('[Sync] 远程独有:', result.remoteOnly);
  }
  if (result.errors.length > 0) {
    console.warn('[Sync] 上传失败:', result.errors);
  }

  // 更新已上传书籍的状态
  for (const id of result.uploaded) {
    const book = allBooks.find((b) => b.id === id);
    if (book) {
      await saveBook({ ...book, syncStatus: 'synced' });
    }
  }

  // 标记远程独有的书籍
  for (const remote of result.remoteOnly) {
    const book = allBooks.find((b) => b.id === remote.id);
    if (book && book.syncStatus !== 'remote') {
      await saveBook({ ...book, syncStatus: 'remote' });
    }
  }

  if (result.uploaded.length > 0 || result.remoteOnly.length > 0) {
    await loadBooks();
    console.log('[Sync] 书籍同步完成，等待配置同步入队');
  }

  console.groupEnd();
  return result.uploaded.length > 0 || result.remoteOnly.length > 0;
}

async function runSyncQueue(): Promise<void> {
  if (syncRunner) {
    await syncRunner;
    return;
  }

  syncRunner = (async () => {
    if (!isWebDAVConfigured()) return;
    setSyncLock(true);
    try {
      while (pendingConfigSync || pendingBookSync || pendingInitialSync) {
        const runInitial = pendingInitialSync;
        const runConfig = pendingConfigSync;
        const runBooks = pendingBookSync;

        pendingInitialSync = false;
        pendingConfigSync = false;
        pendingBookSync = false;

        if (runConfig || runInitial) {
          await runConfigSync(runInitial);
        }

        if (runBooks) {
          const needsMetaPush = await runBookSync();
          if (needsMetaPush) {
            pendingConfigSync = true;
          }
        }
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage((err as Error).message);
      throw err;
    } finally {
      setSyncLock(false);
      syncRunner = null;
    }
  })();

  await syncRunner;
}

export async function enqueueSync(job: SyncJobType): Promise<void> {
  if (!isWebDAVConfigured()) return;
  if (job === 'initial') {
    pendingInitialSync = true;
    pendingConfigSync = true;
  } else if (job === 'config') {
    pendingConfigSync = true;
  } else if (job === 'books') {
    pendingBookSync = true;
  } else {
    pendingConfigSync = true;
    pendingBookSync = true;
  }
  await runSyncQueue();
}

export async function doConfigSync(isInitial = false): Promise<void> {
  await enqueueSync(isInitial ? 'initial' : 'config');
}

export async function doBookSync(): Promise<void> {
  await enqueueSync('books');
}

/** 手动触发完整同步 */
export async function doManualSync(): Promise<void> {
  if (!isWebDAVConfigured()) return;
  console.group('[Sync] 手动同步');
  try {
    await enqueueSync('full');
    console.log('[Sync] 手动同步完成');
    showSnackbar({ message: '同步完成', placement: 'bottom' });
  } catch (err) {
    console.error('[Sync] 手动同步失败:', err);
    showSnackbar({ message: `同步失败: ${(err as Error).message}`, placement: 'bottom' });
  } finally {
    console.groupEnd();
  }
}

/** 启动配置自动同步（防抖 5s） */
export function scheduleConfigSync(): void {
  if (configSyncTimer) clearTimeout(configSyncTimer);
  console.log('[Sync] 配置自动同步已排程 (5s 防抖)');
  configSyncTimer = setTimeout(() => {
    enqueueSync('config');
  }, 5000);
}

/** 启动/停止书籍自动同步定时器 */
export function updateBookSyncTimer(): void {
  if (bookSyncTimer) {
    clearTimeout(bookSyncTimer);
    bookSyncTimer = null;
    console.log('[Sync] 书籍自动同步定时器已停止');
  }

  if (settings().autoSyncBooks && isWebDAVConfigured()) {
    const interval = (settings().bookSyncInterval || 10) * 60 * 1000;
    console.log(`[Sync] 书籍自动同步定时器已启动, 间隔 ${interval / 60000} 分钟`);
    const scheduleNext = () => {
      bookSyncTimer = setTimeout(async () => {
        if (!syncLock()) await enqueueSync('books');
        scheduleNext();
      }, interval);
    };
    scheduleNext();
  }
}

/** 首次连接 WebDAV 时执行的初始同步 */
export async function doInitialSync(): Promise<void> {
  if (!isWebDAVConfigured()) return;
  console.group('[Sync] 首次连接初始同步');
  setSyncStatus('syncing');
  try {
    await enqueueSync('initial');
    setSyncStatus('connected');
    console.log('[Sync] 初始同步完成');
  } catch (err) {
    console.error('[Sync] 初始同步失败:', err);
    setSyncStatus('error');
  }
  console.groupEnd();
}

/** 清理定时器 */
export function cleanupSync(): void {
  console.log('[Sync] 清理定时器');
  if (configSyncTimer) clearTimeout(configSyncTimer);
  if (bookSyncTimer) clearTimeout(bookSyncTimer);
}
