# 「大模型世界」能力数据源可获取性调研

> 调研日期：2026-08-31
> 方法：全部结论基于当日实际 HTTP 请求验证，不依赖记忆。所有 curl 命令与返回片段见各节。

---

## 0. 验证环境与一个必须先知道的坑

本机出口在中国大陆。实测连通性矩阵：

```bash
for u in https://api.github.com https://huggingface.co/api/models/gpt2 \
         https://openrouter.ai/api/v1/models https://lmarena.ai/ \
         https://epoch.ai/ https://artificialanalysis.ai/ https://www.swebench.com/ ; do
  out=$(curl -sS -m 12 -o /dev/null -w "%{http_code}" "$u" 2>&1) || true
  printf "%-50s => %s\n" "$u" "$out"
done
```

```
https://api.github.com                             => 200
https://huggingface.co/api/models/gpt2             => curl: (35) Recv failure: Connection reset by peer
https://openrouter.ai/api/v1/models                => 200
https://lmarena.ai/                                => curl: (35) Recv failure: Connection reset by peer
https://epoch.ai/                                  => 200
https://artificialanalysis.ai/                     => 200
https://www.swebench.com/                          => 200
```

**结论**：`huggingface.co` 和 `lmarena.ai` 从大陆被 TCP reset。`arena.ai`（LMArena 的新主域名）反而可直连。如果同步任务部署在国内，HF 参数量抓取会直接失败——**同步 Job 必须放在境外**，或对 HF 走镜像。本报告中对 HF 和 lmarena.ai 的验证改用境外出口完成。

---

## A. 综合能力 / 排名

| 数据源 | 获取方式 | 需 key | 更新频率 | 许可 / ToS 风险 | 中国厂商覆盖 |
|---|---|---|---|---|---|
| **Epoch AI Capabilities Index (ECI)** | `GET epoch.ai/data/benchmark_data.zip` → `epoch_capabilities_index.csv` | 否 | **日更** | CC-BY 4.0，署名即可商用。**风险极低** | 351 模型中 91 个中国厂商 |
| Artificial Analysis Intelligence Index | `GET /api/v2/language/models/free` + `x-api-key` | **是**（免费注册） | 持续 | 免费 API，**强制署名**，禁止放客户端，1000 req/day。风险低 | 有 |
| HELM | 公开 GCS 桶纯 JSON | 否 | v1.13.0 = 2026-06-10（滞后 3 个月） | 学术开放。风险低 | 弱 |
| LMArena / arena.ai Elo | 无 API；分数 SSR 在 HTML 里 | — | 实时 | **ToS 明确禁止自动化抓取。风险高** | 有 |
| BenchLM.ai（第三方聚合） | `GET benchlm.ai/api/data/leaderboard` | 否 | `lastUpdated: 2026-08-30` | 声明免费商用。单点第三方风险 | 50 模型中 12 个 |
| LiveBench | GitHub Pages 带日期 CSV | 否 | **已停更（2025-11-25）** | — | 弱 |
| SimpleBench | 经 Epoch ZIP 收录 | 否 | 2026-08-12 | CC-BY 4.0 | 103 模型中 23 个 |

### A.1 Epoch ECI —— 最推荐作为「综合战力」主干

```bash
curl -sSL -o benchmark_data.zip -w "HTTP:%{http_code} SIZE:%{size_download}\n" \
  "https://epoch.ai/data/benchmark_data.zip"
# HTTP:200 SIZE:474930
unzip -q benchmark_data.zip -d bench_zip && ls bench_zip/*.csv | wc -l
# 75
```

`epoch_capabilities_index.csv` 内容：867 行 / 351 个独立模型，列为
`Model version, ECI Score, Release date, Organization, Country, Model accessibility, Training compute (FLOP), Confidence, Model name, Description, Display name`

```
ECI= 162.5  Claude Fable 5 (high)      Anthropic       United States  rel=2026-06-09
ECI= 161.7  GPT-5.5 Pro (xhigh)        OpenAI          United States  rel=2026-04-23
ECI= 161.6  Claude Opus 5 (max)        Anthropic       United States  rel=2026-07-24
```

**关键证据：这是日更的，不是季度快照。** ZIP 页面标注 "LLM Benchmark Data ZIP, Updated Aug. 31, 2026"（即今天），且 GPQA 明细里的实际跑批时间戳最新为昨天：

```bash
python3 -c "
import csv; g=list(csv.DictReader(open('bench_zip/gpqa_diamond.csv')))
s=sorted(x['Started at'] for x in g if x.get('Started at'))
print('earliest',s[0],'latest',s[-1])"
# earliest 2025-01-27T00:00:00.000Z latest 2026-08-30T22:42:14.000Z
```

许可（`bench_zip/README.md` 原文）：

> Epoch AI's data is free to use, distribute, and reproduce provided the source and authors are credited under the Creative Commons Attribution license.

注意 ZIP 内混有外部来源数据，Epoch 明确标注：Aider Polyglot 与 Terminal-Bench 派生数据为 Apache-2.0。

另有 `pip install epochai` 走 Airtable API，能保留实体间关系（CSV 会丢失）。

### A.2 Artificial Analysis —— 有免费 API，但 v2 已进入弃用倒计时

无 key 直接请求：

```bash
curl -sS -i "https://artificialanalysis.ai/api/v2/data/llms/models" | head -12
```

```
HTTP/2 401
deprecation: @1785801600
link: <https://artificialanalysis.ai/data-api/migrate-v2-data>; rel="deprecation"; type="text/html"
sunset: Wed, 04 Nov 2026 23:59:59 GMT

{"error":"API key is required"}
```

**两个必须注意的点**：

1. 需要 key。免费 key 在 Insights Platform 注册后生成，走 `x-api-key` header，限 1000 req/day，**必须署名 https://artificialanalysis.ai/**，且官方要求不要放进客户端代码、要缓存响应。
2. `/api/v2/data/*` 系列 **2026-11-04 23:59 UTC 停用**，之后返回 410 Gone。当前应使用 `/api/v2/language/models/free`（Pro 版为 `/api/v2/language/models`，字段更全）。两个新端点实测均存在（无 key → 401）。

它的价值在于**一个端点打包了别处要单独凑的东西**（官方文档示例响应）：

```json
{
  "evaluations": {
    "artificial_analysis_intelligence_index": 62.9,
    "artificial_analysis_coding_index": 55.8,
    "artificial_analysis_math_index": 87.2,
    "mmlu_pro": 0.791, "gpqa": 0.748, "hle": 0.087,
    "livecodebench": 0.717, "scicode": 0.399, "math_500": 0.973, "aime": 0.77
  },
  "pricing": { "price_1m_blended_3_to_1": 1.925, "price_1m_input_tokens": 1.1, "price_1m_output_tokens": 4.4 },
  "median_output_tokens_per_second": 153.831,
  "median_time_to_first_token_seconds": 14.939
}
```

这是**唯一**能自动拿到 MMLU-Pro、吞吐、TTFT 的源。

### A.3 LMArena —— 技术上能抓，法律上不能

现主域名是 `arena.ai`。`lmarena.ai` 从大陆被 reset，但 `arena.ai` 可直连。

```bash
curl -sSL -o /dev/null -w "%{http_code} %{size_download}\n" "https://arena.ai/leaderboard"
# 200 5271760
curl -sSL -o /dev/null -w "%{http_code}\n" "https://arena.ai/api/leaderboard"
# 403
```

分数确实是服务端渲染进 HTML 的（可解析）：

```html
<span ... title="claude-fable-5">claude-fable-5</span>
<span class="text-sm font-normal tabular-nums text-text-primary">1507</span>
<span class="text-xs tabular-nums text-text-secondary">±5</span>
```

robots.txt 看起来还留了口子——`Allow: /leaderboard/text`，但同时：

```
Disallow: /api/
Disallow: /nextjs-api/
Disallow: /_next/
```

**但 Terms of Use 把路彻底堵死了**（`https://arena.ai/terms-of-use` 原文）：

> (vi) access the Services through programmatic or automated means or automatically query the Services, (vii) use any manual or automated software, devices or other processes (including but not limited to spiders, robots, scrapers, crawlers, avatars, data mining tools, or the like) to "scrape", extract, or download data, **including AI Service names, identifiers, or versions**, from any web pages contained in the Service

条款里点名了 "AI Service names, identifiers, or versions"，就是针对榜单数据本身写的。**判定：不要抓。**

官方给的合规路径（`arena.ai/blog/policy`）：

> The model evaluation and ranking pipelines have been open sourced in the Arena-Rank repository. We release a fraction of the data collected from the platform, as well.

`lmarena/arena-rank`（Apache-2.0，2026-08-04 有 push，`pip install arena-rank`）可以自己复算 Bradley-Terry Elo。但**原始对战数据的发布节奏是年度级的**：

```
lmarena-ai/arena-human-preference-55k    lastModified 2024-05-17
lmarena-ai/arena-human-preference-100k   lastModified 2025-02-11
lmarena-ai/arena-human-preference-140k   lastModified 2025-08-01   ← 最新，一年前
```

**所以 LMArena Elo 无法零人工维护地合法同步。** 合法替代是 Epoch 收录的 WebDev Arena（同为 Elo 制，CC-BY，见 A.5）。

### A.4 HELM —— JSON 最干净，但滞后

GCS 桶可直接列举，无需 key：

```bash
curl -sSL "https://storage.googleapis.com/storage/v1/b/crfm-helm-public/o?prefix=lite/benchmark_output/releases/v1.13.0/&delimiter=/&maxResults=50"
```

```
items: [('lite/benchmark_output/releases/v1.13.0/costs.json',   '2026-06-10T22:00:57Z'),
        ('.../groups.json',   '2026-06-10T22:00:56Z'),
        ('.../runs.json',     '2026-06-10T22:00:58Z'),
        ('.../schema.json',   '2026-06-10T22:00:58Z'),
        ('.../summary.json',  '2026-06-10T22:00:58Z')]
```

桶根目录有 26 个 suite：`lite/ mmlu/ vhelm/ long-context/ capabilities/ reasoning/ safety/ medhelm/ cleva/ seahelm/ ...`

最新 release 是 v1.13.0（2026-06-10），滞后约 3 个月，且对最新闭源旗舰覆盖弱。适合"学术严谨"场景，不适合当主干。

### A.5 BenchLM.ai —— 可用的 fallback

```bash
curl -sSL "https://benchlm.ai/api/data/leaderboard" | python3 -m json.tool | head -25
```

```json
{ "lastUpdated": "2026-08-30",
  "models": [{ "rank": 1, "model": "Claude Mythos 5", "creator": "Anthropic",
    "sourceType": "Proprietary", "overallScore": 83.4,
    "categoryScores": { "agentic": 75.79, "coding": 81.66, "reasoning": null,
      "multimodalGrounded": 84.8, "knowledge": 97.4, "multilingual": null,
      "instructionFollowing": null, "math": null },
    "inputPrice": 10, "outputPrice": 50,
    "evidenceStatus": "supported", "methodologyVersion": "bench-align-v5.3-2026-07-24" }]}
```

昨天刚更新，8 个能力分类，另有 `?format=csv` 和 `/api/data/pricing`，声明"free for personal and commercial use"。
**但**：只有 50 个模型、很多 category 为 null、方法论不透明、单点第三方。**作 fallback 可以，不要当主源。**

---

## B. 编程能力

| 数据源 | 获取方式 | 需 key | 更新频率 | 许可 / 风险 | 中国厂商覆盖 |
|---|---|---|---|---|---|
| **Epoch `swe_bench_verified.csv`** | Epoch ZIP | 否 | 日更（模型级） | CC-BY 4.0 | 33 模型中 9 个 |
| Epoch `mirrorcode.csv` | Epoch ZIP（Epoch 自研，抗污染） | 否 | **仅 6 个模型**，跑批 2026-08-12 | CC-BY 4.0 | 少 |
| swebench.com 官方榜 | HTML 内嵌 `<script type="application/json">` | 否 | **最新 2026-02-26（滞后 6 个月）** | 学术榜单，无反爬 ToS | 有 |
| Epoch `terminalbench_external.csv` | Epoch ZIP | 否 | 覆盖至 2026-04-23 | Apache-2.0（Epoch 注明） | 60 模型中 14 个 |
| Aider polyglot | GitHub raw YAML | 否 | **已停更（2025-10-03）** | Apache-2.0 | — |
| LiveCodeBench github.io | `performances_generation.json` | 否 | **旧版数据，仅 28 模型** | — | 少 |
| tbench.ai 官网 | 无公开 API（`/api/leaderboard` → 404） | — | — | — | — |

### B.1 SWE-bench 官方：有干净 JSON，但半年没更新

数据不是独立文件，而是内嵌在首页：

```bash
curl -sSL -o swebench.html "https://www.swebench.com/"   # 200, 4194100 bytes
grep -n "leaderboardData" js/mainResults.js
# 18:            leaderboardData = JSON.parse(dataScript.textContent);
```

抽取方式：

```bash
python3 -c "
import re,json
h=open('swebench.html',encoding='utf-8',errors='ignore').read()
m=re.search(r'<script type=\"application/json\" id=\"leaderboard-data\">\s*(.*?)\s*</script>',h,re.S)
d=json.loads(m.group(1)); print([x['name'] for x in d])"
# ['bash-only', 'Multilingual', 'Test', 'Verified', 'Lite', 'Multimodal']
```

字段非常丰富，甚至有 per-instance 明细：

```json
{"agent":"mini-SWE-agent","model_display":"Claude 4.5 Opus","model_org":"Anthropic",
 "resolved":76.8,"cost":376.95,"instance_calls":32.896,"date":"2026-02-17",
 "os_model":false,"os_system":true,
 "per_instance_details":{"astropy__astropy-12907":{"api_calls":32,"cost":0.722,"resolved":true}}}
```

**致命问题是新鲜度。** 各子榜最新条目日期：

```
bash-only    entries=47   latest dates: 2026-02-17, 2026-02-19, 2026-02-26
Verified     entries=180  latest dates: 2026-02-17, 2026-02-19, 2026-02-26
Lite         entries=84   latest dates: 2025-09-01, 2025-09-06, 2025-09-11
Multimodal   entries=22   latest dates: 2025-06-11, 2025-07-01, 2025-11-17
```

Verified 榜停在 **2026-02-26**，已 6 个月无新提交。原因是这个榜靠 agent 开发者主动投稿，且条目是 "agent + model" 组合而非纯模型，用来映射「模型的编程能力」本来就不干净。

`SWE-bench/experiments` 与 `swebench.github.io` 仓库均返回 404，没有备用数据仓库。

**建议改用 Epoch 自跑的版本**：`swe_bench_verified.csv`，35 行 / 33 模型，列含 `mean_score, Best score (across scorers), stderr, Release date, Organization, Country, Log viewer`，覆盖至 2026-06-16 的模型，9 个中国厂商模型。模型数少，但是**纯模型级、可比、日更、CC-BY**。

### B.2 Aider polyglot —— 数据源已死

```bash
curl -sSL -o aider_polyglot.yml -w "HTTP:%{http_code} SIZE:%{size_download}\n" \
  "https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/_data/polyglot_leaderboard.yml"
# HTTP:200 SIZE:45725
grep "^  date:" aider_polyglot.yml | sort -u | tail -3
```

```
  date: 2025-08-25
  date: 2025-10-03    ← 最新
```

最后 10 个模型止于 `gpt-5 (high)` / `DeepSeek-V3.2-Exp`。**停更 11 个月，不要用。** Epoch 的 `aider_polyglot_external.csv` 同样停在覆盖 2025-12-01 发布的模型。

### B.3 Terminal-Bench —— 官网无 API，只能走 Epoch

```bash
for p in /api/leaderboard /api/leaderboards /api/runs; do
  curl -sSL -o /dev/null -w "$p => %{http_code}\n" "https://www.tbench.ai$p"; done
# /api/leaderboard  => 404
# /api/leaderboards => 404
# /api/runs         => 404
```

官网是 Next.js RSC（HTML 里只有 `self.__next_f` payload，无 `__NEXT_DATA__`），无独立数据文件。GitHub 上的 `laude-institute/terminal-bench-2-leaderboard` 仓库是空的：

```bash
curl -sSL "https://api.github.com/repos/laude-institute/terminal-bench-2-leaderboard/contents/"
# [('.gitignore','file'), ('LICENSE','file'), ('README.md','file')]
```

**唯一可行路径是 Epoch 的 `terminalbench_external.csv`**：204 行 / 60 模型 / 14 个中国厂商，列含 `Agent, Accuracy mean, Accuracy SE, Agent Org, Model Org, Run date`，覆盖至 2026-04-23。许可 Apache-2.0。

### B.4 LiveCodeBench —— github.io 的 JSON 是旧的

```bash
curl -sSL -o lcb.json -w "HTTP:%{http_code} SIZE:%{size_download}\n" \
  "https://livecodebench.github.io/performances_generation.json"
# HTTP:200 SIZE:6950346
python3 -c "
import json; d=json.load(open('lcb.json'))
print(list(d.keys())); print('models:',len(d['models'])); print(d['models'][0])"
```

```
['performances', 'models', 'date_marks']
models: 28
{'model_name': 'deepseek-chat', 'model_repr': 'DeepSeek-V3', 'release_date': 1719705600000}
```

29540 条题目级明细，但**只有 28 个模型，最新是 DeepSeek-V3 时代**。现行 LCB 榜单在 HF Space（需境外访问）。建议改用 AA API 的 `evaluations.livecodebench`。

### B.5 Epoch ZIP 里其他可用的编程维度（全部 CC-BY，同一个 GET）

`mirrorcode.csv`（Epoch 自研）、`frontiercode_external.csv`、`frontierswe_external.csv`、`cursorbench_external.csv`、`deepswe_external.csv`、`gso_external.csv`、`ale_bench_external.csv`、`algotune_external.csv`、`webdev_arena_external.csv`

---

## C. 数学 / 推理 / 长上下文 / 视觉

**一个 475KB 的 GET 拿到 75 个 benchmark CSV，全部 CC-BY 4.0、无 key。** 这是本次调研最有价值的发现。下表的"最新覆盖模型"指该榜单里最新的模型发布日期（今天是 2026-08-31）：

| Epoch CSV | 指标列 | 模型数 | 中国厂商 | 最新覆盖模型 | 判定 |
|---|---|---|---|---|---|
| `epoch_capabilities_index.csv` | ECI Score | 351 | 91 | 2026-08-20 | ✅ 日更 |
| `gpqa_diamond.csv` | mean_score + stderr | 282 | 66 | 2026-08-20 | ✅ 日更 |
| `otis_mock_aime_2024_2025.csv` | mean_score + stderr | 258 | 61 | 2026-08-20 | ✅ AIME 的抗污染替代 |
| `arc_agi_2_external.csv` | Score + **Cost per task** | 192 | 26 | 2026-08-13 | ✅ |
| `webdev_arena_external.csv` | Arena Score + 95%CI + Votes | 117 | 42 | 2026-08-14 | ✅ Arena Elo 的合法替代 |
| `simplebench_external.csv` | Score (AVG@5) | 103 | 23 | 2026-08-12 | ✅ |
| `simpleqa_verified.csv` | mean_score + stderr | 66 | 有 | 2026-08-13（跑批 2026-08-27） | ✅ 事实性/抗幻觉 |
| `math_level_5.csv` | mean_score | 108 | 有 | **2025-10-15（跑批 2025-10-30）** | ❌ Epoch 已停跑，别当日更用 |
| `mirrorcode.csv` | mean_score | **仅 6** | 少 | 2026-07-09（跑批 2026-08-12） | ⚠️ Epoch 新自研榜，样本太少 |
| `swe_bench_verified.csv` | mean_score + stderr | 33 | 9 | 2026-06-16 | ✅ |
| `frontiermath.csv` / `_tier_4.csv` | mean_score | 101 | 17 | 2026-05-28 | ⚠️ 滞后 3 月 |
| `terminalbench_external.csv` | Accuracy mean + SE | 60 | 14 | 2026-04-23 | ⚠️ 滞后 4 月 |
| `hle_external.csv` | Accuracy + SE + Calibration Error | 46 | **3** | 2026-04-16 | ⚠️ 中国覆盖极差 |
| `metr_time_horizons_external.csv` | Time horizon 50%/80% + CI | 50 | 7 | 2026-04-07 | ⚠️ 概念很适合"耐力"属性 |
| `fictionlivebench_external.csv` | 0/400/1k/2k/4k/8k/16k/**120k** token score | 62 | 22 | 2026-01-27 | ⚠️ 长上下文唯一可得，滞后 7 月 |
| `os_world_external.csv` / `osworld_2_external.csv` | Score + Agent | 10 | 2 | 2026-02-17 | ⚠️ 模型太少 |
| `gdpval_external.csv` | Win Rate + Win+tie rate | 11 | **0** | 2025-12-11 | ❌ 太少 |
| `live_bench_external.csv` | Global avg + 6 分项 | 53 | 7 | 2025-11-13 | ❌ 上游停更 |
| `video_mme_external.csv` | overall w/wo subtitles + 长短视频分档 | 50 | 11 | 2025-06-18 | ❌ 过时 |
| `mmlu_external.csv` | EM + Shots | 137 | 25 | 2025-02-26 | ❌ 榜单本身已过时 |

其他视觉相关：`spatialviz_bench_external.csv`、`mindcube_external.csv`、`geobench_external.csv`、`vpct_external.csv`。

### C.1 三个拿不到的

**MMLU-Pro**：Epoch ZIP 里没有。唯一自动化路径是 AA API 的 `evaluations.mmlu_pro`（需 key）。原始榜单在 HF Space `TIGER-Lab/MMLU-Pro`。

**MMMU**：本地 DNS 无法解析 `mmmu-benchmark.github.io`，且它没有官方 JSON，Epoch 未收录，AA 也没有这项。

```bash
curl -sSL -o /dev/null -w "%{http_code}\n" "https://mmmu-benchmark.github.io/leaderboard.html"
# curl: (6) Could not resolve host
curl -sSL -o /dev/null -w "%{http_code}\n" \
  "https://raw.githubusercontent.com/MMMU-Benchmark/mmmu-benchmark.github.io/main/leaderboard.html"
# 404
```

**视觉是最大的缺口之一。**

**RULER**：仓库在，但只有评测代码，没有维护中的 leaderboard 数据文件。

```bash
curl -sSL -o /dev/null -w "%{http_code} %{size_download}\n" \
  "https://raw.githubusercontent.com/NVIDIA/RULER/main/README.md"
# 200 18187
```

不可自动同步。长上下文只能退到 `fictionlivebench_external.csv` 的 120k token score（滞后到 2026-01-27）。

---

## D. 参数量（关键难点）

### D.1 Epoch AI 模型数据库：4 个 CSV，无 key，CC-BY

```bash
for f in all_ai_models frontier_ai_models notable_ai_models large_scale_ai_models; do
  curl -sSL -o "epoch_$f.csv" "https://epoch.ai/data/$f.csv" \
    -w "$f => HTTP:%{http_code} SIZE:%{size_download}\n"; done
```

```
all_ai_models         => HTTP:200 SIZE:6794597   (3593 模型)
frontier_ai_models    => HTTP:200 SIZE:373107    (137 模型)
notable_ai_models     => HTTP:200 SIZE:2232175
large_scale_ai_models => HTTP:200 SIZE:1094996
```

47 列，关键的有：`Parameters, Parameters notes, Training compute (FLOP), Training compute notes, Publication date, Organization, Country (of organization), Model accessibility, Open model weights?, Training compute cost (2023 USD), Training hardware, Hardware quantity, Numerical format, Frontier model, Base model, Confidence`

新鲜度：最新 `Publication date` = 2026-08-14，滞后约 2.5 周；2026-06-01 之后收录 51 个模型。

### D.2 覆盖率实测：开源 94%，闭源 23%，OpenAI 3%，Anthropic 0%

对 2025-01-01 之后发布的 709 个模型统计：

```
accessibility (Open model weights?)     n   params   FLOP   cost
Yes                                   360      338    159      6
No                                    307       71     33      4
unknown                                42       17      1      0
```

按厂商拆开：

```
OpenAI               n=51   params=2   (3%)   FLOP=4   (7%)
Anthropic            n=16   params=0   (0%)   FLOP=1   (6%)
Google DeepMind      n=47   params=18  (38%)  FLOP=9   (19%)   ← 主要是 Gemma 开源系
xAI                  n=15   params=5   (33%)  FLOP=2   (13%)
Meta AI              n=11   params=6   (54%)  FLOP=3   (27%)
DeepSeek             n=23   params=22  (95%)  FLOP=10  (43%)
Alibaba              n=60   params=47  (78%)  FLOP=23  (38%)
Z.ai (Zhipu AI)      n=7    params=6   (85%)  FLOP=2   (28%)
MiniMax              n=14   params=8   (57%)  FLOP=4   (28%)
```

2026-08 发布的模型逐条看，泾渭分明：

```
2026-08-08 | Qwen3.8-2.4T-A95B      | Alibaba          | params= 2400000000000.0 | FLOP= -
2026-08-11 | GPT-5.6 Cyber          | OpenAI           | params= -               | FLOP= -
2026-08-11 | GPT-5.5 Cyber          | OpenAI           | params= -               | FLOP= -
2026-08-12 | Grok 4.6               | xAI              | params= -               | FLOP= -
2026-08-13 | Gemini 3.7 Flash       | Google DeepMind  | params= -               | FLOP= -
2026-08-14 | GLM-5.3                | Z.ai (Zhipu AI)  | params= 744000000000.0  | FLOP= -
2026-08-14 | Qwen 3.8 27B           | Alibaba          | params= 27000000000.0   | FLOP= -
2026-07-31 | K-EXAONE 2.0           | LG AI Research   | params= 750000000000.0  | FLOP= 3.55e+24
```

### D.3 Hugging Face：开源模型的参数量是**精确真值**

```bash
curl -sS "https://huggingface.co/api/models/Qwen/Qwen3-235B-A22B?expand%5B%5D=safetensors&expand%5B%5D=config&expand%5B%5D=downloads&expand%5B%5D=lastModified"
```

```json
{"id":"Qwen/Qwen3-235B-A22B",
 "config":{"architectures":["Qwen3MoeForCausalLM"],"model_type":"qwen3_moe",
           "num_experts":128,"num_experts_per_tok":8},
 "downloads":354190,"lastModified":"2025-07-26T03:45:13.000Z","likes":1108,
 "safetensors":{"parameters":{"BF16":235093634560},"total":235093634560}}
```

无需 key，精确到个位。`config` 里的 `num_experts` / `num_experts_per_tok` 可以算 MoE 激活参数量。

批量拿整个组织，一次请求：

```bash
curl -sS "https://huggingface.co/api/models?author=deepseek-ai&expand%5B%5D=safetensors&expand%5B%5D=downloads&expand%5B%5D=lastModified&limit=8"
```

```json
[{"id":"deepseek-ai/DeepSeek-V4-Flash-0731","downloads":4575518,
  "safetensors":{"parameters":{"BF16":1483567488,"I64":2327040,"F32":37741630,
                               "F8_E4M3":6304038912,"I8":296352743424},
                 "total":304180418494}},
 {"id":"deepseek-ai/DeepSeek-V4-Pro-0813","downloads":127009,
  "safetensors":{"parameters":{"BF16":2954820352,"F8_E4M3":23952621568,
                               "I8":1623497637888},"total":1650497936906}}]
```

**两个坑**：

1. `safetensors.total` 是各 dtype 分片求和。混合量化仓库（上面 DeepSeek 同时含 `BF16` / `F8_E4M3` / `I8`，另有 `DeepSeek-V4-Flash-DSpark` 同时含 `F8_E8M0` 和 `F8_E4M3`）会失真。**要按 dtype 判断主权重格式再取，不能直接用 `total`。**
2. `huggingface.co` 在大陆被 reset（见第 0 节）。

### D.4 重点结论：闭源不公开参数量，**而且训练算力估计同样为零覆盖**

这是本次调研最反直觉、也最容易踩的结论。很多方案会想"参数量拿不到就用训练算力 FLOP 代替"——**对 2026 年的闭源模型行不通**。

ECI 表中 2026-01-01 之后发布的模型，`Training compute (FLOP)` 非空计数：

```
OpenAI               with FLOP=0     without=62
Anthropic            with FLOP=0     without=55
Google DeepMind      with FLOP=0     without=24
xAI                  with FLOP=0     without=14
Alibaba              with FLOP=0     without=28
DeepSeek             with FLOP=18    without=0
Z.ai (Zhipu AI)      with FLOP=1     without=11
```

旁证：`frontier_ai_models.csv` 里 2025-06-01 之后**只剩 1 个模型**（xAI 的），因为 Epoch 的 "frontier" 判定依赖已知算力，新闭源模型压根进不了这个集合。

```
frontier_ai_models rows: 137
since 2025-06: 1
xAI                n=1   params=1 FLOP=1
```

### D.5 替代代理指标建议（按可得性 × 可解释性排序）

| 代理指标 | 数据源 | 覆盖率 | 与「规模」的关系 | 建议映射的角色属性 |
|---|---|---|---|---|
| **输出价格 $/M tokens** | OpenRouter `pricing.completion`；models.dev `cost.output` | ~100% | 最强的服务成本信号，定价隐含算力成本 | 身价 / 稀有度 |
| **厂商命名档位** | 从 model id 解析 `nano/mini/flash/lite/air` → `pro/max/opus/ultra` | ~100% | **厂商自己的规模分层，最贴近真实意图** | 体型 |
| **ECI 分数** | Epoch ECI CSV | 351 模型 | 直接就是能力，无需绕道参数量 | 等级 / 战力 |
| 上下文窗口 | OpenRouter `context_length`；models.dev `limit.context` | ~100% | 与 KV cache 预算相关 | 记忆容量 |
| 吞吐 tokens/s | AA `median_output_tokens_per_second` | AA 覆盖范围 | 同硬件下越大越慢 | 速度 / 敏捷 |
| TTFT | AA `median_time_to_first_token_seconds` | 同上 | prefill + 推理链长度 | 反应速度 |
| **精确参数量（总 / 激活）** | HF safetensors + config | **仅开源** | 真值 | 开源角色的体型真值 |
| 训练算力 FLOP | Epoch | 基本只有开源 | 真值/估计 | **慎用，闭源零覆盖** |

**明确建议：不要把「参数量」设成必填的角色属性。** 改成双轨制：

- **开源模型**：HF `safetensors`（按主 dtype 修正）+ `config` 算激活参数量 → 显示真实体型，可以做得很硬核（"2.4T 总参 / 95B 激活"）。
- **闭源模型**：用「输出价格档位 × 厂商命名档位」合成一个 1–5 星的"体型等级"，UI 上诚实标注 *"闭源，规模未公开（按定价档位推定）"*。

理由有两条：一是编一个假参数量会在模型迭代时不断被打脸；二是价格和命名档位是 100% 覆盖且天然稳定的字段，而参数量/算力估计的覆盖率会随厂商越来越封闭而继续下降。诚实标注反而是更强的产品设定——"这个角色的真实体型是个谜"本身就很适合拟人化叙事。

---

## E. 吞吐速度 / 延迟 / 知识截止 / 弃用退役

| 维度 | 数据源 | 获取方式 | 需 key | 覆盖率 | 判定 |
|---|---|---|---|---|---|
| 吞吐 tokens/s | Artificial Analysis | `/api/v2/language/models/free` | **是** | AA 榜内模型 | ✅ 唯一可得 |
| TTFT | Artificial Analysis | 同上 | **是** | 同上 | ✅ 唯一可得 |
| 吞吐 / 延迟 | OpenRouter | `/api/v1/models/{id}/endpoints` | 否 | **字段全为 null** | ❌ 不可用 |
| 服务健康度 | OpenRouter | 同上的 `uptime_last_*` | 否 | 有值 | ✅ 可当稳定性属性 |
| 知识截止 | models.dev | `GET models.dev/api.json` | 否 | 3981/7494（53%） | ✅ |
| 知识截止 | OpenRouter | `/api/v1/models` 的 `knowledge_cutoff` | 否 | 161/396（41%） | ✅ 互补 |
| 是否退役 | OpenRouter 列表每日快照 diff | 同上 | 否 | ~100% | ✅ **最可靠** |
| 是否退役 | models.dev `status` | 同上 | 否 | 193 条 deprecated | ⚠️ 弱信号 |
| 是否退役 | OpenRouter `expiration_date` | 同上 | 否 | **6/396** | ❌ 不可依赖 |
| 官方退役日期 | 厂商 docs 页面 | HTML 抓取 | 否 | 权威但非结构化 | ⚠️ 仅做告警 |

### E.1 吞吐 / 延迟：只有 AA，OpenRouter 是个陷阱

OpenRouter 的 endpoints API **有** `throughput_last_30m` 和 `latency_last_30m` 字段，看起来完美，但实测全是 null：

```bash
for m in "deepseek/deepseek-v4-flash" "qwen/qwen3.8-27b" "z-ai/glm-5.3"; do
  curl -sSL "https://openrouter.ai/api/v1/models/$m/endpoints" -o ep.json
  python3 -c "
import json; d=json.load(open('ep.json'))['data']['endpoints']
for e in d[:5]: print(f\"  {e['provider_name'][:24]:<24} thr30m={e.get('throughput_last_30m')} lat30m={e.get('latency_last_30m')} up1d={e.get('uptime_last_1d')}\")"
done
```

```
--- deepseek/deepseek-v4-flash ---
  DigitalOcean         thr30m=None lat30m=None up1d=99.65492833829248
  StreamLake           thr30m=None lat30m=None up1d=99.47784956206516
  DeepInfra            thr30m=None lat30m=None up1d=99.64873748123462
--- qwen/qwen3.8-27b ---
  Reka                 thr30m=None lat30m=None up1d=97.85805893997268
  AkashML              thr30m=None lat30m=None up1d=99.69961739588015
--- z-ai/glm-5.3 ---
  Io Net               thr30m=None lat30m=None up1d=91.44625238012809
  DeepInfra            thr30m=None lat30m=None up1d=96.13837607399134
```

（对 `anthropic/claude-opus-5` 同样为 null。）

**结论：吞吐/延迟必须用 AA 的免费 key。** 但 `uptime_last_5m/30m/1d` 是有真实值的，可以映射成角色的"稳定性/健康度"，而且完全免 key。

### E.2 知识截止：两个免 key 源互补

OpenRouter：

```bash
curl -sS "https://openrouter.ai/api/v1/models" -o openrouter.json
python3 -c "
import json; d=json.load(open('openrouter.json'))['data']
kc=[x for x in d if x.get('knowledge_cutoff')]
print('models total:',len(d)); print('with knowledge_cutoff:',len(kc))
for x in kc[:6]: print(' ',x['id'],'->',x['knowledge_cutoff'])"
```

```
models total: 396
with knowledge_cutoff: 161
  openai/gpt-5.6-luna-pro -> 2026-02-16
  openai/gpt-5.6-sol -> 2026-02-16
  google/gemini-3.5-flash -> 2025-01-01
  openai/gpt-5.5-pro -> 2025-12-01
```

models.dev（覆盖面大得多）：

```bash
curl -sSL -o modelsdev.json "https://models.dev/api.json"   # 200, 4435684 bytes
```

```
providers: 212        total models: 7494
with knowledge cutoff: 3981 (53%)      with release_date: 7494 (100%)
all field names: ['attachment','cost','description','experimental','family','id',
 'interleaved','knowledge','last_updated','limit','modalities','name','open_weights',
 'provider','reasoning','reasoning_options','release_date','status',
 'structured_output','temperature','tool_call']
```

单条示例：

```json
{"id":"gpt-4o","name":"GPT-4o","family":"gpt","knowledge":"2023-09",
 "release_date":"2024-05-13","last_updated":"2024-08-06","open_weights":false,
 "modalities":{"input":["text","image","pdf"],"output":["text"]},
 "limit":{"context":128000,"output":16384},
 "cost":{"input":2.5,"output":10,"cache_read":1.25}}
```

许可与可靠性：仓库是 `anomalyco/models.dev`，**MIT 许可**，6658 stars，今天（2026-08-31T07:34Z）还在 push。这是一个非常适合零维护依赖的社区数据库。

### E.3 弃用/退役：没有单一结构化源，推荐用「每日快照 diff」

对「角色是否还活着」这个设定，我实测了四条信号：

**(a) OpenRouter `expiration_date` —— 覆盖率太低，不能用**

```
with expiration_date: 6 / 396
  z-ai/glm-5.3 -> 2098-12-31          ← 明显是占位符
  z-ai/glm-5-turbo -> 2098-12-31
  dots-studio/dots-3-note-preview:free -> 2026-09-30
  z-ai/glm-4.5 -> 2026-12-31
```

**(b) 从 OpenRouter 列表中消失 —— 最可靠，这是我推荐的做法**

```bash
python3 -c "
import json,datetime
d=json.load(open('openrouter.json'))['data']; ids=[x['id'] for x in d]
for p in ['openai/gpt-4-32k','openai/gpt-3.5-turbo','openai/gpt-4o',
          'anthropic/claude-3-opus','openai/o1','google/gemini-2.5-pro']:
    print(f'  {p:<28} present={p in ids}')
cr=sorted((x['created'],x['id']) for x in d)
print('  oldest:',datetime.datetime.fromtimestamp(cr[0][0],datetime.UTC).date(),cr[0][1])
print('  newest:',datetime.datetime.fromtimestamp(cr[-1][0],datetime.UTC).date(),cr[-1][1])"
```

```
  openai/gpt-4-32k             present=False    ← 已退役，从列表消失
  anthropic/claude-3-opus      present=False    ← 已退役
  openai/gpt-3.5-turbo         present=True
  openai/gpt-4o                present=True
  openai/o1                    present=True
  google/gemini-2.5-pro        present=True
  oldest: 2023-05-28 openai/gpt-3.5-turbo
  newest: 2026-08-28 tencent/hy4-preview
```

每天存一份模型 id 快照，消失即判定为"退役"，`created` 字段给出"出生日期"。**完全自动、免 key、覆盖 ~100%。**

**(c) models.dev `status` —— 弱信号，注意粒度**

```
  7223  status=None
   193  status=deprecated   e.g. nvidia/moonshotai/kimi-k2-instruct-0905,
                                 greenpt/glm-5.1, xiaomi-token-plan-sgp/mimo-v2-pro
    78  status=beta
```

注意它是 **provider × model 粒度**——`nvidia/moonshotai/kimi-k2.6` 标 deprecated 意思是"NVIDIA 这个托管方下线了它"，不等于"月之暗面官方退役了 K2.6"。只能当弱信号。

**(d) 厂商官方页面 —— 权威但非结构化**

```
https://platform.openai.com/docs/deprecations                      => 200 447782
https://docs.anthropic.com/en/docs/about-claude/model-deprecations  => 200 541724
https://ai.google.dev/gemini-api/docs/changelog                    => 200 162190
```

OpenAI 页面确实有 "Upcoming deprecations" 章节和明确 shutdown date，例如实际抓到的文本：

> Upcoming deprecations are listed below, with the most recent announcements at the top. **2026-08-26: Transcription models** — On August 26, 2026, we notified developers using `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, and `gpt-4o-transcribe-diarize` of their deprecation and removal from the ...

以及有用的语义区分：deprecated（已宣布退役）≠ shut down / sunset（已不可访问）≠ legacy（不再更新）。这个三态很适合直接映射成角色状态。

但这是**纯 HTML 叙述**，要靠 LLM 抽取，页面改版就会崩。**不算零人工维护**，建议只当人工校验/告警的参考，不要放进主链路。

---

## F. 数据缺口清单

| 缺口 | 影响的角色维度 | 为什么拿不到（有证据） | 替代代理指标 |
|---|---|---|---|
| **闭源模型参数量** | 体型 | Epoch 覆盖率：OpenAI 3%、Anthropic 0%；GPT-5.6/Grok 4.6/Gemini 3.7 Flash 均为空 | 输出价格档位 × 厂商命名档位 → 1–5 星，UI 标注"未公开" |
| **闭源模型训练算力** | 体型的备选代理 | 2026 年 OpenAI/Anthropic/Google/xAI 的 FLOP 估计**全为 0 覆盖** | 同上。**不要指望这条** |
| MoE 激活参数量（闭源） | 总量 vs 战斗力 | 完全未披露 | 仅开源模型用 HF `config.num_experts_per_tok` 计算 |
| **LMArena Elo** | 人类偏好 / 人气 | 无 API（`/api/leaderboard` → 403）；ToS 明文禁止自动化抓取；官方数据集最新 2025-08-01 | Epoch `webdev_arena`（CC-BY，2026-08-14，42 个中国模型）；AA 的 media Elo；OpenRouter 的 provider 数 / 上架时长当人气 |
| **MMMU / 视觉能力** | 视力 | 无官方 JSON，Epoch 未收录，AA 无此项，域名本地不可解析 | Epoch `video_mme`（已过时到 2025-06）+ `spatialviz_bench` + `mindcube` + `geobench` 拼；或**降级为布尔值**"是否支持图像输入"（OpenRouter `input_modalities` 100% 覆盖） |
| **长上下文真实能力** | 记忆质量 | RULER 无维护中的榜单数据；Fiction.liveBench 经 Epoch 收录但滞后至 2026-01-27 | `context_length`（100% 覆盖）当"记忆容量"；`fictionlivebench` 120k score 当"记忆质量"并标注滞后 |
| MMLU-Pro | 知识广度 | Epoch ZIP 无此项 | AA `evaluations.mmlu_pro`（需 key）；或直接用 GPQA Diamond 替代 |
| SWE-bench Verified 新鲜度 | 编程 | 官方榜靠投稿，最新 2026-02-26（滞后 6 个月），且是 agent+model 组合 | Epoch 自跑的 `swe_bench_verified.csv`（模型级、日更，但只有 33 个模型）。编程维度是整套方案里模型覆盖最薄的一环，可用 ECI 的 coding 相关分项补 |
| Aider polyglot / LiveBench / LiveCodeBench | 编程 / 综合 | 上游停更：2025-10-03 / 2025-11-25 / 仅 28 模型 | 弃用。换 Epoch `swe_bench_verified` + `terminalbench`（后者滞后 4 月） |
| **吞吐 / 延迟无免 key 源** | 速度 | OpenRouter 的 `throughput_last_30m`、`latency_last_30m` 实测全 null | 只能用 AA 免费 key（注意 2026-11-04 迁移）；退化方案：用价格反推 |
| 官方退役日期 | 是否活着 | 无结构化 API；`expiration_date` 仅 6/396 | OpenRouter 模型列表**每日快照 diff** |
| HLE / GDPval 的中国模型覆盖 | 极限知识 / 经济价值 | `hle_external.csv` 46 模型仅 3 个中国厂商；`gdpval` 11 模型 0 个 | 不要用这两项做中外模型对比 |

---

## G. 推荐的「可自动同步的能力维度最小集」

### Tier 1 — 零人工维护、免 key、许可清晰（建议作为主干）

| 角色维度 | 数据源 | 端点 | 更新频率 | 许可 |
|---|---|---|---|---|
| 综合战力 | Epoch ECI | `benchmark_data.zip` → `epoch_capabilities_index.csv` | **日更** | CC-BY 4.0 |
| 科学推理 | Epoch GPQA Diamond | 同一个 ZIP | **日更** | CC-BY 4.0 |
| 数学 | Epoch OTIS Mock AIME（**不要用 `math_level_5`**，它停在 2025-10） | 同一个 ZIP | **日更** | CC-BY 4.0 |
| 抽象推理 | Epoch ARC-AGI-2（附 Cost per task） | 同一个 ZIP | 2026-08-13 | CC-BY 4.0 |
| 编程 | Epoch `swe_bench_verified`（33 模型，模型级） | 同一个 ZIP | **日更** | CC-BY 4.0 |
| 常识陷阱 | Epoch SimpleBench | 同一个 ZIP | 2026-08-12 | CC-BY 4.0 |
| 事实性 / 抗幻觉 | Epoch `simpleqa_verified`（66 模型） | 同一个 ZIP | 跑批 2026-08-27 | CC-BY 4.0 |
| 人气型 Elo | Epoch `webdev_arena` | 同一个 ZIP | 2026-08-14 | CC-BY 4.0 |
| 参数量（开源） | HF API | `/api/models?author=X&expand[]=safetensors&expand[]=config` | 实时 | 各模型 license |
| 发布日期 / 国别 / 开源与否 | Epoch | `all_ai_models.csv` | ~2.5 周滞后 | CC-BY 4.0 |
| 价格 / 上下文 / 模态 / 推理档位 | OpenRouter | `/api/v1/models` | 实时 | 公开 API |
| 知识截止 / 发布日期 / 成本 | models.dev | `/api.json` | 每日 push | **MIT** |
| 是否还活着 | OpenRouter 列表每日快照 diff | `/api/v1/models` | 实时 | 公开 API |
| 服务健康度 | OpenRouter | `/api/v1/models/{id}/endpoints` 的 `uptime_last_1d` | 实时 | 公开 API |

**这套最小集只依赖 4 个域名、约 5 个 HTTP 请求**（Epoch ZIP + Epoch all_models CSV + OpenRouter models + models.dev api.json + HF 按需），覆盖 14 个维度。当日实测全部健康：

```
2026-08-31 08:23:24 UTC
  https://epoch.ai/data/benchmark_data.zip        => 200 474930B   2.58s
  https://epoch.ai/data/all_ai_models.csv         => 200 6794597B  7.26s
  https://openrouter.ai/api/v1/models             => 200 655383B   2.59s
  https://models.dev/api.json                     => 200 4435684B  10.87s
  https://benchlm.ai/api/data/leaderboard         => 200 19468B    5.23s
  https://www.swebench.com/                       => 200 4194100B  7.51s
```

中国厂商覆盖：Epoch 有 `Country (of organization)` 字段，ECI 的 351 个模型里 91 个是中国厂商（DeepSeek / Qwen / GLM / Kimi / MiniMax / 腾讯 / 百度 / 小米 / 字节 / 美团 / 阶跃）；OpenRouter 的 396 个模型里 126 个是中国厂商。**覆盖良好，不需要额外接国内榜单。**

### Tier 2 — 需一个免费 key，性价比很高（建议加上）

**Artificial Analysis** `/api/v2/language/models/free`，一次请求换来：Intelligence / Coding / Math Index + MMLU-Pro + GPQA + HLE + LiveCodeBench + AIME + 价格 + **tokens/s** + **TTFT**。

代价：注册一次拿 key；1000 req/day（每天同步 1 次完全够）；**必须署名**；**必须在 2026-11-04 前从 `/api/v2/data/*` 迁到 `/api/v2/language/models/free`**。

它补上了 Tier 1 的两个洞：吞吐/延迟、MMLU-Pro。

### Tier 3 — 不建议纳入自动同步

| 源 | 原因 |
|---|---|
| LMArena / arena.ai Elo | **ToS 明文禁止自动化抓取**，法律风险 |
| swebench.com 内嵌 JSON | 可解析但滞后 6 个月，且是 agent 级不是模型级 |
| Aider polyglot | 上游停更 2025-10-03 |
| LiveBench | 上游停更 2025-11-25 |
| LiveCodeBench github.io JSON | 仅 28 个旧模型 |
| HELM | 滞后 3 个月、旗舰覆盖弱（但若要"学术严谨"的多 suite 数据，它的 JSON 结构是最干净的） |
| 厂商 deprecation 页面 | 非结构化，页面改版即崩；只做人工告警 |
| BenchLM.ai | 单点第三方、方法论不透明、仅 50 模型；作 fallback 可以 |

### 落地建议：角色属性映射

结合可获取性，给拟人化角色的属性映射建议：

| 角色属性 | 建议映射 | 数据可靠性 |
|---|---|---|
| 等级 / 战力 | Epoch ECI Score | ★★★ 日更 |
| 智力 | GPQA Diamond | ★★★ 日更 |
| 数学 | OTIS Mock AIME | ★★★ 日更 |
| 工程力 | Epoch SWE-bench Verified（33 模型，日更、模型级） | ★★☆ 日更但模型数少 |
| 灵光 / 直觉 | SimpleBench（常识陷阱） | ★★☆ |
| 诚实度 | SimpleQA Verified（抗幻觉） | ★★★ |
| 耐力 | METR Time Horizon（能独立干多久的活） | ★★☆ 滞后 4 月 |
| 记忆容量 | `context_length` | ★★★ 100% |
| 记忆质量 | Fiction.liveBench 120k score | ★☆☆ 滞后 7 月 |
| 敏捷 / 速度 | AA `median_output_tokens_per_second` | ★★☆ 需 key |
| 反应速度 | AA `median_time_to_first_token_seconds` | ★★☆ 需 key |
| 体型（开源） | HF safetensors 总参 + 激活参 | ★★★ 真值 |
| 体型（闭源） | 输出价格档位 × 命名档位 → 1–5 星 + "未公开"标注 | ★★☆ 代理 |
| 身价 / 稀有度 | 输出价格 $/M tokens | ★★★ 100% |
| 视力 | 降级为"是否支持图像/视频输入"布尔值 | ★★★ 100% |
| 出生日期 | Epoch `Publication date` / OpenRouter `created` | ★★★ |
| 血统 / 门派 | Epoch `Organization` + `Country` | ★★★ |
| 是否开源 | Epoch `Open model weights?` / models.dev `open_weights` | ★★★ |
| **是否还活着** | OpenRouter 列表每日 diff（消失 = 退役） | ★★★ 免 key |
| 健康度 | OpenRouter `uptime_last_1d` | ★★★ 免 key |
| 记忆终点（知识截止） | models.dev `knowledge` + OpenRouter `knowledge_cutoff` | ★★☆ 41–53% |

---

## 附：Epoch benchmark ZIP 完整清单（75 个 CSV，一次 GET，全 CC-BY 4.0）

```
adversarial_nli  aider_polyglot  ale_bench  algotune  apex_agents  arc_agi  arc_agi_2
arc_ai2  balrog  bbh  blueprint_bench_2  bool_q  btf3  cad_eval  chess_puzzles
cl_bench  cl_bench_life  common_sense_qa_2  critpt  cursorbench  cybench
deepresearchbench  deepswe  enigma_eval  epoch_capabilities_index  exploitbench
fictionlivebench  forecastbench  frontiercode  frontiermath  frontiermath_tier_4
frontierswe  gbaeval  gdp_pdf  gdpval  geobench  gpqa_diamond  gso  gsm8k
hella_swag  hle  lambada  lech_mazur_writing  live_bench  math_level_5
metr_time_horizons  mindcube  mirrorcode  mmlu  mystery_game_puzzles  open_book_qa
os_world  osworld_2  otis_mock_aime_2024_2025  piqa  posttrainbench  proofbench
rli  scicode  science_qa  simplebench  simpleqa_verified  spatialviz_bench
superglue  surface_evolver_bench  swe_bench_verified  terminalbench
the_agent_company  trivia_qa  vending_bench_2  video_mme  vpct  webdev_arena
weirdml  wino_grande
```

引用要求：

```
Epoch AI, 'AI Benchmarking Hub'. Published online at epoch.ai.
Retrieved from 'https://epoch.ai/benchmarks' [online resource].
```
