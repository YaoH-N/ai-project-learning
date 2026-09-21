# 数据来源、仲裁规则与合规边界

本文档定义网站上每一个数字的来源与产生方式。原始调研证据见
[llm-metadata-sources-research.md](./llm-metadata-sources-research.md) 与
[data-sources-research.md](./data-sources-research.md)，两份报告的结论均由实际 `curl` 请求验证。

---

## 一、采用的数据源

| 用途 | 数据源 | 许可 | 需要密钥 | 更新频率 |
|---|---|---|---|---|
| 主元数据 | [models.dev](https://models.dev) `api.json` + `models.json` | MIT | 否 | 每小时 CI 同步 |
| 全部榜单分数 | [Epoch AI](https://epoch.ai) `benchmark_data.zip` | CC-BY 4.0 | 否 | 日更 |
| 编程分项（Coding / Agentic Coding） | [LiveBench](https://livebench.ai) `table_<release>.csv` + `categories_<release>.json` | Apache-2.0（DATASHEET 明文「no copyrights on the data」） | 否 | 活跃 |
| 开源模型参数量与许可证 | Hugging Face Hub | 逐模型判断 | 否 | 实时 |
| 新模型发现与交叉校验 | OpenRouter / Vercel AI Gateway / LiteLLM | 见下 | 否 | 实时 |

**那个 zip 里躺着的东西比想象的多。** `benchmark_data.zip` 有 77 个 CSV，
第一版管线只挑走了 6 个，第二版补上 11 个编程类 CSV，把全站编程覆盖从 30.2% 推到 41% 左右。
第三版不再逐个手写规格，而是读 zip 自带的 **`benchmark_metadata.csv`**（分数列、量纲、随机基线、
满分、替代关系）与 **`model_metadata.csv`**（训练算力），把剩下的 56 个榜单一次性接进
`ModelRecord.scores[]`，元信息透传到 `WorldSnapshot.benchmarks[]`（见五之三）。
三步都不需要任何新的网络请求，也不需要新的许可证评估（同一个 zip、同一份 CC-BY）。教训是：
**接一个新源之前，先把已经下载的东西看完。**

**主源选择 models.dev 的理由**，按重要性排序：MIT 许可使它在法律上完全没有疑虑；
字段覆盖最全（14 列中覆盖 12 列，其中 8 列达 100%）；GitHub Actions 每小时自动同步符合零人工维护的要求；
数据以 TOML 形式存放在 git 仓库中，因此可以 fork 到我们自己的仓库做 vendor 备份，
把「一个 HTTP 依赖」变成「一个 git 依赖」，从根本上消除单点故障。

**Epoch AI 是榜单的唯一地基**：一次 475 KB 的 GET 拿到 75 个 benchmark 的 CSV，
CC-BY 4.0 允许商用与再分发（需署名），而且是日更而非季度快照。

---

## 二、明确排除的数据源

**Artificial Analysis —— 法律禁区。** 免费层明文规定「仅限内部使用、禁止再分发」，
$417/月的 Pro 层仍然禁止再分发原始数据文件。

这里有一个隐蔽陷阱：**OpenRouter 返回体中的 `benchmarks.artificial_analysis` 子字段
（覆盖率约 55%）直接携带 AA 的 intelligence_index / coding_index / agentic_index。**
经 OpenRouter 间接展示，实质上仍然是再分发 AA 的数据，只是多了一层遮羞布。
因此管线在解析阶段就**主动剔除该子字段**，代码中有注释说明这是 ToS 合规要求。

**第三跳：`openrouter.ai` 作为 models.dev `benchmarks[]` 的来源域名，一律按 AA 处理。**
这是 2026-09 实测确认的第三条渗入路径，四条证据缺一不可：

1. URL 形态清一色是 `https://openrouter.ai/<vendor>/<model>/benchmarks`，
   即 OpenRouter 的 Benchmarks 标签页——那一页的数据由 AA 供给，
   与 `/api/v1/models` 里被剔掉的 `benchmarks.artificial_analysis` 是同一条血缘的另一个出口。
2. 这个域名上**只出现 3 个榜单名**：`SciCode`、`Terminal-Bench Hard`，
   以及字面就叫 `Artificial Analysis Coding Index` 的那一个。三个里有一个自己承认了身份。
3. 29 个带该来源成绩的模型里，22 个这三项**完全捆绑同时出现**，其余 7 个是其子集。
   它们是被整体搬运的，不是三次独立测评。
4. SciCode 与 Terminal-Bench Hard 都是 **AA Intelligence Index 的成分榜**。
   拿走指数、留下成分，仍然是再分发 AA 的测量结果。

拦截代价（如实记录，不粉饰）：`terminal_bench_hard` 这个赛制当前 22 条数据全部被拦掉、落地 0 条；
`scicode` 剩下 3 条，而它另有口径问题（见下一节），一并排除。全站编程覆盖因此比「什么都接」少约 20 个模型。

**第四跳：Epoch AI 的 zip。** Epoch 自己是 CC-BY 4.0 的干净源，
但它的 `*_external.csv` 是**转载别人的榜单**，转载谁就带着谁的条款。
实测全 zip 77 个 CSV 里有 2 个带外部血缘：

| 文件 | 上游 | 证据 | 处置 |
|---|---|---|---|
| `scicode_external.csv` | Artificial Analysis | 129 行 `Source` = `https://artificialanalysis.ai/evaluations/scicode`，且有一列**直接叫 `AA model slug`** | **整份拦截** |
| `webdev_arena_external.csv` | LMArena | `Source link` 121 处 = `https://web.lmarena.ai/leaderboard`，`Source` 104 处 = `arena.ai` | **保持现状**，见下 |

拦截实现在 `classifyEpochFile`，**文件名 + 内容里的来源域名双线**，
而且是**先扫全 zip 再决定解析谁**。顺序很要紧：懒查的话，被我们主动跳过的文件永远不会被查，
报告里会写「合规拦截 0 个」——看起来像查过了并且干净，其实是没查。
全量扫描还顺带回答了「上游这次有没有新增带 AA 血缘的文件」，
所以将来 Epoch 多出一个 AA 来源的 CSV 会被自动拦住，不需要有人维护黑名单。

> **`webdev_arena_external.csv` 为什么留着——这不是漏洞。**
> 它的上游确实是 LMArena，而它已经被接进管线（`benchmarks.webdev_arena_elo`，85 个模型）。
> 依据是 HANDOFF 4.2 记录的一个刻意决定：「绝不抓取 LMArena……替代品是 Epoch 收录的 WebDev Arena Elo」。
> 也就是说我们的合规依据是**消费 Epoch 在 CC-BY 4.0 下的再分发**，而不是自己去 LMArena 抓——
> 后者才是 LMArena ToS 明文禁止的行为。这个立场是否继续，项目负责人正在确认；
> **在拿到结论前不要删除这条豁免、也不要撤掉接入。**
> 豁免的作用域被刻意限死：只对 LMArena 家族域名生效，**AA 永不豁免**——
> 哪天这个文件里混进 AA，照样整份拦掉，`selftest.ts` 里有这一条的回归。
> 若结论是撤掉，要动三处：`EPOCH_LMARENA_EXEMPT_FILES`、`epoch.ts` 的 `BENCHMARKS`、
> 以及 `build.ts` 里 `webdev_arena_elo` 进 `coding[]` 的那一段。

判据集中在 `scripts/sync/lib/compliance.ts`，按**名字 + 来源域名双线**判断。
写盘前有两道兜底：`findArtificialAnalysisLeaks` 扫整棵树抓 AA 字符串与指数字段名，
`findBlockedBenchmarkSources` 只查 `coding[].sourceUrl` 的域名（AA 与 LMArena 家族都查）。
后者必须按字段路径查而不是全树搜字符串——**`openrouter` 是 models.dev `api.json` 里的正常 provider，
`vendors[].homepage` 出现 openrouter.ai 是合法的**，全树搜会把厂商主页误判成泄漏。
WebDev Arena 那一条的 `sourceUrl` 指向 `epoch.ai`（我们消费的是 Epoch 的再分发，署名就该给 Epoch），
所以 `coding[]` 里不该出现任何 lmarena 链接，这条兜底也就不会与上面的豁免打架。

> 代价：模型的吞吐速度与首 token 延迟是全网只有 AA 提供的数据，砍掉 AA 意味着
> 「速度」这个视觉维度整个不做。这是有意识的取舍，不是遗漏。

**LMArena —— 抓站禁止，但官方发布可以读。这两件事必须分开说。**

**抓站这条依然禁止。** 它没有公开 API，`arena.ai/robots.txt` 至今仍是 `Disallow: /api/`
（2026-09-20 复查过），ToS 专门禁止用自动化手段抓取「包括 AI Service 名称、标识、版本在内的数据」。
本管线不会去碰它的站。

**但权利人自己发布的数据集是另一回事。** LMArena 在 Hugging Face 上以 **CC-BY 4.0** 发布了
`lmarena-ai/leaderboard-dataset`，是各个竞技场榜单的历史快照，字段有模型名、机构、Arena Score、
置信区间、投票数、排名、榜单发布日期，2026-09 仍在更新。CC-BY 4.0 明确允许再分发与商用，
条件只有署名。读它与抓站在法律性质上是两件事，前者有明示授权，后者没有。

这个判断与本项目既有的立场一致：我们本来就在消费 Epoch（同为 CC-BY 4.0）转载的
WebDev Arena Elo，那次是第三方转载，这次是权利人本人的发布，依据只会更强。
**注意这不构成对 AA 的任何松动**：AA 从未给出任何授权，条款明文禁止再分发、
并且禁止「为构建类似或竞争的服务而访问」，方向是相反的。AA 永不豁免。

接入的是 `sources/lmarena.ts`，覆盖文生图、文生视频、图像编辑、图生视频、视频编辑，
以及文本、联网搜索、文档理解几个分榜。`webdev` 故意不接，站内已有 Epoch 转载的那一份，
两边同时接会让同一个赛制出现两个来源。

**为什么非它不可**：图像与视频生成模型此前在站内一个分数都没有，而它们清一色是闭源商业模型。
排查过的其他源全部不成立——Epoch 那个 zip 的 87 个文件里没有任何生成类榜单（`video_mme`
是视频**理解**）；HELM 的图像分支 HEIM 许可干净但停在 2023 年那一代，26 个模型与站内零交集；
VBench 方向对、代码 Apache-2.0，但成绩数据集是私有的，取不到。**公开评测当代商业图像视频模型的
只有 AA 与 LMArena 两家，而其中一家把数据开放了。**

CC-BY 的义务落在页脚与致谢页：创作者、许可名称与链接、材料链接，外加**声明我们做过修改**
（改名匹配与重新排序）。少任何一项都是违约，虽然 CC-BY 4.0 第 6(b) 条允许 30 天内补正。

**已经死掉的源，不要接入**：LiveBench 停更于 2025-11-25、SWE-bench 官方榜停更于 2026-02-26。
SWE-bench 成绩改从 Epoch 获取。

> Aider Polyglot 是个例外，值得单独说明。它的官方榜也停更了（覆盖的模型全部发布于 2025-12 之前），
> 但 models.dev 转载的 31 条成绩来自 `aider.chat` 官方榜、是干净的中立第三方数据，
> 而且**独立新增 23 个模型**。它救不了首屏（首屏门面都是新模型），
> 但时间线与排行榜「含已退役」里的历史模型靠它才有编程成绩。接入时要清楚它只补历史、不补当下。

**不值得接入**：llm-stats.com（三个域名之间跳转，主体身份混乱，疑似被收购）、
vellum.ai / docsbot.ai（纯 HTML，抓取维护成本远高于收益）、
各厂商官方 endpoint（即使拿到密钥也只返回 id / created / owned_by 的最小集，不含定价、上下文与能力标记）。

**收益递减区，需要先决策许可证后才能接**（调研报告 §2.3–2.6，实测边际增量已在括号里）：

| 源 | 边际增量 | 卡在哪 |
|---|---|---|
| SWE-rebench（Nebius） | +5 | 榜单**结果**未声明许可证（CC-BY 4.0 只覆盖任务集）。另需解析 Next.js RSC payload，脆弱 |
| SWE-bench 官方 `leaderboards.json` | +1 | **CC BY-NC 4.0**（仅非商业）。本站若始终无广告无付费可用，一旦商业化必须下线——接入时要单独打一个 `licenseClass: 'nc'` 标记 |
| SWE-bench-Live（微软） | +1 | 榜单站仓库**无 LICENSE**（主仓 MIT）。且模型名要从 `"<Agent> + <Model>"` 自由文本里切 |
| EvalPlus | +2 | Apache-2.0 干净，但已冻结在 2024-12。HumanEval+/MBPP+ 与 agentic 能力弱相关，档位必须分表 |

这四个加起来只有 +9 个模型（约 2 个百分点），而每一个都带一项待决策事项，
所以**这一轮全部不接**。前两个源（Epoch + LiveBench）已经吃掉九成可得收益。

---

## 三、OpenRouter 的使用边界

OpenRouter 的 `/api/v1/models` 无需密钥且 `access-control-allow-origin: *`，
技术上完全开放，但其 ToS 措辞极宽——禁止「使用脚本、机器人等自动化技术抓取或复制站点及服务上的任何信息」，
并禁止「开发竞争性服务」。一个公开展示 LLM 元数据的网站有被解读为竞争性服务的风险。

采取的边界：**用于新模型发现与发布日期的交叉校验；定价 / 上下文 / 最大输出 / 模态只在 models.dev
缺项时按第五节的顺序兜底，逐字段写 `provenance: 'openrouter'`；不转存原始 JSON 作为展示数据；
`benchmarks.*` 整段剔除。** 评测成绩全部来自 CC-BY 的 Epoch AI、Apache-2.0 的 LiveBench 与 MIT 的 models.dev，
页面保留归属链接。（2026-09 之前这里写的是「仅用于发现与日期投票」，与第五节仲裁表里早就列着的
OpenRouter 兜底自相矛盾；现在以仲裁表为准，HANDOFF 4.2 已同步。）

---

## 四、发布日期：一个会让时间轴错半年的陷阱

**OpenRouter 的 `created` 不是发布日期，是上架日期。**
对 66 个 2026 年模型做内连接的实测结果：平均滞后 3.73 天，最大 +179 天，仅 71% 完全一致。

严重偏差的例子：

```
bytedance-seed/seed-2.0-code   上架 2026-08-12   实际发布 2026-02-14   偏差 +179 天
meta/muse-spark-1.1            上架 2026-07-16   实际发布 2026-04-08   偏差  +99 天
google/gemini-3-pro-image      上架 2026-06-18   实际发布 2026-05-28   偏差  +21 天
```

**偏差不是随机噪声，而是按厂商系统性分布的**：闭源大厂旗舰基本为 0 天（OpenRouter 是 day-one 合作方），
而中国厂商与开源权重模型偏差最大。直接使用 `created` 会把字节的模型在编年史上后移半年——
考虑到这个网站很可能最受关注的部分恰恰就是中外模型的时间线对比，这个错误不可接受。

**采用规则**：取 models.dev / Vercel `released` / OpenRouter `created` 三源的**最小值**，
理由是「上架晚于发布」是系统性偏差而反向极罕见。但需要异常护栏——
实测存在 `qwen3-coder-next` 在两源间相差 196 天的别名错值，
因此**某源的日期比其他源中位数早 60 天以上则丢弃该值**。

**日期精度必须随值保存。** models.dev 有 9 条记录只有 `YYYY-MM` 没有日。
严格 ISO 解析器会抛异常或静默出错（调研过程中就因此得到过一个假的 `-190` 天结果）。
必须使用宽松解析器，接受 day / month / year 三种精度，并把精度本身存为 `releaseDatePrecision` 字段，
前端对低精度日期显示为「2026 年 1 月」。

---

## 五、字段级仲裁规则

不采用「整条记录以某源为准」，而是逐字段设置优先级，并把最终来源写进 `provenance`。

下表是 `merge/build.ts` **实际实现**的顺序（2026-09 校对过，文档与代码不一致时以代码为准并回来改这里）。

| 字段 | 优先级 | 仲裁方式 |
|---|---|---|
| 发布日期 | models.dev → Epoch → Vercel `released` → OpenRouter `created` | 取 min + 60 天异常护栏，记录精度 |
| 定价 | models.dev(`api.json`) → LiteLLM → OpenRouter → Vercel | 归一到 $/M，**逐字段取第一个有值的源**。models.dev 内部多 provider 时第一方报价优先、否则取中位数；LiteLLM 只在第一方 provider 有条目、或所有托管商条目一致时采信 |
| 上下文 / 最大输出 | models.dev → OpenRouter → Vercel → LiteLLM | 逐字段取第一个有值的源（早期文档写「取众数」，从未实现，已删） |
| 工具调用 / 推理 / 结构化输出 | 只认 models.dev | 布尔值缺就是 null；早期文档写的 OpenRouter `supported_parameters` 兜底**没有实现** |
| 模态 | models.dev → OpenRouter → Vercel → LiteLLM | 取第一个非空的源，**不取并集**：并集会把某个托管商额外开放的模态记到模型头上。OpenRouter 的 `file` 归一成 `pdf` |
| 参数量 | Hugging Face → id 正则 → 描述提取 | 必须携带 `confidence` |
| 训练算力 `trainingComputeFlop` | 只有 Epoch `model_metadata.csv` | 按 Epoch 模型名匹配阶梯接；同一别名键被多个不同数值注册过的记 null |
| 开源许可 | Hugging Face → models.dev | 归一为 SPDX；无法确定标 `null` 而非猜测 |
| 编程成绩 `coding[]` | Epoch → LiveBench → models.dev `benchmarks[]` | **按赛制分列**，一个赛制一条；同赛制多条时中立第三方优先于厂商自评，同类来源取高分 |
| 全部成绩 `scores[]` | `coding[]` → `benchmarks.*` 的 Epoch 固定榜 → Epoch metadata 泛化接入的榜单 | 一个 league 一条，第三方胜过自报，同为第三方先到先得；见五之三 |

兜底源的边界：**OpenRouter 只读 `pricing.prompt / completion / input_cache_read`、`context_length`、
`top_provider.max_completion_tokens`、`architecture.*_modalities`**，`benchmarks.*` 整段在解析阶段剔除
（第二节）。图像按张、请求按次、联网搜索按次的价（`pricing.image / request / web_search`）**不折算成 per-token**。
接入兜底之后（2026-09 实测，存活模型口径）：只认 models.dev 时定价（输出）57.9%、上下文 68.8%
（同一批 520 个模型；接入前一版快照 484 个模型时是 62.2% / 74.0%），兜底之后 90.6% / 98.8%，
最大输出 96.7%，模态 100%；各源各补了多少写在 `sync-report.json` 的 `fallbackCoverage`。

**单位归一化是接入时最容易出错的地方。** models.dev 用美元 / 百万 token（`"input": 5`），
而 OpenRouter、Vercel、LiteLLM 都用美元 / token（`"prompt": "0.000005"`）；
前两者是字符串，LiteLLM 还会出现 `5E-7` 这样的科学计数法。
必须用高精度十进制解析后再归一，不能用 float 直接相乘。

---

## 五之二、编程赛制：`coding[]` 里收了什么、为什么

`ModelRecord.coding[]` 是编程维度的**全部**可用成绩，一个赛制一条，按可信度降序。
空数组表示「确实没查到任何公开成绩」，不是「这个模型不会写代码」。
`benchmarks.swe_bench_verified / swe_bench_vendor / swe_bench_pro` 三列保持不变，新数组是它们的超集。

三个源：Epoch zip 里的 11 个编程 CSV、LiveBench 官方 CSV、models.dev 的 `benchmarks[]`。
**接进来的判据是两条，缺一不可**：口径确实是「写代码 / 软件工程」，
且血缘不指向 Artificial Analysis。同一个模型同一个赛制在多个源都有时，
**Epoch > LiveBench > models.dev**——Epoch 是把各官方榜统一收录整理，
比厂商在自家系统卡里报的可信。

### 收录的赛制（31 个，落地模型数为 2026-09 实测）

「量纲」一栏是**逐个查过分数分布定下来的**，不是按名字猜的。判错一个就等于在页面上端出一个假数字。

| 赛制 id | 主要来源 | 主分数列 | 量纲 | 覆盖 | 备注 |
|---|---|---|---|---|---|
| `swe_bench_verified` | Epoch 自测 | `mean_score` ×100 | pct | 25 | **唯一跨模型真正可比的一列**，排序最前 |
| `swe_bench_vendor` | models.dev 转载 | 原样 | pct | 40 | 与上面**分属两个赛制**，见下方说明 |
| `swe_bench_pro` | Scale 官方榜 + 厂商自报 | 原样 | pct | 51 | 列内混着两套测法，见 HANDOFF 坑 4 |
| `terminal_bench_2_0` | Epoch 转载 `tbench.ai` | `Accuracy mean` ×100 | pct | 66 | 见下方「版本就是赛制」 |
| `terminal_bench` | 厂商公告为主 | 原样 | pct | 32 | 无版本的混合自报值，与 2.0 分列 |
| `ale_bench` | Epoch 转载 ALE-Bench | `Performance` 原样 | **index** | 133 | **137–2177 的自定义评分标度，不是百分数** |
| `livebench_coding` | LiveBench 官方 | `code_generation`+`code_completion` 均值 | pct | 120 | 只取题目集换代后的同期，见下 |
| `livebench_agentic_coding` | LiveBench 官方 | `javascript`+`typescript`+`python` 均值 | pct | 99 | 仓库级真实任务，2025-05-30 起才有 |
| `webdev_arena_elo` | Epoch 转载 LMArena | `Arena Score` 原样 | **elo** | 85 | 合规依据见第二节；排在所有百分数赛制之后 |
| `aider_polyglot` | Epoch 转载 `aider.chat` | `Percent correct` **原样** | pct | 62 | 上游已经是 0–100，再乘 100 就错了 |
| `gso` | Epoch 转载 `gso-bench` | `OPT@1 (hack-adjusted)` ×100 | pct | 35 | 只用 adjusted，见下方「选哪一列」 |
| `frontier_code` | Epoch 转载 Cognition | `Main score` ×100 | pct | 31 | |
| `algotune` | Epoch 转载 AlgoTune | `Score` 原样 | **index** | 29 | **加速倍率 1.31–2.05，乘 100 会变成 131–205** |
| `deepswe` | Epoch 转载 `deepswe.datacurve.ai` | `Pass@1` ×100 | pct | 25 | 不用 Pass@4，见下 |
| `frontier_swe` | Epoch 转载 `frontierswe.com` | `Dominance` ×100 | pct | 20 | **是池内相对胜率，不是解题率**，见下 |
| `cursorbench` | Epoch 转载 `cursor.com` | `Score` ×100 | pct | 19 | IDE 内真实编辑 |
| `swe_atlas_refactoring` | `labs.scale.com` | 原样 | pct | 11 | |
| `swe_atlas_codebase_qna` | `labs.scale.com` | 原样 | pct | 10 | 读代码，仍在软件工程口径内 |
| `swe_atlas_test_writing` | `labs.scale.com` | 原样 | pct | 10 | |
| `swe_bench_multilingual` | 厂商自报 | 原样 | pct | 10 | |
| `nl2repo` | 厂商自报 | 原样 | pct | 7 | |
| `mirrorcode` | Epoch 自测 | `mean_score` ×100 | pct | 6 | 只有 6 行，人群极小 |
| `terminal_bench_2_1` | 厂商自报 | 原样 | pct | 5 | |
| `claw_eval` | 厂商自报 | 原样 | pct | 4 | 上游 `ClawEval` / `Claw Eval` 两种拼法归到同一赛制 |
| `livecodebench` | 厂商自报 | 原样 | pct | 3 | |
| `program_bench` | 厂商自报 | 原样 | pct | 3 | |
| `swe_marathon` | 厂商自报 | 原样 | pct | 3 | |
| `livecodebench_pro` | 厂商自报 | 原样 | pct | 2 | |
| `mle_bench` | 厂商自报 | 原样 | pct | 2 | 让 agent 自己写 ML 代码解 Kaggle 式任务 |
| `livecodebench_v6` | 厂商自报 | 原样 | pct | 1 | |
| `swe_bench_multimodal` | 厂商自报 | 原样 | pct | 1 | |
| `terminal_bench_hard` | —— | —— | pct | **0** | 口径合格，但数据 100% 来自 AA 第三跳，全部被拦 |

### 量纲与主分数列：四个必须逐个确认的地方

**一个赛制只能有一种量纲**，这是校验闸门里的硬性检查。Epoch 那个 zip 里至少混着四种量纲，
最可能出现的错误是某个源忘了乘 100——它不会报错，只会让分位数变成噪声。

1. **`aider_polyglot` 的 `Percent correct` 已经是 0–100**（实测 3.6–88），
   而同一个 zip 里绝大多数分数列是 0–1 小数。按「都是小数」统一处理会得到 360–8800。
2. **`ale_bench` 的 `Performance` 是 137–2177 的自定义评分标度**，`algotune` 的 `Score`
   是 **1.31–2.05 的加速倍率**。两者都不是百分数，标 `index`。
   > ⚠️ 顺带一个跨模块的坑：`CodingLedger` 目前是 `unit === 'elo' ? Elo : ${score}%`，
   > 于是 `index` 会被渲染成「2176.9%」「1.5%」。数据侧标 `index` 是对的
   > （契约里 `ScoreUnit` 有这一档就是为了这种情况），**前端需要补一个 index 分支**。
   同文件的 `Rank` 列方向相反（越小越好：98.33 对应最强的 gpt-5.6-sol，861.02 对应最弱的 codestral-2508），
   拿它当分数会把强弱整个颠倒。
3. **`deepswe` 选 `Pass@1` 而不是 `Pass@4`**。Pass@1 是「一次就做对」，与 SWE-bench 的
   resolve rate 同源，也与 models.dev 侧已有的自报值同量纲；Pass@4 是四次里对一次就算过
   （0.044–0.903），系统性高一截，混进同一列会把只有 Pass@1 的模型系统性压低。
4. **`gso` 只用 `OPT@1 (hack-adjusted)`**，代价是从 38 行降到 27 行。
   实测两列都有值的 27 行里有 23 行不同，且 adjusted 一律更低（0.4412→0.4216、0.412→0.373），
   差值是「扣掉作弊式优化」。「有 adjusted 就用、没有就退回 raw」会让缺 adjusted 的 11 个模型
   系统性偏高——**人群里混着两套定义比人群小更糟**。

**`frontier_swe` 的 `Dominance` 是池内相对胜率，不是解题率。** 它等于「在当前候选池里
能赢过多少比例的其他模型」，池子一变分数就变：实测 glm-5.2 在 Epoch 这边是 0.67、
在厂商自报里是 74.4，同一个模型、同一个指标名、不同的池子。量纲仍标 `pct`
（乘 100 之后与自报侧同标度，而「赢过多少比例的对手」终究是个比例），
但**它不是「解决了百分之多少的任务」**，界面上的措辞不该那么写。

### 版本就是赛制：Terminal-Bench 与 LiveBench

**Terminal-Bench：Epoch 的 `terminalbench_external.csv` 整份是 2.0。**
文件里所有能识别的 `Source` 都指向 `/terminal-bench/2.0`，全文搜不到 1.0 或 v1 的痕迹。
所以它归到 `terminal_bench_2_0` 而**不是**无版本的 `terminal_bench`——
后者是厂商自报的混合版本（中位 70.8），与 2.0（中位约 38–69）不是一个人群。
同一个模型在这两列上实测差 10 分（gemini-3.1-pro-preview：2.0 是 80.2，自报是 70.3）。

**LiveBench：只采用题目集换代之后的同期。** 这是本轮最大的量纲陷阱，实测数字如下：

| 同期 | 组内漂移（同一模型跨 release） | 判断 |
|---|---|---|
| `code_generation` 一代（2025-04-25 起，6 个 release） | 中位 0.0，p90 1.4，**最大 5.1** | 可以并入同一赛制 |
| `LCB_generation` 一代（≤2025-04-02，5 个 release） | 中位 1.9，p90 26.3，最大 36.4 | 连组内都不可比，整代不用 |
| **跨断点** | **中位 27.6，最大 41.9** | 绝不可同池 |

典型样例：`command-r-08-2024` 在 2025-04-02 是 6.1、在 2025-04-25 是 26.1；
`claude-3-opus` 从 38.6 掉到 23.3。若把两代混进一个 `livebench_coding`，
模型的档位会取决于它**碰巧在哪个 release 被跑过**，而不是它有多强。

断点的判据**不写死日期**，而是看这个 release 的 Coding 分组用的是哪套 task 名——
上游换题目集时同时换了 task 名，那是它自己留下的版本标记，比日期可靠。
同一后果：Epoch 的 `live_bench_external.csv` 整份是 `LiveBench-2024-11-25`（旧一代），
也因此不接；LiveBench 改从官方 CSV 取，那边能精确挑同期。

**release 清单不写死。** 优先从上游仓库的 `LIVE_BENCH_RELEASES` 常量解析
（`livebench/common.py`），解析失败才回落到内置清单。写死清单意味着新 release
不会被自动发现，与「发布后无人维护」的承诺相悖。

**为什么 `swe_bench_verified` 与 `swe_bench_vendor` 必须是两个赛制。**
两者考的是同一套题，但 Epoch 是用同一套脚手架跑所有模型，
而自报值是各家用自己的 agent 跑的。HANDOFF 4.4 定的规矩是「只能同列内比较」，
而前端按**赛制内分位**算电脑档位——放进同一个池子就等于用别人的尺子量自己。
上游榜单名仍然是 "SWE-Bench Verified"，所以只在出口改名，
`data/benchmark-attribution.json` 的键名不动（那是前端在读的契约）。

### 明确排除的候选，以及排除的理由

| 候选 | 上游规模 | 判定 |
|---|---|---|
| `scicode` | models.dev 30 条 / Epoch 129 行 | **两条独立理由，任一条都足以排除。** 其一，口径不是软件工程：SciCode 考的是「照着科研论文把公式实现成代码」，分数主要由物理/化学/生物的领域知识决定，算进编程能力会让一个不会写业务代码但物理很强的模型在广场上摆出电脑。其二，血缘是 AA——models.dev 那 30 条里 27 条来自 `openrouter.ai`，Epoch 的 `scicode_external.csv` 则有 129 行直指 `artificialanalysis.ai` 且带一列 `AA model slug`。两条路径都被拦。 |
| `live_bench_external.csv`（Epoch） | 113 行 | 不接。整份是 `LiveBench-2024-11-25`，属于旧一代题目集，与官方源采用的同期相差中位 27.6 分，不可同池。LiveBench 改从官方 CSV 接。 |
| `cybench` / `exploitbench`（Epoch） | —— | 安全攻防，不是写业务代码。 |
| `os_world` / `osworld_2` / `the_agent_company`（Epoch） | —— | 计算机操作与办公自动化，同 `automationbench` 的理由。 |
| `terminal bench hard` | 22 个模型 | 口径**合格**，赛制已登记；但 22 条数据 100% 来自 `openrouter.ai`，且它本身是 AA Intelligence Index 的成分榜，全部拦掉。保留赛制登记不是无用代码——哪天 `tbench.ai` 或厂商直接公布，它就自动流进来。 |
| `automationbench` | 6 个模型 | 排除。名字与可得证据都指向「工作流 / 计算机操作自动化」而非写代码：它在厂商公告里的同现邻居是 GDPval、Toolathlon、OSWorld Verified 这一簇，分数区间（17–31）也与计算机操作类一致。若日后确认口径是写代码，加一行即可接入。 |
| 厂商自造的单点评测 | 各 1 个模型 | 排除 `kimi code bench`、`kimi claw 24/7 bench`、`cybergym`、`dsbench *`、`mls bench lite`、`spreadsheetbench`、`forte`、`frontier bench`。它们**在自己的赛制里没有可比人群**，而电脑档位是按赛制内分位算的——n=1 的分位数没有意义，给出的档位看起来言之凿凿实则毫无依据。 |

### 前端消费这个数组时必须知道的三件事

1. **`unit` 决定能不能放进同一个分位池。** `pct` 是 0–100 的通过率，`elo` 是 1000–1700 的 Elo，
   `index` 是没有统一标度的指数（ALE-Bench 137–2177、AlgoTune 1.31–2.05）。
   把它们混进同一个池，所有百分数模型会看起来都是满分。
   实测有 29 个模型**只有 Elo、没有任何百分数成绩**（`sync-report.json` 的 `coding.modelsOnlyElo`）——
   它们能排名，但读不出「解决了几成任务」。
   **`index` 的两个赛制必须单独渲染**，见上面 `ale_bench` 那条的警告。
2. **`coding[0]` 已经是最可信的那条**，排序表在 `scripts/sync/sources/models-dev.ts` 的 `CODING_LEAGUE_ORDER`，
   依据按重要性递减是：是否第三方统一复跑 → 可比人群有多大 → 口径离写业务代码有多近。
3. **小样本赛制的分位数要留神。** 有 9 个赛制的人群不到 5 个模型。
   排序表已经把它们排在大人群赛制之后，但如果某个模型**只有**小赛制成绩，
   按分位算出来的档位仍然是脆的。这一点数据侧解决不了，只能由前端决定要不要设一个最小人群门槛。
4. **LiveBench 的成绩 `source` 是 `'livebench'`**（契约已加上这一档，早期的 `'derived'` 占位已改回）。
   `livebench_coding` 是管线按 categories 分组算出来的算术平均，那个数字在上游 CSV 里并不存在，
   但读者要知道的是「这来自 LiveBench」，均分只是呈现方式；具体 release 的榜单页由 `sourceUrl` 承载。

---

## 五之三、全榜单 `scores[]` 与 `benchmarks[]`：metadata 驱动，不再手写规格

`ModelRecord.scores[]` 是**全部**评测成绩，一个榜单一条，是 `coding[]` 与 `benchmarks.*` 的超集；
`WorldSnapshot.benchmarks[]` 是这些榜单的元信息。两者都是可选字段，旧快照没有，前端必须能在缺席时回落。

### 榜单从哪来

Epoch 的 zip 自带一份 `benchmark_metadata.csv`（列：`benchmark, in_eci, source_file, score_column,
scale, random_baseline, score_ceiling, release_date, superseded_by`）。管线按它逐文件解析：

- **league id** = `source_file` 去掉 `.csv` 与 `_external` 后缀（`hle_external.csv` → `hle`）。
  手写规格早于这条约定，7 个榜的旧 id 通过 `LEAGUE_ID_ALIASES` 对齐（`terminalbench` → `terminal_bench_2_0`、
  `epoch_capabilities_index` → `eci`、`otis_mock_aime_2024_2025` → `aime` 等），保证 `scores[]` 去重时同一个榜只算一个。
- **ECI 文件的位置与格式在 2026-09 变过一次**：从根目录 `epoch_capabilities_index.csv`（列 `ECI Score`，带 `Model version`
  型号列）变成 `epoch_capabilities_index/eci_scores.csv`（列 `eci`，**只有展示名 `Model` / `Display name`**，`model_versions` 列全空）。
  解析器同时兼容两种；因为新版没有型号列，ECI 落在展示名的宽松别名键上，`lookupEpoch` 必须从严到宽逐档补齐而不能一命中就返回。
  `SANITY.loadBearingKeys` 是这次事故之后加的闸门。详见 HANDOFF 踩坑第 11 条。
  **不用 metadata 的 `benchmark` 列当 id**：它是展示名（"Terminal Bench"），slug 化之后会与 models.dev 侧
  无版本的 `terminal_bench` 撞车，而那是另一个人群。展示名原文放在 `sync-report.json` 的 `epochLeagues[*].upstreamName`。
- **量纲**：metadata 的 `scale` 是「原始值 × scale = 0–1 归一分」——`1.0` 表示本来就是小数，`0.01` 表示本来是 0–100
  （Aider、OSWorld），`0.1` 表示本来是 0–10（Lech Mazur Writing）。本站的百分数再乘 100，
  `random_baseline` 与 `score_ceiling` 同样乘 100 换算到 `pct`。
- **手写规格优先**：17 个已有规格的榜（7 个固定榜 + 10 个编程榜）仍走原来的解析器，
  `scores[]` 里的那一条就是 `benchmarks.*` / `coding[]` 里的同一个数，不会出现两个版本；
  元信息（基线、满分、发布日期、替代关系、是否进 ECI）从 metadata 补。
- **逐榜覆盖**（`LEAGUE_OVERRIDES`，每条都看过实际分布）：
  `metr_time_horizons` 取 `Time horizon` 列而不是 metadata 声明的 `average_score`，单位 **minutes**（实测 0.05–1045）；
  `vending_bench_2`（metadata 里没有）取 `Score`，单位 **usd**，可以为负（实测 −31 到 11182）；
  `video_mme`（metadata 里 `source_file` 为空）取 `Overall (no subtitles)`。
- **metadata 没列出的文件**走表头启发式：在 `Best score (across scorers) / mean_score / Overall score / Overall / Score /
  Accuracy / Overall accuracy / Mean score` 里找第一个存在的列，然后**看分布**：全部值落在 0–1 才当小数乘 100，
  列名带 `%`/`percent` 且落在 0–100 才原样当百分数，否则跳过并写明理由。宁可少接一个榜，不端出量纲错的数字。
- **`superseded_by` 非空的榜照样写进 `scores[]`**（`frontiermath` → 被 `frontiermath_tiers_1_3_v2` 取代，
  `frontiermath_tier_4` → `frontiermath_tier_4_v2`），`BenchmarkMeta.supersededBy` 如实写 league id，前端决定默认不开榜。
- `attribution` 一律 `third-party`：Epoch 自己复跑的（文件名不带 `_external`、或有 `Log viewer`/`Logs` 列）是第三方复跑，
  `_external` 是 Epoch 转载的第三方榜单/论文数据，同样不是厂商自报。`source: 'epoch.ai'`；
  `sourceUrl` 取 `Source link` 列（是 URL 才写，写榜单名的当没有），没有就是 null，不伪造。
- 每一行换算后 `pct` 越界（<0 或 >100）的直接丢弃并计入 `outOfRange`——越界说明 metadata 的 `scale` 与实际列不符，
  这是校验闸门「一个赛制一种量纲」在解析侧的前哨。

### 合规过滤照旧、按文件

先扫全 zip 再决定解析谁（第二节）。任何 CSV 的任意单元格出现 `artificialanalysis.ai` / `openrouter.ai` 就整份拦截；
出现 LMArena 家族域名的只放行 `webdev_arena_external.csv` 这一份。2026-09 实测：拦截 1 个（`scicode_external.csv`），
豁免放行 1 个（`webdev_arena_external.csv`），清单在 `sync-report.json` 的 `codingLeaguesBlocked.epochFilesBlocked / epochFilesExempt`。

### 2026-09 实测落地

73 个 Epoch 榜单进入 `scores[]`（17 个手写 + 56 个泛化），其中 71 个至少命中 1 个模型（`lambada`、`superglue` 全是
models.dev 不收的老模型，命中 0，不列进 `benchmarks[]`）；加上 models.dev 自报与 LiveBench 的 19 个赛制，`benchmarks[]` 共 90 条。
303/520 个存活模型至少有一条成绩，242 个有三条以上。人群最大的新榜：`chess_puzzles` 152、`weirdml` 142、`critpt` 139、
`simplebench` 102、`frontiermath_tiers_1_3_v2` 96、`simpleqa_verified` 94、`math_level_5` 91、`vending_bench_2` 88、
`mystery_game_puzzles` 88、`hle` 57、`metr_time_horizons` 53。

**没接入的 4 个文件及理由**（`sync-report.json` 的 `epochFilesSkipped`）：
`live_bench_external.csv`（旧题目集，见五之二）；`btf3_external.csv`（Pooled score 是 Brier 类、越低越好，
契约没有方向字段）；`forecastbench_external.csv`（`Overall score` 实测 50.4–62.5，量纲判不出）；
`gdp_pdf_external.csv`（`GDP.pdf score` 不在启发式列表里）。这四个都可以靠加一条 `LEAGUE_OVERRIDES` 接进来，
前提是有人核过分布与方向。

### `benchmarks[]` 里非 Epoch 的条目

models.dev 自报与 LiveBench 的赛制上游没有 metadata：`sourceFile` 写 `models.dev/models.json#benchmarks[]` 或
`livebench.ai/table_<release>.csv`，`randomBaseline / scoreCeiling / releaseDate / supersededBy` 一律 null，`inEci` false。
**不拿「百分数满分是 100」这类常识去填**——前端按 `unit` 自己知道。

### 训练算力 `trainingComputeFlop`

来自 `model_metadata.csv` 的 `training_compute_flop`，按 Epoch 模型名匹配阶梯接（已匹配上的 Epoch 别名键优先，
其次严格键 → 宽松键）；同一别名键被多个不同数值注册过的记 null（几代模型共用一个营销名）。
2026-09 实测：上游 304 行有估算，落地 81/520 个存活模型；**闭源旗舰（openai / anthropic / google / xai 有 ECI 的）只有 10/94**——
核对过这是**上游的数据缺口**而不是匹配问题：Epoch 对 GPT-5 / Grok 4 之后的闭源模型基本没有估算
（`sync-report.json` 的 `trainingCompute.closedFlagships.without` 逐条列出）。这项数据的价值要等上游补齐才会显现。

---

## 六、数据源血缘：它们不是相互独立的

这一点直接决定兜底策略是否真的有效。

```
OpenRouter API ──(每小时 CI 同步)──> models.dev ──(转载)──> ruby_llm
                                          ↑
厂商官方 API ─────(每小时 CI 同步)────────┘
```

models.dev 的 `.github/workflows/sync-models.yml` 以 `cron: "17 * * * *"` 从 OpenRouter 抓取；
ruby_llm 的 1535 条记录中有 717 条自报 `metadata.source: "models.dev"`。

**含义**：把 models.dev 与 OpenRouter 当作两个独立源做「互为兜底」是错的，它们在同一条血缘链上。
真正与 OpenRouter 独立的交叉校验源只有 **Vercel AI Gateway 和 LiteLLM**。

反过来看这也是好事：models.dev 的 git 仓库实质上是 OpenRouter 数据的持久化快照，
即使 OpenRouter 下线，历史数据也不会消失。

管线会做**冗余度自查**：若某个模型的所有字段都只来自 models.dev / OpenRouter 这一条血缘链，
标记为「单源数据」，并在角色的属性面板上如实提示。

---

## 六之二、Epoch 的匹配率：一个自制的假告警

**「上游有多少 / 我们接住多少」这个指标的分母必须是去重后的模型实体，绝不能用 CSV 行数。**

Epoch 的一个模型会占很多行：每个 reasoning effort 一行、带日期的快照版本各占一行。
拿「有分数的行数」当分母，ECI 会算出 568 行只落地 173 个、看起来丢了 70%，
于是有人开始找不存在的归一化 bug。按名字去重之后的真实数字是**182 个上游模型接住了 122 个（67%）**，
而与编程直接相关的两项是 `swe_bench_verified` 31/32（97%）、`webdev_arena_elo` 81/84（96%）。

剩下没接住的，逐条核对之后**绝大多数根本不是匹配问题**：
Claude 2.1、Gemini 1.5 Flash、Llama 3-70B、o1-preview、GPT-4.5 preview 这类历史模型
压根不在 models.dev 的收录范围里（它只收当前在售的）。

去重口径的指标写在 `data/sync-report.json` 的 `epochMatch`；
`epochBenchmarkRows` 保留下来只为确认解析器读到了东西，字段的 `_note` 里写明了不许当分母用。
（注意 `scripts/qa/match-gap.ts` 仍然用的是行数口径，它的输出已被 `epochMatch` 取代。）

### 唯一一个真实的归一化缺口，以及它为什么不能用「显而易见的办法」修

Epoch 常用营销名（`Nemotron 3 Ultra`），而 models.dev 用带权重的完整 slug
（`nemotron-3-ultra-550b-a55b`），现有的后缀阶梯剥不掉 `-550b-a55b`，
于是这个模型明明有 ECI / AIME / GPQA 三项成绩，站上却显示未参赛——而它还是广场首屏的门面之一。

「把结尾的参数量也剥掉」这个显而易见的修法，**实测是 1 对 2 错**：

```
对：Nemotron 3 Ultra      → nvidia/nemotron-3-ultra-550b-a55b
错：Llama 3.1-405B        → meta/llama-3.1-70b          （405B 的分挂到 70B 头上）
错：Qwen2.5-Coder (1.5B)  → alibaba/qwen2.5-coder-0.5b  （1.5B 的分挂到 0.5B 头上）
```

净效果是负的，正好是 HANDOFF 反复警告的「把 gpt-4-turbo 的成绩挂到 gpt-4 头上」。
因此这条兜底只在**四道守卫同时成立**时才启用：

1. 上游标识自己不带规模标记——它已经指名了规模，匹配到别的规模必然是错的；
2. 上游那个别名键只被一个上游实体注册过——`mistral|mistralsmall` 被 Mistral Small 3 / 3.1 / 3.2 共用，
   键上的聚合值是几代取 max 的结果，谁都不配拿；
3. 命中的实体确实有分数——没分数就没收益，却会把它的 `releaseDate` 当成锚点带进发布日期仲裁；
4. 我们这边去掉参数量后没有多个模型撞在同一个键上——`meta|llama31` 同时对应 70B 和 8B。

加上守卫后实测净增 1 个模型、0 个错配（`sync-report.json` 的 `matchTiers['param-stripped']`）。
**第 2、3 两道守卫是补出来的**：第一版只有 1 和 4，结果多接了 4 个模型，
其中 2 个没有任何分数、只把发布日期改错了（`mistral-small-24b-instruct-2501` 从 01-30 变成 01-25）。
四条守卫各有一条自检固化在 `scripts/sync/selftest.ts`，别删。

---

## 七、上游出事时如何不崩

核心原则：**任何单个源的失败都不能影响已有数据的可用性。**

**第一层 · 数据落盘，不做实时透传。** 前端请求绝不触发上游调用。
定时任务抓取后写入仓库内的静态快照，网站只读自己的快照。
即使所有上游同时挂掉，网站照常运行，只是数据停更。这一条能挡住九成故障场景。

**第二层 · 快照原子替换 + 合理性校验闸门。** 先落地原始快照（保留原始 JSON），
解析成功后原子替换。替换前必须通过以下校验，任一不过则拒绝更新、保留旧数据并告警：

- 模型总数不得比上次减少超过 10%（防截断 JSON 与空数组）
- 必填字段的覆盖率不得下降超过 5%
- 定价不得为 0 或负数（防单位解析错误）
- 已存在模型的发布日期不得变化（变化则记为冲突待审）
- `coding[]` 同一赛制不得出现多条（否则前端算分位时同一个模型被数两次）
- `coding[]` 的分数必须与 `unit` 自洽：`pct` 落在 0–100，`elo` 落在 100–5000
- `coding[]` 里来自 `epoch.ai` 的成绩必须标 `third-party`（把自报值冒充复核是更严重的方向）
- `coding[].sourceUrl` 不得指向任何 AA 血缘域名
- `scores[]` 与 `coding[]` 同一套规矩，外加：`minutes` 不得为负、`usd` 只查有限性（亏钱是合法的）；
  `scores[]` 必须是 `coding[]` 的超集；同一 league 在两个数组里量纲必须一致
- `benchmarks[]` 的 id 唯一、`models` 必须等于 `scores[]` 里的实际命中数、命中 0 的不许列出、
  `scores[]` 里出现的每个 league 都要有元信息
- `trainingComputeFlop` 非 null 时必须是正的有限数

**失败要留痕。** `.github/workflows/sync.yml` 在任一步骤失败时（`if: failure()`）用 `actions/github-script`
找标题为「数据同步失败」且仍 open 的 issue：有就追加一条评论，没有就新建。评论里带运行链接、
`sync-report.json` 的 `failures / warnings` 与抓取失败的源。连续失败只会在同一条 issue 下堆评论，
修好之后手动关掉。这样「零维护」承诺失效时，仓库里一定有一条看得见的痕迹，而不是只在 Actions 页面里静默红一格。

> 覆盖率探针踩过一个坑：`undefined !== null` 为真。历史快照里没有新字段时读到的是 `undefined`，
> 「字段不存在」会被算成 100% 覆盖，于是新字段第一次上线必然触发一条假的「覆盖率骤降」。
> 标量字段用 `!= null`，**数组字段还得再兜一个空数组**（`m.coding ?? []`）——
> 写成 `m.coding.length` 会直接抛异常。每加一个字段都会再踩一次，`selftest.ts` 里两条都有回归。

保留原始快照的另一个价值是：上游改字段时可以**用历史快照回放**来验证新的解析逻辑，不必等下一次抓取。

**第三层 · 解析器容错。** 按「未知字段忽略、已知字段缺失降级」设计，
而不是严格 schema 校验后整体拒绝。单条记录解析失败只丢该条并计数，不中断整批。

这是分层仲裁最大的好处：**models.dev 某天删掉 `license` 字段，系统会自动退化到从 Hugging Face 取值，不会崩。**
上游改字段名（而非删除）是唯一需要人工介入的场景，用「某字段覆盖率从 >90% 突降到 0%」精准捕获并告警。

**第四层 · vendor 主源。** fork models.dev 仓库并定期同步。MIT 许可明确允许。

---

## 八、抓取频率

每 12 小时一次（UTC 01:40 与 13:40，即北京时间 09:40 与 21:40），
带 `If-None-Match` 条件请求（命中 304 时零流量）。

这个节奏先由上游封顶：models.dev 的 CI 每小时才跑一次，OpenRouter 的 CDN `max-age=300`，
所以抓得比一小时更密更没有意义。在此之上又往回收到每天两次，理由是模型发布不按小时发生，
实测连着跑两次多数时候只有几个价格小数点在动，而时间线页面消费的是「天」这个粒度。
需要抢时效时手动触发一次即可，整轮不到一分钟。实测 models.dev 收录新模型的时延是 0–24 小时，
最强证据是 `tencent/hy4-preview` 发布日 08-28、models.dev 当天收录且 `release_date` 正确。

**新模型发现与元数据补全必须解耦。** 用最大的 id 集合做发现，用质量最高的源做补全，
允许模型先以不完整状态出现、随后逐步补齐。若要求字段齐全才展示，上线时延会被最慢的源拖到数周。

**晋升门槛**（`merge/build.ts` 的 `shouldPromoteDiscovery`）：

1. models.dev 收录的直接进快照（它是主源）。
2. 否则需要 ≥ 2 个独立网关源（OpenRouter / Vercel / LiteLLM）同时收录，单源的进 `data/discovery-pending.json` 待定。
3. **例外——注册厂商单源快速晋升**：厂商在 `src/data/vendor-registry.ts` 的 `VENDOR_REGISTRY` 里登记过的，
   OpenRouter 或 Vercel **任一源**收录即晋升（LiteLLM 单源不算：它没有厂商列、只按型号片段匹配，
   单独一条不足以证明「这是 xx 家的新模型」）。目的是大厂新模型上线当天就能进站，不必等第二家网关跟上。
   **守卫**：剥掉服务档位后缀（`-fast / -free / -flex / -priority / -batch / -xhigh / -high / -low`）之后撞上已有模型的，
   视为同一个模型的另一种计费或推理强度，不走快速晋升（第一次实跑 62 个「新模型」里 30 个是 `gpt-5-fast` 这种）。
   刻意不收 `-medium` 与 `-pro`：`mistral-medium`、`gpt-5-pro` 是真型号。
   走这条路进来的模型列在 `sync-report.json` 的 `quickPromoted.models`（2026-09 实测 36 个）。

---

## 九、部署约束

抓取任务**必须在境外节点运行**。实测从中国大陆访问时，
`huggingface.co`（参数量与许可证的唯一来源）、`api.openai.com`、`api.x.ai`、`api.mistral.ai`、
`lmarena.ai` 均在 TLS 握手后被 RST。

本项目的抓取跑在 GitHub Actions 上，天然满足这一条件。
本地开发时 Hugging Face 步骤会失败，管线设计为可失败可跳过，相关字段留空并标 `confidence: unknown`，不阻塞整体。
