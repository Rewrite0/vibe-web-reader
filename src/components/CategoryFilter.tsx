/**
 * 标签筛选组件
 *
 * 固定分类：全部
 * 动态标签：用户自行创建、重命名、删除
 */
import { type Component, For, Show, createSignal } from 'solid-js'
import { settings, updateSettings } from '~/stores/settings'
import { prompt as mduiPrompt, confirm as mduiConfirm, snackbar } from 'mdui'

/** 筛选值：固定分类用字面量，自定义标签用 `tag:名称` 前缀 */
export type FilterValue = 'all' | string

interface CategoryFilterProps {
  value: FilterValue
  onChange: (value: FilterValue) => void
  /** 标签重命名时同步更新书籍数据 */
  onTagRenamed?: (oldName: string, newName: string) => void
  /** 标签删除时同步清理书籍数据 */
  onTagDeleted?: (name: string) => void
}

const CategoryFilterChips: Component<CategoryFilterProps> = (props) => {
  const [managing, setManaging] = createSignal(false)

  const handleAddTag = async () => {
    const result = await mduiPrompt({
      headline: '新建标签',
      description: '请输入标签名称',
      confirmText: '确定',
      cancelText: '取消',
    })
    const name = result?.trim()
    if (!name) return
    if (settings().tags.includes(name)) {
      snackbar({ message: '该标签已存在', placement: 'bottom' })
      return
    }
    await updateSettings({ tags: [...settings().tags, name] })
  }

  const handleRenameTag = async (oldName: string) => {
    const result = await mduiPrompt({
      headline: '重命名标签',
      description: `当前名称：${oldName}`,
      confirmText: '确定',
      cancelText: '取消',
    })
    const newName = result?.trim()
    if (!newName || newName === oldName) return
    if (settings().tags.includes(newName)) {
      snackbar({ message: '该标签名已存在', placement: 'bottom' })
      return
    }
    const next = settings().tags.map((t) => (t === oldName ? newName : t))
    await updateSettings({ tags: next })
    props.onTagRenamed?.(oldName, newName)
    // 如果当前选中的就是被改名的标签，跟随更新
    if (props.value === `tag:${oldName}`) {
      props.onChange(`tag:${newName}`)
    }
  }

  const handleDeleteTag = async (name: string) => {
    try {
      await mduiConfirm({
        headline: '删除标签',
        description: `确定删除标签「${name}」吗？书籍不会被删除，仅移除该标签。`,
        confirmText: '删除',
        cancelText: '取消',
      })
    } catch {
      return // 用户取消
    }
    const next = settings().tags.filter((t) => t !== name)
    await updateSettings({ tags: next })
    props.onTagDeleted?.(name)
    if (props.value === `tag:${name}`) {
      props.onChange('all')
    }
  }

  return (
    <div class="flex items-center gap-2 overflow-x-auto py-2" style={{ 'scrollbar-width': 'none' }}>
      {/* 固定：全部 */}
      <mdui-chip
        variant="filter"
        selected={props.value === 'all' || undefined}
        elevated={props.value === 'all' || undefined}
        on:click={() => props.onChange('all')}
      >
        全部
      </mdui-chip>

      {/* 动态标签 */}
      <For each={settings().tags}>
        {(name) => (
          <mdui-chip
            variant="filter"
            selected={props.value === `tag:${name}` || undefined}
            elevated={props.value === `tag:${name}` || undefined}
            on:click={() => {
              if (!managing()) props.onChange(`tag:${name}`)
            }}
          >
            {name}
            <Show when={managing()}>
              <span slot="end-icon" class="flex items-center gap-0.5">
                <mdui-icon
                  name="edit"
                  style={{ 'font-size': '16px', cursor: 'pointer' }}
                  on:click={(e: MouseEvent) => {
                    e.stopPropagation()
                    handleRenameTag(name)
                  }}
                />
                <mdui-icon
                  name="close"
                  style={{ 'font-size': '16px', cursor: 'pointer' }}
                  on:click={(e: MouseEvent) => {
                    e.stopPropagation()
                    handleDeleteTag(name)
                  }}
                />
              </span>
            </Show>
          </mdui-chip>
        )}
      </For>

      {/* 添加标签 */}
      <mdui-button-icon on:click={handleAddTag}>
        <mdui-icon name="add" />
      </mdui-button-icon>

      {/* 管理按钮 */}
      <Show when={settings().tags.length > 0}>
        <mdui-button-icon on:click={() => setManaging((v) => !v)}>
          <mdui-icon name={managing() ? 'check' : 'edit'} />
        </mdui-button-icon>
      </Show>
    </div>
  )
}

export default CategoryFilterChips
