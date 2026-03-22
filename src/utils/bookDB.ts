/**
 * 书籍元信息数据库（idb-keyval）
 */
import { createStore, get, set, del, keys, entries, clear } from 'idb-keyval';

// 书籍元数据 Store
const booksStore = createStore('books-db', 'books');

// 阅读进度 Store
const progressStore = createStore('progress-db', 'progress');

/** 书籍元数据 */
export interface BookMeta {
  id: string;
  title: string;
  author: string;
  /** 文件格式 */
  format: 'txt' | 'epub';
  /** 文件大小（字节） */
  fileSize: number;
  /** 封面图 data URL 或空 */
  cover?: string;
  /** 章节数 */
  chapterCount: number;
  /**
   * 兼容旧数据：历史版本会保存章节标题列表。
   * 新版本不再写入该字段，以降低元数据体积。
   */
  chapters?: string[];
  /** 标签列表 */
  tags?: string[];
  /** 导入时间 */
  addedAt: number;
  /** 最后阅读时间 */
  lastReadAt?: number;
  /** 是否已读完 */
  finished?: boolean;
  /** 同步状态：local=仅本地, remote=仅远程, synced=已同步 */
  syncStatus?: 'local' | 'remote' | 'synced';
  /** 元信息最后更新时间 */
  updatedAt?: number;
}

/** 书籍删除墓碑（用于跨设备传播删除） */
export interface BookDeletionTombstone {
  bookId: string;
  deletedAt: number;
  format?: 'txt' | 'epub';
  title?: string;
}

// 书籍删除墓碑 Store
const deletionStore = createStore('deleted-books-db', 'tombstones');

/** 阅读进度 */
export interface ReadProgress {
  bookId: string;
  /** 当前章节索引 */
  chapterIndex: number;
  /** 当前页在章节中的滚动百分比 */
  scrollPercent: number;
  /** 总体阅读进度 0-100 */
  overallPercent: number;
  /** 更新时间 */
  updatedAt: number;
}

// ========== 书籍元数据操作 ==========

export async function getBook(id: string): Promise<BookMeta | undefined> {
  const book = await get<BookMeta>(id, booksStore);
  if (!book) return undefined;
  const normalized = normalizeBookMeta(book);
  // 读到旧数据时立即瘦身，避免大体积元数据长期驻留。
  if (book.chapters) {
    await set(id, normalized, booksStore);
  }
  return normalized;
}

export async function saveBook(book: BookMeta): Promise<void> {
  await set(
    book.id,
    { ...normalizeBookMeta(book), updatedAt: book.updatedAt ?? Date.now() },
    booksStore,
  );
}

export async function deleteBook(id: string): Promise<void> {
  await del(id, booksStore);
}

export async function getAllBooks(): Promise<BookMeta[]> {
  const allEntries = await entries<string, BookMeta>(booksStore);
  const books = allEntries.map(([, v]) => normalizeBookMeta(v));
  const legacyEntries = allEntries.filter(([, v]) => Array.isArray(v.chapters));

  if (legacyEntries.length > 0) {
    await Promise.all(
      legacyEntries.map(([id, book]) => set(id, normalizeBookMeta(book), booksStore)),
    );
  }

  return books;
}

export async function getAllBookIds(): Promise<string[]> {
  return (await keys<string>(booksStore)) as string[];
}

// ========== 阅读进度操作 ==========

export async function getProgress(bookId: string): Promise<ReadProgress | undefined> {
  return get<ReadProgress>(bookId, progressStore);
}

export async function saveProgress(progress: ReadProgress): Promise<void> {
  await set(progress.bookId, progress, progressStore);
}

export async function deleteProgress(bookId: string): Promise<void> {
  await del(bookId, progressStore);
}

/** 获取所有阅读进度 */
export async function getAllProgress(): Promise<ReadProgress[]> {
  const allEntries = await entries<string, ReadProgress>(progressStore);
  return allEntries.map(([, v]) => v);
}

// ========== 删除墓碑操作 ==========

export async function getBookDeletion(bookId: string): Promise<BookDeletionTombstone | undefined> {
  return get<BookDeletionTombstone>(bookId, deletionStore);
}

export async function saveBookDeletion(tombstone: BookDeletionTombstone): Promise<void> {
  await set(tombstone.bookId, tombstone, deletionStore);
}

export async function deleteBookDeletion(bookId: string): Promise<void> {
  await del(bookId, deletionStore);
}

export async function getAllBookDeletions(): Promise<BookDeletionTombstone[]> {
  const allEntries = await entries<string, BookDeletionTombstone>(deletionStore);
  return allEntries.map(([, v]) => v);
}

export async function clearAllBookDeletions(): Promise<void> {
  const ids = await keys<string>(deletionStore);
  await Promise.all(ids.map((id) => del(id, deletionStore)));
}

export async function clearAllBookData(): Promise<void> {
  await Promise.all([clear(booksStore), clear(progressStore), clear(deletionStore)]);
}

function normalizeBookMeta(book: BookMeta): BookMeta {
  const { chapters: _legacyChapters, ...rest } = book;
  return rest;
}
