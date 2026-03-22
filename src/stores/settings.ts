/**
 * 全局设置状态管理
 */
import { createSignal, createEffect } from 'solid-js';
import { createStore as createIdbStore, get, set } from 'idb-keyval';

const settingsStore = createIdbStore('settings-db', 'settings');

/** 深色模式选项 */
export type ThemeMode = 'light' | 'dark' | 'auto';

/** 阅读背景预设 key */
export type ReaderTheme = 'default' | 'warm' | 'green' | 'night';

export interface AppSettings {
  /** 主题模式 */
  themeMode: ThemeMode;
  /** 主题色 HEX */
  themeColor: string;
  /** 默认字号 */
  fontSize: number;
  /** 默认行高 */
  lineHeight: number;
  /** 默认段落间距（em） */
  paragraphSpacing: number;
  /** 翻页动画 */
  pageAnimation: boolean;
  /** 屏幕常亮 */
  keepScreenOn: boolean;
  /** WebDAV 地址 */
  webdavUrl: string;
  /** WebDAV 用户名 */
  webdavUser: string;
  /** WebDAV 密码 */
  webdavPassword: string;
  /** WebDAV 存储目录（默认 web-reader） */
  webdavDir: string;
  /** 自动同步书籍文件 */
  autoSyncBooks: boolean;
  /** 书籍同步间隔（分钟） */
  bookSyncInterval: number;
  /** 上次配置同步时间戳 */
  configSyncedAt?: number;
  /** 用户自定义标签列表 */
  tags: string[];
  /** 阅读背景预设 */
  readerTheme: ReaderTheme;
}

const defaultSettings: AppSettings = {
  themeMode: 'auto',
  themeColor: '#6750A4',
  fontSize: 18,
  lineHeight: 1.8,
  paragraphSpacing: 1,
  pageAnimation: true,
  keepScreenOn: false,
  webdavUrl: '',
  webdavUser: '',
  webdavPassword: '',
  webdavDir: 'web-reader',
  autoSyncBooks: false,
  bookSyncInterval: 10,
  tags: [],
  readerTheme: 'default',
};

const [settings, setSettingsSignal] = createSignal<AppSettings>({ ...defaultSettings });

/** 从 IndexedDB 加载设置 */
export async function loadSettings(): Promise<void> {
  const saved = await get<Partial<AppSettings>>('app-settings', settingsStore);
  if (saved) {
    setSettingsSignal({ ...defaultSettings, ...saved });
  }
  applyTheme(settings());
}

/** 更新设置（合并更新） */
export async function updateSettings(partial: Partial<AppSettings>): Promise<void> {
  const next = { ...settings(), ...partial };
  setSettingsSignal(next);
  await set('app-settings', next, settingsStore);
  applyTheme(next);
}

/** 恢复默认设置 */
export async function resetSettings(): Promise<void> {
  const next = { ...defaultSettings };
  setSettingsSignal(next);
  await set('app-settings', next, settingsStore);
  applyTheme(next);
}

/** 阅读背景预设映射 */
const readerThemeMap: Record<ReaderTheme, { bg: string; text: string }> = {
  default: { bg: 'var(--reader-bg-default)', text: 'var(--reader-text-default)' },
  warm: { bg: 'var(--reader-bg-warm)', text: 'var(--reader-text-warm)' },
  green: { bg: 'var(--reader-bg-green)', text: 'var(--reader-text-green)' },
  night: { bg: 'var(--reader-bg-night)', text: 'var(--reader-text-night)' },
};

/** 应用主题到 DOM */
function applyTheme(s: AppSettings): void {
  const html = document.documentElement;
  // 深色模式
  html.classList.remove('mdui-theme-light', 'mdui-theme-dark', 'mdui-theme-auto');
  if (s.themeMode === 'auto') {
    html.classList.add('mdui-theme-auto');
  } else if (s.themeMode === 'dark') {
    html.classList.add('mdui-theme-dark');
  } else {
    html.classList.add('mdui-theme-light');
  }
  // 主题色
  import('mdui').then(({ setColorScheme }) => {
    setColorScheme(s.themeColor);
  });
  // 阅读背景
  const theme = readerThemeMap[s.readerTheme] ?? readerThemeMap.default;
  html.style.setProperty('--reader-active-bg', theme.bg);
  html.style.setProperty('--reader-active-text', theme.text);
}

export { settings };
