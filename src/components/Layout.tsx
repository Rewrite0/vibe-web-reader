/**
 * 全局布局：底部导航栏 + 内容区域
 * 移动端使用 navigation-bar，桌面端使用 navigation-rail
 */
import { type Component, createSignal, onMount, onCleanup, Show } from 'solid-js'
import { useNavigate, useMatch } from '@solidjs/router'
import type { ParentProps } from 'solid-js'
import { syncStatus, syncMessage } from '~/stores/sync'
import { doManualSync, isWebDAVConfigured } from '~/services/syncService'

const DESKTOP_BREAKPOINT = 840

/** 同步状态图标映射 */
function syncIconName(): string {
  switch (syncStatus()) {
    case 'syncing': return 'cloud_sync'
    case 'connected': return 'cloud_done'
    case 'error': return 'cloud_off'
    default: return 'cloud_off'
  }
}

function syncIconColor(): string {
  switch (syncStatus()) {
    case 'syncing': return 'var(--mdui-color-primary)'
    case 'connected': return 'var(--mdui-color-on-surface-variant)'
    case 'error': return 'var(--mdui-color-error)'
    default: return 'var(--mdui-color-on-surface-variant)'
  }
}

export const SyncStatusIcon: Component<{ size?: string }> = (props) => {
  const iconSize = () => props.size ?? '20px'
  return (
    <Show when={isWebDAVConfigured()}>
      <mdui-button-icon
        on:click={(e: Event) => {
          e.stopPropagation()
          doManualSync()
        }}
        title={syncStatus() === 'error' ? syncMessage() : syncStatus()}
      >
        <mdui-icon
          name={syncIconName()}
          class={syncStatus() === 'syncing' ? 'animate-spin' : ''}
          style={{ 'font-size': iconSize(), color: syncIconColor() }}
        />
      </mdui-button-icon>
    </Show>
  )
}

const Layout: Component<ParentProps> = (props) => {
  const navigate = useNavigate()
  const matchSettings = useMatch(() => '/settings')
  const [isDesktop, setIsDesktop] = createSignal(window.innerWidth >= DESKTOP_BREAKPOINT)

  const handleResize = () => {
    setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT)
  }

  onMount(() => {
    window.addEventListener('resize', handleResize)
  })

  onCleanup(() => {
    window.removeEventListener('resize', handleResize)
  })

  const currentTab = () => (matchSettings() ? 'settings' : 'bookshelf')

  const handleNavChange = (e: CustomEvent) => {
    const value = (e.target as any)?.value
    if (value === 'settings') {
      navigate('/settings')
    } else {
      navigate('/')
    }
  }

  return (
    <mdui-layout full-height>
      <Show when={isDesktop()}>
        <mdui-navigation-rail
          value={currentTab()}
          on:change={handleNavChange}
          class="border-r border-[var(--mdui-color-surface-variant)]"
        >
          <mdui-navigation-rail-item
            value="bookshelf"
            icon="book"
          >
            书架
          </mdui-navigation-rail-item>
          <mdui-navigation-rail-item
            value="settings"
            icon="settings"
          >
            设置
          </mdui-navigation-rail-item>
        </mdui-navigation-rail>
      </Show>

      <mdui-layout-main
        class="overflow-auto"
        style={{
          'padding-bottom': isDesktop() ? '0' : '80px',
        }}
      >
        {props.children}
      </mdui-layout-main>

      <Show when={!isDesktop()}>
        <mdui-navigation-bar
          value={currentTab()}
          on:change={handleNavChange}
          label-visibility="labeled"
        >
          <mdui-navigation-bar-item
            value="bookshelf"
            icon="book"
          >
            书架
          </mdui-navigation-bar-item>
          <mdui-navigation-bar-item
            value="settings"
            icon="settings"
          >
            设置
          </mdui-navigation-bar-item>
        </mdui-navigation-bar>
      </Show>
    </mdui-layout>
  )
}

export default Layout
