---
name: typed-worker
description: |
  @rewrite0/typed-worker 类型安全 Web Worker 封装库 API 参考。
  当涉及 Web Worker 创建、Worker 通信、后台任务、WebDAV 同步 Worker 时触发。
  Triggers: typed-worker, Web Worker, createTypedWorker, defineWorkerActions, Worker 通信, sync worker
---

# @rewrite0/typed-worker API 参考

类型安全的 Web Worker 封装库。提供完整的 TypeScript 类型推断，支持 action 调用和事件通信两种模式。

## 安装

```bash
pnpm add @rewrite0/typed-worker
```

## 核心 API

### Worker 文件（Worker 线程）

#### `defineWorkerActions(actions)`

定义 Worker 可执行的操作集合。

```typescript
import { defineWorkerActions, setupWorkerActions } from '@rewrite0/typed-worker'

const actions = defineWorkerActions({
  async add(a: number, b: number) {
    return a + b
  },
  async processData(data: string) {
    return data.toUpperCase()
  },
})

setupWorkerActions(actions)
export type Actions = typeof actions
```

#### `setupWorkerActions(actions)`

注册 actions，启用 Worker 消息处理。**每个 Worker 文件必须调用一次**。

#### `defineWorkerSendEvent<Events>()`

创建类型安全的事件发送函数，用于 Worker → 主线程通信。

```typescript
import { defineWorkerSendEvent } from '@rewrite0/typed-worker'

type MyEvents = {
  'progress': [percent: number, message: string]
  'status': ['idle' | 'syncing' | 'error' | 'done']
}

const sender = defineWorkerSendEvent<MyEvents>()

// 在 action 中发送事件
sender('progress', 50, 'Processing...')
sender('status', 'done')
```

### 主线程

#### `createTypedWorker<Actions, Events>(setupWorker)`

创建类型安全的 Worker 实例。

**参数：**
- `setupWorker: () => Worker` — Worker 工厂函数

**返回：** TypedWorker 实例

```typescript
import { createTypedWorker } from '@rewrite0/typed-worker'
import SyncWorker from '~/workers/sync.worker?worker'
import type { SyncActions, SyncEvents } from '~/workers/sync.worker'

const worker = createTypedWorker<SyncActions, SyncEvents>(
  () => new SyncWorker()
)
```

## TypedWorker 实例方法

### 调用 Action

```typescript
// 直接调用（推荐）
const result = await worker.add(2, 3)  // 返回 5

// call 语法（支持 Transferable）
const result = await worker.call('add')(2, 3)

// 传递 Transferable 对象（零拷贝）
const buffer = new ArrayBuffer(1024)
await worker.call('processBuffer', [buffer])(buffer)
```

### 事件监听

#### `onEvent(eventName, listener): () => void`

注册事件监听器，返回取消订阅函数。

```typescript
const unsubscribe = worker.onEvent('progress', (percent, message) => {
  console.log(`${percent}%: ${message}`)
})

// 取消监听
unsubscribe()
```

#### `offEvent(eventName, listener): void`

移除指定事件监听器（需同一函数引用）。

#### `clearEvents(eventName?): void`

清除事件监听器。不传参数则清除所有。

```typescript
worker.clearEvents('progress')  // 清除 progress 事件的所有监听
worker.clearEvents()            // 清除所有事件的所有监听
```

#### `terminate(): Promise<void>`

等待所有进行中的任务完成后终止 Worker。终止后再调用会抛错。

## 完整 Worker 文件模板

```typescript
// src/workers/sync.worker.ts
import {
  defineWorkerActions,
  setupWorkerActions,
  defineWorkerSendEvent,
} from '@rewrite0/typed-worker'

export type SyncEvents = {
  'sync-progress': [percent: number, message: string]
  'sync-status': [status: 'idle' | 'syncing' | 'error' | 'done']
  'sync-conflict': [bookId: string, localTime: number, remoteTime: number]
}

const sender = defineWorkerSendEvent<SyncEvents>()

const actions = defineWorkerActions({
  async testConnection(url: string, username: string, password: string) {
    // 测试 WebDAV 连接
    return true
  },

  async syncSettings(config: WebDAVConfig) {
    sender('sync-status', 'syncing')
    // ... 同步逻辑 ...
    sender('sync-status', 'done')
  },

  async syncBooks(config: WebDAVConfig) {
    sender('sync-status', 'syncing')
    // ... 同步逻辑 ...
    sender('sync-status', 'done')
  },

  async uploadBook(config: WebDAVConfig, bookId: string, content: ArrayBuffer) {
    // 上传单本书籍
  },

  async downloadBook(config: WebDAVConfig, bookId: string) {
    // 下载单本书籍，返回 ArrayBuffer
    return new ArrayBuffer(0)
  },
})

setupWorkerActions(actions)
export type SyncActions = typeof actions
```

## 完整主线程使用模板

```typescript
import { createTypedWorker } from '@rewrite0/typed-worker'
import SyncWorker from '~/workers/sync.worker?worker'
import type { SyncActions, SyncEvents } from '~/workers/sync.worker'

const syncWorker = createTypedWorker<SyncActions, SyncEvents>(
  () => new SyncWorker()
)

// 监听同步状态
syncWorker.onEvent('sync-status', (status) => { /* 更新 UI */ })
syncWorker.onEvent('sync-progress', (percent, msg) => { /* 进度条 */ })

// 测试连接
const ok = await syncWorker.testConnection(url, username, password)

// 定时同步（在主线程用 setInterval 触发 Worker）
setInterval(() => syncWorker.syncBooks(config), syncInterval)
```

## Vite 集成

使用 Vite 的 `?worker` 导入语法：

```typescript
import SyncWorker from '~/workers/sync.worker?worker'

const worker = createTypedWorker<SyncActions, SyncEvents>(
  () => new SyncWorker()
)
```

## 特性

| 特性 | 说明 |
|------|------|
| 类型安全 | 方法和事件完整 TypeScript 推断 |
| 懒初始化 | Worker 首次使用时才创建 |
| 并发安全 | 正确处理多个同时调用 |
| Transferable | `call(name, [transferables])` 零拷贝传输 |
| 优雅关闭 | `terminate()` 等待进行中任务 |
| 错误传播 | Worker 中的异常会传播到主线程 |
| 零依赖 | 无外部依赖 |

## 注意事项

1. Worker 文件必须调用 `setupWorkerActions(actions)` 注册
2. 事件类型定义使用 labeled tuple: `[percent: number, message: string]`
3. `offEvent` 需传入同一函数引用才能正确移除
4. `terminate()` 后不可再调用 action
5. 多个并发调用会正确路由到对应结果（不会混淆）
