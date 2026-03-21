/**
 * 阅读页面
 * - 路由 /reader/:id/:chapter? 包含阅读进度
 * - 全屏沉浸式阅读
 * - 左右翻页（触摸/点击/键盘）
 * - 中心菜单浮层
 * - 自动保存进度
 */
import { type Component, createSignal, createEffect, onMount, onCleanup, Show } from 'solid-js'
import { useParams, useNavigate } from '@solidjs/router'
import { getBook, getProgress } from '~/utils/bookDB'
import { readBookFile } from '~/utils/bookStorage'
import { parseBook, type Chapter } from '~/utils/parser'
import { settings } from '~/stores/settings'
import { updateProgress } from '~/stores/reader'
import type { BookMeta } from '~/utils/bookDB'
import ReaderMenu from '~/components/ReaderMenu'
import TableOfContents from '~/components/TableOfContents'
import ReaderSettingsPanel from '~/components/ReaderSettingsPanel'

const Reader: Component = () => {
  const params = useParams<{ id: string; chapter?: string }>()
  const navigate = useNavigate()

  const [book, setBook] = createSignal<BookMeta | null>(null)
  const [chapters, setChapters] = createSignal<Chapter[]>([])
  const [loading, setLoading] = createSignal(true)
  const [ready, setReady] = createSignal(false)
  const [menuOpen, setMenuOpen] = createSignal(false)
  const [tocOpen, setTocOpen] = createSignal(false)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [loadError, setLoadError] = createSignal('')

  // 当前章节索引，从路由参数读取
  const currentChapter = () => {
    const ch = parseInt(params.chapter ?? '0', 10)
    return isNaN(ch) ? 0 : ch
  }

  // 导航到指定章节（替换 URL，不产生历史记录）
  const goToChapter = (index: number) => {
    navigate(`/reader/${params.id}/${index}`, { replace: true })
    scrollToTop()
  }

  // 加载书籍
  onMount(async () => {
    try {
      const meta = await getBook(params.id)
      if (!meta) {
        setLoadError('书籍不存在')
        return
      }
      setBook(meta)

      const fileData = await readBookFile(params.id)
      if (!fileData) {
        setLoadError('书籍文件丢失')
        return
      }

      const parsed = await parseBook(
        fileData,
        `${meta.title}.${meta.format}`,
      )
      setChapters(parsed.chapters)

      // 如果 URL 中没有章节号，从 DB 恢复进度并跳转
      if (params.chapter == null || params.chapter === '') {
        const saved = await getProgress(params.id)
        const restoreIndex = saved && saved.chapterIndex < parsed.chapters.length
          ? saved.chapterIndex
          : 0
        navigate(`/reader/${params.id}/${restoreIndex}`, { replace: true })
      }

      setReady(true)
    } catch (err) {
      setLoadError((err as Error).message)
    } finally {
      setLoading(false)
    }
  })

  // 保存进度（仅在 ready 后）
  createEffect(() => {
    if (!ready()) return
    const ch = currentChapter()
    const total = chapters().length
    if (total > 0 && book()) {
      updateProgress(params.id, ch, 0, total)
    }
  })

  // 键盘翻页
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextChapter()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      prevChapter()
    } else if (e.key === 'Escape') {
      setMenuOpen((v) => !v)
    }
  }

  onMount(() => document.addEventListener('keydown', handleKeydown))
  onCleanup(() => document.removeEventListener('keydown', handleKeydown))

  // 屏幕常亮
  let wakeLock: WakeLockSentinel | null = null
  onMount(async () => {
    if (settings().keepScreenOn && 'wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen')
      } catch { /* ignore */ }
    }
  })
  onCleanup(() => { wakeLock?.release() })

  const nextChapter = () => {
    if (currentChapter() < chapters().length - 1) {
      goToChapter(currentChapter() + 1)
    }
  }

  const prevChapter = () => {
    if (currentChapter() > 0) {
      goToChapter(currentChapter() - 1)
    }
  }

  const scrollToTop = () => {
    document.getElementById('reader-content')?.scrollTo(0, 0)
  }

  // 触摸 & 点击翻页
  let touchStartX = 0
  let touchStartY = 0

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
  }

  const handleTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX
    const dy = e.changedTouches[0].clientY - touchStartY

    if (Math.abs(dy) > Math.abs(dx)) return
    if (Math.abs(dx) < 50) return

    if (dx < 0) nextChapter()
    else prevChapter()
  }

  const handleClick = (e: MouseEvent) => {
    if (menuOpen()) {
      setMenuOpen(false)
      return
    }

    const w = window.innerWidth
    const x = e.clientX

    if (x < w / 3) {
      prevChapter()
    } else if (x > (w * 2) / 3) {
      nextChapter()
    } else {
      setMenuOpen(true)
    }
  }

  const currentHtmlContent = () => {
    const ch = chapters()[currentChapter()]
    return ch?.htmlContent
  }

  const currentContent = () => {
    const ch = chapters()[currentChapter()]
    return ch?.content ?? ''
  }

  const currentTitle = () => {
    const ch = chapters()[currentChapter()]
    return ch?.title ?? ''
  }

  return (
    <Show
      when={!loadError()}
      fallback={
        <div class="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
          <mdui-icon name="error" style={{ 'font-size': '48px', color: 'var(--mdui-color-error)' }} />
          <p style={{ color: 'var(--mdui-color-error)' }}>{loadError()}</p>
          <mdui-button on:click={() => navigate('/')}>返回书架</mdui-button>
        </div>
      }
    >
      {/* Loading */}
      <Show when={loading()}>
        <div
          class="flex flex-col items-center justify-center min-h-screen gap-4"
          style={{ background: 'var(--mdui-color-surface)' }}
        >
          <mdui-circular-progress />
          <p
            class="text-sm"
            style={{ color: 'var(--mdui-color-on-surface-variant)' }}
          >
            正在加载《{book()?.title ?? ''}》...
          </p>
        </div>
      </Show>

      {/* 阅读内容 */}
      <Show when={!loading()}>
        <div
          id="reader-content"
          class="min-h-screen overflow-y-auto select-text"
          style={{
            background: 'var(--reader-active-bg, var(--reader-bg-default))',
            color: 'var(--reader-active-text, var(--reader-text-default))',
          }}
          on:click={handleClick}
          on:touchstart={handleTouchStart}
          on:touchend={handleTouchEnd}
        >
          <div
            class="mx-auto"
            style={{
              'max-width': 'var(--reader-content-max-width)',
              padding: 'var(--reader-padding-block) var(--reader-padding-inline)',
              'font-size': `${settings().fontSize}px`,
              'line-height': String(settings().lineHeight),
              'font-family': 'var(--reader-font-family)',
            }}
          >
            <h2
              class="font-bold mb-6 text-center"
              style={{ 'font-size': `${settings().fontSize + 4}px` }}
            >
              {currentTitle()}
            </h2>

            <Show
              when={currentHtmlContent()}
              fallback={
                <div class="break-words">
                  {currentContent().split('\n').map((line) =>
                    line.trim() ? <p style={{ 'text-indent': '2em', 'margin-bottom': 'var(--reader-paragraph-spacing)' }}>{line.trim()}</p> : null
                  )}
                </div>
              }
            >
              <div
                class="reader-html-content break-words"
                innerHTML={currentHtmlContent()}
              />
            </Show>

            <div
              class="text-center py-8 text-sm"
              style={{ color: 'var(--mdui-color-on-surface-variant)', opacity: '0.6' }}
            >
              {currentChapter() < chapters().length - 1
                ? '左滑或点击右侧翻到下一章'
                : '已经是最后一章了'}
            </div>
          </div>
        </div>

        <ReaderMenu
          open={menuOpen()}
          bookTitle={book()?.title ?? ''}
          currentChapter={currentChapter()}
          totalChapters={chapters().length}
          onBack={() => navigate('/')}
          onToggleToc={() => {
            setMenuOpen(false)
            setTocOpen(true)
          }}
          onChapterChange={goToChapter}
          onSettingsOpen={() => {
            setMenuOpen(false)
            setSettingsOpen(true)
          }}
        />

        <TableOfContents
          open={tocOpen()}
          chapters={book()?.chapters ?? []}
          currentIndex={currentChapter()}
          onClose={() => setTocOpen(false)}
          onSelect={goToChapter}
        />

        <ReaderSettingsPanel
          open={settingsOpen()}
          onClose={() => setSettingsOpen(false)}
        />
      </Show>
    </Show>
  )
}

export default Reader
