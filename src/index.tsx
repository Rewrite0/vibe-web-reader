/* @refresh reload */
import { render } from 'solid-js/web'
import 'mdui/mdui.css'
import 'mdui'
import 'virtual:uno.css'
import '@unocss/reset/tailwind-compat.css'
import '~/styles/tokens.css'
import App from './App'

const root = document.getElementById('root')

render(() => <App />, root!)
