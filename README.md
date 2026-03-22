# Web Reader

> 也是体验了一把纯 vibe coding 项目

基于 SolidJS 构建的本地小说阅读器 PWA，支持 TXT / EPUB 格式，采用 Material Design 3 设计规范。

## 功能

- **书架管理** — 导入 TXT / EPUB 书籍，支持搜索、自定义标签分类
- **沉浸阅读** — 全屏阅读，触摸翻页 / 键盘翻页，阅读进度自动保存
- **目录增强** — 目录支持章节搜索、当前章节定位、书签标记与仅看书签筛选
- **书签系统** — 一键添加/取消当前章节书签，书签持久化到书籍元数据
- **阅读设置** — 字号、行高、背景色预设（默认 / 护眼 / 绿色 / 夜间）
- **WebDAV 同步** — 书籍元数据与文件双向同步，支持自动 / 手动同步
- **离线可用** — PWA 支持，Service Worker 预缓存静态资源
- **深色模式** — 浅色 / 深色 / 跟随系统，支持动态主题色

## 技术栈

| 类别 | 技术                                         |
| ---- | -------------------------------------------- |
| 框架 | SolidJS + TypeScript                         |
| 构建 | Vite + pnpm                                  |
| UI   | mdui v2 (Material Design 3 Web Components)   |
| 样式 | UnoCSS                                       |
| 存储 | OPFS (opfs-tools) + IndexedDB (idb-keyval)   |
| 同步 | WebDAV + Web Worker (@rewrite0/typed-worker) |
| EPUB | JSZip                                        |
| PWA  | vite-plugin-pwa + Workbox                    |

## 开始使用

```bash
pnpm install
pnpm dev
```

构建生产版本：

```bash
pnpm build
pnpm preview
```

## 许可证

MIT
