/**
 * 全局布局：底部导航栏 + 内容区域
 * 移动端使用 navigation-bar，桌面端使用 navigation-rail
 */
import { type Component, createSignal, onMount, onCleanup } from 'solid-js'
import { useNavigate, useLocation } from '@solidjs/router'
import type { ParentProps } from 'solid-js'

const DESKTOP_BREAKPOINT = 840

const Layout: Component<ParentProps> = (props) => {
  const navigate = useNavigate()
  const location = useLocation()
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

  const currentTab = () => (location.pathname === '/settings' ? 'settings' : 'bookshelf')

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
      {isDesktop() ? (
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
      ) : null}

      <mdui-layout-main
        class="overflow-auto"
        style={{
          'padding-bottom': isDesktop() ? '0' : '80px',
        }}
      >
        {props.children}
      </mdui-layout-main>

      {!isDesktop() ? (
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
      ) : null}
    </mdui-layout>
  )
}

export default Layout
