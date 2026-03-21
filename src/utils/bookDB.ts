/**
 * 书籍元信息数据库（idb-keyval）
 */
import { createStore, get, set, del, keys, entries } from 'idb-keyval'

// 书籍元数据 Store
const booksStore = createStore('books-db', 'books')

// 阅读进度 Store
const progressStore = createStore('progress-db', 'progress')

/** 书籍元数据 */
export interface BookMeta {
  id: string
  title: string
  author: string
  /** 文件格式 */
  format: 'txt' | 'epub'
  /** 文件大小（字节） */
  fileSize: number
  /** 封面图 data URL 或空 */
  cover?: string
  /** 章节数 */
  chapterCount: number
  /** 章节标题列表 */
  chapters: string[]
  /** 标签列表 */
  tags?: string[]
  /** 导入时间 */
  addedAt: number
  /** 最后阅读时间 */
  lastReadAt?: number
  /** 是否已读完 */
  finished?: boolean
}

/** 阅读进度 */
export interface ReadProgress {
  bookId: string
  /** 当前章节索引 */
  chapterIndex: number
  /** 当前页在章节中的滚动百分比 */
  scrollPercent: number
  /** 总体阅读进度 0-100 */
  overallPercent: number
  /** 更新时间 */
  updatedAt: number
}

// ========== 书籍元数据操作 ==========

export async function getBook(id: string): Promise<BookMeta | undefined> {
  return get<BookMeta>(id, booksStore)
}

export async function saveBook(book: BookMeta): Promise<void> {
  await set(book.id, book, booksStore)
}

export async function deleteBook(id: string): Promise<void> {
  await del(id, booksStore)
}

export async function getAllBooks(): Promise<BookMeta[]> {
  const allEntries = await entries<string, BookMeta>(booksStore)
  return allEntries.map(([, v]) => v)
}

export async function getAllBookIds(): Promise<string[]> {
  return (await keys<string>(booksStore)) as string[]
}

// ========== 阅读进度操作 ==========

export async function getProgress(bookId: string): Promise<ReadProgress | undefined> {
  return get<ReadProgress>(bookId, progressStore)
}

export async function saveProgress(progress: ReadProgress): Promise<void> {
  await set(progress.bookId, progress, progressStore)
}

export async function deleteProgress(bookId: string): Promise<void> {
  await del(bookId, progressStore)
}
