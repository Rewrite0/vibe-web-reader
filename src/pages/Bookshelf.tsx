/**
 * 书架页面
 */
import { type Component, createSignal, createMemo, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { books, loading, removeBook, updateBook } from '~/stores/books'
import { addBook } from '~/stores/books'
import { saveBookFile, deleteBookFile } from '~/utils/bookStorage'
import { parseBook, generateBookId } from '~/utils/parser'
import { getProgress, getAllBooks, saveBook } from '~/utils/bookDB'
import type { BookMeta } from '~/utils/bookDB'
import { settings } from '~/stores/settings'
import { getSyncWorker } from '~/stores/sync'
import { isWebDAVConfigured } from '~/services/syncService'
import { SyncStatusIcon } from '~/components/Layout'
import SearchBar from '~/components/SearchBar'
import CategoryFilterChips, { type FilterValue } from '~/components/CategoryFilter'
import BookCard from '~/components/BookCard'
import { snackbar } from 'mdui'
import { loadBooks } from '~/stores/books'

const Bookshelf: Component = () => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = createSignal('')
  const [filter, setFilter] = createSignal<FilterValue>('all')
  const [progressMap, setProgressMap] = createSignal<Record<string, number>>({})
  const [importing, setImporting] = createSignal(false)

  // 上下文菜单状态
  const [menuOpen, setMenuOpen] = createSignal(false)
  const [menuPosition, setMenuPosition] = createSignal({ x: 0, y: 0 })
  const [selectedBook, setSelectedBook] = createSignal<BookMeta | null>(null)

  // 加载所有书籍的已读章节索引
  const loadAllProgress = async () => {
    const map: Record<string, number> = {}
    for (const book of books()) {
      const p = await getProgress(book.id)
      if (p) map[book.id] = p.chapterIndex
    }
    setProgressMap(map)
  }

  createMemo(() => {
    if (books().length > 0) loadAllProgress()
  })

  // 筛选逻辑
  const filteredBooks = createMemo(() => {
    let list = [...books()]

    // 搜索
    const q = searchQuery().toLowerCase()
    if (q) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q),
      )
    }

    // 分类
    const f = filter()
    if (f === 'recent') {
      list = list
        .filter((b) => b.lastReadAt)
        .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))
    } else if (f.startsWith('tag:')) {
      const tagName = f.slice(4)
      list = list.filter((b) => b.tags?.includes(tagName))
    }

    return list
  })

  // 导入书籍
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.epub'
    input.multiple = true
    input.onchange = async () => {
      if (!input.files?.length) return
      setImporting(true)
      try {
        for (const file of Array.from(input.files)) {
          const data = await file.arrayBuffer()
          const parsed = await parseBook(data, file.name)
          const id = generateBookId()
          const meta: BookMeta = {
            id,
            title: parsed.title,
            author: parsed.author,
            format: file.name.endsWith('.epub') ? 'epub' : 'txt',
            fileSize: data.byteLength,
            cover: parsed.cover,
            chapterCount: parsed.chapters.length,
            chapters: parsed.chapters.map((c) => c.title),
            addedAt: Date.now(),
            syncStatus: 'local',
          }
          await saveBookFile(id, data)
          await addBook(meta)
        }
        snackbar({ message: `成功导入 ${input.files.length} 本书`, placement: 'bottom' })
      } catch (err) {
        snackbar({ message: `导入失败: ${(err as Error).message}`, placement: 'bottom' })
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }

  // 右键菜单
  const handleContextMenu = (book: BookMeta, e: MouseEvent) => {
    setSelectedBook(book)
    setMenuPosition({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }

  // 删除本地副本
  const handleDeleteLocal = async () => {
    const book = selectedBook()
    if (!book) return
    setMenuOpen(false)
    await deleteBookFile(book.id)
    if (book.syncStatus === 'synced') {
      await updateBook(book.id, { syncStatus: 'remote' })
      snackbar({ message: `已删除《${book.title}》本地副本`, placement: 'bottom' })
    } else {
      // local-only: 完全删除
      await removeBook(book.id)
      snackbar({ message: `已删除《${book.title}》`, placement: 'bottom' })
    }
  }

  // 删除远程副本
  const handleDeleteRemote = async () => {
    const book = selectedBook()
    if (!book) return
    setMenuOpen(false)

    const worker = getSyncWorker()
    if (worker && isWebDAVConfigured()) {
      const s = settings()
      const ok = await worker.deleteRemoteBook(
        s.webdavUrl, s.webdavUser, s.webdavPassword,
        s.webdavDir || 'web-reader',
        book.id, book.format, book.title,
      )
      if (ok) {
        if (book.syncStatus === 'synced') {
          await updateBook(book.id, { syncStatus: 'local' })
        } else if (book.syncStatus === 'remote') {
          await removeBook(book.id)
        }
        snackbar({ message: `已删除《${book.title}》远程副本`, placement: 'bottom' })
      } else {
        snackbar({ message: '删除远程副本失败', placement: 'bottom' })
      }
    }
  }

  // 完全删除
  const handleDeleteAll = async () => {
    const book = selectedBook()
    if (!book) return
    setMenuOpen(false)

    // 删除远程
    const worker = getSyncWorker()
    if (worker && isWebDAVConfigured() && (book.syncStatus === 'synced' || book.syncStatus === 'remote')) {
      const s = settings()
      await worker.deleteRemoteBook(
        s.webdavUrl, s.webdavUser, s.webdavPassword,
        s.webdavDir || 'web-reader',
        book.id, book.format, book.title,
      )
    }

    // 删除本地
    await removeBook(book.id)
    snackbar({ message: `已完全删除《${book.title}》`, placement: 'bottom' })
  }

  // 切换标签（多选）
  const handleToggleTag = async (tagName: string) => {
    const book = selectedBook()
    if (!book) return
    const current = book.tags ?? []
    const next = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName]
    await updateBook(book.id, { tags: next })
    // 更新本地选中书籍的引用以刷新菜单 UI
    setSelectedBook({ ...book, tags: next })
  }

  // 标签重命名 → 批量更新所有书籍中的旧标签
  const handleTagRenamed = async (oldName: string, newName: string) => {
    const all = await getAllBooks()
    for (const book of all) {
      if (book.tags?.includes(oldName)) {
        book.tags = book.tags.map((t) => (t === oldName ? newName : t))
        await saveBook(book)
      }
    }
    await loadBooks()
  }

  // 标签删除 → 批量清理所有书籍中的该标签
  const handleTagDeleted = async (name: string) => {
    const all = await getAllBooks()
    for (const book of all) {
      if (book.tags?.includes(name)) {
        book.tags = book.tags.filter((t) => t !== name)
        await saveBook(book)
      }
    }
    await loadBooks()
  }

  const clampedMenuStyle = () => {
    const pos = menuPosition()
    return {
      left: `${Math.min(pos.x, window.innerWidth - 200)}px`,
      top: `${Math.min(pos.y, window.innerHeight - 300)}px`,
    }
  }

  const bookSyncStatus = () => selectedBook()?.syncStatus ?? 'local'

  return (
    <div class="p-4 max-w-6xl mx-auto">
      <div class="flex items-center gap-2">
        <div class="flex-1">
          <SearchBar value={searchQuery()} onInput={setSearchQuery} />
        </div>
        <SyncStatusIcon />
      </div>

      <CategoryFilterChips
        value={filter()}
        onChange={setFilter}
        onTagRenamed={handleTagRenamed}
        onTagDeleted={handleTagDeleted}
      />

      <Show when={!loading() && !importing()} fallback={
        <div class="flex flex-col items-center justify-center py-16 gap-4">
          <mdui-circular-progress />
          <Show when={importing()}>
            <p
              class="text-sm"
              style={{ color: 'var(--mdui-color-on-surface-variant)' }}
            >
              正在导入书籍...
            </p>
          </Show>
        </div>
      }>
        <Show
          when={filteredBooks().length > 0}
          fallback={
            <div
              class="flex flex-col items-center justify-center py-16 gap-4"
              style={{ color: 'var(--mdui-color-on-surface-variant)' }}
            >
              <mdui-icon name="menu_book" style={{ 'font-size': '64px' }} />
              <p class="text-lg">
                {books().length === 0 ? '书架空空如也，点击右下角导入书籍' : '没有找到匹配的书籍'}
              </p>
            </div>
          }
        >
          <div
            class="grid gap-3 mt-2"
            style={{
              'grid-template-columns': 'repeat(auto-fill, minmax(var(--reader-card-min-width), 1fr))',
            }}
          >
            <For each={filteredBooks()}>
              {(book) => (
                <BookCard
                  book={book}
                  readChapterIndex={progressMap()[book.id]}
                  onClick={() => navigate(`/reader/${book.id}`)}
                  onContextMenu={(e) => handleContextMenu(book, e)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* 导入 FAB */}
      <mdui-fab
        icon={importing() ? '' : 'add'}
        style={{ position: 'fixed', right: '24px', bottom: '96px' }}
        on:click={handleImport}
      >
        <Show when={importing()}>
          <mdui-circular-progress />
        </Show>
      </mdui-fab>

      {/* 右键操作菜单 */}
      <Show when={menuOpen()}>
        <div class="fixed inset-0 z-50" on:click={() => setMenuOpen(false)}>
          <mdui-card
            variant="elevated"
            class="fixed z-50 py-2"
            style={{
              ...clampedMenuStyle(),
              'min-width': '200px',
              'max-height': '70vh',
              'overflow-y': 'auto',
              'box-shadow': 'var(--mdui-elevation-level2)',
            }}
            on:click={(e: MouseEvent) => e.stopPropagation()}
          >
            <mdui-list>
              {/* 书籍信息 */}
              <mdui-list-item
                icon="info"
                headline={`${selectedBook()?.chapterCount ?? 0} 章 · ${formatSize(selectedBook()?.fileSize ?? 0)}`}
                description={syncStatusText(bookSyncStatus())}
                nonclickable
              />

              {/* 当前标签 */}
              <Show when={(selectedBook()?.tags?.length ?? 0) > 0}>
                <mdui-list-item
                  icon="label"
                  headline={selectedBook()!.tags!.join(', ')}
                  nonclickable
                />
              </Show>

              <mdui-divider />

              {/* 标签多选 */}
              <Show when={settings().tags.length > 0}>
                <mdui-list-subheader>标签</mdui-list-subheader>
                <For each={settings().tags}>
                  {(tagName) => {
                    const isChecked = () => selectedBook()?.tags?.includes(tagName) ?? false
                    return (
                      <mdui-list-item
                        icon={isChecked() ? 'check_box' : 'check_box_outline_blank'}
                        headline={tagName}
                        on:click={() => handleToggleTag(tagName)}
                      />
                    )
                  }}
                </For>
                <mdui-divider />
              </Show>

              {/* 删除选项 */}
              <Show when={bookSyncStatus() === 'synced' || bookSyncStatus() === 'local'}>
                <mdui-list-item
                  icon="delete_outline"
                  headline={bookSyncStatus() === 'synced' ? '仅删除本地' : '删除书籍'}
                  on:click={handleDeleteLocal}
                  style={{ color: 'var(--mdui-color-error)' }}
                />
              </Show>

              <Show when={isWebDAVConfigured() && (bookSyncStatus() === 'synced' || bookSyncStatus() === 'remote')}>
                <mdui-list-item
                  icon="cloud_off"
                  headline={bookSyncStatus() === 'synced' ? '仅删除远程' : '删除书籍'}
                  on:click={handleDeleteRemote}
                  style={{ color: 'var(--mdui-color-error)' }}
                />
              </Show>

              <Show when={bookSyncStatus() === 'synced'}>
                <mdui-list-item
                  icon="delete_forever"
                  headline="完全删除"
                  on:click={handleDeleteAll}
                  style={{ color: 'var(--mdui-color-error)' }}
                />
              </Show>
            </mdui-list>
          </mdui-card>
        </div>
      </Show>
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function syncStatusText(status: string): string {
  switch (status) {
    case 'synced': return '已同步'
    case 'remote': return '仅远程'
    case 'local': return '仅本地'
    default: return '仅本地'
  }
}

export default Bookshelf
