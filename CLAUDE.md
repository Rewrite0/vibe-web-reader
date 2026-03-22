# Web Reader - 本地小说阅读器

## 项目概述

基于 SolidJS + TypeScript + UnoCSS + mdui 构建的本地小说阅读器 PWA 应用。采用 Google Material Design 3 设计规范，移动端优先，响应式适配桌面端。

## 技术栈

- **框架**: SolidJS + TypeScript
- **构建工具**: Vite + pnpm
- **UI 组件库**: mdui v2（Web Components，MD3 风格）
- **EPUB 解析**: JSZip（ZIP 解压读取 EPUB 内容）
- **原子 CSS**: UnoCSS（presetUno + presetAttributify + presetIcons）
- **Web Worker**: @rewrite0/typed-worker（类型安全的 Worker 封装）
- **本地存储**:
  - **文件存储**: opfs-tools（OPFS 文件系统 API，用于存储书籍文件）
  - **数据库**: idb-keyval（轻量 IndexedDB 封装，用于存储书籍元信息和设置）
- **PWA**: vite-plugin-pwa + workbox-precaching
- **路径别名**: `~` → `src/`
- **ID 生成**: nanoid（customAlphabet `1234567890abcdefghijklmnopqrstuvwxyz`，长度 10），统一从 `src/utils/id.ts` 导入

## mdui 使用规范

- mdui 组件是标准 Web Components，在 SolidJS 中直接以 HTML 标签形式使用（如 `<mdui-button>`）
- 使用前必须查阅 mdui 官方文档：<https://www.mdui.org/zh-cn/docs/2/llms.txt> ，或使用 `@mdui/mcp` MCP 服务获取组件 API
- mdui 提供完整的 MD3 设计令牌（CSS 自定义属性），所有自定义样式必须基于这些令牌
- 深色模式通过 `<html class="mdui-theme-dark">` 或 `mdui-theme-auto` 类控制
- 动态配色通过 `setColorScheme(hex)` 实现
- SolidJS 中 mdui Web Components 的类型声明在 `src/types/mdui.d.ts` 中统一维护

### mdui 已知注意事项

- **`mdui-chip selectable`**: 内部自行管理 `selected` 状态，与 SolidJS 外部状态冲突会导致需要双击才能切换。解决方案：不使用 `selectable` 属性，通过 SolidJS 信号完全控制 `selected` prop
- **图标只读按钮**: `mdui-button` 没有 label 文本时会有多余 padding，icon-only 场景应使用 `mdui-button-icon`
- **`--mdui-color-surface` 半透明**: mdui 的 surface 系列颜色令牌内部使用 `color-mix()` 生成半透明值，不能直接用于需要不透明背景的场景（如阅读器背景）。应使用硬编码的不透明色值替代
- **Material Icons 字体**: mdui 不内置图标字体，需在 `index.html` 中通过 CDN 引入 Google Material Icons
- **CSS Reset 兼容性**: 必须使用 `@unocss/reset/tailwind-compat.css` 而非 `tailwind.css`。后者的 `[type='button'] { background-color: transparent }` 会匹配 mdui 组件 host 元素（如 `<mdui-fab type="button">`），覆盖 Shadow DOM 内部 `:host` 的背景色样式

## 设计令牌体系

所有设计决策必须先定义设计令牌，再基于令牌进行开发。mdui 已内置以下 MD3 令牌：

- **颜色**: `--mdui-color-primary`, `--mdui-color-surface`, `--mdui-color-on-primary` 等
- **字体**: `--mdui-typescale-{display|headline|title|label|body}-{large|medium|small}-*`
- **圆角**: `--mdui-shape-corner-{none|extra-small|small|medium|large|extra-large|full}`
- **动效**: `--mdui-motion-easing-*`, `--mdui-motion-duration-*`
- **阴影**: `--mdui-elevation-level{0-5}`
- **断点**: `--mdui-breakpoint-{xs|sm|md|lg|xl|xxl}`（xs=0, sm=600, md=840, lg=1080, xl=1440, xxl=1920）

项目扩展令牌统一在 `src/styles/tokens.css` 中定义，命名格式 `--reader-*`：

- **阅读背景预设**: `--reader-bg-{default|warm|green|night}` — 不透明固定色值，default 在深色模式有覆盖
- **阅读文字色**: `--reader-text-{default|warm|green|night}`
- **当前激活背景/文字**: `--reader-active-bg` / `--reader-active-text` — 由 JS 动态设置，跟随用户选择的 `readerTheme`
- **排版**: `--reader-padding-inline`, `--reader-padding-block`, `--reader-content-max-width`, `--reader-font-family`, `--reader-paragraph-spacing`
- **书架**: `--reader-card-gap`, `--reader-card-min-width`

## 项目结构

```
src/
├── index.tsx                     # 入口：导入 mdui CSS、UnoCSS、tokens
├── App.tsx                       # 根组件：路由配置，启动时加载设置/书籍/同步Worker
├── styles/
│   └── tokens.css                # 项目扩展设计令牌（含深色模式覆盖）
├── types/
│   └── mdui.d.ts                 # mdui Web Components 的 SolidJS JSX 类型声明
├── components/
│   ├── Layout.tsx                # 响应式布局：移动端底部导航 / 桌面端侧边导航 / 同步状态图标
│   ├── BookCard.tsx              # 书籍卡片：3:4 封面、书名、章节进度、同步状态角标
│   ├── SearchBar.tsx             # 搜索栏
│   ├── CategoryFilter.tsx        # 标签筛选（全部 / 最近阅读 / 用户自定义标签）
│   ├── ReaderMenu.tsx            # 阅读页顶部/底部菜单浮层
│   ├── ReaderSettingsPanel.tsx   # 阅读页内嵌设置面板（字号、行高、背景色）
│   └── TableOfContents.tsx       # 目录侧边栏（mdui-navigation-drawer）
├── pages/
│   ├── Bookshelf.tsx             # 书架页：搜索、筛选、导入、右键菜单（分级删除）
│   ├── Settings.tsx              # 设置页：主题、阅读、同步（WebDAV配置/手动同步/自动同步）、存储、关于
│   └── Reader.tsx                # 阅读页：全屏沉浸式，URL 驱动章节进度，支持从WebDAV按需下载
├── stores/
│   ├── books.ts                  # 书籍列表状态（idb-keyval）
│   ├── reader.ts                 # 阅读进度状态（idb-keyval）
│   ├── settings.ts               # 全局设置（含 readerTheme 持久化）
│   └── sync.ts                   # WebDAV 同步状态（连接状态、同步锁、进度）
├── services/
│   └── syncService.ts            # WebDAV 同步服务（Worker初始化、配置/书籍同步编排）
├── workers/
│   ├── sync.worker.ts            # WebDAV 同步 Worker（配置同步、书籍上传/下载/删除/列表）
│   └── types.ts                  # Worker Actions / Events 类型导出
└── utils/
    ├── id.ts                     # 唯一 ID 生成（nanoid customAlphabet）
    ├── parser.ts                 # TXT/EPUB 文件解析（TXT 正则章节检测，EPUB JSZip 解析）
    ├── bookStorage.ts            # 书籍文件存储（OPFS /books/{bookId}/content）
    ├── bookDB.ts                 # 书籍元信息数据库（BookMeta、ReadProgress CRUD）
    └── webdav.ts                 # WebDAV 客户端封装
```

## 已实现功能

### 书架页

- **搜索**: 按书名/作者实时筛选
- **标签系统**: 固定分类（全部、最近阅读）+ 用户自定义标签，支持标签的创建、重命名、删除；书籍支持多标签
- **书籍导入**: FAB 按钮触发文件选择，支持 .txt / .epub 批量导入
- **书籍卡片**: 3:4 封面（TXT 显示图标+格式文字，EPUB 显示封面图）、书名（固定 2 行高度对齐）、章节进度条、同步状态角标（remote=云下载图标，synced=云完成图标）
- **右键菜单**: 书籍信息（含同步状态）、标签多选管理、分级删除（仅删除本地/仅删除远程/完全删除，根据同步状态动态显示）
- **网格布局**: `auto-fill` 响应式列数

### 阅读页

- **路由**: `/reader/:id/:chapter?`，章节索引编码在 URL 中，作为状态的唯一数据源
- **进度恢复**: 首次进入（URL 无 chapter 参数）时从 IndexedDB 恢复上次章节
- **翻页**: 触摸左右滑动、点击屏幕左/中/右三区域、键盘方向键
- **中心菜单**: 顶栏（返回 + 书名 + 当前章书签按钮）、底栏（章节进度滑块 + 目录/书签/设置按钮）
- **目录增强**: 支持目录搜索（按章节标题过滤）、书签图标标记、仅看书签筛选
- **章节书签**: 支持当前章节添加/取消书签，书签随书籍元数据持久化
- **阅读设置面板**: 字号（12-32）、行高（1.2-3.0）、背景色预设（默认/护眼/绿色/夜间）
- **背景持久化**: 选中的背景预设 key 存入 `settings.readerTheme`，刷新后自动恢复
- **菜单/面板背景**: 跟随当前阅读背景（通过 `--reader-active-bg/text` CSS 变量）
- **进度自动保存**: `createEffect` 监听章节变化，写入 IndexedDB
- **屏幕常亮**: 通过 Wake Lock API 实现
- **EPUB 图片渲染**: EPUB 章节保留 HTML 内容（`Chapter.htmlContent`），图片 src 替换为 base64 data URL 内嵌；纯图片页（彩页、插图目录）也作为章节保留；Reader 通过 `innerHTML` 渲染 HTML 内容，TXT 回退为纯文本渲染
- **按需下载**: 打开仅远程(remote)书籍时自动从 WebDAV 下载到本地，显示下载进度

### 设置页

- 深色模式（浅色/深色/跟随系统）、主题色选择
- 默认字号、行高、翻页动画、屏幕常亮
- WebDAV 同步配置（地址、凭据、存储目录、测试连接、手动同步按钮）
- 同步状态显示（连接状态、上次同步时间、冲突解决提示）
- 自动同步书籍开关 + 书籍同步间隔设置
- 存储管理、版本信息

### WebDAV 同步

- **同步架构**: Worker 后台执行，主线程通过 syncService.ts 编排
- **同步内容**: 配置（settings + books-meta + progress）默认自动同步；书籍文件可选自动同步
- **远程目录结构**: `{webdavDir}/config/`（settings.json, books-meta.json, progress.json）、`{webdavDir}/books/{txt|epub}/`
- **远程书籍文件名**: `{title}_{id}.{format}`，title 经 `sanitizeFilename()` 清理特殊字符
- **书籍同步状态**: `local`（仅本地）、`remote`（仅远程）、`synced`（已同步）
- **冲突解决**: 首次同步远程覆盖本地，后续按 `configSyncedAt` 时间戳比较，新的覆盖旧的
- **书签冲突合并**: `BookMeta.bookmarks` 使用独立时间戳 `bookmarksUpdatedAt` 合并，避免被 `syncStatus` 等无关元数据更新回退
- **书签同步触发**: 阅读页变更书签后会主动触发一次配置同步，减少重启时被远端旧数据覆盖的窗口
- **状态图标**: 导航栏显示 WebDAV 连接状态（disconnected/connected/syncing/error），点击触发手动同步
- **防重入锁**: `syncLock` 信号防止并发同步

### 导航布局

- 移动端：`mdui-navigation-bar` 底部导航
- 桌面端（≥840px）：`mdui-navigation-rail` 侧边导航
- 阅读页独立于导航布局之外，全屏显示

### PWA

- vite-plugin-pwa 生成 Service Worker，precache 静态资源
- workbox 运行时缓存 Google Fonts CDN
- manifest.json 配置 standalone 启动方式

## 数据存储架构

### 存储分层

| 层级 | 技术 | 用途 |
|------|------|------|
| 文件存储 | OPFS（opfs-tools） | 书籍原始文件（.txt / .epub） |
| 元数据 | IndexedDB（idb-keyval） | 书籍信息、阅读进度、设置 |
| 同步 | Web Worker（@rewrite0/typed-worker） | 后台 WebDAV 定时同步 |

### 关键数据模型

- **BookMeta**: `{ id, title, author, format, fileSize, cover?, chapterCount, chapters?: string[] (legacy), bookmarks?: number[], bookmarksUpdatedAt?: number, addedAt, lastReadAt?, tags?: string[], finished?, syncStatus?: 'local'|'remote'|'synced', updatedAt? }`
- **ReadProgress**: `{ bookId, chapterIndex, scrollPercent, overallPercent, updatedAt }`
- **AppSettings**: `{ themeMode, themeColor, fontSize, lineHeight, pageAnimation, keepScreenOn, webdavUrl/User/Password, webdavDir, autoSyncBooks, bookSyncInterval, configSyncedAt?, tags: string[], readerTheme }`

### 存储路径

- OPFS: `/books/{bookId}/content`
- IndexedDB stores: `settings-db`（设置）、`books-db`（书籍元信息）、`progress-db`（阅读进度）
- WebDAV 远程: `{webdavDir}/config/`（settings.json, books-meta.json, progress.json）、`{webdavDir}/books/txt/`、`{webdavDir}/books/epub/`

## 组件设计原则

- **复用优先**: 提取可复用 UI 单元为独立组件（BookCard、SearchBar 等）
- **令牌驱动**: 所有颜色、间距、圆角、字体等样式值从设计令牌获取，禁止硬编码
- **Props 类型化**: 所有组件 props 使用 TypeScript interface 定义
- **响应式**: 使用 mdui 断点令牌 + UnoCSS 响应式前缀实现自适应布局
- **无障碍**: 为交互元素提供 aria 标签

## 开发规范

- 包管理器统一使用 **pnpm**，禁止使用 npm 或 yarn（包括 `npm install`、`npm run` 等命令，一律替换为 `pnpm add`、`pnpm run`）
- 组件文件使用 PascalCase 命名（如 `BookCard.tsx`）
- 工具/状态文件使用 camelCase 命名（如 `books.ts`）
- 使用 SolidJS 响应式原语（`createSignal`, `createStore`, `createEffect`）管理状态
- mdui Web Components 在 SolidJS 中使用时，事件监听通过 `on:event-name` 或 `ref` + `addEventListener` 绑定
- UnoCSS 用于布局和辅助样式（flex、grid、spacing），组件外观优先使用 mdui 自带样式
