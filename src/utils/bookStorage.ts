/**
 * 书籍文件存储（OPFS via opfs-tools）
 */
import { file, dir, write } from 'opfs-tools';

const BOOKS_DIR = '/books';

function contentPath(bookId: string): string {
  return `${BOOKS_DIR}/${bookId}/content`;
}

/** 保存书籍文件到 OPFS */
export async function saveBookFile(bookId: string, data: ArrayBuffer): Promise<void> {
  await write(contentPath(bookId), data);
}

/** 读取书籍文件 */
export async function readBookFile(bookId: string): Promise<ArrayBuffer | null> {
  try {
    const f = file(contentPath(bookId));
    if (!(await f.exists())) return null;
    return await f.arrayBuffer();
  } catch {
    return null;
  }
}

/** 读取书籍文件为文本 */
export async function readBookFileAsText(bookId: string): Promise<string | null> {
  try {
    const f = file(contentPath(bookId));
    if (!(await f.exists())) return null;
    return await f.text();
  } catch {
    return null;
  }
}

/** 删除书籍文件（整个目录） */
export async function deleteBookFile(bookId: string): Promise<void> {
  try {
    await dir(`${BOOKS_DIR}/${bookId}`).remove();
  } catch {
    // ignore if not exists
  }
}

/** 检查书籍文件是否存在 */
export async function bookFileExists(bookId: string): Promise<boolean> {
  try {
    return await file(contentPath(bookId)).exists();
  } catch {
    return false;
  }
}

/** 删除全部书籍文件目录 */
export async function clearAllBookFiles(): Promise<void> {
  try {
    await dir(BOOKS_DIR).remove();
  } catch {
    // ignore if not exists
  }
}
