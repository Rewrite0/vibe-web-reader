/**
 * WebDAV 客户端封装
 */

export interface WebDAVConfig {
  url: string
  user: string
  password: string
}

function authHeader(config: WebDAVConfig): Record<string, string> {
  return {
    Authorization: 'Basic ' + btoa(`${config.user}:${config.password}`),
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base : base + '/'
  const p = path.startsWith('/') ? path.slice(1) : path
  return b + p
}

/** 测试 WebDAV 连接 */
export async function testConnection(config: WebDAVConfig): Promise<boolean> {
  try {
    const res = await fetch(config.url, {
      method: 'OPTIONS',
      headers: authHeader(config),
    })
    return res.ok
  } catch {
    return false
  }
}

/** 上传文件 */
export async function uploadFile(
  config: WebDAVConfig,
  remotePath: string,
  data: string | ArrayBuffer,
): Promise<boolean> {
  try {
    const res = await fetch(joinUrl(config.url, remotePath), {
      method: 'PUT',
      headers: {
        ...authHeader(config),
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    })
    return res.ok || res.status === 201 || res.status === 204
  } catch {
    return false
  }
}

/** 下载文件 */
export async function downloadFile(
  config: WebDAVConfig,
  remotePath: string,
): Promise<string | null> {
  try {
    const res = await fetch(joinUrl(config.url, remotePath), {
      method: 'GET',
      headers: authHeader(config),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

/** 创建目录 */
export async function createDirectory(
  config: WebDAVConfig,
  remotePath: string,
): Promise<boolean> {
  try {
    const res = await fetch(joinUrl(config.url, remotePath), {
      method: 'MKCOL',
      headers: authHeader(config),
    })
    return res.ok || res.status === 201 || res.status === 405 // 405 = already exists
  } catch {
    return false
  }
}

/** 检查资源是否存在 */
export async function exists(
  config: WebDAVConfig,
  remotePath: string,
): Promise<boolean> {
  try {
    const res = await fetch(joinUrl(config.url, remotePath), {
      method: 'HEAD',
      headers: authHeader(config),
    })
    return res.ok
  } catch {
    return false
  }
}
