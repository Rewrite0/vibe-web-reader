import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestBook = {
  id: string;
  title: string;
  author: string;
  format: 'txt' | 'epub';
  fileSize: number;
  chapterCount: number;
  chapters: string[];
  addedAt: number;
  syncStatus?: 'local' | 'remote' | 'synced';
  updatedAt?: number;
};

type TestDeletion = {
  bookId: string;
  deletedAt: number;
};

const mockWorker = {
  onEvent: vi.fn(),
  ensureDirectories: vi.fn(),
  syncConfig: vi.fn(),
  syncAllBooks: vi.fn(),
  testConnection: vi.fn(),
  deleteRemoteBook: vi.fn(),
  downloadBook: vi.fn(),
  uploadBook: vi.fn(),
  listRemoteBooks: vi.fn(),
};

const mockSettings = {
  themeMode: 'auto',
  themeColor: '#6750A4',
  fontSize: 18,
  lineHeight: 1.8,
  pageAnimation: true,
  keepScreenOn: false,
  webdavUrl: 'https://dav.example.com',
  webdavUser: 'user',
  webdavPassword: 'pass',
  webdavDir: 'web-reader',
  autoSyncBooks: false,
  bookSyncInterval: 10,
  tags: [],
  readerTheme: 'default',
} as const;

let lockState = false;
let workerState: typeof mockWorker | null = null;

const mockUpdateSettings = vi.fn(async () => {});
const mockSetSyncStatus = vi.fn();
const mockSetSyncMessage = vi.fn();
const mockSetSyncLock = vi.fn((next: boolean) => {
  lockState = next;
});
const mockSetSyncPhase = vi.fn();
const mockSetSyncStats = vi.fn();
const mockSetBookSyncProgress = vi.fn();

const mockLoadBooks = vi.fn(async () => {});

const mockGetAllBooks = vi.fn<() => Promise<TestBook[]>>(async () => []);
const mockGetAllProgress = vi.fn<() => Promise<unknown[]>>(async () => []);
const mockSaveBook = vi.fn(async () => {});
const mockSaveProgress = vi.fn(async () => {});
const mockGetAllBookDeletions = vi.fn<() => Promise<TestDeletion[]>>(async () => []);
const mockSaveBookDeletion = vi.fn(async () => {});
const mockGetBookDeletion = vi.fn(async () => undefined);
const mockDeleteBook = vi.fn(async () => {});
const mockDeleteProgress = vi.fn(async () => {});
const mockGetBook = vi.fn<() => Promise<TestBook | undefined>>(async () => undefined);

const mockReadBookFile = vi.fn<() => Promise<ArrayBuffer | null>>(async () => null);
const mockBookFileExists = vi.fn<() => Promise<boolean>>(async () => false);
const mockDeleteBookFile = vi.fn(async () => {});

const mockSnackbar = vi.fn();

vi.mock('@rewrite0/typed-worker', () => ({
  createTypedWorker: vi.fn(() => mockWorker),
}));

vi.mock('~/workers/sync.worker?worker', () => ({
  default: class MockSyncWorker {},
}));

vi.mock('~/stores/settings', () => ({
  settings: () => mockSettings,
  updateSettings: mockUpdateSettings,
}));

vi.mock('~/stores/sync', () => ({
  setSyncWorker: (w: typeof mockWorker) => {
    workerState = w;
  },
  getSyncWorker: () => workerState,
  setSyncStatus: mockSetSyncStatus,
  setSyncMessage: mockSetSyncMessage,
  syncLock: () => lockState,
  setSyncLock: mockSetSyncLock,
  setSyncPhase: mockSetSyncPhase,
  setSyncStats: mockSetSyncStats,
  setBookSyncProgress: mockSetBookSyncProgress,
}));

vi.mock('~/stores/books', () => ({
  loadBooks: mockLoadBooks,
}));

vi.mock('~/utils/bookDB', () => ({
  getAllBooks: mockGetAllBooks,
  getAllProgress: mockGetAllProgress,
  saveBook: mockSaveBook,
  saveProgress: mockSaveProgress,
  getAllBookDeletions: mockGetAllBookDeletions,
  saveBookDeletion: mockSaveBookDeletion,
  getBookDeletion: mockGetBookDeletion,
  deleteBook: mockDeleteBook,
  deleteProgress: mockDeleteProgress,
  getBook: mockGetBook,
}));

vi.mock('~/utils/bookStorage', () => ({
  readBookFile: mockReadBookFile,
  bookFileExists: mockBookFileExists,
  deleteBookFile: mockDeleteBookFile,
}));

vi.mock('mdui', () => ({
  snackbar: mockSnackbar,
}));

async function loadSyncService() {
  return await import('~/services/syncService');
}

function makeBook(id: string, syncStatus: 'local' | 'remote' | 'synced' = 'local'): TestBook {
  return {
    id,
    title: `Book-${id}`,
    author: 'Author',
    format: 'txt' as const,
    fileSize: 1,
    chapterCount: 1,
    chapters: ['chapter'],
    addedAt: 1,
    syncStatus,
    updatedAt: 1,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  lockState = false;
  workerState = null;

  mockWorker.ensureDirectories.mockResolvedValue(true);
  mockWorker.syncConfig.mockResolvedValue({ direction: 'none' });
  mockWorker.syncAllBooks.mockResolvedValue({ uploaded: [], remoteOnly: [], errors: [] });

  mockGetAllBooks.mockResolvedValue([]);
  mockGetAllProgress.mockResolvedValue([]);
  mockGetAllBookDeletions.mockResolvedValue([]);
  mockGetBookDeletion.mockResolvedValue(undefined);
  mockGetBook.mockResolvedValue(undefined);
  mockReadBookFile.mockResolvedValue(null);
  mockBookFileExists.mockResolvedValue(false);
});

describe('syncService', () => {
  it('recordBookDeletion 应写入墓碑并触发配置同步', async () => {
    const syncService = await loadSyncService();
    syncService.initSyncWorker();

    await syncService.recordBookDeletion({
      id: 'b1',
      format: 'txt',
      title: 'Delete-Me',
    });

    expect(mockSaveBookDeletion).toHaveBeenCalledTimes(1);
    expect(mockSaveBookDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: 'b1',
        format: 'txt',
        title: 'Delete-Me',
      }),
    );
    expect(mockWorker.ensureDirectories).toHaveBeenCalledTimes(1);
    expect(mockWorker.syncConfig).toHaveBeenCalledTimes(1);
  });

  it('full 同步在有上传时会二次触发配置同步', async () => {
    const syncService = await loadSyncService();
    syncService.initSyncWorker();

    mockGetAllBooks.mockResolvedValue([makeBook('b1', 'local')]);
    mockReadBookFile.mockResolvedValue(new ArrayBuffer(8));
    mockWorker.syncAllBooks.mockResolvedValue({ uploaded: ['b1'], remoteOnly: [], errors: [] });

    await syncService.doManualSync();

    expect(mockWorker.syncAllBooks).toHaveBeenCalledTimes(1);
    expect(mockWorker.syncConfig).toHaveBeenCalledTimes(2);
  });

  it('配置同步返回删除墓碑时应删除本地数据并提示', async () => {
    const syncService = await loadSyncService();
    syncService.initSyncWorker();

    mockWorker.syncConfig.mockResolvedValue({
      direction: 'none',
      deletions: JSON.stringify([{ bookId: 'b1', deletedAt: Date.now() }]),
    });
    mockGetBook.mockResolvedValue(makeBook('b1'));

    await syncService.doConfigSync();

    expect(mockDeleteBookFile).toHaveBeenCalledWith('b1');
    expect(mockDeleteBook).toHaveBeenCalledWith('b1');
    expect(mockDeleteProgress).toHaveBeenCalledWith('b1');
    expect(mockSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('已同步其他设备删除'),
      }),
    );
  });

  it('配置同步只上传 TTL 内的本地墓碑', async () => {
    const syncService = await loadSyncService();
    syncService.initSyncWorker();

    vi.useFakeTimers();
    const now = new Date('2026-03-22T00:00:00.000Z');
    vi.setSystemTime(now);

    const ttlMs = 30 * 24 * 60 * 60 * 1000;
    mockGetAllBookDeletions.mockResolvedValue([
      { bookId: 'old', deletedAt: now.getTime() - ttlMs - 1 },
      { bookId: 'fresh', deletedAt: now.getTime() - 1000 },
    ]);

    await syncService.doConfigSync();

    const call = mockWorker.syncConfig.mock.calls[0];
    const sentDeletions = JSON.parse(call[7] as string);
    const sentTtl = call[8];

    expect(sentDeletions).toEqual([{ bookId: 'fresh', deletedAt: now.getTime() - 1000 }]);
    expect(sentTtl).toBe(ttlMs);

    vi.useRealTimers();
  });

  it('本地未同步过时应带 configSyncedAt=0，避免覆盖远程', async () => {
    const syncService = await loadSyncService();
    syncService.initSyncWorker();

    await syncService.doConfigSync();

    const call = mockWorker.syncConfig.mock.calls[0];
    const sentConfig = JSON.parse(call[4] as string);
    expect(sentConfig.configSyncedAt).toBe(0);
  });

  it('拉取远程元信息时，本地无文件应标记为 remote', async () => {
    const syncService = await loadSyncService();
    syncService.initSyncWorker();

    mockWorker.syncConfig.mockResolvedValue({
      direction: 'pulled',
      meta: JSON.stringify([
        {
          ...makeBook('b1', 'local'),
          syncStatus: 'local',
        },
      ]),
    });
    mockBookFileExists.mockResolvedValue(false);

    await syncService.doConfigSync();

    expect(mockSaveBook).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'b1',
        syncStatus: 'remote',
      }),
    );
  });

  it('配置同步前应清理无对应书籍元信息的孤儿进度', async () => {
    const syncService = await loadSyncService();
    syncService.initSyncWorker();

    mockGetAllBooks.mockResolvedValue([makeBook('b1', 'local')]);
    mockGetAllProgress.mockResolvedValue([
      { bookId: 'b1', chapterIndex: 1, scrollPercent: 0, overallPercent: 10, updatedAt: 1 },
      { bookId: 'orphan', chapterIndex: 2, scrollPercent: 0, overallPercent: 20, updatedAt: 2 },
    ]);

    await syncService.doConfigSync();

    expect(mockDeleteProgress).toHaveBeenCalledWith('orphan');

    const call = mockWorker.syncConfig.mock.calls[0];
    const sentProgress = JSON.parse(call[6] as string);
    expect(sentProgress).toEqual({
      b1: expect.objectContaining({ bookId: 'b1' }),
    });
    expect(sentProgress.orphan).toBeUndefined();
  });
});
