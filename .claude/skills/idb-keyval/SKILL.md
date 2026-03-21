---
name: idb-keyval
description: |
  idb-keyval 轻量 IndexedDB 键值存储库 API 参考。
  当涉及 IndexedDB 数据存储、书籍元信息、设置存储、阅读进度存储时触发。
  Triggers: idb-keyval, IndexedDB, keyval, 元数据存储, bookDB, createStore
---

# idb-keyval API 参考

轻量级 Promise-based IndexedDB 键值存储。体积极小（get/set 仅 295B brotli），支持 tree-shaking。

## 安装

```bash
pnpm add idb-keyval
```

## 核心 API

### 单键操作

#### `get<T>(key, customStore?): Promise<T | undefined>`

获取值，不存在时返回 `undefined`（非报错）。

```typescript
import { get } from 'idb-keyval'
const value = await get('theme')
```

#### `set(key, value, customStore?): Promise<void>`

存储键值对，已存在则覆盖。

```typescript
import { set } from 'idb-keyval'
await set('theme', 'dark')
await set('user', { id: 1, name: 'Alice', created: new Date() })
```

#### `del(key, customStore?): Promise<void>`

删除指定键。

```typescript
import { del } from 'idb-keyval'
await del('expired-token')
```

### 批量操作（更高效）

#### `setMany(entries, customStore?): Promise<void>`

原子性批量存储，全部成功或全部失败。

```typescript
import { setMany } from 'idb-keyval'
await setMany([
  ['theme', 'dark'],
  ['language', 'zh'],
  ['fontSize', 16],
])
```

#### `getMany(keys, customStore?): Promise<(T | undefined)[]>`

批量获取，返回值顺序与 keys 一致。

```typescript
import { getMany } from 'idb-keyval'
const [theme, lang, size] = await getMany(['theme', 'language', 'fontSize'])
```

#### `delMany(keys, customStore?): Promise<void>`

批量删除。

```typescript
import { delMany } from 'idb-keyval'
await delMany(['token-1', 'token-2', 'session-id'])
```

### 原子更新

#### `update<T>(key, updater, customStore?): Promise<T>`

原子性读取-修改-写入，防止竞态条件。updater 函数**必须返回新值**。

```typescript
import { update } from 'idb-keyval'

// 计数器递增
await update('counter', (val) => (val || 0) + 1)

// 更新对象字段
await update('user', (val) => ({
  ...val,
  lastSeen: new Date(),
  loginCount: (val?.loginCount || 0) + 1,
}))

// 追加到数组
await update('bookmarks', (val) => [
  ...(val || []),
  { id: 2, title: 'New Bookmark' },
])
```

### 全量检索

#### `keys(customStore?): Promise<IDBValidKey[]>`

获取所有键。

#### `values<T>(customStore?): Promise<T[]>`

获取所有值。

#### `entries<T>(customStore?): Promise<[IDBValidKey, T][]>`

获取所有键值对。

```typescript
import { entries } from 'idb-keyval'
const allData = await entries()
allData.forEach(([key, value]) => console.log(key, value))
```

#### `clear(customStore?): Promise<void>`

清空整个 store。**不可逆操作**。

## 自定义 Store

默认使用 `keyval-store` 数据库的 `keyval` store。使用 `createStore` 创建独立存储：

```typescript
import { createStore, set, get } from 'idb-keyval'

const settingsStore = createStore('settings-db', 'settings')
const booksStore = createStore('books-db', 'metadata')
const progressStore = createStore('progress-db', 'progress')

// 传入 store 参数
await set('theme', 'auto', settingsStore)
const theme = await get('theme', settingsStore)
```

**注意**: 每个数据库只能有一个 object store。不要在同一个数据库中创建多个 store。

## 支持的数据类型

**键类型 (IDBValidKey)**: `string`, `number`, `Date`

**值类型（结构化克隆）**: `string`, `number`, `boolean`, 普通对象, 数组, `Date`, `Blob`, `File`, `ArrayBuffer`, `Uint8Array`, `Map`, `Set`

**不支持**: 函数, Symbol, DOM 节点, 循环引用

## 项目中的使用模式

### 书籍元信息

```typescript
import { get, set, del, entries, createStore } from 'idb-keyval'

// key: bookId, value: BookMeta
interface BookMeta {
  id: string
  title: string
  author: string
  category: string
  fileSize: number
  addedAt: number
  lastReadAt: number
  progress: number        // 0-1
  currentChapter: number
  totalChapters: number
}
```

### 设置存储

```typescript
const settingsStore = createStore('settings-db', 'settings')
await set('theme', 'auto', settingsStore)
await set('webdav', { url, username, password }, settingsStore)
```

### 阅读进度

```typescript
const progressStore = createStore('progress-db', 'progress')
await set(bookId, { chapter: 5, offset: 1234 }, progressStore)
```

## 错误处理

```typescript
try {
  const theme = await get('theme', settingsStore)
} catch (error) {
  // QuotaExceededError: 存储空间不足
  // 其他 IndexedDB 错误
  console.error('Storage error:', error)
}
```

## 完整导入参考

```typescript
import {
  get, set, del, clear,       // 单键操作
  getMany, setMany, delMany,  // 批量操作
  update,                      // 原子更新
  keys, values, entries,       // 全量检索
  createStore,                 // 自定义 store
} from 'idb-keyval'
```
