/**
 * 搜索栏组件
 */
import type { Component } from 'solid-js'

interface SearchBarProps {
  value: string
  onInput: (value: string) => void
}

const SearchBar: Component<SearchBarProps> = (props) => {
  return (
    <mdui-text-field
      variant="outlined"
      placeholder="搜索书名或作者"
      icon="search"
      clearable
      value={props.value}
      on:input={(e: Event) => {
        const val = (e.target as HTMLInputElement).value
        props.onInput(val)
      }}
      on:clear={() => props.onInput('')}
      class="w-full"
    />
  )
}

export default SearchBar
