'use client';

import { useMemo } from 'react';
import { VendorCrest } from '@/components/character/VendorCrest';
import { DEFAULT_LANG, getDict } from '@/lib/i18n';
import { KINDS, type ModelKind } from '@/lib/kind';
import type { FilterState, Kind, Region, Weights } from './filters';
import { EMPTY_FILTER, isFilterActive } from './filters';
import type { LeanModel, LeanVendor } from './types';

/**
 * 排行榜与总表共用的筛选条。
 *
 * 全部控件都是受控的，状态由调用方持有并同步到 URL——这样两个页面的
 * `?region=east&weights=open` 是同一个意思，链接可以互相带着参数跳。
 */

interface ModelFiltersProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
  vendors: LeanVendor[];
  models: LeanModel[];
  /** 当前筛选后剩多少个模型，显示在清空按钮旁 */
  matched?: number;
}

/** 一组互斥的小按钮，像老游戏菜单里的选项卡 */
function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; text: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="mr-0.5 text-[13px] text-[var(--color-ghost)]">{label}</span>
      {options.map((o) => (
        <Chip key={o.id} pressed={o.id === value} onClick={() => onChange(o.id)} title={o.title}>
          {o.text}
        </Chip>
      ))}
    </div>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
  title,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className="border-2 border-[var(--color-ink)] px-2 py-0.5 text-[13px] leading-5"
      style={{
        background: pressed ? 'var(--color-gold)' : 'rgb(0 0 0 / 0.35)',
        color: pressed ? 'var(--color-ink)' : 'var(--color-parchment)',
        boxShadow: pressed
          ? 'inset 2px 2px 0 0 rgb(0 0 0 / 0.2)'
          : 'inset -2px -2px 0 0 rgb(0 0 0 / 0.35), inset 2px 2px 0 0 rgb(255 255 255 / 0.08)',
      }}
    >
      {children}
    </button>
  );
}

const INPUT_CLASS =
  'border-2 border-[var(--color-ink)] bg-[rgb(0_0_0/0.35)] px-2 py-0.5 text-[13px] leading-5 text-[var(--color-parchment)] outline-none focus:border-[var(--color-gold)]';

const dict = getDict(DEFAULT_LANG);

export function ModelFilters({ value, onChange, vendors, models, matched }: ModelFiltersProps) {
  // 类型按钮只列快照里真有的类型，并带上数量：读者一眼知道「视频生成」是 5 个还是 50 个。
  // 数量按全库算而不按当前筛选算——否则点了「国内」之后「语音 0」会闪来闪去。
  // 只有「含已退役」这一项会影响它：退役模型默认不在任何名单里，数进去会对不上。
  const kindOptions = useMemo(() => {
    const count = new Map<ModelKind, number>();
    let multimodal = 0;
    for (const m of models) {
      if (m.retired && !value.retired) continue;
      if (!m.kind) continue;
      count.set(m.kind, (count.get(m.kind) ?? 0) + 1);
      if (m.kind !== 'text') multimodal += 1;
    }
    const present = KINDS.filter((k) => (count.get(k) ?? 0) > 0);
    return [
      { id: 'all' as Kind, text: '全部' },
      // 「多模态」排在六个具体类型前面：它是读者最常用的问法，而且是这几类的并集
      ...(multimodal > 0
        ? [{ id: 'multimodal' as Kind, text: `${dict.kind.multimodal} ${multimodal}`, title: dict.kind.multimodalHint }]
        : []),
      ...present.map((k) => ({
        id: k as Kind,
        text: `${dict.kind.label[k]} ${count.get(k)}`,
        title: dict.kind.hint[k],
      })),
    ];
  }, [models, value.retired]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const m of models) if (m.year != null) set.add(m.year);
    return [...set].sort((a, b) => b - a);
  }, [models]);

  const vendorGroups = useMemo(() => {
    const used = new Set(models.map((m) => m.vendor));
    const list = vendors.filter((v) => used.has(v.id));
    const sortByName = (a: LeanVendor, b: LeanVendor) => a.nameZh.localeCompare(b.nameZh, 'zh-Hans-CN');
    return [
      { label: '国内', items: list.filter((v) => v.continent === 'east').sort(sortByName) },
      { label: '国外', items: list.filter((v) => v.continent === 'west').sort(sortByName) },
    ];
  }, [vendors, models]);

  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v });
  const toggleVendor = (id: string) =>
    set(
      'vendors',
      value.vendors.includes(id) ? value.vendors.filter((x) => x !== id) : [...value.vendors, id],
    );

  const active = isFilterActive(value);

  return (
    <div className="pixel-panel-dark flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <label className="flex items-center gap-1.5">
        <span className="text-[13px] text-[var(--color-ghost)]">搜索</span>
        <input
          type="search"
          value={value.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="模型名或厂商"
          aria-label="按模型名或厂商名搜索"
          className={`${INPUT_CLASS} w-36 sm:w-44`}
        />
      </label>

      <Segment<Region>
        label="地区"
        value={value.region}
        options={[
          { id: 'all', text: '全部' },
          { id: 'east', text: '国内' },
          { id: 'west', text: '国外' },
        ]}
        onChange={(v) => set('region', v)}
      />

      <Segment<Weights>
        label="开放"
        value={value.weights}
        options={[
          { id: 'all', text: '全部' },
          { id: 'open', text: '开源' },
          { id: 'closed', text: '闭源' },
        ]}
        onChange={(v) => set('weights', v)}
      />

      <Segment<Kind>
        label={dict.kind.filterLabel}
        value={value.kind}
        options={kindOptions}
        onChange={(v) => set('kind', v)}
      />

      <label className="flex items-center gap-1.5">
        <span className="text-[13px] text-[var(--color-ghost)]">年份</span>
        <select
          value={value.year ?? ''}
          onChange={(e) => set('year', e.target.value ? Number(e.target.value) : null)}
          className={INPUT_CLASS}
          aria-label="按发布年份筛选"
        >
          <option value="">不限</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      {/* 厂商多选：原生 details 做下拉，不需要额外状态，点外面收起靠浏览器自己 */}
      <details className="relative">
        <summary
          className="flex cursor-pointer list-none items-center gap-1.5 border-2 border-[var(--color-ink)] px-2 py-0.5 text-[13px] leading-5 select-none"
          style={{
            background: value.vendors.length ? 'var(--color-gold)' : 'rgb(0 0 0 / 0.35)',
            color: value.vendors.length ? 'var(--color-ink)' : 'var(--color-parchment)',
          }}
        >
          厂商{value.vendors.length ? `（${value.vendors.length}）` : ''}
          <span aria-hidden className="font-pixel text-[12px]">
            ▼
          </span>
        </summary>
        <div className="pixel-panel-dark absolute left-0 top-full z-20 mt-1 max-h-72 w-64 overflow-y-auto p-2">
          {vendorGroups.map((g) => (
            <div key={g.label} className="mb-2 last:mb-0">
              <div className="mb-1 text-[13px] text-[var(--color-ghost)]">{g.label}</div>
              <ul className="grid grid-cols-2 gap-x-2">
                {g.items.map((v) => {
                  const on = value.vendors.includes(v.id);
                  return (
                    <li key={v.id}>
                      <label className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[13px] leading-5 hover:text-[var(--color-gold)]">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleVendor(v.id)}
                          className="accent-[var(--color-gold)]"
                        />
                        <VendorCrest motif={v.motif} accentColor={v.accent} size={12} />
                        <span className="truncate" style={{ color: on ? 'var(--color-gold)' : undefined }}>
                          {v.nameZh}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {value.vendors.length > 0 && (
            <button
              type="button"
              onClick={() => set('vendors', [])}
              className="mt-1 text-[13px] text-[var(--color-ghost)] hover:text-[var(--color-gold)]"
            >
              清空厂商
            </button>
          )}
        </div>
      </details>

      <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--color-parchment)]">
        <input
          type="checkbox"
          checked={value.retired}
          onChange={(e) => set('retired', e.target.checked)}
          className="accent-[var(--color-gold)]"
        />
        含已退役
      </label>

      <span className="ml-auto flex items-center gap-3 text-[13px] text-[var(--color-ghost)]">
        {matched != null && <span>{matched} 个模型符合</span>}
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTER)}
            className="text-[var(--color-parchment)] underline decoration-dotted hover:text-[var(--color-gold)]"
          >
            清空筛选
          </button>
        )}
      </span>
    </div>
  );
}
