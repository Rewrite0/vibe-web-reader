/**
 * 阅读状态管理
 */
import { createSignal } from 'solid-js'
import type { ReadProgress } from '~/utils/bookDB'
import { getProgress, saveProgress } from '~/utils/bookDB'
import { updateBook } from '~/stores/books'

const [currentProgress, setCurrentProgress] = createSignal<ReadProgress | null>(null)

/** 加载某本书的阅读进度 */
export async function loadProgress(bookId: string): Promise<ReadProgress | null> {
  const p = await getProgress(bookId)
  const progress = p ?? {
    bookId,
    chapterIndex: 0,
    scrollPercent: 0,
    overallPercent: 0,
    updatedAt: Date.now(),
  }
  setCurrentProgress(progress)
  return progress
}

/** 更新阅读进度 */
export async function updateProgress(
  bookId: string,
  chapterIndex: number,
  scrollPercent: number,
  totalChapters: number,
): Promise<void> {
  const overallPercent = totalChapters > 0
    ? Math.round(((chapterIndex + scrollPercent / 100) / totalChapters) * 100)
    : 0

  const progress: ReadProgress = {
    bookId,
    chapterIndex,
    scrollPercent,
    overallPercent: Math.min(overallPercent, 100),
    updatedAt: Date.now(),
  }

  setCurrentProgress(progress)
  await saveProgress(progress)

  // 更新书籍的最后阅读时间
  await updateBook(bookId, {
    lastReadAt: Date.now(),
    finished: overallPercent >= 100,
  })
}

export { currentProgress }
