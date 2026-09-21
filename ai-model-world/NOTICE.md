# 第三方素材、字体与数据的许可与署名

`LICENSE`（MIT）只覆盖**本项目自研的代码与文档**：`src/`、`scripts/`、`docs/`、
根目录的配置文件，以及由它们确定性生成的构建产物。

**它不覆盖下面这些目录**，它们各自遵循上游许可：

| 路径 | 内容 | 许可 |
|---|---|---|
| `assets/lpc/` · `public/sprites/` | 像素角色素材与合成产物 | CC0 / OGA-BY 3.0 |
| `assets/fonts/` · `public/fonts/` | 中文像素字体及其子集 | SIL OFL 1.1 |
| `data/` | 模型快照与榜单成绩 | 见第三节，逐源不同 |

---

## 一、像素素材

角色由 [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
的分层素材程序化合成，上游锁定在 commit `6a437fcecefbc7b82b401ca319046f80d67cdd2b`。

本项目**只 vendoring 了提供 CC0 或 OGA-BY 3.0 选项的资产**：269 个素材目录、
1450 张 PNG，其中 OGA-BY 3.0 共 234 个、CC0 共 35 个。只提供 CC-BY-SA / GPL 的资产
在 vendoring 阶段就被丢弃，因此本仓库**不承担任何 ShareAlike 或 GPL 的传染义务**，
只承担署名义务。

上游生成器的**代码**是 GPL-3.0，本项目未使用其任何代码——`scripts/sprites/` 的合成器
为自研，只消费上游的 JSON 元数据与 PNG 图像。

逐资产的作者、采用许可与来源链接（269 行、35 位作者）在
[`assets/lpc/CREDITS.md`](assets/lpc/CREDITS.md)，站内 `/credits/` 页面在构建期读取同一份文件渲染。
**再分发本仓库或其衍生作品时需保留该署名文件。**

## 二、字体

`public/fonts/pixel-zh.woff2` 是 [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)
的字形子集，由 `scripts/fonts/subset.ts` 从 `assets/fonts/` 下的原始字体生成。

- Fusion Pixel Font，Copyright (c) 2022 TakWolf，SIL Open Font License 1.1 ——
  许可证全文见 [`assets/fonts/OFL.txt`](assets/fonts/OFL.txt)。
- 其拼合来源字体的许可证副本保留在 `assets/fonts/LICENSES/`：
  Ark Pixel Font（OFL-1.1）、Cubic 11（OFL-1.1）、Galmuri（OFL-1.1）。

上游的版权声明中**未声明 Reserved Font Name**，因此子集化与重命名合法。
OFL 的义务：衍生字体须继续以 OFL 分发，且不得作为独立商品出售。

## 三、数据快照

`data/` 下的 JSON 是多个上游源经仲裁归一后的衍生数据集。逐字段的来源记录在每条记录的
`provenance` 里，规则见 [`docs/DATA.md`](docs/DATA.md)。

| 内容 | 来源 | 许可 |
|---|---|---|
| 全部榜单成绩 | [Epoch AI](https://epoch.ai) · AI Benchmarking Hub | CC-BY 4.0（署名后可商用与再分发） |
| 模型元数据（发布日期、定价、上下文） | [models.dev](https://models.dev) | MIT |
| 编程分项（Coding / Agentic Coding） | [LiveBench](https://livebench.ai) | Apache-2.0 |
| 参数量与开源许可证 | [Hugging Face Hub](https://huggingface.co) | 逐模型判断，仅取事实字段 |
| 定价 / 上下文 / 模态兜底 | OpenRouter · Vercel AI Gateway · LiteLLM | 仅取可独立核实的事实字段；不转存原始 JSON，不展示其自由文本 |

`data/bilibili.json` 是哔哩哔哩公开搜索接口返回的视频**元数据**（标题、BV 号、封面 URL、
UP 主名），版权归各视频作者所有。本项目仅作索引与外链，不转存视频内容；封面图由
B 站 CDN 直接提供，未做转存或再分发。

## 四、明确排除的数据源

这两条是刻意的取舍，不是疏漏，改动前请先读 [`docs/DATA.md`](docs/DATA.md) 的合规章节：

- **Artificial Analysis** —— 其条款禁止将数据用于任何以 benchmarking / ranking /
  comparison 为主要目的、且对外提供的产品，免费层另有 internal use only 的限制。
  本项目全链路拦截，包括经 OpenRouter 的 `benchmarks.artificial_analysis` 字段、
  经 models.dev 的 `openrouter.ai` 来源域名、以及 Epoch zip 里的 `scicode_external.csv`
  这三条间接渗入路径。
- **LMArena** —— 其条款禁止自动化抓取。本项目从不直接访问其站点；
  `webdev_arena_elo` 消费的是 Epoch AI 在 CC-BY 4.0 下的再分发。

实现集中在 `scripts/sync/lib/compliance.ts`，写盘前有全树扫描兜底，并有回归自检。

## 五、商标

各模型与厂商名称（OpenAI、Anthropic、DeepSeek、通义千问等）为其各自所有者的商标，
本项目仅作**指称性使用**以标识被描述的对象，不表示任何关联或背书。

站内的厂商家徽是原创的 12×12 像素图形（`src/data/crests.ts`，以字符网格手工绘制），
**未使用任何厂商的官方标识**。角色形象由第一节所述的开源素材合成。
