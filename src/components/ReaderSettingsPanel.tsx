/**
 * 阅读页内嵌设置面板（字号、行高、背景色）
 */
import { type Component, Show, For } from 'solid-js';
import { settings, updateSettings, type ReaderTheme } from '~/stores/settings';

interface ReaderSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const bgPresets: { name: string; key: ReaderTheme; bg: string; text: string }[] = [
  {
    name: '默认',
    key: 'default',
    bg: 'var(--reader-bg-default)',
    text: 'var(--reader-text-default)',
  },
  { name: '护眼', key: 'warm', bg: 'var(--reader-bg-warm)', text: 'var(--reader-text-warm)' },
  { name: '绿色', key: 'green', bg: 'var(--reader-bg-green)', text: 'var(--reader-text-green)' },
  { name: '夜间', key: 'night', bg: 'var(--reader-bg-night)', text: 'var(--reader-text-night)' },
];

const panelBg = 'var(--reader-active-bg, var(--reader-bg-default))';
const panelText = 'var(--reader-active-text, var(--reader-text-default))';

const ReaderSettingsPanel: Component<ReaderSettingsPanelProps> = (props) => {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0" style={{ 'z-index': '10000' }} on:click={props.onClose}>
        <div
          class="fixed bottom-0 left-0 right-0 p-6 rounded-t-xl"
          style={{
            'z-index': '10001',
            'background-color': panelBg,
            color: panelText,
            'box-shadow': '0 -4px 12px rgba(0,0,0,0.2)',
          }}
          on:click={(e: MouseEvent) => e.stopPropagation()}
        >
          <div class="text-base font-medium mb-4">阅读设置</div>

          {/* 字号 */}
          <div class="flex items-center gap-3 mb-4">
            <span class="text-sm shrink-0 w-12" style={{ opacity: '0.7' }}>
              字号
            </span>
            <mdui-slider
              value={settings().fontSize}
              min={12}
              max={32}
              step={1}
              class="flex-1"
              on:change={(e: CustomEvent) => {
                updateSettings({ fontSize: Number((e.target as any).value) });
              }}
            />
            <span class="text-sm w-8 text-right" style={{ opacity: '0.7' }}>
              {settings().fontSize}
            </span>
          </div>

          {/* 行高 */}
          <div class="flex items-center gap-3 mb-4">
            <span class="text-sm shrink-0 w-12" style={{ opacity: '0.7' }}>
              行高
            </span>
            <mdui-slider
              value={settings().lineHeight * 10}
              min={12}
              max={30}
              step={1}
              class="flex-1"
              on:change={(e: CustomEvent) => {
                updateSettings({ lineHeight: Number((e.target as any).value) / 10 });
              }}
            />
            <span class="text-sm w-8 text-right" style={{ opacity: '0.7' }}>
              {settings().lineHeight.toFixed(1)}
            </span>
          </div>

          {/* 段距 */}
          <div class="flex items-center gap-3 mb-4">
            <span class="text-sm shrink-0 w-12" style={{ opacity: '0.7' }}>
              段距
            </span>
            <mdui-slider
              value={settings().paragraphSpacing * 10}
              min={0}
              max={30}
              step={1}
              class="flex-1"
              on:change={(e: CustomEvent) => {
                updateSettings({ paragraphSpacing: Number((e.target as any).value) / 10 });
              }}
            />
            <span class="text-sm w-8 text-right" style={{ opacity: '0.7' }}>
              {settings().paragraphSpacing.toFixed(1)}
            </span>
          </div>

          {/* 背景色预设 */}
          <div class="flex items-center gap-3">
            <span class="text-sm shrink-0 w-12" style={{ opacity: '0.7' }}>
              背景
            </span>
            <div class="flex gap-3">
              <For each={bgPresets}>
                {(preset) => (
                  <div
                    class="w-10 h-10 rounded-full border-2 cursor-pointer flex items-center justify-center text-xs"
                    style={{
                      background: preset.bg,
                      color: preset.text,
                      'border-color':
                        settings().readerTheme === preset.key ? panelText : 'transparent',
                    }}
                    title={preset.name}
                    on:click={() => {
                      updateSettings({ readerTheme: preset.key });
                    }}
                  >
                    {preset.name.charAt(0)}
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ReaderSettingsPanel;
