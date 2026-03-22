import type { Component } from 'solid-js'
import { Router, Route } from '@solidjs/router'
import { onMount, onCleanup, createEffect } from 'solid-js'
import { loadSettings, settings } from '~/stores/settings'
import { loadBooks } from '~/stores/books'
import {
  initSyncWorker,
  isWebDAVConfigured,
  doConfigSync,
  updateBookSyncTimer,
  cleanupSync,
} from '~/services/syncService'
import { setSyncStatus } from '~/stores/sync'
import Layout from '~/components/Layout'
import Bookshelf from '~/pages/Bookshelf'
import Settings from '~/pages/Settings'
import Reader from '~/pages/Reader'

const App: Component = () => {
  onMount(async () => {
    await loadSettings()
    await loadBooks()

    // 初始化同步 Worker
    initSyncWorker()

    // 如果已配置 WebDAV，启动配置自动同步
    if (isWebDAVConfigured()) {
      setSyncStatus('connected')
      doConfigSync()
      updateBookSyncTimer()
    }
  })

  // 监听 autoSyncBooks / bookSyncInterval 变化，更新定时器
  createEffect(() => {
    const _ = settings().autoSyncBooks
    const __ = settings().bookSyncInterval
    updateBookSyncTimer()
  })

  onCleanup(() => {
    cleanupSync()
  })

  return (
    <Router>
      <Route path="/reader/:id/:chapter?" component={Reader} />
      <Route path="/" component={Layout}>
        <Route path="/" component={Bookshelf} />
        <Route path="/settings" component={Settings} />
      </Route>
    </Router>
  )
}

export default App
