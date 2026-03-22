/**
 * 小说文件解析器（TXT / EPUB）
 */
import JSZip from 'jszip'

export interface ParsedBook {
  title: string
  author: string
  chapters: Chapter[]
  cover?: string // data URL
}

export interface Chapter {
  title: string
  content: string // 纯文本内容
  htmlContent?: string // EPUB 的 HTML 内容（含内嵌图片）
}

export { generateId as generateBookId } from '~/utils/id'

// ========== TXT 解析 ==========

/** 常见章节标题正则 */
const CHAPTER_RE =
  /^[\s]*(?:第[零一二三四五六七八九十百千万\d]+[章节回卷集部篇]|chapter\s*\d+|序[章言]?|楔子|尾声|番外|引子|前言|后记)\s*.*/i

/** 解析 TXT 文件 */
export function parseTxt(text: string, fileName: string): ParsedBook {
  const lines = text.split(/\r?\n/)
  const chapters: Chapter[] = []

  let currentTitle = ''
  let currentLines: string[] = []

  // 尝试从文件名提取书名
  const title = fileName.replace(/\.txt$/i, '').trim()

  for (const line of lines) {
    if (CHAPTER_RE.test(line) && line.trim().length > 0 && line.trim().length < 50) {
      // 遇到新章节标题
      if (currentTitle || currentLines.length > 0) {
        chapters.push({
          title: currentTitle || '开头',
          content: currentLines.join('\n').trim(),
        })
      }
      currentTitle = line.trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  // 最后一章
  if (currentTitle || currentLines.length > 0) {
    chapters.push({
      title: currentTitle || '正文',
      content: currentLines.join('\n').trim(),
    })
  }

  // 如果没有分出章节，整个文件作为一章
  if (chapters.length === 0) {
    chapters.push({ title: '正文', content: text })
  }

  return { title, author: '未知', chapters }
}

// ========== EPUB 解析 ==========

/** 解析相对路径为 ZIP 内绝对路径 */
function resolveZipPath(base: string, relative: string): string {
  // 去除 base 的文件名，保留目录
  const baseDir = base.includes('/') ? base.substring(0, base.lastIndexOf('/') + 1) : ''
  const parts = (baseDir + relative).split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') resolved.pop()
    else if (part !== '.' && part !== '') resolved.push(part)
  }
  return resolved.join('/')
}

/** 根据文件扩展名推断 MIME 类型 */
function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
  }
  return map[ext] ?? 'image/png'
}

/** 处理 EPUB 章节 HTML 中的图片，将 src 替换为 data URL */
async function processEpubImages(
  body: Element,
  zip: JSZip,
  chapterFilePath: string,
): Promise<void> {
  // 处理 <img> 标签
  const imgs = body.querySelectorAll('img')
  for (const img of Array.from(imgs)) {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:')) continue
    const zipPath = resolveZipPath(chapterFilePath, src)
    try {
      const imgData = await zip.file(zipPath)?.async('base64')
      if (imgData) {
        const mime = guessMimeType(zipPath)
        img.setAttribute('src', `data:${mime};base64,${imgData}`)
      }
    } catch { /* ignore missing image */ }
  }

  // 处理 SVG <image> 标签（href / xlink:href）
  const svgImages = body.querySelectorAll('image')
  for (const img of Array.from(svgImages)) {
    const href = img.getAttribute('href') ?? img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (!href || href.startsWith('data:')) continue
    const zipPath = resolveZipPath(chapterFilePath, href)
    try {
      const imgData = await zip.file(zipPath)?.async('base64')
      if (imgData) {
        const mime = guessMimeType(zipPath)
        const dataUrl = `data:${mime};base64,${imgData}`
        img.setAttribute('href', dataUrl)
        if (img.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl)
        }
      }
    } catch { /* ignore */ }
  }
}

/** 清理 HTML 中的不安全内容 */
function sanitizeHtml(body: Element): void {
  // 移除 script 标签
  body.querySelectorAll('script').forEach((el) => el.remove())
  // 移除 style 标签外链（保留 inline style）
  body.querySelectorAll('link[rel="stylesheet"]').forEach((el) => el.remove())
  // 移除事件处理属性
  const allEls = body.querySelectorAll('*')
  for (const el of Array.from(allEls)) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name)
      }
    }
  }
}

/** 解析 EPUB 文件 */
export async function parseEpub(data: ArrayBuffer, fileName: string): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(data)

  // 1. 读取 container.xml 找到 OPF 路径
  const containerXml = await zip.file('META-INF/container.xml')?.async('text')
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml')

  const parser = new DOMParser()
  const containerDoc = parser.parseFromString(containerXml, 'application/xml')
  const rootfilePath =
    containerDoc.querySelector('rootfile')?.getAttribute('full-path') ?? ''

  if (!rootfilePath) throw new Error('Invalid EPUB: missing rootfile path')

  // OPF 所在目录（用于解析相对路径）
  const opfDir = rootfilePath.includes('/')
    ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1)
    : ''

  // 2. 解析 OPF
  const opfXml = await zip.file(rootfilePath)?.async('text')
  if (!opfXml) throw new Error('Invalid EPUB: missing OPF file')

  const opfDoc = parser.parseFromString(opfXml, 'application/xml')

  // 提取元数据
  const title =
    opfDoc.querySelector('metadata > *|title, metadata title')?.textContent?.trim() ??
    fileName.replace(/\.epub$/i, '')
  const author =
    opfDoc.querySelector('metadata > *|creator, metadata creator')?.textContent?.trim() ??
    '未知'

  // 3. 获取 manifest（id -> href 映射）
  const manifestItems = new Map<string, string>()
  const manifestMediaTypes = new Map<string, string>()
  opfDoc.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id') ?? ''
    const href = item.getAttribute('href') ?? ''
    const mediaType = item.getAttribute('media-type') ?? ''
    manifestItems.set(id, href)
    manifestMediaTypes.set(id, mediaType)
  })

  // 4. 按 spine 顺序读取内容
  const spineRefs: string[] = []
  opfDoc.querySelectorAll('spine > itemref').forEach((ref) => {
    const idref = ref.getAttribute('idref') ?? ''
    if (idref) spineRefs.push(idref)
  })

  const chapters: Chapter[] = []

  for (const idref of spineRefs) {
    const href = manifestItems.get(idref)
    if (!href) continue

    const filePath = opfDir + href
    const htmlContent = await zip.file(filePath)?.async('text')
    if (!htmlContent) continue

    const doc = parser.parseFromString(htmlContent, 'application/xhtml+xml')
    const body = doc.querySelector('body')
    if (!body) continue

    // 提取纯文本（用于标题提取）
    const text = extractText(body).trim()
    const hasImages = body.querySelector('img, image') !== null

    // 跳过既无文本也无图片的空页
    if (!text && !hasImages) continue

    // 尝试提取章节标题
    const heading =
      body.querySelector('h1, h2, h3, h4')?.textContent?.trim() ?? ''
    const chapterTitle = heading || (hasImages && !text ? '插图' : `第 ${chapters.length + 1} 章`)

    // 处理 HTML 内容：内嵌图片、清理不安全元素
    await processEpubImages(body, zip, filePath)
    sanitizeHtml(body)
    const richHtml = body.innerHTML

    chapters.push({ title: chapterTitle, content: text, htmlContent: richHtml })
  }

  if (chapters.length === 0) {
    chapters.push({ title: '正文', content: '（内容为空）' })
  }

  // 5. 尝试提取封面
  let cover: string | undefined
  const coverMeta = opfDoc.querySelector('metadata meta[name="cover"]')
  const coverId = coverMeta?.getAttribute('content')
  if (coverId) {
    const coverHref = manifestItems.get(coverId)
    const mediaType = manifestMediaTypes.get(coverId)
    if (coverHref && mediaType?.startsWith('image/')) {
      try {
        const coverData = await zip.file(opfDir + coverHref)?.async('base64')
        if (coverData) {
          cover = `data:${mediaType};base64,${coverData}`
        }
      } catch {
        // ignore cover extraction failure
      }
    }
  }

  return { title, author, chapters, cover }
}

/** 从 DOM 节点提取纯文本，保留段落结构 */
function extractText(node: Element): string {
  const blocks: string[] = []

  function walk(el: Element) {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent?.trim()
        if (text) blocks.push(text)
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName.toLowerCase()
        if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'li'].includes(tag)) {
          walk(child as Element)
          blocks.push('\n')
        } else {
          walk(child as Element)
        }
      }
    }
  }

  walk(node)
  return blocks
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 根据文件扩展名解析书籍 */
export async function parseBook(
  fileData: ArrayBuffer,
  fileName: string,
): Promise<ParsedBook> {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'epub') {
    return parseEpub(fileData, fileName)
  }
  // 默认按 TXT 处理
  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(fileData)
  return parseTxt(text, fileName)
}
