import { beforeEach, describe, expect, it, vi } from 'vitest';

type CapturedActions = Record<string, (...args: any[]) => any>;

let capturedActions: CapturedActions | null = null;

const sendEvent = vi.fn();

vi.mock('@rewrite0/typed-worker', () => ({
  defineWorkerActions: (actions: CapturedActions) => actions,
  setupWorkerActions: (actions: CapturedActions) => {
    capturedActions = actions;
  },
  defineWorkerSendEvent: () => sendEvent,
}));

function createResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe('sync.worker actions', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    capturedActions = null;
    await import('~/workers/sync.worker');
    expect(capturedActions).toBeTruthy();
  });

  it('syncConfig 会按 TTL 清理墓碑并采用较新的删除记录', async () => {
    const now = new Date('2026-03-22T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const ttlMs = 30 * 24 * 60 * 60 * 1000;
    const oldTs = now.getTime() - ttlMs - 10;
    const freshTs = now.getTime() - 1000;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/settings.json') && method === 'GET') {
        return createResponse(JSON.stringify({ configSyncedAt: 1 }));
      }
      if (url.endsWith('/books-meta.json') && method === 'PUT') {
        return createResponse('');
      }
      if (url.endsWith('/settings.json') && method === 'PUT') {
        return createResponse('');
      }
      if (url.endsWith('/progress.json') && method === 'GET') {
        return createResponse('{}');
      }
      if (url.endsWith('/progress.json') && method === 'PUT') {
        return createResponse('');
      }
      if (url.endsWith('/deleted-books.json') && method === 'GET') {
        return createResponse(
          JSON.stringify([
            { bookId: 'shared', deletedAt: freshTs + 1 },
            { bookId: 'remote-only', deletedAt: freshTs + 2 },
            { bookId: 'remote-expired', deletedAt: oldTs },
          ]),
        );
      }
      if (url.endsWith('/deleted-books.json') && method === 'PUT') {
        return createResponse('');
      }

      return createResponse('{}');
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await capturedActions!.syncConfig(
      'https://dav.example.com',
      'user',
      'pass',
      'web-reader',
      JSON.stringify({ configSyncedAt: 2 }),
      '[]',
      '{}',
      JSON.stringify([
        { bookId: 'shared', deletedAt: freshTs },
        { bookId: 'local-only', deletedAt: freshTs },
        { bookId: 'local-expired', deletedAt: oldTs },
      ]),
      ttlMs,
      false,
    );

    expect(result.direction).toBe('pushed');

    const deletionPutCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/deleted-books.json') && (init?.method ?? 'GET') === 'PUT',
    );
    expect(deletionPutCall).toBeTruthy();

    const mergedDeletionBody = JSON.parse(String(deletionPutCall![1]!.body));
    expect(mergedDeletionBody).toEqual(
      expect.arrayContaining([
        { bookId: 'shared', deletedAt: freshTs + 1 },
        { bookId: 'remote-only', deletedAt: freshTs + 2 },
        { bookId: 'local-only', deletedAt: freshTs },
      ]),
    );
    expect(mergedDeletionBody.find((d: any) => d.bookId === 'local-expired')).toBeUndefined();
    expect(mergedDeletionBody.find((d: any) => d.bookId === 'remote-expired')).toBeUndefined();

    const localUpdates = JSON.parse(result.deletions ?? '[]');
    expect(localUpdates).toEqual(
      expect.arrayContaining([
        { bookId: 'shared', deletedAt: freshTs + 1 },
        { bookId: 'remote-only', deletedAt: freshTs + 2 },
      ]),
    );

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('syncAllBooks 会跳过墓碑书籍并过滤远程独有墓碑项', async () => {
    vi.spyOn(capturedActions!, 'listRemoteBooks').mockResolvedValue([
      { id: 'remote-1', format: 'txt' },
    ]);
    const uploadSpy = vi.spyOn(capturedActions!, 'uploadBook').mockResolvedValue(true);

    const result = await capturedActions!.syncAllBooks(
      'https://dav.example.com',
      'user',
      'pass',
      'web-reader',
      JSON.stringify([
        { id: 'local-1', format: 'txt', syncStatus: 'local', title: 'L1' },
        { id: 'local-2', format: 'txt', syncStatus: 'remote', title: 'L2' },
        { id: 'tomb-1', format: 'txt', syncStatus: 'local', title: 'T1' },
      ]),
      {
        'local-1': new ArrayBuffer(4),
        'tomb-1': new ArrayBuffer(4),
      },
      JSON.stringify([
        { bookId: 'tomb-1', deletedAt: Date.now() },
        { bookId: 'remote-1', deletedAt: Date.now() },
      ]),
    );

    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledWith(
      'https://dav.example.com',
      'user',
      'pass',
      'web-reader',
      'local-1',
      'txt',
      expect.any(ArrayBuffer),
      'L1',
    );

    expect(result.uploaded).toEqual(['local-1']);
    expect(result.remoteOnly).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('syncConfig 合并进度时应过滤无对应元信息的条目', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';

      if (url.endsWith('/settings.json') && method === 'GET') {
        return createResponse(JSON.stringify({ configSyncedAt: 1 }));
      }
      if (url.endsWith('/settings.json') && method === 'PUT') {
        return createResponse('');
      }
      if (url.endsWith('/books-meta.json') && method === 'PUT') {
        return createResponse('');
      }
      if (url.endsWith('/progress.json') && method === 'GET') {
        return createResponse(
          JSON.stringify({
            orphan: { bookId: 'orphan', chapterIndex: 1, updatedAt: 2 },
          }),
        );
      }
      if (url.endsWith('/progress.json') && method === 'PUT') {
        return createResponse('');
      }
      if (url.endsWith('/deleted-books.json') && method === 'GET') {
        return createResponse('[]');
      }
      if (url.endsWith('/deleted-books.json') && method === 'PUT') {
        return createResponse('[]');
      }

      return createResponse('{}');
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await capturedActions!.syncConfig(
      'https://dav.example.com',
      'user',
      'pass',
      'web-reader',
      JSON.stringify({ configSyncedAt: 2 }),
      JSON.stringify([{ id: 'b1', title: 'B1', format: 'txt' }]),
      JSON.stringify({
        b1: { bookId: 'b1', chapterIndex: 3, updatedAt: 3 },
      }),
      '[]',
      30 * 24 * 60 * 60 * 1000,
      false,
    );

    const progressPutCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith('/progress.json') && (init?.method ?? 'GET') === 'PUT',
    );
    expect(progressPutCall).toBeTruthy();

    const mergedProgressBody = JSON.parse(String(progressPutCall![1]!.body));
    expect(mergedProgressBody).toEqual({
      b1: expect.objectContaining({ bookId: 'b1' }),
    });
    expect(mergedProgressBody.orphan).toBeUndefined();
    expect(result.progress).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
