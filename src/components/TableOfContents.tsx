/**
 * 目录侧边栏
 */
import { type Component, For } from 'solid-js'

interface TableOfContentsProps {
  open: boolean
  chapters: string[]
  currentIndex: number
  onClose: () => void
  onSelect: (index: number) => void
}

const TableOfContents: Component<TableOfContentsProps> = (props) => {
  return (
    <mdui-navigation-drawer
      open={props.open || undefined}
      modal
      close-on-overlay-click
      close-on-esc
      placement="left"
      on:close={props.onClose}
    >
      <div
        class="p-4 font-medium text-lg border-b"
        style={{
          color: 'var(--mdui-color-on-surface)',
          'border-color': 'var(--mdui-color-outline-variant)',
        }}
      >
        目录
      </div>
      <mdui-list>
        <For each={props.chapters}>
          {(title, index) => (
            <mdui-list-item
              headline={title}
              active={props.currentIndex === index() || undefined}
              on:click={() => {
                props.onSelect(index())
                props.onClose()
              }}
            />
          )}
        </For>
      </mdui-list>
    </mdui-navigation-drawer>
  )
}

export default TableOfContents
