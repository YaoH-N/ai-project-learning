import { CRESTS } from '@/data/crests';
import { VENDOR_REGISTRY, profileFor } from '@/data/vendor-registry';
import { VendorCrest } from '@/components/character/VendorCrest';

export const metadata = { title: '家徽校对表', robots: { index: false } };

/**
 * 家徽校对表。
 *
 * 12×12 的像素纹章画在字符网格里，肉眼看代码是看不出像不像的，
 * 必须渲染成大图逐个校对。这一页也方便后来者新增家徽时对照现有风格。
 */
export default function CrestQAPage() {
  const motifToVendors = new Map<string, string[]>();
  for (const [id, profile] of Object.entries(VENDOR_REGISTRY)) {
    const list = motifToVendors.get(profile.motif);
    if (list) list.push(id);
    else motifToVendors.set(profile.motif, [id]);
  }

  return (
    <main className="min-h-dvh bg-[var(--color-dusk)] p-8">
      <h1 className="pixel-outline mb-2 text-2xl">家徽校对表</h1>
      <p className="mb-8 text-xs text-[var(--color-ghost)]">
        共 {Object.keys(CRESTS).length} 枚。未收录厂商一律回落到 wanderer。
      </p>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {Object.keys(CRESTS).map((motif) => {
          const vendors = motifToVendors.get(motif) ?? [];
          const accent = vendors[0] ? profileFor(vendors[0]).accentColor : '#8a8a8a';
          return (
            <div key={motif} className="pixel-panel-dark flex flex-col items-center gap-3 p-4">
              <VendorCrest motif={motif} accentColor={accent} size={96} />
              <div className="text-center">
                <div className="text-xs text-[var(--color-parchment)]">{motif}</div>
                <div className="mt-1 text-[12px] text-[var(--color-ghost)]">
                  {vendors.length > 0
                    ? vendors.map((v) => profileFor(v).nameZh).join('、')
                    : '未绑定厂商'}
                </div>
              </div>
              {/* 同时看一眼实际使用的小尺寸，确认缩小后还认得出 */}
              <div className="flex items-center gap-2 border-t border-white/10 pt-2">
                <VendorCrest motif={motif} accentColor={accent} size={24} />
                <VendorCrest motif={motif} accentColor={accent} size={12} />
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
