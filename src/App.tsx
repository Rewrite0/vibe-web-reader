import type { Component } from 'solid-js'
import { Router, Route } from '@solidjs/router'
import { onMount } from 'solid-js'
import { loadSettings } from '~/stores/settings'
import { loadBooks } from '~/stores/books'
import Layout from '~/components/Layout'
import Bookshelf from '~/pages/Bookshelf'
import Settings from '~/pages/Settings'
import Reader from '~/pages/Reader'

const App: Component = () => {
  onMount(async () => {
    await loadSettings()
    await loadBooks()
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
