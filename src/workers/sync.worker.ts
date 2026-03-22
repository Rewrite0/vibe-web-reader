/**
 * WebDAV 同步 Worker
 */
import {
  defineWorkerActions,
  setupWorkerActions,
  defineWorkerSendEvent,
} from '@rewrite0/typed-worker';
import type { SyncEvents } from './types';

const sender = defineWorkerSendEvent<SyncEvents>();

type BookDeletionTombstone = {
  bookId: string;
  deletedAt: number;
  format?: 'txt' | 'epub';
  title?: string;
};

// ========== 工具函数 ==========

function authHeader(user: string, password: string): Record<string, string> {
  return {
    Authorization: 'Basic ' + btoa(`${user}:${password}`),
  };
}

function joinUrl(base: string, ...parts: string[]): string {
  let result = base.endsWith('/') ? base.slice(0, -1) : base;
  for (const part of parts) {
    const p = part.startsWith('/') ? part : '/' + part;
    result += p;
  }
  return result;
}

/** 确保 PUT/MKCOL 成功 */
function isSuccess(status: number): boolean {
  return (status >= 200 && status < 300) || status === 405;
}

/** 清理文件名中的非法字符 */
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'untitled'
  );
}

/** 构造远程书籍文件名: {title}_{id}.{format} */
function bookFileName(bookId: string, format: string, title?: string): string {
  const safeName = title ? sanitizeFilename(title) : bookId;
  return `${safeName}_${bookId}.${format}`;
}

/** 从远程文件名解析 bookId: {title}_{id}.{format} → id */
function parseBookFileName(filename: string): { id: string; format: string } | null {
  // 匹配最后一个 _ 之后到 .format 之间的部分作为 id
  const match = filename.match(/^.+_([^_]+)\.(txt|epub)$/);
  if (match) return { id: match[1], format: match[2] };
  // 兼容旧格式 {id}.{format}
  const legacy = filename.match(/^([^_]+)\.(txt|epub)$/);
  if (legacy) return { id: legacy[1], format: legacy[2] };
  return null;
}

/** 递归创建远程目录 */
async function mkdirp(url: string, user: string, password: string, path: string): Promise<void> {
  const segments = path.split('/').filter(Boolean);
  let current = url;
  for (const seg of segments) {
    current = joinUrl(current, seg);
    await fetch(current + '/', {
      method: 'MKCOL',
      headers: authHeader(user, password),
    }).catch(() => {});
  }
}

/** PROPFIND 列出目录内容 */
async function propfind(
  url: string,
  user: string,
  password: string,
  path: string,
): Promise<string[]> {
  console.log('[Worker] PROPFIND:', path);
  const res = await fetch(joinUrl(url, path) + '/', {
    method: 'PROPFIND',
    headers: {
      ...authHeader(user, password),
      Depth: '1',
      'Content-Type': 'application/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>',
  });
  if (!res.ok) {
    console.warn('[Worker] PROPFIND 失败:', res.status);
    return [];
  }
  const xml = await res.text();
  const hrefs: string[] = [];
  const regex = /<d:href>([^<]+)<\/d:href>|<D:href>([^<]+)<\/D:href>|<href>([^<]+)<\/href>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    hrefs.push(match[1] || match[2] || match[3]);
  }
  const basePath = path.endsWith('/') ? path : path + '/';
  const result = hrefs
    .map((h) => decodeURIComponent(h))
    .filter((h) => {
      const normalized = h.endsWith('/') ? h.slice(0, -1) : h;
      const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
      return normalized !== base && !normalized.endsWith(base);
    })
    .map((h) => {
      const parts = h.replace(/\/$/, '').split('/');
      return parts[parts.length - 1];
    })
    .filter(Boolean);
  console.log(`[Worker] PROPFIND 结果: ${result.length} 项`, result);
  return result;
}

// ========== Worker Actions ==========

const actions = defineWorkerActions({
  /** 测试 WebDAV 连接 */
  async testConnection(url: string, user: string, password: string) {
    console.group('[Worker] testConnection');
    try {
      const res = await fetch(url, {
        method: 'OPTIONS',
        headers: authHeader(user, password),
      });
      console.log('[Worker] OPTIONS 响应:', res.status);
      console.groupEnd();
      return res.ok;
    } catch (err) {
      console.error('[Worker] 连接失败:', err);
      console.groupEnd();
      return false;
    }
  },

  /** 确保远程目录结构存在 */
  async ensureDirectories(url: string, user: string, password: string, dir: string) {
    console.group('[Worker] ensureDirectories:', dir);
    try {
      await mkdirp(url, user, password, dir);
      await mkdirp(url, user, password, `${dir}/config`);
      await mkdirp(url, user, password, `${dir}/books`);
      await mkdirp(url, user, password, `${dir}/books/txt`);
      await mkdirp(url, user, password, `${dir}/books/epub`);
      console.log('[Worker] 目录结构创建完成');
      console.groupEnd();
      return true;
    } catch (err) {
      console.error('[Worker] 创建目录失败:', err);
      console.groupEnd();
      return false;
    }
  },

  /**
   * 同步配置（设置 + 书籍元信息 + 进度）
   * 设置和元信息：isInitial 时远程覆盖本地，否则按 configSyncedAt 时间戳比较
   * 阅读进度：始终双向合并，逐本书比较 updatedAt，取更新的记录
   */
  async syncConfig(
    url: string,
    user: string,
    password: string,
    dir: string,
    localConfig: string,
    localMeta: string,
    localProgress: string,
    localDeletions: string,
    tombstoneTtlMs: number,
    isInitial: boolean,
  ): Promise<{
    config?: string;
    meta?: string;
    progress?: string;
    deletions?: string;
    direction: 'pushed' | 'pulled' | 'none';
  }> {
    console.group(`[Worker] syncConfig (isInitial=${isInitial})`);
    sender('sync-status', 'syncing');
    sender('sync-phase', 'planning');
    try {
      const configPath = `${dir}/config`;
      const headers = authHeader(user, password);
      const progressUrl = joinUrl(url, configPath, 'progress.json');
      const deletionsUrl = joinUrl(url, configPath, 'deleted-books.json');

      // ========== 设置 & 元信息：方向性同步 ==========

      console.log('[Worker] 获取远程 settings.json...');
      const remoteConfigRes = await fetch(joinUrl(url, configPath, 'settings.json'), {
        method: 'GET',
        headers,
      }).catch(() => null);

      const remoteExists = remoteConfigRes && remoteConfigRes.ok;
      console.log('[Worker] 远程配置存在:', remoteExists);

      let direction: 'pushed' | 'pulled' | 'none' = 'none';
      let pulledConfig: string | undefined;
      let pulledMeta: string | undefined;

      if (isInitial && remoteExists) {
        sender('sync-phase', 'pulling');
        console.log('[Worker] 首次同步 + 远程有数据 → 拉取设置和元信息');
        direction = 'pulled';
        pulledConfig = await remoteConfigRes!.text();

        const metaRes = await fetch(joinUrl(url, configPath, 'books-meta.json'), {
          method: 'GET',
          headers,
        });
        pulledMeta = metaRes.ok ? await metaRes.text() : undefined;
        console.log('[Worker] 远程书籍元信息:', pulledMeta ? '有' : '无');
      } else if (!remoteExists) {
        sender('sync-phase', 'pushing');
        console.log('[Worker] 远程无数据 → 推送设置和元信息');
        direction = 'pushed';
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
        ]);
      } else {
        // 非首次同步：比较时间戳
        const remoteConfig = await remoteConfigRes!.text();
        let remoteTimestamp = 0;
        try {
          const parsed = JSON.parse(remoteConfig);
          remoteTimestamp = parsed.configSyncedAt ?? 0;
        } catch {
          /* ignore */
        }

        let localTimestamp = 0;
        try {
          const parsed = JSON.parse(localConfig);
          localTimestamp = parsed.configSyncedAt ?? 0;
        } catch {
          /* ignore */
        }

        console.log(`[Worker] 时间戳比较: 本地=${localTimestamp}, 远程=${remoteTimestamp}`);

        if (remoteTimestamp > localTimestamp) {
          sender('sync-phase', 'pulling');
          console.log('[Worker] 远程更新 → 拉取设置和元信息');
          direction = 'pulled';
          pulledConfig = remoteConfig;

          const metaRes = await fetch(joinUrl(url, configPath, 'books-meta.json'), {
            method: 'GET',
            headers,
          });
          pulledMeta = metaRes.ok ? await metaRes.text() : undefined;
        } else {
          sender('sync-phase', 'pushing');
          console.log('[Worker] 本地更新或相等 → 推送设置和元信息');
          direction = 'pushed';
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
          ]);
        }
      }

      // ========== 阅读进度：双向合并（逐本书比较 updatedAt） ==========

      console.log('[Worker] 获取远程进度...');
      const remoteProgressRes = await fetch(progressUrl, {
        method: 'GET',
        headers,
      }).catch(() => null);
      const remoteProgressText =
        remoteProgressRes && remoteProgressRes.ok ? await remoteProgressRes.text() : '{}';

      let remoteProgressMap: Record<string, { updatedAt?: number; [k: string]: unknown }> = {};
      let localProgressMap: Record<string, { updatedAt?: number; [k: string]: unknown }> = {};
      try {
        remoteProgressMap = JSON.parse(remoteProgressText);
      } catch {
        /* ignore */
      }
      try {
        localProgressMap = JSON.parse(localProgress);
      } catch {
        /* ignore */
      }

      let localBooksMeta: Array<{ id?: string }> = [];
      let remoteBooksMeta: Array<{ id?: string }> = [];
      try {
        localBooksMeta = JSON.parse(localMeta);
      } catch {
        /* ignore */
      }
      if (direction === 'pulled' && pulledMeta) {
        try {
          remoteBooksMeta = JSON.parse(pulledMeta);
        } catch {
          /* ignore */
        }
      }

      const validBookIds = new Set([
        ...localBooksMeta.map((b) => b.id).filter((id): id is string => !!id),
        ...remoteBooksMeta.map((b) => b.id).filter((id): id is string => !!id),
      ]);
      if (validBookIds.size > 0) {
        remoteProgressMap = Object.fromEntries(
          Object.entries(remoteProgressMap).filter(([bookId]) => validBookIds.has(bookId)),
        );
        localProgressMap = Object.fromEntries(
          Object.entries(localProgressMap).filter(([bookId]) => validBookIds.has(bookId)),
        );
      }

      const merged: Record<string, unknown> = {};
      const localUpdates: Record<string, unknown> = {};

      const allBookIds = new Set([
        ...Object.keys(localProgressMap),
        ...Object.keys(remoteProgressMap),
      ]);

      for (const bookId of allBookIds) {
        const local = localProgressMap[bookId];
        const remote = remoteProgressMap[bookId];
        if (local && remote) {
          if ((remote.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
            merged[bookId] = remote;
            localUpdates[bookId] = remote;
          } else {
            merged[bookId] = local;
          }
        } else if (local) {
          merged[bookId] = local;
        } else {
          merged[bookId] = remote;
          localUpdates[bookId] = remote;
        }
      }

      const localUpdateCount = Object.keys(localUpdates).length;
      console.log(`[Worker] 进度合并: 共 ${allBookIds.size} 本, 远程更新 ${localUpdateCount} 条`);

      // 推送合并后的进度到远程
      await fetch(progressUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });

      // ========== 删除墓碑：双向合并（逐本书比较 deletedAt） ==========

      console.log('[Worker] 获取远程删除墓碑...');
      const remoteDeletionsRes = await fetch(deletionsUrl, {
        method: 'GET',
        headers,
      }).catch(() => null);
      const remoteDeletionsText =
        remoteDeletionsRes && remoteDeletionsRes.ok ? await remoteDeletionsRes.text() : '[]';

      let remoteDeletions: BookDeletionTombstone[] = [];
      let localDeletionsList: BookDeletionTombstone[] = [];
      try {
        remoteDeletions = JSON.parse(remoteDeletionsText);
      } catch {
        /* ignore */
      }
      try {
        localDeletionsList = JSON.parse(localDeletions);
      } catch {
        /* ignore */
      }

      const now = Date.now();
      const cutoff = now - Math.max(tombstoneTtlMs, 0);
      const freshRemoteDeletions = remoteDeletions.filter((d) => d.deletedAt >= cutoff);
      const freshLocalDeletions = localDeletionsList.filter((d) => d.deletedAt >= cutoff);

      const remoteDeletionMap = new Map(freshRemoteDeletions.map((d) => [d.bookId, d]));
      const localDeletionMap = new Map(freshLocalDeletions.map((d) => [d.bookId, d]));
      const mergedDeletionMap = new Map<string, BookDeletionTombstone>();
      const localDeletionUpdates: BookDeletionTombstone[] = [];

      const allDeletionIds = new Set([...remoteDeletionMap.keys(), ...localDeletionMap.keys()]);

      for (const bookId of allDeletionIds) {
        const local = localDeletionMap.get(bookId);
        const remote = remoteDeletionMap.get(bookId);
        if (local && remote) {
          if ((remote.deletedAt ?? 0) > (local.deletedAt ?? 0)) {
            mergedDeletionMap.set(bookId, remote);
            localDeletionUpdates.push(remote);
          } else {
            mergedDeletionMap.set(bookId, local);
          }
          continue;
        }
        if (local) {
          mergedDeletionMap.set(bookId, local);
          continue;
        }
        if (remote) {
          mergedDeletionMap.set(bookId, remote);
          localDeletionUpdates.push(remote);
        }
      }

      const mergedDeletions = Array.from(mergedDeletionMap.values());
      await fetch(deletionsUrl, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(mergedDeletions),
      });

      console.log(
        `[Worker] 删除墓碑合并: 共 ${mergedDeletions.length} 条(已按TTL清理), 远程更新 ${localDeletionUpdates.length} 条`,
      );

      sender('sync-status', 'done');
      sender('sync-phase', 'done');
      sender('sync-stats', 0, 0, 0, localDeletionUpdates.length, 0);
      console.groupEnd();
      return {
        config: pulledConfig,
        meta: pulledMeta,
        progress: localUpdateCount > 0 ? JSON.stringify(localUpdates) : undefined,
        deletions:
          localDeletionUpdates.length > 0 ? JSON.stringify(localDeletionUpdates) : undefined,
        direction,
      };
    } catch (err) {
      console.error('[Worker] syncConfig 失败:', err);
      sender('sync-status', 'error', (err as Error).message);
      sender('sync-phase', 'error');
      console.groupEnd();
      return { direction: 'none' };
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
    const fileName = bookFileName(bookId, format, title);
    const remotePath = `${dir}/books/${format}/${fileName}`;
    console.log(`[Worker] 上传书籍: ${remotePath} (${(data.byteLength / 1024).toFixed(1)} KB)`);
    try {
      const res = await fetch(joinUrl(url, remotePath), {
        method: 'PUT',
        headers: {
          ...authHeader(user, password),
          'Content-Type': 'application/octet-stream',
        },
        body: data,
      });
      const ok = isSuccess(res.status);
      console.log(`[Worker] 上传结果: ${res.status} (${ok ? '成功' : '失败'})`);
      return ok;
    } catch (err) {
      console.error(`[Worker] 上传失败:`, err);
      return false;
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
    const fileName = bookFileName(bookId, format, title);
    const remotePath = `${dir}/books/${format}/${fileName}`;
    console.log(`[Worker] 下载书籍: ${remotePath}`);
    try {
      const res = await fetch(joinUrl(url, remotePath), {
        method: 'GET',
        headers: authHeader(user, password),
      });
      if (!res.ok) {
        console.warn(`[Worker] 下载失败: ${res.status}`);
        return null;
      }
      const buf = await res.arrayBuffer();
      console.log(`[Worker] 下载完成: ${(buf.byteLength / 1024).toFixed(1)} KB`);
      return buf;
    } catch (err) {
      console.error(`[Worker] 下载异常:`, err);
      return null;
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
    const fileName = bookFileName(bookId, format, title);
    const remotePath = `${dir}/books/${format}/${fileName}`;
    console.log(`[Worker] 删除远程书籍: ${remotePath}`);
    try {
      const res = await fetch(joinUrl(url, remotePath), {
        method: 'DELETE',
        headers: authHeader(user, password),
      });
      const ok = res.ok || res.status === 404;
      console.log(`[Worker] 删除结果: ${res.status} (${ok ? '成功' : '失败'})`);
      return ok;
    } catch (err) {
      console.error(`[Worker] 删除异常:`, err);
      return false;
    }
  },

  /** 列出远程所有书籍文件 */
  async listRemoteBooks(
    url: string,
    user: string,
    password: string,
    dir: string,
  ): Promise<{ id: string; format: string }[]> {
    console.group('[Worker] listRemoteBooks');
    const results: { id: string; format: string }[] = [];

    for (const format of ['txt', 'epub']) {
      try {
        const files = await propfind(url, user, password, `${dir}/books/${format}`);
        for (const filename of files) {
          const parsed = parseBookFileName(filename);
          if (parsed) {
            results.push(parsed);
          }
        }
      } catch {
        /* ignore */
      }
    }

    console.log(`[Worker] 远程书籍: ${results.length} 本`);
    console.groupEnd();
    return results;
  },

  /** 清空远程书籍文件和书籍相关元信息（开发用途） */
  async clearRemoteBooks(
    url: string,
    user: string,
    password: string,
    dir: string,
  ): Promise<{ deleted: number; errors: number }> {
    console.group('[Worker] clearRemoteBooks');
    sender('sync-status', 'syncing');
    sender('sync-phase', 'files');

    let deleted = 0;
    let errors = 0;
    const headers = authHeader(user, password);

    for (const format of ['txt', 'epub']) {
      let files: string[] = [];
      try {
        files = await propfind(url, user, password, `${dir}/books/${format}`);
      } catch (err) {
        console.warn('[Worker] 列举远程书籍失败:', err);
        errors += 1;
        continue;
      }

      for (const filename of files) {
        const remotePath = `${dir}/books/${format}/${filename}`;
        try {
          const res = await fetch(joinUrl(url, remotePath), {
            method: 'DELETE',
            headers,
          });
          if (res.ok || res.status === 404) {
            deleted += 1;
          } else {
            errors += 1;
          }
        } catch (err) {
          console.warn('[Worker] 删除远程书籍失败:', remotePath, err);
          errors += 1;
        }
      }
    }

    const configBase = `${dir}/config`;
    const configWrites = [
      fetch(joinUrl(url, configBase, 'books-meta.json'), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '[]',
      }),
      fetch(joinUrl(url, configBase, 'progress.json'), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      }),
      fetch(joinUrl(url, configBase, 'deleted-books.json'), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '[]',
      }),
    ];

    const writeResults = await Promise.allSettled(configWrites);
    for (const result of writeResults) {
      if (result.status === 'rejected') {
        errors += 1;
        continue;
      }
      if (!isSuccess(result.value.status)) {
        errors += 1;
      }
    }

    sender(
      'sync-status',
      errors > 0 ? 'error' : 'done',
      errors > 0 ? '部分文件删除失败' : undefined,
    );
    sender('sync-phase', errors > 0 ? 'error' : 'done');
    sender('sync-stats', 0, 0, 0, 0, errors);
    console.groupEnd();
    return { deleted, errors };
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
    localDeletionsJson = '[]',
  ): Promise<{
    uploaded: string[];
    remoteOnly: { id: string; format: string }[];
    errors: string[];
  }> {
    console.group('[Worker] syncAllBooks');
    sender('sync-status', 'syncing');
    sender('sync-phase', 'files');
    const localBooks: { id: string; format: string; syncStatus?: string; title?: string }[] =
      JSON.parse(localBooksJson);
    const localDeletionList: BookDeletionTombstone[] = JSON.parse(localDeletionsJson);
    const localDeletionSet = new Set(localDeletionList.map((d) => d.bookId));
    console.log(
      `[Worker] 本地书籍: ${localBooks.length} 本, 待上传数据: ${Object.keys(bookDataMap).length} 本`,
    );

    const remoteBooks = await actions.listRemoteBooks(url, user, password, dir);

    const remoteSet = new Set(remoteBooks.map((b) => b.id));
    const localSet = new Set(localBooks.map((b) => b.id));

    const uploaded: string[] = [];
    const errors: string[] = [];

    const toUpload = localBooks.filter((b) => {
      if (localDeletionSet.has(b.id)) return false;
      return !remoteSet.has(b.id) && b.syncStatus !== 'remote';
    });
    const total = toUpload.length;
    console.log(`[Worker] 需要上传: ${total} 本`);

    for (let i = 0; i < toUpload.length; i++) {
      const book = toUpload[i];
      sender('book-sync-progress', i + 1, total, book.title ?? book.id);
      console.log(`[Worker] 上传 ${i + 1}/${total}: ${book.title ?? book.id}`);

      const data = bookDataMap[book.id];
      if (!data) {
        console.warn(`[Worker] 无数据，跳过: ${book.id}`);
        errors.push(book.id);
        continue;
      }

      const ok = await actions.uploadBook(
        url,
        user,
        password,
        dir,
        book.id,
        book.format,
        data,
        book.title,
      );
      if (ok) {
        uploaded.push(book.id);
      } else {
        errors.push(book.id);
      }
    }

    const remoteOnly = remoteBooks.filter(
      (b) => !localSet.has(b.id) && !localDeletionSet.has(b.id),
    );
    console.log(
      `[Worker] 完成: 上传 ${uploaded.length}, 远程独有 ${remoteOnly.length}, 失败 ${errors.length}`,
    );

    sender('sync-status', 'done');
    sender('sync-phase', 'done');
    sender('sync-stats', uploaded.length, 0, remoteOnly.length, 0, errors.length);
    console.groupEnd();
    return { uploaded, remoteOnly, errors };
  },
});

setupWorkerActions(actions);
export type SyncActions = typeof actions;
