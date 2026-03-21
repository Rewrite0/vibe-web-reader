---
name: opfs-tools
description: |
  OPFS (Origin Private File System) 文件存储库 API 参考。
  当涉及浏览器端文件读写、OPFS 文件系统操作、书籍文件存储时触发。
  Triggers: opfs, opfs-tools, file storage, OPFS, 文件存储, bookStorage
---

# opfs-tools API 参考

基于 OPFS (Origin Private File System) 的高性能浏览器端文件存储库。使用 Worker 池（最多 3 个）避免阻塞主线程，支持流式读写和随机访问。

## 安装

```bash
pnpm add opfs-tools
```

## 核心入口

### `file(filePath, mode?): OTFile`

访问文件，可配置读写模式。

**参数：**
- `filePath: string` — 文件路径
- `mode?: 'r' | 'rw' | 'rw-unsafe'` — 默认 `'rw'`
  - `'r'`: 只读，安全并发读取
  - `'rw'`: 读写，独占锁
  - `'rw-unsafe'`: 读写无锁（高性能，Chrome 121+）

```typescript
import { file } from 'opfs-tools'

const content = await file('/books/novel.txt').text()
const exists = await file('/books/novel.txt').exists()
const size = await file('/books/novel.txt').getSize()
await file('/books/novel.txt').remove()
```

### `write(target, content, opts?): Promise<void>`

写入文件，自动创建父目录。

**参数：**
- `target: string | OTFile` — 目标文件
- `content: string | BufferSource | ReadableStream | OTFile` — 写入内容
- `opts?: { overwrite?: boolean }`

```typescript
import { write } from 'opfs-tools'

// 写入文本
await write('/path/file.txt', 'Hello, world!')

// 写入二进制
await write('/data/binary.dat', new Uint8Array([1, 2, 3]))

// 从 fetch 流写入
const response = await fetch(url)
await write('/downloads/file.zip', response.body)

// 从另一个文件复制
await write('/backup/copy.txt', file('/original/file.txt'))
```

### `dir(dirPath): OTDir`

访问目录。

```typescript
import { dir } from 'opfs-tools'

const d = dir('/books')
await d.create()          // 创建目录（含父目录）
await d.exists()          // 检查是否存在
const items = await d.children()  // 列出内容
await d.remove()          // 递归删除
```

### `tmpfile(): OTFile`

创建临时文件，系统自动清理。

## OTFile 方法

### 读取

| 方法 | 返回 | 说明 |
|------|------|------|
| `text()` | `Promise<string>` | UTF-8 文本内容 |
| `arrayBuffer()` | `Promise<ArrayBuffer>` | 二进制数据 |
| `stream()` | `Promise<ReadableStream<Uint8Array>>` | 流式读取（大文件推荐） |
| `createReader()` | `Promise<Reader>` | 随机访问读取器 |
| `exists()` | `Promise<boolean>` | 文件是否存在 |
| `getSize()` | `Promise<number>` | 文件大小（字节） |

### Reader（随机访问读取）

```typescript
const reader = await file('/data/book.epub').createReader()
const header = await reader.read(1024)              // 读前 1024 字节
const chunk = await reader.read(512, { at: 10000 }) // 从位置 10000 读 512 字节
const size = await reader.getSize()
await reader.close()  // 必须关闭
```

### Writer（随机访问写入）

同一文件同时只能有一个 Writer。

```typescript
const writer = await file('/data/output.bin').createWriter()
await writer.write(new Uint8Array([1, 2, 3]))       // 顺序写
await writer.write(new Uint8Array([4, 5]), { at: 100 }) // 定位写
await writer.truncate(200)  // 截断到指定大小
await writer.flush()        // 强制刷盘
await writer.close()        // 释放锁（必须）
```

### 文件操作

```typescript
// 复制
await file('/a.txt').copyTo(file('/backup/a.txt'))
await file('/a.txt').copyTo(dir('/backups'))  // 保留文件名

// 移动
const moved = await file('/old.txt').moveTo(dir('/archive'))
```

## OTDir 方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `create()` | `Promise<void>` | 创建目录及父目录 |
| `exists()` | `Promise<boolean>` | 是否存在 |
| `remove()` | `Promise<void>` | 递归删除 |
| `children()` | `Promise<(OTDir \| OTFile)[]>` | 列出内容 |
| `copyTo(target)` | `Promise<void>` | 复制目录树 |
| `moveTo(target)` | `Promise<OTDir>` | 移动目录 |

**区分子项类型：**
```typescript
const items = await dir('/books').children()
items.forEach(item => {
  if (item.kind === 'dir') { /* 目录 */ }
  if (item.kind === 'file') { /* 文件 */ }
})
```

## 属性

OTFile 和 OTDir 共有属性：
- `kind: 'file' | 'dir'` — 类型标识
- `name: string` — 名称
- `path: string` — 完整路径
- `parent: OTDir | null` — 父目录

## 项目中的使用模式

书籍文件统一存储在 OPFS `/books/` 目录下：

```
/books/
├── {bookId}/
│   ├── content.txt    # 或 content.epub
│   └── cover.jpg      # 封面（如有）
```

```typescript
import { file, dir, write } from 'opfs-tools'

// 导入书籍
await write(`/books/${bookId}/content.txt`, fileStream)

// 读取书籍
const content = await file(`/books/${bookId}/content.txt`).text()

// 删除书籍
await dir(`/books/${bookId}`).remove()

// 检查文件
const exists = await file(`/books/${bookId}/content.txt`).exists()
```

## 注意事项

1. **独占写入**: 同一文件同时只能有一个 Writer，否则抛错
2. **资源清理**: 必须关闭 Reader/Writer 后才能删除文件
3. **只读限制**: `'r'` 模式文件无法创建 Writer
4. **copyTo 行为**: 目标目录存在时复制到其内部；不存在时重命名
5. **大文件**: 优先使用 `stream()` 而非 `arrayBuffer()`
6. **浏览器兼容**: Chrome 90+, Firefox 111+, Safari 15.1+；`'rw-unsafe'` 需 Chrome 121+
