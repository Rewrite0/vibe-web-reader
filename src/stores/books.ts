/**
 * 书籍状态管理
 */
import { createSignal } from 'solid-js';
import type { BookMeta } from '~/utils/bookDB';
import { getAllBooks, getBook, saveBook, deleteBook as dbDeleteBook } from '~/utils/bookDB';
import { deleteBookFile } from '~/utils/bookStorage';
import { deleteProgress } from '~/utils/bookDB';

const [books, setBooks] = createSignal<BookMeta[]>([]);
const [loading, setLoading] = createSignal(false);

/** 从 IndexedDB 加载所有书籍 */
export async function loadBooks(): Promise<void> {
  setLoading(true);
  try {
    const all = await getAllBooks();
    // 按最后阅读时间降序，未阅读的按导入时间降序
    all.sort((a, b) => (b.lastReadAt ?? b.addedAt) - (a.lastReadAt ?? a.addedAt));
    setBooks(all);
  } finally {
    setLoading(false);
  }
}

/** 添加书籍 */
export async function addBook(meta: BookMeta): Promise<void> {
  await saveBook(meta);
  await loadBooks();
}

/** 删除书籍（元数据 + 文件 + 进度） */
export async function removeBook(id: string): Promise<void> {
  await Promise.all([dbDeleteBook(id), deleteBookFile(id), deleteProgress(id)]);
  await loadBooks();
}

/** 更新书籍元数据 */
export async function updateBook(id: string, partial: Partial<BookMeta>): Promise<void> {
  const current = await getBook(id);
  if (!current) return;
  await saveBook({ ...current, ...partial });
  await loadBooks();
}

export { books, loading };
