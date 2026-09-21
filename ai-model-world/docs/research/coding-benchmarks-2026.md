# AI 编程能力数据源调研（2026-09）

> 调研目标：把「AI 编程能力」（角色房间里的电脑）的覆盖率从 **17.9%（87/485）** 拉高。
> 硬约束：不用 Artificial Analysis、不抓 LMArena、免费无密钥、机器可读、明确允许再分发、持续更新。
>
> 本文所有覆盖率数字都是**实测**的：把候选源的模型名列表拿下来，用与 `data/models.json` 相同的归一化规则做匹配后统计，不是估算。复现方式见文末《附录 A：测算方法》。

---

## 0. 结论先行

**最重要的发现：我们已经在下载的那个 zip 里，躺着 12 个没被解析的编程榜单。**

`scripts/sync/sources/epoch.ts` 每次同步都会下载 `https://epoch.ai/data/benchmark_data.zip`（482 KB，78 个 CSV），但 `filePatterns` 只挑走了 6 个文件。这个 zip 里实际有 **13 个编程类 CSV**，其中 12 个干净可用，仅解析这 12 个文件就能把覆盖率从 17.9% 拉到 **34.4%**——几乎翻倍，而且**不需要新增任何网络请求、不需要新的合规评估**（Epoch 全站 CC-BY 4.0，我们已经在用）。

**第二个重要发现：现有管线里有一处合规泄漏。** `epoch.ts` 第 68 行已经把 `webdev_arena_external.csv` 接进来了，而这个文件的 `Source link` 列写的是 `https://web.lmarena.ai/leaderboard`——它是 LMArena 的 WebDev Arena 数据。同一个 zip 里的 `scicode_external.csv` 有 129 行指向 `https://artificialanalysis.ai/evaluations/scicode`。**Epoch 是 AA 和 LMArena 的第三跳渗入路径**，`lib/compliance.ts` 目前只防 models.dev 和 OpenRouter 两条线，没防 Epoch 这条。详见 §3.1。

全部接入后的预估：**41.9%（西方 38.6% / 中国 48.2%）**，中国模型覆盖率反超西方。

---

## 1. 推荐接入表（按「覆盖率提升 ÷ 接入成本」排序）

「新增模型数」= 该源匹配上我们目录、且当前**完全没有**编程成绩的模型数（standalone，不考虑与其他源重叠）。
「边际增量」= 按本表顺序依次接入时该源真正贡献的新模型数。

| # | 数据源 | 测评内容 | 条目数 | 新增模型（standalone） | 边际增量 | 累计覆盖率 | 接入成本 | 许可证 | 更新状态 |
|---|---|---|---|---|---|---|---|---|---|
| **1** | **Epoch AI 编程 CSV ×12**（zip 已在下载） | ALE-Bench / Aider Polyglot / Terminal-Bench / LiveBench-Coding / GSO / CursorBench / DeepSWE / FrontierCode / FrontierSWE / AlgoTune / MirrorCode / SWE-bench Verified | 324 model-version | **+80**（中国 30） | **+80** | **34.4%** | 极低（改 `filePatterns` + 12 个列名映射，~0.5 天） | CC-BY 4.0（zip 内 README 明文） | 每日重打包，最新条目 2026-08-12 |
| **2** | **LiveBench 官方 CSV**（11 个 release 全量） | LiveBench Coding（code_generation + code_completion）+ Agentic Coding（js/ts/python） | 337 model-config | +89（中国 31） | **+27** | **40.0%** | 低（11 个 CSV + 1 个 categories JSON，~0.5 天） | Apache-2.0（DATASHEET 明文「no copyrights on the data」） | 活跃，最新 release 2026-06-25 |
| **3** | **SWE-rebench**（Nebius） | SWE-rebench（持续新增任务的 SWE-bench，多语言 py/java/rust/ts） | 117（113 条是**模型级**） | +37（中国 15） | **+5** | **41.0%** | 中（需解析 Next.js RSC flight payload，~1.5 天） | ⚠️ 榜单结果**未声明许可证**（任务集是 CC-BY 4.0） | 活跃，最新模型 2026-07-24 |
| **4** | **SWE-bench 官方 leaderboards.json** | SWE-bench Verified / Lite / Test / Multimodal / **Multilingual** / **bash-only**（bash-only 是纯模型级） | 370 提交，133 个模型组合 | +31（中国 8） | **+1** | **41.2%** | 低（单个 JSON，~0.5 天） | ⚠️ **CC BY-NC 4.0**（仅非商业） | 活跃（2026-08-31 提交），bash-only 榜最近刷新 2026-02-26 |
| **5** | **SWE-bench-Live**（微软） | SWE-bench-Live lite / MultiLang / Windows，每月新增 50 道题 | 150 行，53 个 agent+model | +5（中国 2） | **+1** | **41.4%** | 低（单个 jsonl，但模型名要从 `"Agent + Model"` 字符串里切，~0.5 天） | ⚠️ 榜单站仓库**无 LICENSE**（主仓 MIT） | 非常活跃（2026-08-31） |
| **6** | **EvalPlus leaderboard** | HumanEval / HumanEval+ / MBPP / MBPP+ | 125 | +16（中国 3） | **+2** | **41.9%** | 极低（单个 34 KB JSON，~0.2 天） | Apache-2.0 | ❄️ 冻结在 2024-12-26 |
| 7 | Multi-SWE-bench（字节） | 7 语言 issue resolving | 36（agent+model） | +2（含 **Doubao-1.5-thinking/pro**，唯一的第三方豆包编程分） | +1 | 42.1% | 中（HTML 表格解析） | Apache-2.0 | ❄️ 停在 2025-04-26 |
| 8 | bigcode-models-leaderboard | HumanEval + MultiPL-E（多语言） | ~60（全是 2023–24 老代码模型） | 待测（预计 +5～10，补 mistral/meta/nvidia 长尾） | — | — | 中（HF datasets-server，中国大陆直连不通） | 需确认 | ❄️ 已归档 |
| 9 | Terminal-Bench HF 榜单仓库 | Terminal-Bench 2.0 | 87 commits | 与 #1 重复 | 0 | — | 中 | **Apache-2.0**（README frontmatter） | ⚠️ 2.0 已停止投稿，官方主榜已到 4.0 |
| 10 | Aider Polyglot YAML | Aider Polyglot（225 道 Exercism 多语言题） | 69 | 与 #1 重复（Epoch 有 71 条，更全） | 0 | — | 极低 | Apache-2.0 | ❄️ 停在 2025-10-04 |
| 11 | LiveCodeBench | LCB code generation | 仅 22 个模型（main 分支 mocks） | 低 | 0 | — | 中 | ⚠️ 站点仓库无 LICENSE | ❄️ 停在 2025-08-01 |

**行动建议：先做 #1 和 #2 就够了**——两者合计 40.0% 覆盖率，加起来约 1 天工作量，两者都有明文的宽松许可证，都是持续更新。#3～#6 是收益递减区（边际 +5 / +1 / +1 / +2），可以放到第二期，其中 #3 和 #4 有需要先决策的许可证问题。

---

## 2. 每个源的详细档案

### 2.1 ⭐ Epoch AI Benchmarking Hub —— 编程类 CSV（最高优先级）

**1) 名称与 URL**

- 人读页面：https://epoch.ai/data/ai-benchmarking-dashboard
- 机器可读端点：`https://epoch.ai/data/benchmark_data.zip`（**我们已经在 `scripts/sync/config.ts` 里配了 `epochBenchmarkZip`**）
- zip 解开后共 78 个 CSV，编程相关的 13 个：

| 文件名 | 测评 | 有效行 | 去重 model-version | 匹配到我们目录 | 新增模型 | 数据来源 |
|---|---|---|---|---|---|---|
| `ale_bench_external.csv` | ALE-Bench（AtCoder 启发式算法竞赛） | 110 | 110 | 92 | **+44** | ALE-Bench 官方 |
| `terminalbench_external.csv` | Terminal-Bench 1.0/2.0 | 204 | 59 | 40 | +15 | `tbench.ai/leaderboard/terminal-bench/2.0` |
| `aider_polyglot_external.csv` | Aider Polyglot | 77 | 71 | 36 | +31 | `aider.chat/docs/leaderboards/` |
| `live_bench_external.csv` | LiveBench（**含独立的 `Coding average` 列**） | 64 | 52 | 25 | +23 | LiveBench Leaderboard |
| `deepswe_external.csv` | DeepSWE（SWE-bench Verified 变体，Pass@1/Pass@4） | 61 | 61 | 23 | +7 | `deepswe.datacurve.ai` |
| `cursorbench_external.csv` | CursorBench | 67 | 67 | 19 | +4 | `cursor.com/cursorbench` |
| `gso_external.csv` | GSO（代码性能优化，OPT@1/OPT@10，含 hack-adjusted） | 38 | 38 | 26 | +11 | `gso-bench.github.io` |
| `frontiercode_external.csv` | FrontierCode | 33 | 28 | 25 | +7 | `cognition.com/frontiercode` |
| `frontierswe_external.csv` | FrontierSWE（rank/dominance） | 17 | 17 | 16 | +2 | `frontierswe.com` |
| `algotune_external.csv` | AlgoTune | 18 | 18 | 18 | +9 | AlgoTune 官方 |
| `swe_bench_verified.csv` | SWE-bench Verified（Epoch 自己复跑） | 35 | 33 | 32 | +8 | Epoch 自测 ✅ **已在用** |
| `mirrorcode.csv` | MirrorCode（Epoch 自测） | 6 | 6 | 6 | 0 | Epoch 自测 |
| ~~`scicode_external.csv`~~ | SciCode | 218 | — | — | — | ❌ **`https://artificialanalysis.ai/evaluations/scicode`——必须排除** |

另有几个边缘相关的可选项：`cybench_external.csv`（安全代码）、`exploitbench_external.csv`、`the_agent_company_external.csv`、`os_world_external.csv` / `osworld_2_external.csv`（computer-use）、`blueprint_bench_2_external.csv`、`surface_evolver_bench_external.csv`、`posttrainbench_external.csv`、`apex_agents_external.csv`、`epoch_capabilities_index.csv`（ECI 综合指数，已在用）。

**2) 测评内容**：见上表，覆盖 agentic SWE（SWE-bench Verified / DeepSWE / FrontierSWE）、多语言代码编辑（Aider Polyglot）、终端任务（Terminal-Bench）、竞赛算法（ALE-Bench / AlgoTune）、性能优化（GSO）、IDE 内真实编辑（CursorBench）、通用代码生成（LiveBench Coding）。**这是一个多测评组合，很适合我们「电脑」这个单一视觉槽位做加权聚合**。

**3) 覆盖模型**：ALE-Bench 的 org 分布最具代表性——OpenAI 27、Anthropic 13、Google DeepMind 11、DeepSeek 8、Z.ai(智谱) 8、Alibaba 8、Moonshot 6、xAI 5、小米 4、Mistral 4、MiniMax 4、StepFun 1、蚂蚁 1、NVIDIA 1、Meta 1、Thinking Machines 1、Inception Labs 1。含最前沿型号：`gpt-5.6-sol/luna/terra`、`claude-opus-5`、`claude-fable-5`、`gemini-3.7-flash`、`glm-5.2/5.3`、`deepseek-v4-pro`、`qwen3.7-max`、`kimi-k2.7`、`minimax-m3`、`grok-4.6`。
**注意：字节 / 豆包（`bytedance-seed`，我们有 13 个模型，覆盖率 0）在 13 个 Epoch 编程 CSV 里一条都没有**，只能靠 §2.4 和 §2.7 补。

**4) 数据格式与获取方式**：单个 zip → 内含标准 CSV，UTF-8，带引号转义（有字段内嵌换行，必须用真正的 CSV parser，`split('\n')` 会错）。**管线已有 `csv-parse/sync` + `fflate` 的解压解析代码，直接复用。**

**5) 更新频率**：zip 内文件 mtime 为当天（本次抓取 2026-09-01 拿到的是 `2026-09-01 02:21`），至少每日重打包。各榜最新评测日期：MirrorCode 2026-08-12、GSO 2026-07-12、SWE-bench Verified 2026-06-25、Terminal-Bench 2026-05-15、Aider Polyglot 2025-10-03（上游 Aider 本身停更了）。

**6) 许可证与再分发条款**：zip 内 `README.md` 原文——

> ## Licensing
> Epoch AI's data is free to use, distribute, and reproduce provided the source and authors are credited under the [Creative Commons Attribution license](https://creativecommons.org/licenses/by/4.0/).

CC-BY 4.0，明确允许再分发，只要求署名。引用格式：`Epoch AI, 'AI Benchmarking Hub'. Published online at epoch.ai.`

**7) 模型命名格式**：`Model version` 列统一为 **`<厂商 API model id>_<reasoning effort>`**，例如 `gpt-5.6-sol_max`、`claude-opus-4-8_unknown`、`glm-5.2_max`、`qwen3.7-max`（无 effort 时不带后缀）、`o3-mini-2025-01-31_high`、`deepseek-v4-pro_max`。归一化只需 `split(/_(?=[a-z]+$)/)` 取第一段，再套现有的 id 规则。另有 `Organization`（`Z.ai (Zhipu AI)`、`Moonshot`、`Google DeepMind,Google` 这类逗号并列要拆）、`Release date`、`Country` 列可交叉校验。

**8) 风险提示**：
- ⚠️ **`scicode_external.csv` 是 AA 数据**（129 行 Source 指向 `artificialanalysis.ai/evaluations/scicode`，且它有一列直接叫 `AA model slug`）。
- ⚠️ **`webdev_arena_external.csv` 是 LMArena 数据**（`Source link` = `https://web.lmarena.ai/leaderboard`，另一列 = `https://arena.ai/leaderboard`），**而它现在已经被接进管线了**（`epoch.ts:68`）。
- 全 zip 扫描结果：只有这 2 个文件命中 AA / LMArena 关键词，其余 76 个文件干净。
- 无反爬（静态文件，无 Referer / UA 校验）。
- **建议**：把 `lib/compliance.ts` 扩一条 Epoch 侧的文件级黑名单（按文件名 + 按 `Source`/`Source link` 列的域名双线拦），并把已有的 webdev_arena 接入撤掉。

---

### 2.2 ⭐ LiveBench 官方 CSV

**1) 名称与 URL**

- 榜单页：https://livebench.ai/
- 机器可读端点（**关键发现，官网没有文档写这个**）：
  - `https://livebench.ai/table_<YYYY_MM_DD>.csv`
  - `https://livebench.ai/categories_<YYYY_MM_DD>.json`
- 有效 release（来自 `livebench/common.py:79` 的 `LIVE_BENCH_RELEASES`）：`2024_06_24`、`2024_07_26`、`2024_08_31`、`2024_11_25`、`2025_04_02`、`2025_04_25`、`2025_05_30`、`2025_11_25`、`2025_12_23`、`2026_01_08`、`2026_06_25`。11 个全部返回 HTTP 200。
- 仓库：https://github.com/LiveBench/LiveBench （Apache-2.0，2026-08-31 有提交）

**2) 测评内容**：`categories_*.json` 定义了分组，编程相关两组：
- **Coding** = `code_generation` + `code_completion`（LeetCode/LiveCodeBench 风格的函数合成与补全）
- **Agentic Coding** = `javascript` + `typescript` + `python`（仓库级真实任务）

CSV 是按 task 的宽表（23 列），需要自己按 categories JSON 做分组平均。

**3) 覆盖模型**：11 个 release 去重后 **337 个 model-config**，折叠 reasoning-effort 变体后约 190 个 base model。单个 release 里 `2026_01_08` 最全（121 行）。
- 前沿：`claude-opus-5`、`claude-fable-5-max-effort`、`gpt-5.6-sol/terra/luna-max`、`gemini-3.7-flash-high`、`grok-4.6`、`glm-5.3` / `glm-5.3-flash`、`deepseek-v4-pro-0813` / `deepseek-v4-flash`、`kimi-k3`、`qwen3.8-max` / `qwen3.8-27b`、`minimax-m3`、`mimo-v2-pro`、`nemotron-3-ultra-550b-a55b`、`gemma-4-31b-it`、`devstral-2512`、`arcee-trinity-large-preview`、`gpt-oss-120b`
- 长尾老模型：`gemini-1.5-pro-002`、`command-r-plus`、`deepseek-coder-v2`、`dracarys-72b-instruct`、`amazon.nova-pro-v1:0`、`chatgpt-4o-latest-*`、`claude-3-sonnet-20240229` ——**这批是补 mistral(31)/cohere(11)/amazon(7) 缺口的关键**

**4) 数据格式与获取方式**：纯 CSV，无需 JS 渲染，无需密钥。11 个 GET 请求，总量约 120 KB。

**5) 更新频率**：活跃。最新 release `2026_06_25`（48 行，只跑了前沿模型）；仓库 2026-08-31 仍有提交。**注意**：新 release 只包含被重新跑过的模型，历史模型分数留在旧 release，所以**必须取 11 个 release 的并集**才能拿到长尾。

**6) 许可证与再分发条款**：`docs/DATASHEET.md` 原文——

> ### When will the dataset be released/first distributed? What license (if any) is it distributed under?
> The benchmark suite is public as of June 12, 2024, distributed under the Apache License 2.0.
>
> ### Are there any copyrights on the data?
> There are no copyrights on the data.

仓库 `LICENSE` = Apache-2.0（沿用自 FastChat）。**这是本次调研里最干净的一份许可证声明。**

**7) 模型命名格式**：接近厂商 API id，但**带 reasoning-effort / thinking 后缀**，是本源最大的归一化成本：`claude-opus-4-5-20251101-thinking-64k-high-effort`、`gpt-5.2-2025-12-11-nothinking`、`gemini-3-pro-preview-11-2025-low`、`qwen3-235b-a22b-thinking-2507`、`deepseek-v3.2-exp-thinking`、`grok-4-1-fast-non-reasoning`。需要一张后缀剥离表：`-base|-thinking(-auto)?(-\d+k)?|-no-?thinking|-(x)?high-effort|-medium-effort|-low-effort|-max-effort|-minimal|-(non-)?reasoning`。

**8) 风险提示**：
- LiveBench 代码沿用了 lm-sys/FastChat（LMArena 的开源框架），`LICENSE` 开头就写着「The original LICENSE from https://github.com/lm-sys/FastChat is copied below」。**但这只是代码血缘，LiveBench 的题目和分数是自己跑的，与 LMArena 的众包投票数据无关**，不触发 LMArena ToS。
- 无反爬。
- 同一模型在不同 release 分数不同（题目集变了），聚合时要记录 release 版本，建议只取最新出现该模型的 release。

---

### 2.3 SWE-rebench（Nebius）

**1) 名称与 URL**

- 榜单：https://swe-rebench.com/
- 机器可读端点：**没有 REST API**。数据完整嵌在首页 HTML 的 Next.js RSC flight payload 里（`self.__next_f.push([1,"..."])`，23 个 chunk，解码后 6.55 MB JSON）。
- 任务集（非结果）：https://huggingface.co/datasets/nebius/SWE-rebench-leaderboard
- 评测 harness：https://github.com/SWE-rebench/SWE-bench-fork （MIT）

**2) 测评内容**：SWE-rebench——从 GitHub 持续自动抽取的 SWE-bench 式任务（21K+ 任务的语料，榜单用其中一个 curated 子集），带去污染设计。指标 `resolvedRate` + `passN`，并按任务时间窗口切片（`rangeStats`，可以按「只用某月之后的新题」重算，天然抗污染）。已扩展到多语言：`python` / `java` / `rust` / `typescript` 分列。

**3) 覆盖模型**：**117 条，其中 `meta.instance_type === "model"` 的有 113 条**（另 4 条是 agent：Claude Code / Codex / Junie / Cursor）。开发者分布：openai 29、alibaba 21、anthropic 13、google 12、zhipu 9、deepseek 8、moonshot 5、minimax 5、xai 3、meta 3、mistral 3、stepfun 1、xiaomi 1、openrouter 2。
**中国模型 50 条，是所有源里中国覆盖占比最高的**。含 `Qwen3.5-397B-A17B`、`Qwen3.6-35B-A3B`、`GLM-5.1/5.2`、`DeepSeek-V4 Pro/Flash [high]`、`Kimi K2.5/K2.6`、`MiniMax M2.7/M3`、`MiMo V2.5 Pro`、`Step-3.5-Flash`。

**4) 数据格式与获取方式**：需要解析 RSC payload。可行做法（已验证）：
```
GET https://swe-rebench.com/  →  正则抓 self.__next_f.push([1,"<escaped>"]) 的所有 chunk
→  JSON.parse('"'+chunk+'"') 解转义  →  拼接  →  在结果里定位 "items":[{"modelId":...
```
字段：`modelId`（形如 `GLM-5.1__tools`）、`modelName`、`release.date`、`agentVersion`（`text` / `tools`）、`meta.developer`、`meta.instance_type`、`rangeStats.<window>.{resolvedRate,sem,passN,instanceCosts,totalTokenUsage}`。**脆弱点：Next.js 升级或改版会打断解析器，必须写 selftest 断言 + 失败时保留旧快照（管线已有 SANITY 闸门可复用）。**

**5) 更新频率**：活跃。榜内最新模型 release date 2026-07-24（`Opus 5 [high]`）。org 下 `SWE-rebench-V2` 2026-03、`SWE-bench-fork` 2026-06 都有提交。

**6) 许可证与再分发条款**：⚠️ **这是本源唯一的硬伤。**
- 任务集 `nebius/SWE-rebench-leaderboard` 的 README frontmatter 是 `license: cc-by-4.0`，卡片正文：「The dataset is licensed under the Creative Commons Attribution 4.0 license.」
- **但这是「题目」的许可证，不是「榜单分数」的许可证。** swe-rebench.com 站点上、`/about` 页里、GitHub org 的四个仓库里，都找不到对榜单结果数值的再分发声明（`.github` 和 `SWE-rebench-V2-OpenRewardEnv` 无 LICENSE）。
- **建议**：接入前发一封邮件/issue 向 Nebius 确认，或让 Epoch 去收录（Epoch 已收录 DeepSWE、FrontierSWE 等同类第三方榜，加一个 SWE-rebench 是合理请求）。在拿到明确答复前，**按「不可再分发」处理**。

**7) 模型命名格式**：`modelId` = `<modelName>__<agentVersion>`，`modelName` 是人读名而非 API id（`Claude Opus 4.6-high`、`GPT-5.6 Sol [medium]`、`DeepSeek-V4 Pro [high]`、`GLM-5.2 [high]`、`Qwen3.5-397B-A17B`）。需要剥离 `__tools`/`__text` 后缀、`[high]`/`[medium]` 方括号、`-high` 连字符后缀。

**8) 风险提示**：无 AA / LMArena 痕迹（payload 内 grep 无命中）。无反爬。主要风险是 (a) 许可证未声明，(b) RSC 解析脆弱。

---

### 2.4 SWE-bench 官方 leaderboard

**1) 名称与 URL**

- 榜单页：https://www.swebench.com/
- **机器可读端点（关键发现）**：
  - `https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json` （7.27 MB，单文件含全部 6 个榜）
  - `https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/info_for_leaderboard.json` （175 KB）
  - 注意默认分支是 **`master`** 不是 `main`。
- 每次提交的原始结果：`https://github.com/SWE-bench/experiments` → `evaluation/<split>/<date>_<model>/{metadata.yaml,results/results.json}`

**2) 测评内容**：6 个榜（`leaderboards.json` 的 `leaderboards[].name`）：

| split | 条目 | 说明 |
|---|---|---|
| **`bash-only`** | **47** | ⭐ **纯模型级**：统一用 mini-SWE-agent 单一 scaffold，唯一变量是模型。这正是我们要的 apples-to-apples 对比 |
| `Verified` | 180 | 经典 500 题，agent+model 混合 |
| `Lite` | 84 | 300 题 |
| `Multilingual` | 13 | 多语言，全是 2026-02 的新提交 |
| `Multimodal` | 22 | 带截图的前端 issue |
| `Test` | 24 | 2294 题全集 |

**3) 覆盖模型**：370 条提交，133 个去重的模型（组合）。**`bash-only` 那 47 条最有价值**：`claude-4-5-opus` 76.8、`gemini-3-flash-preview` 75.8、`minimax-m2.5` 75.8、`claude-opus-4-6` 75.6、`gpt-5-2-codex` 72.8、`glm-5` 72.8、`kimi-k2.5` 70.8、`deepseek-v3.2` 70、`devstral-small-2512` 56.4、`Qwen3-Coder-480B-A35B` 55.4、`gpt-oss-120b` 26、`llama-4-maverick/scout` 21/9。
**`Verified` 榜里有 `Doubao-Seed-Code+Doubao-Seed-1.6` = 78.8（ByteDance）**——这是我们 13 个 `bytedance-seed` 模型的唯一第三方编程分来源之一。

**4) 数据格式与获取方式**：单个 raw JSON，无需 JS 渲染。每条记录：
```json
{"agent":"live-SWE-agent","agent_org":"UIUC","model_display":"Claude 4.5 Opus","model_org":"Anthropic",
 "resolved":79.2,"date":"2025-12-15","os_model":false,"os_system":true,"reasoning_effort":"medium",
 "tags":["Model: claude-opus-4-5-20251101","Org: UIUC","System: Attempts - 1"]}
```
**`tags` 里的 `"Model: <api-id>"` 是规范化的 API model id**，非常好用。`experiments` 仓库的 `metadata.yaml` 里还有 `tags.model[]`（数组，多模型组合会有多项）、`tags.model_display`、`tags.model_org`、`tags.os_model`。

**5) 更新频率**：活跃但节奏慢。站点仓库最近提交 2026-08-31（Multimodal 内容），`data/leaderboards.json` 最近改动 2026-08-10；bash-only 榜的模型条目最近新增是 2026-02-26（Gemini 3 Pro）、Multilingual 是 2026-02-20。
⚠️ **政策变化**：`experiments` README 声明 2025-11-18 起 Verified 和 Multilingual **只接受学术机构 / 有同行评审论文的投稿**，商业产品投稿一律关闭。所以未来新型号进榜会变慢，但 bash-only 由维护者自己跑，仍会更新。

**6) 许可证与再分发条款**：⚠️ **CC BY-NC 4.0（署名-非商业）**
- `https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/LICENSE` 首行：`Attribution-NonCommercial 4.0 International`
- `SWE-bench/experiments` 仓库**没有 LICENSE 文件**（GitHub API `license: null`，`LICENSE`/`LICENSE.md`/`LICENSE.txt` 全 404）。README 只有意向性表述：「These logs are publicly accessible and meant to enable greater reproducibility and transparency」——**不构成许可授权**。
- **结论**：优先用站点仓库的 `leaderboards.json`（有明文 CC BY-NC 4.0），**不要**直接抓 `experiments` 仓库的 results。CC BY-NC 允许再分发，但要求 (a) 署名，(b) **非商业用途**。本站若始终无广告 / 无付费 / 无商业变现，可用；一旦商业化，这个源必须下线。**建议在 provenance 里单独打一个 `licenseClass: 'nc'` 标记，让未来的人一眼看到这个约束。**

**7) 模型命名格式**：见上，`tags` 里是 `Model: claude-opus-4-5-20251101` / `Model: glm-5` / `Model: Qwen3-Coder-480B-A35B-Instruct`（大小写不统一，需 lowercase）。组合提交会出现 `claude-3-7-sonnet-20250219+o3+gemini-2.5-pro` 这类多模型串，**必须过滤掉含 `+` 的条目**，否则会把 scaffold 分数错记到单个模型上。也有少量脏值（`Model: https://huggingface.co/Qwen/...`、`Undisclosed`、`Mixed Models`、`4x Scaled`）要丢弃。

**8) 风险提示**：无 AA / LMArena 痕迹。无反爬（raw.githubusercontent.com）。7.27 MB 单文件，建议加 ETag 条件请求避免每小时全量下载。**最大风险是 NC 条款**。

---

### 2.5 SWE-bench-Live（微软）

**1) 名称与 URL**

- 榜单页：https://swe-bench-live.github.io/
- 机器可读端点：`https://raw.githubusercontent.com/SWE-bench-Live/swe-bench-live.github.io/main/reports-0605.jsonl` （416 KB，150 行）
  - 文件名带日期，**会随更新改名**（`leaderboard.js:181` 里是硬编码的 `fetch('reports-0605.jsonl')`），所以要先拉仓库 contents 列表找 `reports-*.jsonl`，不能写死。
- 主仓：https://github.com/microsoft/SWE-bench-Live （MIT）
- 投稿仓：https://github.com/SWE-bench-Live/submission

**2) 测评内容**：SWE-bench-Live——自动化流水线（RepoLaunch）持续构建的 SWE-bench 式任务。三个数据集：`SWE-bench-Live`（Python）、`MultiLang`（C/C++/C#/Java/TS/JS/Go/Rust，2026-08 已到 1077 题）、`Windows`（PowerShell）。`lite`/`verified` split 冻结以保证可比，`full` split **每月新增 50 道验证过的新题**。

**3) 覆盖模型**：150 行 / 53 个 agent+model 组合 / 约 20 个 base model。模型很新：`Deepseek-v4-Pro`、`GPT-5.5 (Medium)`、`Claude-4.6-Opus`、`Gemini-3.1-Pro`、`Gemini-3.6-flash`、`Claude-4.6-Sonnet`、`Seed-OSS-36B`、`DeepSeek-V3.1-Terminus`、`Qwen3-Coder-480B-A35B`。
**优点：它对同一模型跑多个 scaffold（Claude Code / OpenHands / SWE-agent / Agentless），可以取 max 或 median，比单 scaffold 更稳。**

**4) 数据格式与获取方式**：JSON Lines，每行 `{"name","set","total","logo","date","resolved","url"}`。极简。

**5) 更新频率**：**非常活跃**。主仓 2026-08-31 有提交，榜单站仓库 2026-08-18，投稿仓 2026-08-31。榜内最新条目 2026-08-17。README 里 2026-08-21 / 2026-03-08 / 2026-01-10 都有更新日志。

**6) 许可证与再分发条款**：⚠️ 混合。
- `microsoft/SWE-bench-Live` 主仓：**MIT**（`LICENSE`，1141 bytes）
- `SWE-bench-Live/swe-bench-live.github.io`（榜单数据所在）：**无 LICENSE**（API `license: null`）
- `SWE-bench-Live/submission`：**无 LICENSE**
- **结论**：分数数值本身作为事实性数据，可以按「事实不受版权保护」处理，但严格讲缺明确授权。**建议向仓库提 issue 请他们加一个 CC-BY 或 MIT 的 LICENSE**——微软仓库通常很配合这类请求，成本极低。

**7) 模型命名格式**：⚠️ 最脏的一个。`name` 是自由文本 `"<Agent> + <Model>"`，例如 `"Slingshot + Claude-4.6-Opus"`、`"Brokk + Sonnet4.5 (Standard) + Flash3 (Minimal)"`、`"MIT-IBM Agent (BOAD) + SWE-Agent + Seed-OSS-36B"`、`"OpenHands + GPT5.2-Thinking (Medium)"`。需要按 `+` 切分后取最后一段、去掉括号里的 effort、再做别名映射（`Sonnet4.5` → `claude-sonnet-4-5`、`GPT5.2-Thinking` → `gpt-5.2`）。三段以上的多模型组合建议直接丢弃。

**8) 风险提示**：无 AA / LMArena 痕迹。无反爬。文件名会变（见上）。命名归一化工作量比分数收益大——**这是排到 #5 的原因**。

---

### 2.6 EvalPlus Leaderboard

**1) 名称与 URL**

- 榜单页：https://evalplus.github.io/leaderboard.html
- 机器可读端点：`https://raw.githubusercontent.com/evalplus/evalplus.github.io/main/results.json` （34 KB）
- 另有 `results/` 目录存放逐题明细。

**2) 测评内容**：HumanEval、**HumanEval+**、MBPP、**MBPP+**（`+` 版是加了大量额外测试用例的严格版），指标 pass@1。

**3) 覆盖模型**：**125 个**，几乎全是 2023–2024 的模型，但这正好是我们的长尾缺口：`StarCoder`/`StarCoder2`(1B/3B/7B/15B)、`StarCoderBase`、`CodeLlama`(7B/13B/34B/70B ± Instruct/Python)、`WizardCoder`(15B/33B/34B/7B)、`DeepSeek-Coder`(1.3B/6.7B/33B ± base/instruct)、`DeepSeek-Coder-V2-Instruct`、`Qwen2.5-Coder-32B-Instruct`、`CodeQwen1.5-7B(-Chat)`、`codegemma`(2b/7b/7b-it)、`gemma`(2b/7b ± it)、`Codestral-22B-v0.1`、`Mixtral-8x7B/8x22B-Instruct`、`Mistral-7B(-Instruct-v0.2)`、`Phi-3-mini-4k-instruct`、`phi-2`、`Magicoder-S-*`、`OpenCodeInterpreter-DS-*`、`Phind-CodeLlama-34B-v2`、`stable-code-3B`、`CodeGen/CodeGen2`、`CodeT5+`、`InCoder`、`PolyCoder`、`SantaCoder`、`dbrx-instruct`、`Command-R+`、`Llama3-8B/70B-instruct`、`Vicuna`、`Zephyr β-7B`、`SOLAR-10.7B`。

**4) 数据格式与获取方式**：单个 JSON，key = 模型名，value =
```json
{"link":"https://huggingface.co/infly/OpenCoder-8B-Instruct","open-data":"NONE","prompted":true,"size":8,
 "pass@1":{"humaneval":81.7,"humaneval+":77.4,"mbpp":82,"mbpp+":71.4}}
```
`link` 直接给了 HF repo URL，**可以用它做精确匹配，绕过名称归一化**——这是本源最大的优点。

**5) 更新频率**：❄️ **冻结**。`evalplus/evalplus.github.io` 最后 push **2024-12-26**（约 20 个月前）；主仓 `evalplus/evalplus` 最后 push 2025-10-02（仅代码，未更新榜单）。作为持续源不合格，**但作为一次性的历史长尾快照仍然值得接**（成本 0.2 天，永久有效，老模型分数不会变）。

**6) 许可证与再分发条款**：`evalplus/evalplus.github.io` 与 `evalplus/evalplus` 均为 **Apache-2.0**（GitHub API `license.spdx_id = "Apache-2.0"`，仓库根有 `LICENSE` 11357/11558 bytes）。允许再分发，要求保留版权与许可声明。

**7) 模型命名格式**：人读名，风格不统一（`StarCoder2-15B`、`DeepSeek-Coder-33B-instruct`、`GPT 4o (Aug 2024)`、`Claude Sonnet 3.5 (June 2024)`、`Mistral Large (Mar 2024)`、`databricks/dbrx-instruct`）。**强烈建议优先用 `link` 字段里的 HF repo id 匹配**，匹配不到再退回名称。

**8) 风险提示**：无 AA / LMArena 痕迹。无反爬。需在 UI 上明确标注「HumanEval/MBPP 与 SWE-bench 不同量纲」——HumanEval+ 的 80 分和 SWE-bench Verified 的 80 分完全不是一回事，档位阈值必须分表（参考 `data/benchmark-attribution.json` 里已记录的 SWE-Bench Pro 18 分系统性落差问题）。

---

### 2.7 Multi-SWE-bench（字节跳动）

- **URL**：https://multi-swe-bench.github.io/ ；仓库 https://github.com/multi-swe-bench/multi-swe-bench
- **测评**：7 语言（Java/TS/JS/Go/Rust/C/C++）+ Python 的 issue resolving，1632 题，分 Easy/Medium/Hard
- **覆盖**：36 条，全是 `<Agent> + <Model>` 组合（MopenHands / MagentLess / MSWE-agent × 12 个模型）。**唯一价值：`Doubao-1.5-thinking` (15.24) 和 `Doubao-1.5-pro` (7.83) 的第三方编程分**，这是补 `bytedance-seed` 缺口的稀缺数据；此外有 `Qwen2.5-72B-Instruct`、`DeepSeek-V3`/`R1`、`Llama-4-Maverick`
- **格式**：榜单是 HTML 表格（`multi-swe-bench.github.io` 首页只有 992 bytes，实际表格由 JS 注入）。仓库 Apache-2.0，但结果 JSON 位置未标准化。需 HTML/JS 解析。
- **更新**：❄️ 最新条目 2025-04-26，仓库 2025-12-18。约 16 个月未更新新模型。
- **许可证**：Apache-2.0（仓库）。页面免责声明「Multi-SWE-bench is for research purposes only」——⚠️ 「research purposes only」比 Apache-2.0 更严，接入前需判断静态科普站是否算 research use。
- **命名**：`MopenHands + Gemini-2.5-Pro`、`MagentLess + Doubao-1.5-thinking`
- **风险**：分数绝对值很低（最高 21.6%），与 SWE-bench Verified 的 70–80 分不可直接比较，必须单独校准档位。

---

### 2.8 Terminal-Bench

- **URL**：https://www.tbench.ai/leaderboard/terminal-bench/4.0 （官方主榜已到 **4.0**）；2.0 榜单投稿数据在 HF `harborframework/terminal-bench-2-leaderboard`；数据集镜像 https://github.com/harbor-framework/terminal-bench-2
- **测评**：终端环境里的 agent 任务，指标 accuracy / resolution rate，每题至少 5 trial
- **覆盖**：4.0 榜首页 payload 里只有 11 条（`claude-opus-5`、`claude-opus-4-8`、`claude-sonnet-5`、`gpt-5.6-luna/sol/terra`、`glm-5.3`、`claude-fable-5-mythos-5`、`grok-4.5/4.6`）；2.0 榜有更多但都是 agent 名（`vix__claude-opus-4-7`、`Wecode__GPT-5.5`、`JJAgent__Multiple`）
- **格式**：tbench.ai 是 Next.js + react-query，数据嵌在 dehydrated payload 里（`metadata_schema` / `metrics_schema` 定义了 `model_display`/`model_org`/`reasoning_effort`/`accuracy`/`n_trials`/`total_cost_usd`）。底层是 `hub.harborframework.com`，未找到公开 REST 端点（`/api/*` 试探全部 404/405）。
- **更新**：活跃（4.0 是当前版本），但 2.0 榜「SUBMISSIONS CLOSED」
- **许可证**：HF `harborframework/terminal-bench-2-leaderboard` README frontmatter = **`license: apache-2.0`** ✅；`harbor-framework/terminal-bench-1` = Apache-2.0
- **结论**：**不建议直连**。Epoch 的 `terminalbench_external.csv`（204 行 / 59 个 model-version / 最新 2026-05-15）已经把 Terminal-Bench 抓好并转成 CC-BY 的规整 CSV，成本低一个数量级。只有在需要 4.0 的最新前沿分数时才考虑直连。

---

### 2.9 bigcode-models-leaderboard / BigCodeBench

- **bigcode-models-leaderboard**：HF Space `bigcode/bigcode-models-leaderboard`，测 HumanEval + MultiPL-E（多语言 pass@1）。README frontmatter 列了约 60 个模型，全是 2023–24 代码专用模型：`starcoder`/`starcoder2`(3b/7b/15b)、`CodeLlama`(7b–70b × base/Python/Instruct)、`WizardCoder`(1B–34B)、`deepseek-coder`(1.3b/6.7b/33b)、`codegemma`、`CodeQwen1.5-7B`、`Qwen2.5-Coder-32B`、`octocoder`、`santacoder`、`replit-code-v1-3b`、`codegeex2-6b`、`CodeShell-7B`、`CodeFuse-DeepSeek-33B`、`falcon-180B`、`phi-1`、`stable-code-3b`。数据可经 `https://datasets-server.huggingface.co/rows?dataset=bigcode%2Fbigcode-models-leaderboard&config=default&split=train` 取。❄️ 已归档。
- **BigCodeBench**：仓库 `bigcode-project/bigcodebench` Apache-2.0（2026-01-03 有提交，仅代码）。结果在 HF `bigcode/bigcodebench-results` / `bigcodebench-hard-results` / `bigcodebench-solve-rate`，**lastModified 2025-04-17，约 16 个月未更新**。主数据集 `bigcode/bigcodebench` 是 `license:apache-2.0`，但 `-results` 系列没有 license tag。
- **⚠️ 中国大陆网络限制**：`huggingface.co` 在本机被 TCP reset（`config.ts` 的 `HF` 段已经记录了这个问题，并配了短超时 + 探针）。**任何依赖 HF API 的源，在 GitHub Actions 上能跑通、但在本地开发时不可用**，会显著拖慢迭代。这是把所有 HF 源排在 GitHub raw / 普通 HTTPS 源之后的另一个理由。
- **结论**：作为「补 mistral(31)/nvidia(18)/meta(12) 长尾」的第二期候选。EvalPlus（§2.6）覆盖高度重叠且不依赖 HF，**优先做 EvalPlus**。

---

### 2.10 Aider Polyglot Leaderboard

- **URL**：https://aider.chat/docs/leaderboards/ ；数据 `https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/_data/polyglot_leaderboard.yml` （45.7 KB）
- **测评**：Aider Polyglot——225 道 Exercism 多语言练习题（C++/Go/Java/JS/Python/Rust），指标 `pass_rate_2`（第二轮通过率）+ `percent_cases_well_formed`（编辑格式正确率）
- **覆盖**：69 条。含 `gpt-5 (high/medium/low)`、`grok-4 (high)`、`Kimi K2`、`DeepSeek-V3.2-Exp (Chat/Reasoner)`、`claude-opus-4`、`gemini-2.5-pro-preview-06-05`、`Qwen3-235B-A22B`、`QwQ-32B`、`gpt-oss-120b (high)`、`command-a-03-2025`、`yi-lightning`、`openhands-lm-32b-v0.1`
- **格式**：YAML，字段规整（`model`、`pass_rate_1/2`、`edit_format`、`percent_cases_well_formed`、`total_cost`、`date`、`versions`）
- **更新**：❄️ 最后一次改动 **2025-10-04**（"chore: update deepseek model names and metadata"），约 11 个月未加新模型。Aider 主仓 2026-05-22 仍有提交，但榜单停更。
- **许可证**：`Aider-AI/aider` = **Apache-2.0** ✅
- **命名**：人读名混 API id（`claude-opus-4-20250514 (32k thinking)`、`gpt-4o-mini-2024-07-18`、`Qwen3 235B A22B diff, no think, Alibaba API`、`DeepSeek R1 + claude-3-5-sonnet-20241022`）。含 `+` 的是双模型组合，需过滤。
- **结论**：**不必直连**。Epoch 的 `aider_polyglot_external.csv` 有 77 行 / 71 个 model-version（比原仓库多），同样更新到 2025-10-03，且命名已被规整成 `<api-id>_<effort>` 格式，还带 `Organization`/`Country` 列。

---

### 2.11 LiveCodeBench

- **URL**：https://livecodebench.github.io/ ；HF Space `livecodebench/leaderboard`；数据 `https://raw.githubusercontent.com/LiveCodeBench/livecodebench.github.io/main/src/mocks/performances_{generation,execution,repair,testgen}.json`（5.4 / 4.1 / 2.8 / 3.2 MB）
- **测评**：LCB code generation / self-repair / test output prediction / code execution，按题目发布日期切窗防污染
- **覆盖**：⚠️ **main 分支的 mocks 里只有 22 个模型**（`performances_generation.json` 的 `models` 数组）：DeepSeek-V3/R1-0528、GPT-4-Turbo/4O/4O-mini、O3(-Mini)/O4-Mini、Claude-3.5-Sonnet/3-Haiku/Sonnet-4/Opus-4、Gemini-2.5-Pro/Flash、Qwen3-235B-A22B、Grok-3-Mini。远少于 HF Space 上显示的数量（Space 可能另有数据源）。
- **格式**：JSON，`{performances:[{question_id,model,date,difficulty,pass@1,platform}], models:[...], date_marks:[...]}` —— 23210 条逐题记录，需自己聚合 pass@1。官方明确说没有 CSV：「Sorry, currently, we don't have any csv. You can reconstruct it from the JSONs easily though.」
- **更新**：❄️ 主仓 `LiveCodeBench/LiveCodeBench` 最后 push **2025-07-16**；站点仓库 2025-08-01。数据集最新是 `release_v6`（题目截至 2025-04）。
- **许可证**：⚠️ 主仓 MIT，但**站点仓库 `livecodebench.github.io` 无 LICENSE**（数据就在这个仓库里）
- **结论**：低优先。模型太少、停更、数据仓库无许可证、需要自己做逐题聚合。**LiveBench 的 `code_generation` 任务本身就是 LiveCodeBench 风格的题目**（DATASHEET 原文：「the coding questions consists of only medium and hard questions from LeetCode (via LiveCodeBench)」），接 LiveBench 已覆盖同类信号。

---

## 3. 已排除的源

### 3.1 合规排除（硬红线）

| 源 | 排除理由 | 具体证据 |
|---|---|---|
| **Artificial Analysis**（直连） | 免费层与 Pro 层禁止再分发 | 项目既有约束，`lib/compliance.ts` 已实现拦截 |
| **AA 经 Epoch 渗入** | ❌ **`scicode_external.csv`** | 129 行 `Source` = `https://artificialanalysis.ai/evaluations/scicode`；该 CSV 甚至有一列直接叫 `AA model slug`。示例行：`claude-fable-5_max,0.6018...,Anthropic,claude-fable-5,2026-06-09,...,https://artificialanalysis.ai/evaluations/scicode` |
| **AA 经 models.dev / OpenRouter 渗入** | 已有防护 | `lib/compliance.ts` 的 `BLOCKED_SOURCE_HOSTS` + `stripArtificialAnalysis` |
| **LMArena / Chatbot Arena**（直连） | ToS 明文禁止自动化抓取模型名与分数 | 项目既有约束 |
| **WebDev Arena 经 Epoch 渗入** | ❌ **`webdev_arena_external.csv`**，**且此文件当前已被接入管线** | 123 行含 lmarena；`Source link (site from table)` = `https://web.lmarena.ai/leaderboard`，`Source` = `https://arena.ai/leaderboard`。示例行：`claude-opus-5_max,1690.64,2026-07-24,Anthropic,...,8116,,https://arena.ai/leaderboard,https://web.lmarena.ai/leaderboard,...`。接入点：`scripts/sync/sources/epoch.ts:68` 的 `filePatterns: [/^webdev_arena(_external)?\.csv$/i, ...]` |
| **Vals AI**（vals.ai） | **找不到任何许可证 / 使用条款声明**，无再分发授权 | `/terms`、`/terms-of-service`、`/privacy` 全部 404；`/about` 页只讲方法论，无版权/许可条款。数据本身很有吸引力（`/benchmarks/swebench` 页嵌了 `claude-opus-5`、`gpt-5.6-luna/sol/terra`、`glm-5.3`、`deepseek-v4-pro-0813`、`gemini-3.7-flash` 等最新型号，还有 `/benchmarks/lcb`、`/benchmarks/terminal-bench-2-1`、`/benchmarks/code-migration`、`/benchmarks/programbench`、`/benchmarks/medcode` 等多个编程榜），**建议主动联系 contact@vals.ai 申请 CC-BY 授权**——这是最值得争取的一个源 |
| **Design Arena**（designarena.ai） | 无公开 API | `/api/leaderboard` 返回 405 Method Not Allowed；首页 HTML 里只找到 `/api/og`，无榜单端点 |

**⚠️ 结论：`lib/compliance.ts` 需要新增第三条渗入路径的防护——Epoch AI。** 现有注释里写的「两个已知的渗入路径」（OpenRouter、models.dev）已经不完整了。建议加：
1. 文件级黑名单：`scicode_external.csv`、`webdev_arena_external.csv`
2. 列级兜底：解析每个 Epoch CSV 时，检查 `Source` / `Source link` / `Source link (site from table)` 列，命中 `artificialanalysis.ai` / `lmarena.ai` / `arena.ai` / `lmsys` 即整文件丢弃（这样将来 Epoch 新增 AA 来源的 CSV 也会被自动拦住，不需要人工维护黑名单）
3. 全 zip 扫描已确认：78 个文件里只有这 2 个命中，其余 76 个干净。

### 3.2 无法机器读取 / 无公开端点

| 源 | 排除理由 |
|---|---|
| **OpenCompass / CompassRank**（司南） | `rank.opencompass.org.cn` 是 SPA（首页仅 4.5 KB），试探的 `/api/v1/leaderboard`、`/api/leaderboard` 都返回同一个 HTML 外壳，无 JSON 端点。且 LLM 主榜用「官方**闭源**评测集」，README 里代码能力那一项还写着「\[ \] 发布代码能力评测榜单」（未完成）。站点有独立的「OpenCompass Open Platform Service Agreement」需单独评估。投稿方式是发邮件给 `opencompass@pjlab.org.cn`。**如果后续想覆盖中文社区，这里值得发邮件问有没有数据导出**。 |
| **SuperCLUE**（superclueai.com） | Vite SPA，首页 5.9 KB。`/api/leaderboard`、`/data/leaderboard.json` → 404；`/rank.json` 虽返回 200 但内容是 SPA fallback HTML（`content-type: text/html`）。评测报告以 PDF / 微信公众号文章发布，无结构化端点。且用闭源题库。 |
| **Terminal-Bench 官方 4.0 榜（直连）** | `hub.harborframework.com` 无公开 REST API（`/api/datasets/...` → 404）；数据只在 Next.js dehydrated payload 里，且 4.0 首页只暴露 11 条。**改用 Epoch 的 `terminalbench_external.csv`**。 |

### 3.3 无维护 / 无编程测评

| 源 | 排除理由 |
|---|---|
| **HELM（Stanford CRFM）** | 端点确实公开可用（GCS bucket `crfm-helm-public`，26 个 project，`https://storage.googleapis.com/crfm-helm-public/<project>/benchmark_output/runs/<version>/`，版本号可从 `https://crfm.stanford.edu/helm/<project>/latest/config.js` 读到），模型命名也很规范（`openai_gpt-5.1-2025-11-13`、`anthropic_claude-haiku-4-5-20251001`）。**但没有在维护的编程 scenario**：HELM Capabilities 当前版 v1.15.0 的 run 目录只有 `gpqa` / `ifeval` / `mmlu_pro` / `omni_math`；HELM Lite 停在 v1.13.0 且不含 coding；含 HumanEval 的 HELM Classic 停在 **v0.4.0**。 |
| **HuggingFace Open LLM Leaderboard** | 2025 年已归档。其评测套件（IFEval / BBH / MATH-Hard / GPQA / MuSR / MMLU-Pro）**完全不含编程任务**，`open-llm-leaderboard/contents` dataset 对本项目零价值。 |
| **BigCodeArena** | `bigcode-project/bigcodearena` Apache-2.0，但最后 push 2025-10-13（约 11 个月）。且是 arena 式众包投票，与我们要的确定性 pass rate 不同量纲。 |
| **LiveCodeBench** | 见 §2.11：22 个模型 + 停更 + 数据仓库无 LICENSE。 |
| **EvalPlus / BigCodeBench / Aider / Multi-SWE-bench** | 均已停更，但因许可证干净且能补长尾，**保留为低优先候选**（见 §2.6 / §2.9 / §2.10 / §2.7），不是排除。 |

---

## 4. 预估覆盖率

### 4.1 基线

| 分组 | 有编程成绩 | 总数 | 覆盖率 |
|---|---|---|---|
| 全部 | 87 | 485 | **17.9%** |
| 中国厂商 | 35 | 164 | **21.3%** |
| 西方厂商 | 52 | 321 | **16.2%** |

（中国厂商 = `alibaba` `deepseek` `zhipuai` `moonshotai` `minimax` `bytedance-seed` `tencent` `baidu` `xiaomi` `stepfun` `inclusionai` `meituan` `kwaipilot`）

### 4.2 按推荐顺序逐步接入的实测结果

| 接入到 | 边际新增 | 全部 | 中国 | 西方 |
|---|---|---|---|---|
| 基线 | — | 17.9% | 21.3% | 16.2% |
| + **Epoch 编程 CSV ×12** | +80（中 +30） | **34.4%** | **39.6%** | 31.8% |
| + **LiveBench 全 release** | +27（中 +10） | **40.0%** | **45.7%** | 37.1% |
| + SWE-rebench | +5（中 +4） | 41.0% | **48.2%** | 37.4% |
| + SWE-bench 官方 leaderboards.json | +1 | 41.2% | 48.2% | 37.7% |
| + SWE-bench-Live | +1 | 41.4% | 48.2% | 38.0% |
| + EvalPlus | +2 | **41.9%** | **48.2%** | **38.6%** |

**单独看每个源能带来多少新模型（不考虑重叠）**：LiveBench +89、Epoch +80、SWE-rebench +37、SWE-bench 官方 +31、EvalPlus +16、SWE-bench-Live +5。重叠度很高——**前两个源就吃掉了 90% 的可得收益**。

### 4.3 分别看西方与中国

- **中国模型：21.3% → 48.2%（+27 个百分点，翻 2.3 倍）**。中国模型的编程覆盖率会**反超西方**，因为第三方 SWE 榜单近一年对中国开源模型的测评密度非常高：SWE-rebench 有 50 条中国模型、SWE-bench bash-only 有 GLM-5/Kimi-K2.5/MiniMax-M2.5/DeepSeek-V3.2/Qwen3-Coder、ALE-Bench 有 DeepSeek 8 + 智谱 8 + 阿里 8 + Moonshot 6 + 小米 4 + MiniMax 4 + StepFun 1 + 蚂蚁 1。
- **西方模型：16.2% → 38.6%（+22 个百分点）**。西方那 321 个模型里有大量 Mistral 旧版本（42 个中 31 个仍缺）、NVIDIA Nemotron 变体（21 个中 18 个仍缺）、Cohere（15 个中 11 个仍缺）——这些型号**客观上就没有任何公开编程成绩**，不是抓取问题。

### 4.4 天花板分析：剩下那 58% 为什么补不上

全部接入后仍无编程成绩的 282 个模型，按厂商分布：

```
alibaba 38, openai 34, mistral 31, google 29, nvidia 18, bytedance-seed 13,
meta 12, cohere 11, xai 10, deepseek 9, amazon 7, anthropic 7,
minimax 5, zhipuai 5, arcee-ai 4, ibm 4, kwaipilot 4, moonshotai 4, ...
```

抽查后这批基本是四类，**都不是数据源问题**：
1. **非编程模型**：embedding / rerank / TTS / 视觉专用 / moderation（cohere 的 11 个大半是 embed/rerank）
2. **同族的量化/尺寸变体**：Nemotron 的 FP8/NIM 变体、Qwen 的 0.5B/1.5B 小尺寸
3. **早期废弃型号**：`gpt-3.5-turbo-0301`、`mistral-tiny`、`text-davinci-*` 这类没人再测
4. **闭源新品，厂商自己也没发编程分**

**因此 ~42% 大致就是「所有公开、合规、机器可读数据源的联合上限」附近。** 如果再投入做一张精细的模型别名表（本次测算用的是保守的纯算法归一化，LiveBench 有 197/337 条因命名差异未匹配上，如 `claude-4-opus-20250514-base`、`gemini-1.5-pro-002`、`amazon.nova-pro-v1:0`、`deepseek-coder-v2-lite-instruct`、`dracarys2-72b-instruct`），**乐观估计还能再多 3–5 个百分点，即 45–47%**。

### 4.5 对首屏视觉的影响

首屏若按热度/新近度排序，展示的是前 50–100 个模型。这批模型全是主流新品，在 Epoch + LiveBench 里的覆盖率远高于全库平均——**首屏「盖防尘布的桌子」应该从「大部分」降到「个别」**。建议接入后跑一次 `scripts/qa/measure-tiers.ts` 复核首屏实际填充率，而不是只看全库 42% 这个数字。

---

## 5. 实施注意事项

### 5.1 量纲与档位校准（最容易出错的地方）

`data/benchmark-attribution.json` 里已经记录了一个真实教训：SWE-Bench Pro 混着 Scale AI 官方榜（中位数 41.0）和厂商系统卡自评（中位数 59.0），**18 分的系统性落差**，直接套 SWE-bench Verified 的档位阈值会系统性低估。新增 12+ 个测评后这个问题会放大 10 倍：

| 测评 | 典型分数区间 | 与 SWE-bench Verified 的关系 |
|---|---|---|
| SWE-bench Verified | 40–80 | 基准 |
| SWE-bench bash-only | 9–77 | 单一 scaffold，比 Verified 低 3–8 分 |
| Aider Polyglot `pass_rate_2` | 4–90 | 高分区被压缩 |
| Terminal-Bench 2.0 accuracy | 0.3–0.91 | **0–1 小数，不是百分比** |
| ALE-Bench `Performance` | 自定义标度 | 需查文档 |
| GSO `OPT@1` | 很低 | 另有 hack-adjusted 列，**应优先用 adjusted** |
| Multi-SWE-bench | 2–22 | 最高才 21.6%，与 Verified 差 4 倍 |
| HumanEval+ / MBPP+ | 60–90 | 老基准已饱和，与 agentic 能力弱相关 |
| LiveBench Coding | 0–100 | 各 release 不可直接比 |

**建议**：不要把所有分数塞进一个 `swe_bench_*` 字段。改成 per-benchmark 存原始分 + 一个独立的「编程档位」聚合器，每个测评单独标定 percentile → tier 映射，再按「数据质量」加权（Epoch 自测 > 单一 scaffold 第三方榜 > 混合 scaffold 榜 > 厂商自报）。

### 5.2 归一化清单

| 源 | `Model version` 形态 | 处理 |
|---|---|---|
| Epoch | `gpt-5.6-sol_max` | `split(/_(?=[a-z]+$)/)[0]`，`Organization` 按逗号拆 |
| LiveBench | `claude-opus-4-5-20251101-thinking-64k-high-effort` | 剥离 effort/thinking 后缀表 |
| SWE-rebench | `GLM-5.1__tools` / `GPT-5.6 Sol [medium]` | 去 `__*` 后缀、去 `[...]` |
| SWE-bench | `tags: ["Model: claude-opus-4-5-20251101"]` | 取 `Model:` 前缀项；**丢弃含 `+` 的多模型条目**和 `Undisclosed`/`Mixed Models`/`4x Scaled` 脏值 |
| SWE-bench-Live | `"Slingshot + Claude-4.6-Opus"` | 按 `+` 切取末段；三段以上丢弃 |
| EvalPlus | `StarCoder2-15B` + `link` 字段 | **优先用 `link` 里的 HF repo id 精确匹配** |

### 5.3 运维

- Epoch zip 已在下载，新增 12 个 CSV 解析**不增加任何网络请求**
- LiveBench 需 11 个额外 GET（约 120 KB），建议加 `If-None-Match`
- SWE-bench `leaderboards.json` 是 7.27 MB，**每小时全量拉不合适**，必须用 ETag 条件请求或降频到每日
- SWE-rebench 的 RSC 解析必须有 selftest + 失败降级（复用现有 `SANITY` 闸门）
- SWE-bench-Live 的 `reports-*.jsonl` 文件名会变，必须先拉目录列表
- HF 系源（BigCodeBench / Terminal-Bench HF）在中国大陆本地开发时不可用，`config.ts` 的 `HF` 探针机制要一并覆盖

---

## 附录 A：测算方法（可复现）

1. 从 `data/models.json` 读 485 个模型；「有编程成绩」定义为 `benchmarks.swe_bench_verified` / `swe_bench_vendor` / `swe_bench_pro` 三者任一非 `null`。
2. 归一化函数：lowercase → 去 `vendor/` 前缀 → 去括号内容 → 去日期（`20\d{6}` / `20\d{2}-\d{2}-\d{2}`）→ 非字母数字全删 → 剔除停用词（`base` `thinking` `nothinking` `reasoning` `high` `medium` `low` `xhigh` `max` `minimal` `*-effort` `instruct` `it` `chat` `preview` `latest` `exp` `tools` `text` `turbo` `001/002/003` 等）→ 剔除纯数字/`\d+k` token。
3. 匹配：先精确命中，再做双向前缀匹配（要求 key 长度 ≥ 5，取最长命中）。**这是保守匹配**——宁可漏也不错配，所以报告里的覆盖率是**下界**。
4. 各源的模型名列表来源：Epoch = zip 内 12 个 CSV 的 `Model version` 列（自写 quote-aware CSV parser，因字段内含换行）；LiveBench = 11 个 `table_*.csv` 第一列的并集（337 条）；SWE-rebench = 首页 RSC payload 里正则抽出的 117 条 `modelId`/`modelName`；SWE-bench = `leaderboards.json` 六个 split 的 `tags` 中 `Model:` 项（过滤含 `+` 与 URL 的脏值后 101 条）；SWE-bench-Live = `reports-0605.jsonl` 的 `name` 按 `+` 切末段（22 条）；EvalPlus = `results.json` 的 key（125 条）。
5. 抓取时间：**2026-09-01**。所有 HTTP 状态码、文件大小、commit 日期均为当日实测值。

## 附录 B：所有已验证端点速查

```
# 强烈推荐
https://epoch.ai/data/benchmark_data.zip                                              # CC-BY 4.0，已在用
https://livebench.ai/table_{2024_06_24,2024_07_26,2024_08_31,2024_11_25,
  2025_04_02,2025_04_25,2025_05_30,2025_11_25,2025_12_23,2026_01_08,2026_06_25}.csv    # Apache-2.0
https://livebench.ai/categories_2026_06_25.json                                       # 分组定义

# 次优先（有许可证问题待解决）
https://swe-rebench.com/                                                              # RSC payload；许可证未声明
https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json   # CC BY-NC 4.0
https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/info_for_leaderboard.json
https://raw.githubusercontent.com/SWE-bench-Live/swe-bench-live.github.io/main/reports-0605.jsonl  # 无 LICENSE
https://raw.githubusercontent.com/evalplus/evalplus.github.io/main/results.json        # Apache-2.0，已冻结

# 备用 / 低优先
https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/_data/polyglot_leaderboard.yml  # Apache-2.0，已冻结
https://raw.githubusercontent.com/LiveCodeBench/livecodebench.github.io/main/src/mocks/performances_generation.json  # 无 LICENSE
https://datasets-server.huggingface.co/rows?dataset=bigcode%2Fbigcode-models-leaderboard&config=default&split=train  # 中国大陆不通
https://storage.googleapis.com/crfm-helm-public/<project>/benchmark_output/runs/<ver>/  # 无编程 scenario

# ❌ 禁用（含 AA / LMArena）
epoch_data/scicode_external.csv        →  artificialanalysis.ai/evaluations/scicode
epoch_data/webdev_arena_external.csv   →  web.lmarena.ai/leaderboard   ← 当前已被 epoch.ts:68 接入，需撤除
```
