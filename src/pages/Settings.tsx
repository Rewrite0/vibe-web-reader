/**
 * 设置页面
 */
import { type Component, createSignal, Show } from 'solid-js';
import { settings, updateSettings, resetSettings, type ThemeMode } from '~/stores/settings';
import { syncStatus, syncLock } from '~/stores/sync';
import {
  doManualSync,
  doInitialSync,
  isWebDAVConfigured,
  cleanupSync,
} from '~/services/syncService';
import { getSyncWorker } from '~/stores/sync';
import { clearAllBookData } from '~/utils/bookDB';
import { clearAllBookFiles } from '~/utils/bookStorage';
import { loadBooks } from '~/stores/books';
import { showSnackbar } from '~/utils/snackbar';

const themeColors = [
  '#6750A4',
  '#0061A4',
  '#006E1C',
  '#9C4146',
  '#7D5700',
  '#006874',
  '#984061',
  '#4A6267',
];

const Settings: Component = () => {
  const [testingSync, setTestingSync] = createSignal(false);
  const [resettingAll, setResettingAll] = createSignal(false);
  const [factoryResetting, setFactoryResetting] = createSignal(false);

  const handleThemeModeChange = (mode: ThemeMode) => {
    updateSettings({ themeMode: mode });
  };

  const handleTestSync = async () => {
    const { webdavUrl, webdavUser, webdavPassword } = settings();
    if (!webdavUrl) {
      showSnackbar({ message: '请先填写 WebDAV 地址', placement: 'bottom' });
      return;
    }
    setTestingSync(true);
    try {
      const worker = getSyncWorker();
      if (worker) {
        const ok = await worker.testConnection(webdavUrl, webdavUser, webdavPassword);
        if (ok) {
          showSnackbar({ message: '连接成功', placement: 'bottom' });
          // 如果是首次配置，执行初始同步
          if (!settings().configSyncedAt) {
            await doInitialSync();
          }
        } else {
          showSnackbar({ message: '连接失败', placement: 'bottom' });
        }
      } else {
        // fallback: 直接 fetch
        const response = await fetch(webdavUrl, {
          method: 'OPTIONS',
          headers: {
            Authorization: 'Basic ' + btoa(`${webdavUser}:${webdavPassword}`),
          },
        });
        if (response.ok) {
          showSnackbar({ message: '连接成功', placement: 'bottom' });
          if (!settings().configSyncedAt) {
            await doInitialSync();
          }
        } else {
          showSnackbar({ message: `连接失败: ${response.status}`, placement: 'bottom' });
        }
      }
    } catch (err) {
      showSnackbar({ message: `连接失败: ${(err as Error).message}`, placement: 'bottom' });
    } finally {
      setTestingSync(false);
    }
  };

  const clearRuntimeCaches = async () => {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  };

  const handleClearCache = async () => {
    await clearRuntimeCaches();
    showSnackbar({ message: '缓存已清除', placement: 'bottom' });
  };

  const handleFactoryReset = async () => {
    if (factoryResetting()) return;

    const confirmed = window.confirm(
      '确认恢复出厂设置吗？将清空本地书籍、阅读进度、标签与设置，并清除缓存。此操作不可恢复。',
    );
    if (!confirmed) return;

    setFactoryResetting(true);
    try {
      cleanupSync();
      await Promise.all([
        clearAllBookFiles(),
        clearAllBookData(),
        resetSettings(),
        clearRuntimeCaches(),
      ]);
      await loadBooks();

      showSnackbar({ message: '应用数据已清空，正在刷新页面', placement: 'bottom' });
      window.setTimeout(() => window.location.reload(), 250);
    } catch (err) {
      showSnackbar({ message: `恢复失败: ${(err as Error).message}`, placement: 'bottom' });
      setFactoryResetting(false);
    }
  };

  const handleResetAllData = async () => {
    if (resettingAll()) return;

    const confirmed = window.confirm(
      '确认一键清空本地与 WebDAV 的全部书籍和同步数据吗？此操作不可恢复。',
    );
    if (!confirmed) return;

    setResettingAll(true);
    try {
      const worker = getSyncWorker();
      const hasWebDAV = isWebDAVConfigured() && !!worker;
      let remoteDeleted = 0;
      let remoteErrors = 0;

      if (hasWebDAV && worker) {
        const { webdavUrl, webdavUser, webdavPassword, webdavDir } = settings();
        const result = await worker.clearRemoteBooks(
          webdavUrl,
          webdavUser,
          webdavPassword,
          webdavDir || 'web-reader',
        );
        remoteDeleted = result.deleted;
        remoteErrors = result.errors;
      }

      await Promise.all([clearAllBookFiles(), clearAllBookData()]);
      await updateSettings({ configSyncedAt: undefined });
      await loadBooks();

      if (hasWebDAV) {
        showSnackbar({
          message:
            remoteErrors > 0
              ? `已清空本地数据；WebDAV 删除 ${remoteDeleted} 本，${remoteErrors} 项失败`
              : `已清空本地与 WebDAV 数据（WebDAV 删除 ${remoteDeleted} 本）`,
          placement: 'bottom',
        });
      } else {
        showSnackbar({
          message: '已清空本地数据（未配置 WebDAV，已跳过远程）',
          placement: 'bottom',
        });
      }
    } catch (err) {
      showSnackbar({ message: `清空失败: ${(err as Error).message}`, placement: 'bottom' });
    } finally {
      setResettingAll(false);
    }
  };

  const lastSyncedText = () => {
    const t = settings().configSyncedAt;
    if (!t) return '从未同步';
    return new Date(t).toLocaleString();
  };

  return (
    <div class="p-4 max-w-2xl mx-auto">
      {/* 外观设置 */}
      <SectionTitle>外观设置</SectionTitle>
      <mdui-list>
        {/* 深色模式 */}
        <mdui-list-item headline="深色模式" description={themeModeLabel(settings().themeMode)}>
          <mdui-segmented-button-group
            slot="end-icon"
            value={settings().themeMode}
            selects="single"
            on:change={(e: CustomEvent) => {
              handleThemeModeChange((e.target as any).value as ThemeMode);
            }}
          >
            <mdui-segmented-button value="light" icon="light_mode" />
            <mdui-segmented-button value="dark" icon="dark_mode" />
            <mdui-segmented-button value="auto" icon="brightness_auto" />
          </mdui-segmented-button-group>
        </mdui-list-item>

        {/* 主题色 */}
        <mdui-list-item headline="主题色" nonclickable>
          <div class="flex gap-3 flex-wrap mt-2">
            {themeColors.map((color) => (
              <div
                class="w-9 h-9 rounded-full cursor-pointer flex items-center justify-center"
                style={{ background: color }}
                on:click={() => updateSettings({ themeColor: color })}
              >
                <Show when={settings().themeColor === color}>
                  <mdui-icon name="check" style={{ color: '#fff', 'font-size': '18px' }} />
                </Show>
              </div>
            ))}
          </div>
        </mdui-list-item>
      </mdui-list>

      {/* 阅读设置 */}
      <SectionTitle>阅读设置</SectionTitle>
      <mdui-list>
        <mdui-list-item headline="默认字号" description={`${settings().fontSize}px`}>
          <mdui-slider
            slot="end-icon"
            value={settings().fontSize}
            min={12}
            max={32}
            step={1}
            style={{ width: '120px' }}
            on:change={(e: CustomEvent) => {
              updateSettings({ fontSize: Number((e.target as any).value) });
            }}
          />
        </mdui-list-item>

        <mdui-list-item headline="默认行高" description={settings().lineHeight.toFixed(1)}>
          <mdui-slider
            slot="end-icon"
            value={settings().lineHeight * 10}
            min={12}
            max={30}
            step={1}
            style={{ width: '120px' }}
            on:change={(e: CustomEvent) => {
              updateSettings({ lineHeight: Number((e.target as any).value) / 10 });
            }}
          />
        </mdui-list-item>

        <mdui-list-item
          headline="默认段距"
          description={`${settings().paragraphSpacing.toFixed(1)}em`}
        >
          <mdui-slider
            slot="end-icon"
            value={settings().paragraphSpacing * 10}
            min={0}
            max={30}
            step={1}
            style={{ width: '120px' }}
            on:change={(e: CustomEvent) => {
              updateSettings({ paragraphSpacing: Number((e.target as any).value) / 10 });
            }}
          />
        </mdui-list-item>

        <mdui-list-item headline="翻页动画">
          <mdui-switch
            slot="end-icon"
            checked={settings().pageAnimation || undefined}
            on:change={(e: CustomEvent) => {
              updateSettings({ pageAnimation: (e.target as any).checked });
            }}
          />
        </mdui-list-item>

        <mdui-list-item headline="屏幕常亮">
          <mdui-switch
            slot="end-icon"
            checked={settings().keepScreenOn || undefined}
            on:change={(e: CustomEvent) => {
              updateSettings({ keepScreenOn: (e.target as any).checked });
            }}
          />
        </mdui-list-item>
      </mdui-list>

      {/* 同步设置 */}
      <SectionTitle>同步设置</SectionTitle>
      <mdui-list>
        <mdui-list-item nonclickable>
          <mdui-text-field
            variant="outlined"
            label="WebDAV 地址"
            placeholder="https://dav.example.com/"
            value={settings().webdavUrl}
            on:change={(e: Event) => {
              updateSettings({ webdavUrl: (e.target as HTMLInputElement).value });
            }}
            class="w-full"
          />
        </mdui-list-item>

        <mdui-list-item nonclickable>
          <mdui-text-field
            variant="outlined"
            label="用户名"
            value={settings().webdavUser}
            on:change={(e: Event) => {
              updateSettings({ webdavUser: (e.target as HTMLInputElement).value });
            }}
            class="w-full"
          />
        </mdui-list-item>

        <mdui-list-item nonclickable>
          <mdui-text-field
            variant="outlined"
            label="密码"
            type="password"
            value={settings().webdavPassword}
            on:change={(e: Event) => {
              updateSettings({ webdavPassword: (e.target as HTMLInputElement).value });
            }}
            class="w-full"
          />
        </mdui-list-item>

        <mdui-list-item nonclickable>
          <mdui-text-field
            variant="outlined"
            label="存储目录"
            placeholder="web-reader"
            value={settings().webdavDir}
            on:change={(e: Event) => {
              updateSettings({ webdavDir: (e.target as HTMLInputElement).value });
            }}
            class="w-full"
            helper="WebDAV 上的存储目录名，默认为 web-reader"
          />
        </mdui-list-item>

        <mdui-list-item nonclickable>
          <div class="flex gap-2 w-full">
            <mdui-button
              variant="tonal"
              on:click={handleTestSync}
              loading={testingSync() || undefined}
              class="flex-1"
            >
              测试连接
            </mdui-button>
            <mdui-button
              variant="filled"
              on:click={() => doManualSync()}
              disabled={syncLock() || !isWebDAVConfigured() || undefined}
              loading={syncLock() || undefined}
              class="flex-1"
            >
              <mdui-icon slot="icon" name="sync" />
              手动同步
            </mdui-button>
          </div>
        </mdui-list-item>

        {/* 同步状态信息 */}
        <Show when={isWebDAVConfigured()}>
          <mdui-list-item
            headline="同步状态"
            description={`${syncStatusLabel(syncStatus())} · 上次同步: ${lastSyncedText()}`}
            nonclickable
          >
            <mdui-icon
              slot="icon"
              name={
                syncStatus() === 'connected'
                  ? 'cloud_done'
                  : syncStatus() === 'error'
                    ? 'cloud_off'
                    : 'cloud_sync'
              }
              style={{
                color:
                  syncStatus() === 'error'
                    ? 'var(--mdui-color-error)'
                    : 'var(--mdui-color-on-surface-variant)',
              }}
            />
          </mdui-list-item>
        </Show>

        {/* 冲突提示 */}
        <Show when={isWebDAVConfigured()}>
          <mdui-list-item nonclickable>
            <div
              class="text-xs px-2 py-2 rounded"
              style={{
                color: 'var(--mdui-color-on-surface-variant)',
                background: 'var(--mdui-color-surface-variant)',
              }}
            >
              首次同步将使用远程配置覆盖本地。之后按修改时间自动合并，较新的数据覆盖较旧的。
            </div>
          </mdui-list-item>
        </Show>

        <mdui-list-item headline="自动同步书籍" description="定时将书籍文件备份到 WebDAV">
          <mdui-switch
            slot="end-icon"
            checked={settings().autoSyncBooks || undefined}
            on:change={(e: CustomEvent) => {
              updateSettings({ autoSyncBooks: (e.target as any).checked });
            }}
          />
        </mdui-list-item>

        <Show when={settings().autoSyncBooks}>
          <mdui-list-item
            headline="书籍同步间隔"
            description={`每 ${settings().bookSyncInterval} 分钟`}
          >
            <mdui-slider
              slot="end-icon"
              value={settings().bookSyncInterval}
              min={5}
              max={120}
              step={5}
              style={{ width: '120px' }}
              on:change={(e: CustomEvent) => {
                updateSettings({ bookSyncInterval: Number((e.target as any).value) });
              }}
            />
          </mdui-list-item>
        </Show>
      </mdui-list>

      {/* 存储管理 */}
      <SectionTitle>存储管理</SectionTitle>
      <mdui-list>
        <mdui-list-item
          headline="清除缓存"
          description="清除 Service Worker 缓存"
          on:click={handleClearCache}
        />
        <mdui-list-item nonclickable>
          <div class="w-full flex flex-col gap-2">
            <div class="text-sm" style={{ color: 'var(--mdui-color-error)' }}>
              恢复出厂设置
            </div>
            <div class="text-xs" style={{ color: 'var(--mdui-color-on-surface-variant)' }}>
              仅清空当前应用本地数据（书籍、进度、标签与设置），不会删除 WebDAV 远程数据
            </div>
            <mdui-button
              variant="outlined"
              loading={factoryResetting() || undefined}
              disabled={factoryResetting() || syncLock() || undefined}
              on:click={handleFactoryReset}
              style={{
                color: 'var(--mdui-color-error)',
                'border-color': 'var(--mdui-color-error)',
              }}
            >
              <mdui-icon slot="icon" name="factory" />
              恢复出厂设置（清空当前应用数据）
            </mdui-button>
          </div>
        </mdui-list-item>
        <Show when={import.meta.env.DEV}>
          <mdui-list-item nonclickable>
            <div class="w-full flex flex-col gap-2">
              <div class="text-sm" style={{ color: 'var(--mdui-color-error)' }}>
                开发模式一键还原
              </div>
              <mdui-button
                variant="outlined"
                loading={resettingAll() || undefined}
                disabled={resettingAll() || undefined}
                on:click={handleResetAllData}
                style={{
                  color: 'var(--mdui-color-error)',
                  'border-color': 'var(--mdui-color-error)',
                }}
              >
                <mdui-icon slot="icon" name="delete_forever" />
                一键清空本地 + WebDAV 全部书籍数据
              </mdui-button>
            </div>
          </mdui-list-item>
        </Show>
      </mdui-list>

      {/* 关于 */}
      <SectionTitle>关于</SectionTitle>
      <mdui-list>
        <mdui-list-item headline="Web Reader" description={`v${__APP_VERSION__}`} nonclickable />
        <mdui-list-item
          headline="GitHub"
          description="Rewrite0/vibe-web-reader"
          href="https://github.com/Rewrite0/vibe-web-reader"
          target="_blank"
        >
          <mdui-icon slot="end-icon" name="open_in_new" />
        </mdui-list-item>
      </mdui-list>

      <div style={{ height: '32px' }} />
    </div>
  );
};

const SectionTitle: Component<{ children: string }> = (props) => (
  <div class="text-sm font-medium mt-6 mb-2 px-4" style={{ color: 'var(--mdui-color-primary)' }}>
    {props.children}
  </div>
);

function themeModeLabel(mode: ThemeMode): string {
  switch (mode) {
    case 'light':
      return '浅色';
    case 'dark':
      return '深色';
    case 'auto':
      return '跟随系统';
  }
}

function syncStatusLabel(status: string): string {
  switch (status) {
    case 'connected':
      return '已连接';
    case 'syncing':
      return '同步中';
    case 'error':
      return '同步出错';
    default:
      return '未连接';
  }
}

export default Settings;
