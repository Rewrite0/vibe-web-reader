import { describe, expect, it } from 'vitest';

import { parseTxt } from '~/utils/parser';

describe('parseTxt', () => {
  it('支持按【番外】标题拆分章节', () => {
    const text = [
      '【番外】清潭旧梦舞飞绫（1）',
      '第一段内容',
      '',
      '【番外】清潭旧梦舞飞绫（2）',
      '第二段内容',
    ].join('\n');

    const parsed = parseTxt(text, 'demo.txt');

    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0].title).toBe('【番外】清潭旧梦舞飞绫（1）');
    expect(parsed.chapters[1].title).toBe('【番外】清潭旧梦舞飞绫（2）');
  });

  it('番外标题末尾无编号时也应拆分章节', () => {
    const text = ['【番外】清潭旧梦舞飞绫', '第一段内容', '', '番外 风起青萍', '第二段内容'].join(
      '\n',
    );

    const parsed = parseTxt(text, 'demo-no-index.txt');

    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0].title).toBe('【番外】清潭旧梦舞飞绫');
    expect(parsed.chapters[1].title).toBe('番外 风起青萍');
  });
});
