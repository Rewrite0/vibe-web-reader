/**
 * 阅读页顶部/底部菜单浮层
 */
import { type Component, Show } from 'solid-js'

interface ReaderMenuProps {
  open: boolean
  bookTitle: string
  currentChapter: number
  totalChapters: number
  onBack: () => void
  onToggleToc: () => void
  onChapterChange: (index: number) => void
  onSettingsOpen: () => void
}

const menuBg = 'var(--reader-active-bg, var(--reader-bg-default))'
const menuText = 'var(--reader-active-text, var(--reader-text-default))'

const ReaderMenu: Component<ReaderMenuProps> = (props) => {
  return (
    <Show when={props.open}>
      {/* 顶部栏 */}
      <div
        class="fixed top-0 left-0 right-0 flex items-center gap-2 px-2"
        style={{
          'z-index': '9999',
          height: '56px',
          'background-color': menuBg,
          color: menuText,
          'box-shadow': '0 2px 6px rgba(0,0,0,0.15)',
        }}
      >
        <mdui-button-icon on:click={props.onBack}>
          <mdui-icon name="arrow_back" style={{ color: menuText }} />
        </mdui-button-icon>
        <span class="flex-1 text-sm font-medium truncate">{props.bookTitle}</span>
      </div>

      {/* 底部栏 */}
      <div
        class="fixed bottom-0 left-0 right-0 px-4 py-3"
        style={{
          'z-index': '9999',
          'background-color': menuBg,
          color: menuText,
          'box-shadow': '0 -2px 6px rgba(0,0,0,0.15)',
        }}
      >
        {/* 进度滑块 */}
        <div class="flex items-center gap-3 mb-3">
          <span class="text-xs shrink-0" style={{ opacity: '0.7' }}>
            {props.currentChapter + 1}/{props.totalChapters}
          </span>
          <mdui-slider
            value={props.currentChapter}
            min={0}
            max={Math.max(props.totalChapters - 1, 0)}
            step={1}
            class="flex-1"
            on:change={(e: CustomEvent) => {
              const val = Number((e.target as any).value)
              props.onChapterChange(val)
            }}
          />
        </div>

        {/* 操作按钮 */}
        <div class="flex justify-around">
          <mdui-button variant="text" icon="list" on:click={props.onToggleToc}>
            目录
          </mdui-button>
          <mdui-button variant="text" icon="tune" on:click={props.onSettingsOpen}>
            设置
          </mdui-button>
        </div>
      </div>
    </Show>
  )
}

export default ReaderMenu
