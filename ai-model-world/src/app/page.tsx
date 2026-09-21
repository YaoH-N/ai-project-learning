import { Sky } from '@/components/world/Sky';
import { GroundBackdrop, HorizonEdge } from '@/components/world/Ground';
import { Plaza } from '@/components/world/Plaza';
import { SiteNav } from '@/components/world/SiteNav';
import { DEFAULT_LANG, getDict } from '@/lib/i18n';
import { isSampleData, loadSnapshot } from '@/lib/snapshot';
import { buildPlazaRoster } from '@/lib/roster';
import { listSpriteSlugs, spriteOverlaysBaked } from '@/lib/sprites-available';
import { canonicalVendorId, VENDOR_REGISTRY } from '@/data/vendor-registry';
import { attributionFor, loadAttribution } from '@/lib/attribution';
import { buildChampions } from '@/lib/champions';
import { ChampionRow } from '@/components/world/ChampionRow';
import { buildKindGroups } from '@/lib/kind';
import { KindRow } from '@/components/world/KindRow';
import { PageJump } from '@/components/world/PageJump';

export default function Page() {
  const dict = getDict(DEFAULT_LANG);
  const snapshot = loadSnapshot();
  const now = new Date(snapshot.generatedAt);
  const registryHas = (id: string) => canonicalVendorId(id) in VENDOR_REGISTRY;
  const rosters = buildPlazaRoster(snapshot.models, snapshot.vendors, now, registryHas);
  const spriteSlugs = listSpriteSlugs();
  const champions = buildChampions(snapshot.models, snapshot.vendors, now, registryHas);
  const kindGroups = buildKindGroups(snapshot.models, now, registryHas);

  const alive = snapshot.models.filter((m) => !m.retiredAt).length;
  const updated = `${now.getUTCMonth() + 1} 月 ${now.getUTCDate()} 日`;

  const attribution = loadAttribution();
  const proIsThirdParty = (id: string) =>
    attributionFor(attribution, id, 'swe_bench_pro')?.attributionType === 'third-party';

  return (
    <main className="flex min-h-dvh flex-col">
      {/*
        地平线带。刻意压得很窄——早先这里是半屏高的标题海报，
        进站第一眼看到的是一张封面而不是一个世界，那是错的。
        站名与导航做成 HUD 叠在天空上；站名下面只放一行状态（更新时间、规模），
        不放任何自我介绍——用户是来看格局的，不是来听站点自述的。
      */}
      <header className="relative min-h-[124px] shrink-0 pb-2">
        <Sky skylineHeight="clamp(48px, 8vh, 78px)" />
        {/* page-shell：与下面的正文用同一个壳，否则宽屏上导航贴着屏幕边、内容却是居中的 */}
        <div className="page-shell relative flex flex-wrap items-start justify-between gap-x-3 gap-y-2 pt-3">
          <div>
            {/* pixel-outline 的描边会溢出行盒，leading 必须留出余量否则顶部会被裁掉 */}
            <h1 className="pixel-outline font-pixel text-xl leading-[1.4] sm:text-2xl">
              {dict.siteName}
            </h1>
            {/*
              状态行做成一枚仪器读数：细边框 + 半透底 + 等宽像素字 + 一颗呼吸的青灯。
              比一行裸文字更像「这台机器正在联机」，而它压在天空上，也需要一层底色才读得清。
            */}
            <p
              className="mt-1.5 inline-flex items-center gap-1.5 border px-2 py-0.5 font-pixel text-[12px] text-[var(--color-parchment)]"
              style={{
                borderColor: 'rgb(98 182 224 / 0.45)',
                background: 'rgb(13 16 23 / 0.55)',
                boxShadow: 'inset 0 0 12px rgb(98 182 224 / 0.12)',
              }}
            >
              <span
                className="inline-block h-2 w-2 animate-pulse"
                style={{ background: 'var(--color-west)', boxShadow: '0 0 6px var(--color-west)' }}
                aria-hidden
              />
              {dict.hud.updatedAt(updated)} · {dict.hud.modelCount(alive, snapshot.vendors.length)}
            </p>
          </div>
          <SiteNav current="plaza" lang={DEFAULT_LANG} />
        </div>
      </header>

      <HorizonEdge />

      <div className="relative flex-1">
        <GroundBackdrop />
        <div className="page-shell relative py-5">
          {isSampleData(snapshot) && (
            <p className="pixel-panel mb-6 px-4 py-3 text-[13px] text-[var(--color-ink)]">
              当前显示的是本地样本数据。运行{' '}
              <code className="bg-[var(--color-parchment-dim)] px-1">npm run sync</code>{' '}
              获取真实数据。
            </p>
          )}

          {/*
            本页导航。四个锚点，读者从顶栏往下扫的第一眼就知道这页有什么、
            以及怎么一步跳到国内那一段。它取代了原先浮在广场顶上的分区标签栏——
            那个是筛选器（点「国内」会把国外藏起来），而读者要的只是「带我过去」。
          */}
          <PageJump
            targets={[
              { href: '#section-champions', label: dict.champions.title, accent: 'var(--color-gold)' },
              { href: '#section-kinds', label: dict.kind.sectionTitle, accent: 'var(--color-dawn)' },
              ...rosters.map((r) => ({
                href: `#region-${r.continent}`,
                label: dict.continent[r.continent],
                accent: r.continent === 'west' ? 'var(--color-west)' : 'var(--color-east)',
                count: r.entries.length,
              })),
            ]}
          />

          {/* 首屏先给结论：今日格局。它取代了早先那条教用户读图的图例。 */}
          <div className="mb-6">
            <ChampionRow champions={champions} lang={DEFAULT_LANG} spriteSlugs={spriteSlugs} />
          </div>

          {/*
            按类型看：文本 / 视觉 / 全模态 / 图像生成 / 视频生成 / 语音。
            放在格局之后、广场之前——广场只住对话模型，出图、出视频、出声音的
            在这里才看得见；也是从首页按类型钻进总表的入口。
          */}
          <div className="mb-6">
            <KindRow groups={kindGroups} lang={DEFAULT_LANG} spriteSlugs={spriteSlugs} />
          </div>

          <Plaza
            rosters={rosters}
            allModels={snapshot.models}
            vendors={snapshot.vendors}
            lang={DEFAULT_LANG}
            spriteSlugs={spriteSlugs}
            now={now}
            proIsThirdParty={proIsThirdParty}
            overlaysNeeded={!spriteOverlaysBaked()}
          />
        </div>
      </div>
    </main>
  );
}
