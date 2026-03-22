/**
 * 书籍卡片组件
 */
import type { Component } from 'solid-js'
import { Show } from 'solid-js'
import type { BookMeta } from '~/utils/bookDB'

interface BookCardProps {
  book: BookMeta
  /** 已读到的章节索引（0-based） */
  readChapterIndex?: number
  onClick: () => void
  onContextMenu: (e: MouseEvent) => void
}

/** 同步状态角标 */
function SyncBadge(props: { syncStatus?: string }) {
  const icon = () => {
    switch (props.syncStatus) {
      case 'remote': return 'cloud_download'
      case 'synced': return 'cloud_done'
      case 'local': return 'cloud_upload'
      default: return 'cloud_upload'
    }
  }

  const color = () => {
    switch (props.syncStatus) {
      case 'remote': return 'var(--mdui-color-primary)'
      case 'synced': return 'var(--mdui-color-on-surface-variant)'
      default: return 'var(--mdui-color-outline)'
    }
  }

  return (
    <div
      class="absolute top-1 right-1 rounded-full flex items-center justify-center"
      style={{
        width: '24px',
        height: '24px',
        background: 'var(--mdui-color-surface)',
        opacity: '0.9',
      }}
    >
      <mdui-icon
        name={icon()}
        style={{ 'font-size': '16px', color: color() }}
      />
    </div>
  )
}

const BookCard: Component<BookCardProps> = (props) => {
  const isTxt = () => props.book.format === 'txt'
  const hasEpubCover = () => !isTxt() && !!props.book.cover
  const readChapters = () => props.readChapterIndex != null ? props.readChapterIndex + 1 : 0
  const totalChapters = () => props.book.chapterCount

  return (
    <mdui-card
      variant="outlined"
      clickable
      on:click={props.onClick}
      on:contextmenu={(e: MouseEvent) => {
        e.preventDefault()
        props.onContextMenu(e)
      }}
      class="overflow-hidden cursor-pointer"
      style={{ 'border-radius': '0' }}
    >
      {/* 封面区域 - 3:4 比例 */}
      <div
        class="w-full relative overflow-hidden"
        style={{
          'aspect-ratio': '3 / 4',
          background: 'var(--mdui-color-surface-variant)',
        }}
      >
        <Show
          when={hasEpubCover()}
          fallback={
            /* TXT 或无封面：图标 + 格式大字 */
            <div class="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <mdui-icon
                name="description"
                style={{
                  'font-size': '40px',
                  color: 'var(--mdui-color-on-surface-variant)',
                  opacity: '0.6',
                }}
              />
              <span
                class="font-bold tracking-wider"
                style={{
                  'font-size': '20px',
                  color: 'var(--mdui-color-on-surface-variant)',
                  opacity: '0.5',
                }}
              >
                {props.book.format.toUpperCase()}
              </span>
            </div>
          }
        >
          <img
            src={props.book.cover}
            alt={props.book.title}
            class="absolute inset-0 w-full h-full object-cover"
          />
        </Show>

        {/* 同步状态角标 */}
        <SyncBadge syncStatus={props.book.syncStatus} />
      </div>

      {/* 信息区域 - 固定高度保证网格对齐 */}
      <div class="p-3 flex flex-col">
        {/* 书名 - 固定两行高度 */}
        <div
          class="font-medium text-sm line-clamp-2"
          style={{
            color: 'var(--mdui-color-on-surface)',
            'line-height': '1.4',
            height: 'calc(2 * 1.4 * 0.875rem)',
          }}
        >
          {props.book.title}
        </div>

        {/* 章节进度 */}
        <div
          class="text-xs mt-1"
          style={{ color: 'var(--mdui-color-on-surface-variant)' }}
        >
          <Show
            when={readChapters() > 0}
            fallback={`共 ${totalChapters()} 章`}
          >
            {readChapters()}/{totalChapters()} 章
          </Show>
        </div>

        {/* 进度条 - 固定高度占位 */}
        <div class="mt-2" style={{ height: '4px' }}>
          <Show when={readChapters() > 0}>
            <mdui-linear-progress
              value={readChapters()}
              max={totalChapters()}
            />
          </Show>
        </div>
      </div>
    </mdui-card>
  )
}

export default BookCard
