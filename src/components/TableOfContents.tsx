/**
 * 目录侧边栏
 */
import { type Component, For, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';

interface TableOfContentsProps {
  open: boolean;
  chapters: string[];
  currentIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}

const TableOfContents: Component<TableOfContentsProps> = (props) => {
  const ITEM_HEIGHT = 56;
  const OVERSCAN = 6;

  let scrollContainerRef: HTMLDivElement | undefined;
  const [searchKeyword, setSearchKeyword] = createSignal('');
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);

  const filteredChapters = createMemo(() => {
    const keyword = searchKeyword().trim().toLowerCase();
    if (!keyword) {
      return props.chapters.map((title, index) => ({ title, index }));
    }

    return props.chapters
      .map((title, index) => ({ title, index }))
      .filter((item) => item.title.toLowerCase().includes(keyword));
  });

  const updateViewportHeight = () => {
    setViewportHeight(scrollContainerRef?.clientHeight ?? 0);
  };

  const visibleRange = createMemo(() => {
    const total = filteredChapters().length;
    if (total === 0) {
      return { start: 0, end: 0 };
    }

    const top = scrollTop();
    const height = viewportHeight();
    const rawStart = Math.floor(top / ITEM_HEIGHT) - OVERSCAN;
    const start = Math.max(0, rawStart);
    const visibleCount = Math.ceil(height / ITEM_HEIGHT) + OVERSCAN * 2;
    const end = Math.min(total, start + visibleCount);

    return { start, end };
  });

  const visibleItems = createMemo(() => {
    const { start, end } = visibleRange();
    return filteredChapters().slice(start, end);
  });

  const topSpacerHeight = createMemo(() => visibleRange().start * ITEM_HEIGHT);
  const bottomSpacerHeight = createMemo(() => {
    const { end } = visibleRange();
    return Math.max(0, (filteredChapters().length - end) * ITEM_HEIGHT);
  });

  const scrollToCurrentChapter = () => {
    const container = scrollContainerRef;
    const list = filteredChapters();
    if (!container || list.length === 0) return;

    const currentVisibleIndex = list.findIndex((item) => item.index === props.currentIndex);
    const targetIndex = currentVisibleIndex >= 0 ? currentVisibleIndex : 0;

    const maxScrollTop = Math.max(0, list.length * ITEM_HEIGHT - container.clientHeight);
    const target = targetIndex * ITEM_HEIGHT - container.clientHeight / 2 + ITEM_HEIGHT / 2;
    container.scrollTop = Math.min(maxScrollTop, Math.max(0, target));
    setScrollTop(container.scrollTop);
  };

  createEffect(() => {
    if (!props.open) {
      setSearchKeyword('');
      setScrollTop(0);
    }
  });

  createEffect(() => {
    if (!props.open) return;

    requestAnimationFrame(() => {
      updateViewportHeight();
      scrollToCurrentChapter();
    });
  });

  createEffect(() => {
    if (!props.open) return;
    props.currentIndex;
    filteredChapters();

    requestAnimationFrame(() => {
      scrollToCurrentChapter();
    });
  });

  const handleResize = () => {
    updateViewportHeight();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
  }

  onCleanup(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleResize);
    }
  });

  return (
    <mdui-navigation-drawer
      open={props.open || undefined}
      modal
      close-on-overlay-click
      close-on-esc
      placement="left"
      on:close={props.onClose}
    >
      <div class="h-full flex flex-col">
        <div
          class="p-4 border-b flex flex-col gap-3"
          style={{
            color: 'var(--mdui-color-on-surface)',
            'border-color': 'var(--mdui-color-outline-variant)',
          }}
        >
          <div class="font-medium text-lg">目录</div>
          <mdui-text-field
            variant="outlined"
            placeholder="搜索章节"
            icon="search"
            clearable
            value={searchKeyword()}
            on:input={(e: Event) => setSearchKeyword((e.target as HTMLInputElement).value)}
            on:clear={() => setSearchKeyword('')}
          />
          <div class="text-xs" style={{ color: 'var(--mdui-color-on-surface-variant)' }}>
            共 {filteredChapters().length} / {props.chapters.length} 章
          </div>
        </div>
        <div
          ref={scrollContainerRef}
          class="flex-1 min-h-0 overflow-y-auto"
          on:scroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <mdui-list>
            <div style={{ height: `${topSpacerHeight()}px` }} />
            <For each={visibleItems()}>
              {(item) => (
                <mdui-list-item
                  headline={item.title}
                  active={props.currentIndex === item.index || undefined}
                  style={{ height: `${ITEM_HEIGHT}px` }}
                  on:click={() => {
                    props.onSelect(item.index);
                    props.onClose();
                  }}
                />
              )}
            </For>
            <div style={{ height: `${bottomSpacerHeight()}px` }} />
          </mdui-list>
          <div
            class="px-4 py-8 text-center text-sm"
            style={{
              color: 'var(--mdui-color-on-surface-variant)',
              display: filteredChapters().length === 0 ? 'block' : 'none',
            }}
          >
            没有匹配的章节
          </div>
        </div>
      </div>
    </mdui-navigation-drawer>
  );
};

export default TableOfContents;
