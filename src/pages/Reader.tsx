/**
 * 阅读页面
 * - 路由 /reader/:id/:chapter? 包含阅读进度
 * - 全屏沉浸式阅读
 * - 左右翻页（触摸/点击/键盘）
 * - 中心菜单浮层
 * - 自动保存进度
 */
import {
  type Component,
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  Show,
} from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { getBook, getProgress, saveBook } from '~/utils/bookDB';
import { readBookFile, saveBookFile } from '~/utils/bookStorage';
import { parseBook, type Chapter } from '~/utils/parser';
import { settings } from '~/stores/settings';
import { updateProgress } from '~/stores/reader';
import { updateBook } from '~/stores/books';
import { getSyncWorker } from '~/stores/sync';
import { doConfigSync } from '~/services/syncService';
import type { BookMeta } from '~/utils/bookDB';
import { showSnackbar } from '~/utils/snackbar';
import ReaderMenu from '~/components/ReaderMenu';
import TableOfContents from '~/components/TableOfContents';
import ReaderSettingsPanel from '~/components/ReaderSettingsPanel';
import { SyncStatusIcon } from '~/components/Layout';

const Reader: Component = () => {
  const params = useParams<{ id: string; chapter?: string }>();
  const navigate = useNavigate();

  const [book, setBook] = createSignal<BookMeta | null>(null);
  const [chapters, setChapters] = createSignal<Chapter[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [ready, setReady] = createSignal(false);
  const [skipNextSave, setSkipNextSave] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [tocOpen, setTocOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [loadError, setLoadError] = createSignal('');
  const [downloadingFromCloud, setDownloadingFromCloud] = createSignal(false);

  // 当前章节索引，从路由参数读取
  const currentChapter = () => {
    const ch = parseInt(params.chapter ?? '0', 10);
    return isNaN(ch) ? 0 : ch;
  };

  const chapterTitles = createMemo(() => chapters().map((chapter) => chapter.title));
  const bookmarks = createMemo(() => book()?.bookmarks ?? []);
  const bookmarkSet = createMemo(() => new Set(bookmarks()));
  const isCurrentBookmarked = createMemo(() => bookmarkSet().has(currentChapter()));

  // 导航到指定章节（替换 URL，不产生历史记录）
  const goToChapter = (index: number) => {
    navigate(`/reader/${params.id}/${index}`, { replace: true });
    scrollToTop();
  };

  // 加载书籍
  onMount(async () => {
    try {
      const meta = await getBook(params.id);
      if (!meta) {
        setLoadError('书籍不存在');
        return;
      }
      setBook(meta);

      const fileData = await readBookFile(params.id);
      let bookData = fileData;

      // 本地文件不存在，尝试从 WebDAV 下载
      if (!bookData && (meta.syncStatus === 'remote' || meta.syncStatus === 'synced')) {
        const worker = getSyncWorker();
        const s = settings();
        if (worker && s.webdavUrl) {
          setDownloadingFromCloud(true);
          try {
            const downloaded = await worker.downloadBook(
              s.webdavUrl,
              s.webdavUser,
              s.webdavPassword,
              s.webdavDir || 'web-reader',
              meta.id,
              meta.format,
              meta.title,
            );
            if (downloaded) {
              await saveBookFile(meta.id, downloaded);
              await updateBook(meta.id, { syncStatus: 'synced' });
              // 写入 OPFS 后 ArrayBuffer 可能被 detached，需重新读取
              bookData = await readBookFile(meta.id);
            }
          } finally {
            setDownloadingFromCloud(false);
          }
        }
      }

      if (!bookData) {
        setLoadError('书籍文件丢失');
        return;
      }

      const parsed = await parseBook(bookData, `${meta.title}.${meta.format}`);
      setChapters(parsed.chapters);

      // 阅读时校正历史元数据中的章节数，确保旧规则导入的书籍能自动升级。
      if (meta.chapterCount !== parsed.chapters.length) {
        const latestMeta = (await getBook(params.id)) ?? meta;
        const normalizedMeta: BookMeta = {
          ...latestMeta,
          chapterCount: parsed.chapters.length,
        };
        await saveBook(normalizedMeta);
        setBook(normalizedMeta);
      }

      // 如果 URL 中没有章节号，从 DB 恢复进度并跳转
      if (params.chapter == null || params.chapter === '') {
        const saved = await getProgress(params.id);
        const restoreIndex =
          saved && saved.chapterIndex < parsed.chapters.length ? saved.chapterIndex : 0;
        // 先设置 loading=false 和 ready，再 navigate，避免进度被覆盖
        setLoading(false);
        setSkipNextSave(true);
        setReady(true);
        navigate(`/reader/${params.id}/${restoreIndex}`, { replace: true });
        return;
      }

      setReady(true);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  });

  // 保存进度（仅在 ready 后）
  createEffect(() => {
    if (!ready()) return;
    const ch = currentChapter();
    const total = chapters().length;
    if (skipNextSave()) {
      setSkipNextSave(false);
      return;
    }
    if (total > 0 && book()) {
      updateProgress(params.id, ch, 0, total);
    }
  });

  // 键盘翻页
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextChapter();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      prevChapter();
    } else if (e.key === 'Escape') {
      setMenuOpen((v) => !v);
    }
  };

  onMount(() => document.addEventListener('keydown', handleKeydown));
  onCleanup(() => document.removeEventListener('keydown', handleKeydown));

  // 屏幕常亮
  let wakeLock: WakeLockSentinel | null = null;
  onMount(async () => {
    if (settings().keepScreenOn && 'wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        /* ignore */
      }
    }
  });
  onCleanup(() => {
    wakeLock?.release();
  });

  const nextChapter = () => {
    if (currentChapter() < chapters().length - 1) {
      goToChapter(currentChapter() + 1);
    }
  };

  const prevChapter = () => {
    if (currentChapter() > 0) {
      goToChapter(currentChapter() - 1);
    }
  };

  const scrollToTop = () => {
    document.getElementById('reader-content')?.scrollTo(0, 0);
  };

  // 触摸 & 点击翻页
  let touchStartX = 0;
  let touchStartY = 0;

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 50) return;

    if (dx < 0) nextChapter();
    else prevChapter();
  };

  const handleClick = (e: MouseEvent) => {
    if (menuOpen()) {
      setMenuOpen(false);
      return;
    }

    const w = window.innerWidth;
    const x = e.clientX;

    if (x < w / 3) {
      prevChapter();
    } else if (x > (w * 2) / 3) {
      nextChapter();
    } else {
      setMenuOpen(true);
    }
  };

  const currentHtmlContent = () => {
    const ch = chapters()[currentChapter()];
    return ch?.htmlContent;
  };

  const currentContent = () => {
    const ch = chapters()[currentChapter()];
    return ch?.content ?? '';
  };

  const currentTitle = () => {
    const ch = chapters()[currentChapter()];
    return ch?.title ?? '';
  };

  const toggleCurrentBookmark = async () => {
    const currentBook = book();
    if (!currentBook) return;

    const chapterIndex = currentChapter();
    const now = Date.now();
    const currentBookmarks = currentBook.bookmarks ?? [];
    const hasBookmark = currentBookmarks.includes(chapterIndex);

    const nextBookmarks = hasBookmark
      ? currentBookmarks.filter((index) => index !== chapterIndex)
      : [...currentBookmarks, chapterIndex].sort((a, b) => a - b);

    const nextMeta: BookMeta = {
      ...currentBook,
      bookmarks: nextBookmarks,
      bookmarksUpdatedAt: now,
    };

    await saveBook(nextMeta);
    setBook(nextMeta);

    // 书签属于元信息变更，尽快同步可避免重启后被远程旧数据覆盖。
    void doConfigSync().catch(() => {
      /* ignore sync failure in reader interaction */
    });

    showSnackbar({
      message: hasBookmark
        ? `已移除书签：第 ${chapterIndex + 1} 章`
        : `已添加书签：第 ${chapterIndex + 1} 章`,
      placement: 'bottom',
    });
  };

  return (
    <Show
      when={!loadError()}
      fallback={
        <div class="flex flex-col items-center justify-center min-h-screen gap-4 p-4">
          <mdui-icon
            name="error"
            style={{ 'font-size': '48px', color: 'var(--mdui-color-error)' }}
          />
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
          <p class="text-sm" style={{ color: 'var(--mdui-color-on-surface-variant)' }}>
            {downloadingFromCloud()
              ? '正在从 WebDAV 下载书籍...'
              : `正在加载《${book()?.title ?? ''}》...`}
          </p>
        </div>
      </Show>

      {/* 阅读内容 */}
      <Show when={!loading()}>
        {/* 同步状态图标 - 右上角，不影响正文 */}
        <div class="fixed z-10" style={{ top: '8px', right: '8px', opacity: '0.5' }}>
          <SyncStatusIcon size="16px" />
        </div>
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
              '--reader-paragraph-spacing': `${settings().paragraphSpacing}em`,
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
                  {currentContent()
                    .split('\n')
                    .map((line) =>
                      line.trim() ? (
                        <p
                          style={{
                            'text-indent': '2em',
                            'margin-bottom': 'var(--reader-paragraph-spacing)',
                          }}
                        >
                          {line.trim()}
                        </p>
                      ) : null,
                    )}
                </div>
              }
            >
              <div class="reader-html-content break-words" innerHTML={currentHtmlContent()} />
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
          isCurrentBookmarked={isCurrentBookmarked()}
          onBack={() => navigate('/')}
          onToggleToc={() => {
            setMenuOpen(false);
            setTocOpen(true);
          }}
          onChapterChange={goToChapter}
          onToggleBookmark={toggleCurrentBookmark}
          onSettingsOpen={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        />

        <Show when={tocOpen()}>
          <TableOfContents
            open={tocOpen()}
            chapters={chapterTitles()}
            bookmarks={bookmarks()}
            currentIndex={currentChapter()}
            onClose={() => setTocOpen(false)}
            onSelect={goToChapter}
          />
        </Show>

        <ReaderSettingsPanel open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      </Show>
    </Show>
  );
};

export default Reader;
