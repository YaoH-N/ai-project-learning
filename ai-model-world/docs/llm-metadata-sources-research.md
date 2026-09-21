# 全球 LLM 元数据自动同步：数据源调研报告

**调研日期**：2026-08-31
**方法**：全部结论基于实际 `curl` 请求验证，而非文档描述。测试机网络位于中国大陆（UTC+8），部分境外域名存在网络层阻断，报告中已明确区分「需要 key」与「网络不可达」两种情况。

---

## 1. 核心结论（TL;DR）

1. **存在三个完全无需 API key、可直接编程访问的高质量源**，全部实测 HTTP 200：
   - `models.dev`（MIT 许可，**唯一法律上完全干净且字段最全的源**）
   - `OpenRouter /api/v1/models`（字段最丰富，但 ToS 有反抓取条款）
   - `Vercel AI Gateway /v1/models`（意外发现，**唯一有独立 `released` 字段的商业网关**）
   - 外加 `LiteLLM` 的 GitHub raw JSON（MIT，定价维度最全，3408 条）

2. **最重要的陷阱**：OpenRouter 的 `created` **不是模型发布日期**，而是「上架 OpenRouter 的时间」。实测 66 个 2026 年模型，仅 71% 与真实发布日一致，最大偏差 **+179 天**。任何把 `created` 当发布日的实现都会产生错误的时间线。

3. **社区维护 + CI 自动更新的上游仓库确实存在，就是 `models.dev`**：GitHub Actions 以 `cron: "17 * * * *"`（每小时）按 provider 矩阵自动同步，实测最近提交为持续的 `chore(sync): update ... model catalog`。可以直接作为上游依赖。

4. **Artificial Analysis 基本不可用于公开网站**：免费层明确「仅限内部使用、禁止再分发」，Pro（$417/月/座）仍禁止再分发原始数据文件，只有 Commercial 套餐才有再分发权。

5. **两个字段是全局缺口**：**开源许可证**（models.dev 覆盖率仅 9%）和**参数量**（所有已验证源均无此字段）。这两项只能靠 Hugging Face 补齐，而 HF 在本机网络被阻断，未能亲自验证。

---

## 2. 可用性验证结果（实测 curl 证据）

### 2.1 无需 key，实测 200 —— 可直接作为生产数据源

**OpenRouter**

```bash
curl -s -o openrouter.json -w "HTTP %{http_code} size=%{size_download} time=%{time_total}\n" \
  https://openrouter.ai/api/v1/models
# HTTP 200 size=655383 time=2.720209   → 396 个模型
```

响应头（关键，决定轮询策略）：

```
HTTP/2 200
cf-cache-status: HIT
access-control-allow-origin: *
cache-control: public, max-age=300, stale-while-revalidate=3600, stale-if-error=3600
server: cloudflare
```

`stale-if-error=3600` 意味着即使源站故障，Cloudflare 边缘仍会返回 1 小时内的旧数据 —— 这是一层免费的兜底。`access-control-allow-origin: *` 说明可从浏览器直接调用。**响应头中不存在任何 `x-ratelimit-*` 字段。**

单模型多 provider 端点（同样无 key）：

```bash
curl -s https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints
# HTTP 200, 16613 bytes，返回该模型在各 provider 的报价、状态、近 30 分钟延迟/吞吐
```

**models.dev**（三个端点全部无 key）

```bash
curl -s -o modelsdev.json -w "HTTP %{http_code} size=%{size_download}\n" https://models.dev/api.json
# models.json HTTP 200 size=4435684   → 212 个 provider，7494 条 provider×model，3558 个去重模型 id
curl -s -o mdmodels.json  -w "HTTP %{http_code} size=%{size_download}\n" https://models.dev/models.json
# HTTP 200 size=293117   → 363 条「与 provider 无关」的模型事实
curl -s -o mdcatalog.json -w "HTTP %{http_code} size=%{size_download}\n" https://models.dev/catalog.json
# HTTP 200 size=4728825   → 上面两者合并
```

响应头：

```
cache-control: public, max-age=0, must-revalidate
etag: "8fc467476b5be502af549f56f3e3f353"
access-control-allow-origin: *
```

**有 ETag 且 `must-revalidate`** → 可用 `If-None-Match` 条件请求，命中 304 时零流量，非常适合高频轮询 4.4MB 的 `api.json`。

**三端点的分工很关键**：
- `models.json`：模型本身的事实（发布日期、许可、权重、开源与否）—— 用于「模型档案」
- `api.json`：provider × model 的笛卡尔积（同一模型在 15 家 provider 的不同报价）—— 用于「比价」。实测 `glm-5.3` 由 **15 个 provider** 提供

**Vercel AI Gateway**（本次调研的意外发现）

```bash
curl -sL https://ai-gateway.vercel.sh/v1/models
# HTTP 200, 368180 bytes → 362 个模型，无 key
```

```json
{
  "id": "alibaba/qwen-3-14b",
  "created": 1755815280,
  "released": 1745798400,
  "owned_by": "alibaba",
  "name": "Qwen3-14B",
  "context_window": 40960,
  "max_tokens": 16384,
  "type": "language",
  "zdr": "all",
  "no_training": "all",
  "tags": ["reasoning", "tool-use"],
  "modalities": { "input": ["text"], "output": ["text"] },
  "supported_parameters": ["max_tokens","temperature","stop","tools","tool_choice","reasoning","include_reasoning"],
  "knowledge": "2025-04",
  "pricing": { "input": "0.00000012", "output": "0.00000024" }
}
```

**它同时给出 `created`（上架时间）和 `released`（发布时间）两个独立字段**，是唯一在商业网关中明确区分二者的源。另有 `zdr`（零数据保留）、`no_training`（不用于训练）两个合规字段，其他源都没有。

**LiteLLM**

```bash
curl -s -o litellm.json -w "HTTP %{http_code} size=%{size_download}\n" \
  https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
# HTTP 200 size=2005767   → 3408 条，模型数量最多
```

定价维度是全场最细的（以 `claude-opus-4-7` 为例）：

```json
{
  "deprecation_date": "2027-04-16",
  "input_cost_per_token": 0.000005,
  "output_cost_per_token": 0.000025,
  "cache_creation_input_token_cost": 0.00000625,
  "cache_creation_input_token_cost_above_1hr": 0.00001,
  "cache_read_input_token_cost": 5e-7,
  "max_input_tokens": 1000000,
  "max_output_tokens": 128000,
  "search_context_cost_per_query": { "search_context_size_high": 0.01, ... },
  "supports_function_calling": true, "supports_reasoning": true,
  "supports_computer_use": true, "supports_pdf_input": true,
  "supports_prompt_caching": true, "prompt_cache_min_tokens": 2048
}
```

**致命缺陷：完全没有发布日期，也没有模型显示名/描述。** 全库 `release_date` / `created` 覆盖率实测 **0%**。它是定价与能力源，不是时间线源。

**其他无 key 可用但元数据较薄的网关**（可作冗余交叉校验）：

```bash
https://router.requesty.ai/v1/models        # HTTP 200, 879104 bytes，含 input_price/output_price/updated
https://nano-gpt.com/api/v1/models          # HTTP 200,  58020 bytes，仅 id/created/owned_by
https://llm.chutes.ai/v1/models             # HTTP 200,  12292 bytes，含 usd 报价
https://api.deepinfra.com/v1/openai/models  # HTTP 200, 127950 bytes，含 description + metadata
https://raw.githubusercontent.com/crmne/ruby_llm/main/lib/ruby_llm/models.json  # HTTP 200, 2174065 bytes, 1535 条
```

### 2.2 实测需要 key（有响应、明确返回 401/403）

| 源 | 实测状态 | 返回体片段 |
|---|---|---|
| Anthropic | **401** | `{"type":"error","error":{"type":"authentication_error","message":"x-api-key header is required"}}` |
| Google Gemini | **403** | `"Method doesn't allow unregistered callers ... Please use API Key"` |
| DeepSeek | **401** | `Authentication Fails (governor)` |
| Moonshot (`.cn` 与 `.ai` 均) | **401** | `{"error":{"message":"Incorrect API key provided"}}` |
| Alibaba DashScope | **401** | `"You didn't provide an API key ... Authorization header"` |
| Zhipu (bigmodel.cn) | **401** | `{"error":{"code":"1001","message":"Header中未收到Authorization参数，无法进行身份验证。"}}` |
| Groq | **401** | `{"error":{"message":"Invalid API Key"}}` |
| Together | **401** | `Missing API key` |
| Fireworks | **401** | `{"error":{"message":"You must provide an API key"}}` |
| SiliconFlow | **401** | `{"code":30014,"message":"Token is invalid."}` |
| Cohere | **403** | Cloudflare `403 Forbidden`（连 401 都拿不到） |
| Artificial Analysis | **401** | `{"error":"API key is required"}` |
| llm-stats API | **401** | `{"error":{"code":"authentication_required","message":"API key required. Generate one at https://huggle.ai/settings?tab=api-keys"}}` |
| **OpenRouter Data API** | **401** | `{"error":{"message":"No cookie auth credentials found","code":401}}` |

**关于厂商官方 endpoint 的重要结论**：即使拿到 key，这些 endpoint 的价值也很低。它们返回的基本只有 `id` / `created` / `owned_by`（OpenAI 兼容格式的最小集），**普遍不含定价、不含上下文长度、不含能力标记**。为 10 家厂商各申请一个 key、各写一个适配器，换来的信息量远低于直接用 models.dev。**不建议把厂商官方 endpoint 作为主数据通路**，仅建议用于「探测新模型 id 是否出现」这一个目的。

### 2.3 本机网络阻断，无法得出「是否需要 key」的结论

```bash
curl -sv -m 15 https://api.openai.com/v1/models
# * Trying 93.179.102.140:443...
# * Connected to api.openai.com (93.179.102.140) port 443
# * (304) (OUT), TLS handshake, Client hello (1):
# * Recv failure: Connection reset by peer
# * LibreSSL/3.3.6: error:02FFF036:system library:func(4095):Connection reset by peer
# exit code 35
```

TLS Client Hello 之后被 RST —— 典型的网络层阻断，非源站问题。同样情况：

| 域名 | curl_rc | 说明 |
|---|---|---|
| `api.openai.com` | 35 | TLS 握手被重置 |
| `api.x.ai`（`/v1/models` 与 `/v1/language-models`） | 35 | TLS 握手被重置 |
| `api.mistral.ai` | 60 | 证书校验失败 |
| `huggingface.co` / `hf.co` / `hf-mirror.com` | 35 / 35 / 308→35 | 三条路径全部失败 |

**Hugging Face 未能亲自验证，这是本报告最大的证据空缺。** 由于 HF 是补齐「参数量 + 开源许可证」的唯一可行源，**部署前必须在境外节点重新验证 HF Hub API**（`/api/models?full=true&config=true`，关注 `safetensors.total`、`cardData.license`、`downloads`、`createdAt`）。

### 2.4 无公开 JSON API，只有 HTML

| 源 | 实测 | 结论 |
|---|---|---|
| `llm-stats.com/api/models` | **404**（返回 Next.js HTML） | 该路径不存在；真实 API 在 `api.llm-stats.com/stats/v1`，需 key |
| `vellum.ai/llm-leaderboard` | 200，366252 bytes 纯 HTML | 只能解析 Next.js RSC payload，极脆弱 |
| `docsbot.ai/tools/...` | 200，240034 bytes 纯 HTML | 同上 |
| `glama.ai/api/gateway/v1/models` | **403** `error code: 1034` | Cloudflare 拦截 |
| `openrouter.ai/api/frontend/models` | **404** | 内部前端 API 已不可用 |

**结论：这三个聚合站（llm-stats / vellum / docsbot）都不值得作为数据源。** 抓 HTML 的维护成本远高于收益，且随时因前端改版而崩。

---

## 3. 字段覆盖矩阵

覆盖率为实测统计（非文档声明）。图例：`✅`=有且覆盖率高 / `⚠️ n%`=有但覆盖不全 / `❌`=无 / `🔶`=需推导。

| 数据源 | 模型名 | 厂商 | 发布日期 | 上下文长度 | 最大输出 | 输入定价 | 输出定价 | 输入模态 | 输出模态 | 工具调用 | 推理模型 | 参数量 | 开源许可 | 权重开放 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **models.dev** `models.json` (n=363) | ✅ 100% | ✅ | ✅ **100%** | ✅ 100% | ✅ 97% | ✅ | ✅ | ✅ 100% | ✅ 100% | ✅ **100%** | ✅ **100%** | ❌ | ⚠️ **9%** | ✅ **100%** |
| **models.dev** `api.json` (7494) | ✅ | ✅ 212家 | ✅ | ✅ | ✅ | ✅ 逐provider | ✅ 逐provider | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ |
| **OpenRouter** (n=396) | ✅ 100% | ✅ 从id | ⚠️ **仅上架日** | ✅ 100% | ✅ 98% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 83% | ⚠️ 68% | ❌ 🔶描述文本 | ❌ | ❌ 🔶`hugging_face_id` 45% |
| **Vercel AI Gateway** (n=362) | ✅ 100% | ✅ `owned_by` | ✅ **`released` 100%** | ✅ 95% | ✅ 95% | ⚠️ 78% | ⚠️ 68% | ✅ 100% | ✅ 100% | ⚠️ 62% | ⚠️ `tags` 80% | ❌ | ❌ | ❌ |
| **LiteLLM** (n=3408) | ❌ 仅id | ✅ 99% | ❌ **0%** | ✅ 84% | ✅ 75% | ✅ 83% | ✅ 83% | ⚠️ 12% | ⚠️ 12% | ✅ 58% | ⚠️ 30% | ❌ | ❌ | ❌ |
| **ruby_llm** (n=1535) | ✅ | ✅ | ✅ `created_at` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ `capabilities` | ✅ | ❌ | ❌ | ✅ 转载 |
| **Hugging Face** | ✅ | ✅ | ✅ `createdAt` | ❌ | ❌ | ❌ | ❌ | 🔶 tags | 🔶 tags | ❌ | ❌ | ✅ **唯一源** | ✅ **唯一源** | ✅ 天然 |
| **厂商官方 endpoint** | ⚠️ | ✅ | ⚠️ 仅部分 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Artificial Analysis 免费层** | ✅ | ✅ | ❌ | ❌ 明确排除 | ❌ | ✅ | ✅ | ❌ 明确排除 | ❌ | ❌ | ❌ | ❌ 明确排除 | ❌ 明确排除 | ❌ |
| **llm-stats API**（需key） | ✅ | ✅ | ✅ `released_after` 可筛 | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | — | — | — | ✅ `open_weight` |

**矩阵的三条硬结论**：

1. **models.dev 单源即可覆盖 12/14 列**，且 8 列达到 100% 覆盖率。它是唯一能同时给出「发布日期 + 工具调用 + 推理 + 权重开放」四项全 100% 的源。
2. **参数量：所有已验证源全部为 ❌。** 唯一出路是 HF 的 `safetensors.total`。次优解是从模型 id 正则推导（`nemotron-3-ultra-550b-a55b`、`qwen3.8-27b`、`hy-mt2-30b-a3b` 这类命名已含参数量），或从 OpenRouter 的 `description` 自由文本中提取（实测 `tencent/hy4-preview` 的描述含「49B active parameters out of 770B total」）—— 两种都是启发式，需标记为低置信度。
3. **开源许可证：models.dev 覆盖率仅 9%（363 条中仅 33 条）**，且**值未做归一化**，实测同时存在 `"MIT"` 与 `"MIT License"`、`"DeepSeek Model License"`、`"OpenMDW-1.1"`。即使用了也必须自建 SPDX 归一化映射表。

### 单位差异（接入时最易出错的地方）

| 源 | 定价单位 | 实测样例（Claude Opus，真实价 $5/M in） |
|---|---|---|
| models.dev | **美元/百万 token**，number | `"cost": { "input": 5, "output": 25 }` |
| OpenRouter | **美元/token**，**字符串** | `"pricing": { "prompt": "0.000005" }` |
| Vercel Gateway | **美元/token**，字符串 | `"pricing": { "input": "0.00000012" }` |
| LiteLLM | **美元/token**，number | `"input_cost_per_token": 0.000005` |

OpenRouter 与 Vercel 都是**字符串**，且 LiteLLM 会出现 `5E-7` 这类科学计数法。必须统一用高精度十进制解析后归一到「美元/百万 token」，不要用 float 直接相乘。

---

## 4. 关键陷阱：`created` 不是发布日期

这是本次调研最有工程价值的发现。用 OpenRouter 的 `created` 与 models.dev 的 `release_date` 对 66 个 2026 年模型做内连接：

```
--- n=66  mean_lag=3.73 days  min=-190  max=+179 ---
lag<=0d: 46 (71%)   1-3d: 5   4-7d: 4   8-30d: 8   >30d: 2
```

一致的例子（占多数）：

```
anthropic/claude-opus-5      OR_created=2026-07-24  MD_release=2026-07-24  lag=+0d
deepseek/deepseek-v4-pro     OR_created=2026-04-24  MD_release=2026-04-24  lag=+0d
openai/gpt-5.4               OR_created=2026-03-05  MD_release=2026-03-05  lag=+0d
tencent/hy4-preview          OR_created=2026-08-28  MD_release=2026-08-28  lag=+0d
```

严重偏差的例子：

```
bytedance-seed/seed-2.0-code OR_created=2026-08-12  MD_release=2026-02-14  lag=+179d
meta/muse-spark-1.1          OR_created=2026-07-16  MD_release=2026-04-08  lag= +99d
bytedance-seed/seed-2.0-lite OR_created=2026-03-10  MD_release=2026-02-14  lag= +24d
google/gemini-3-pro-image    OR_created=2026-06-18  MD_release=2026-05-28  lag= +21d
meituan/longcat-2.0          OR_created=2026-07-20  MD_release=2026-06-30  lag= +20d
openai/gpt-5.3-codex         OR_created=2026-02-24  MD_release=2026-02-05  lag= +19d
```

**规律**：偏差几乎全为正（上架晚于发布），闭源大厂旗舰基本 0 天（因为 OpenRouter 是 day-one 合作方），而**中国厂商与开源权重模型的偏差最大**（ByteDance Seed、Meituan LongCat 都是几周到半年）。对「大模型世界」这种需要正确时间线的产品，直接用 `created` 会把 ByteDance 的模型在时间轴上后移半年。

Vercel Gateway 的 `released` 字段做同样对比（n=86）：

```
--- n=86  exact_match=58 (67%)  mean_diff=-4.73d ---
```

67% 完全一致，与 OpenRouter 的 71% 相当。三个源两两吻合约 7 成，说明**没有任何单一源的发布日期可信到可以独用**。

**推荐的发布日期推导策略**：对同一模型取多源 `min(release_date)`，因为「上架日期晚于真实发布日」是系统性偏差，而早于真实发布日极为罕见。但必须加异常护栏 —— 实测存在反例：

```
qwen3-coder-next  vercel_released=2025-07-22  md_release=2026-02-03  diff=-196d
```

这条 Vercel 的日期明显是别名/错值。护栏规则：若某源日期比其他源的中位数早于 60 天以上，判为异常并丢弃该源的取值。

### models.dev 的日期格式缺陷

实测 363 条中有 **9 条 `release_date` 只有 `YYYY-MM`，没有日**：

```
moonshotai/kimi-k2.5                      2026-01
upstage/solar-pro3                        2026-01
alibaba/qwen3-32b                         2025-04
alibaba/qwen3-235b-a22b                   2025-04
alibaba/qwen3-coder-480b-a35b-instruct    2025-04
alibaba/qwen3-next-80b-a3b-thinking       2025-09
alibaba/qwen3-next-80b-a3b-instruct       2025-09
alibaba/qwen3-coder-30b-a3b-instruct      2025-04
alibaba/qwen2-5-vl-72b-instruct           2024-09
```

严格的 ISO 日期解析器遇到这 9 条会抛异常或静默产生错误值（我在分析中就因此得到一个 `lag=-190d` 的假结果）。**日期字段必须用宽松解析器：接受 `YYYY-MM-DD` / `YYYY-MM` / `YYYY` 三种精度，并把精度本身作为一个字段存下来**，前端对低精度日期显示「2026年1月」而非「2026-01-01」。

---

## 5. 数据源血缘：它们不是相互独立的

这一点直接决定兜底策略是否真的有效。

```
OpenRouter API ──(每小时 CI 同步)──> models.dev ──(转载)──> ruby_llm
                                          │
厂商官方 API ─────(每小时 CI 同步)────────┘
```

**证据 1** —— models.dev 的 CI 每小时从 OpenRouter 抓取：

```bash
curl -s "https://api.github.com/repos/anomalyco/models.dev/commits?per_page=15"
```
```
2026-08-31T06:50:27Z  chore(sync): update OpenRouter model catalog (#5907)
2026-08-31T06:49:47Z  chore(sync): update NanoGPT model catalog (#5908)
2026-08-31T06:49:32Z  chore(sync): update Kilo model catalog (#5909)
2026-08-31T04:31:42Z  chore(sync): update OpenRouter model catalog (#5903)
2026-08-31T03:32:17Z  chore(sync): update OpenRouter model catalog (#5899)
2026-08-31T01:39:53Z  chore(sync): update OpenRouter model catalog (#5895)
```

`.github/workflows/sync-models.yml`：

```yaml
schedule:
  - cron: "17 * * * *"      # 每小时第 17 分钟
```

按 provider 矩阵并行同步，`fail-fast: false`（单个 provider 挂掉不影响其他）。

**证据 2** —— ruby_llm 是 models.dev 的下游，1535 条中 717 条自报来源：

```bash
jq -r '[.[] | .metadata.source // "none"] | group_by(.) | map({src:.[0], n:length})' rubyllm.json
# 812  none
# 717  models.dev
#   6  known_models
```

**含义**：
- **把 models.dev 和 OpenRouter 当作两个独立源来做「互为兜底」是错的** —— OpenRouter 挂掉超过几小时，models.dev 里那部分数据同样会停止更新（但存量数据仍在，因为它落盘为 git 里的 TOML 文件）。
- 反过来看这也是好事：**models.dev 的 git 仓库是 OpenRouter 数据的持久化快照**。即使 OpenRouter 完全下线，models.dev 的历史数据不会消失，这是真正的兜底价值所在。
- ruby_llm 不应作为独立源计入冗余度。
- **Vercel AI Gateway 和 LiteLLM 是真正与 OpenRouter 独立的源**（各自维护自己的数据），它们才是有效的交叉校验来源。

---

## 6. 推荐组合方案

### 6.1 分层架构

**主源：models.dev（`models.json` + `api.json`）**

理由，按重要性排序：
1. **MIT 许可，法律上完全干净**，明确允许再分发与商用 —— 这是所有源里唯一没有法律疑虑的。
2 字段覆盖最全（12/14 列，8 列 100%）。
3. 每小时 CI 自动同步，符合「零人工维护」要求。
4. 数据以 TOML 存在 git 仓库中，**可以 fork/clone/vendor 到自己的仓库**，从根本上消除单点依赖。
5. 有 ETag，条件请求成本极低。

**补充源 1：OpenRouter `/api/v1/models`** —— 补 `description`（人类可读的模型介绍，models.dev 的描述很简短）、`supported_parameters`（细粒度参数支持）、`hugging_face_id`（45% 覆盖，是连接 HF 补参数量/许可的桥）、`top_provider`、多 provider 报价。

**补充源 2：Vercel AI Gateway** —— 补独立的 `released` 字段用于发布日期三方投票，以及 `zdr` / `no_training` 两个其他源都没有的合规字段。

**补充源 3：LiteLLM** —— 补细粒度定价（缓存读/写、1 小时缓存、batch 价、priority 价、图片/音频单价）和 `deprecation_date`（17% 覆盖，用于标记模型退役）。模型数量最多（3408），可用于发现前几个源尚未收录的长尾模型。

**补充源 4：Hugging Face Hub API** —— 唯一的参数量与许可证来源，通过 OpenRouter 的 `hugging_face_id` 或 models.dev 的 `weights[].url` 关联。**上线前必须在境外节点验证。**

**明确排除**：Artificial Analysis（ToS 禁止再分发）、llm-stats / vellum / docsbot（无可用公开 JSON 或需 key）、厂商官方 endpoint 作为主通路（性价比过低）。

### 6.2 字段级仲裁规则

不要「整条记录以某个源为准」，而要**逐字段设优先级**，因为每个源的强项不同：

| 字段 | 优先级顺序 | 仲裁方式 |
|---|---|---|
| 发布日期 | models.dev → Vercel `released` → OpenRouter `created` | **取 min，带 60 天异常护栏**；记录日期精度 |
| 定价 | models.dev(`api.json` 逐provider) → LiteLLM → OpenRouter | 全部归一到 $/M token；多 provider 时保留全部并标注 |
| 上下文/最大输出 | models.dev → OpenRouter → Vercel → LiteLLM | 取首个非空；多源冲突时取**众数**而非最大值 |
| 工具调用/推理 | models.dev(100%) → OpenRouter `supported_parameters` | models.dev 布尔值优先，OpenRouter 用于补空 |
| 模态 | models.dev → OpenRouter → Vercel | 取**并集**（不同 provider 可能开放不同模态） |
| 参数量 | HF `safetensors.total` → id 正则 → 描述文本提取 | 必须带 `confidence` 字段 |
| 开源许可 | HF `cardData.license` → models.dev `license` | 归一到 SPDX；未知时标 `unknown` 而非猜测 |
| 权重开放 | models.dev `open_weights`(100%) | 单源即可，覆盖率已满 |

### 6.3 「某个源挂掉/改字段时系统如何不崩」

这是需求里最实质的一条。**核心原则：任何单个源的失败都不能影响已有数据的可用性。**

**第一层 —— 数据落盘，不做实时透传**

绝不让前端请求触发对上游的调用。所有源定时抓取后写入自己的数据库，网站只读自己的库。这样即使全部上游同时挂掉，网站照常运行，只是数据停止更新。这一条能挡住 90% 的故障场景。

**第二层 —— 快照 + 原子替换 + 合理性校验**

每次抓取先落地为原始快照（保留原始 JSON，不只存解析结果），解析成功后才原子替换生产数据。替换前做**合理性校验（sanity check）**，任一不通过则拒绝本次更新并保留旧数据 + 告警：

- 模型总数不得比上次减少超过 10%（防止上游返回了截断的 JSON 或空数组）
- 必填字段（id / name / context）的覆盖率不得比上次下降超过 5%
- 定价字段不得出现 0 或负数（防止解析单位错误）
- 不得出现「已存在模型的发布日期发生变化」（若变化则记为冲突待审，不自动覆盖）

保留原始快照的另一个价值：上游改字段时，可以**用历史快照回放**来验证新的解析逻辑，不必等下一次抓取。

**第三层 —— 解析器容错**

按「未知字段忽略、已知字段缺失降级」设计，而不是严格 schema 校验后整体拒绝。具体：
- 用宽松 schema 解析（如 Zod 的 `.passthrough()` 加全字段 `.optional()`），**单条记录解析失败只丢弃该条并计数告警，不中断整批**。
- 单个源的字段覆盖率下降到阈值以下时告警，但不阻塞 —— 因为仲裁层会自动从下一优先级源取值。这是分层仲裁最大的好处：**models.dev 某天删掉 `license` 字段，系统会自动退化到 HF 取值，不会崩**。
- 上游改了字段名（而非删除）是唯一需要人工介入的场景。用「某字段覆盖率从 >90% 突降到 0%」这个信号来精准捕获它。

**第四层 —— 冗余度自查**

因为存在第 5 节的血缘关系，需要监控**真正独立的源的数量**。若某个模型的所有字段都只来自 models.dev/OpenRouter 这一条血缘链，应标记为「单源数据」，在 UI 上可以不区分，但在告警系统里要能看出冗余度。

**第五层 —— vendor 主源**

把 models.dev 仓库 fork 并定期同步到自己的仓库。这一步把主源从「一个 HTTP 依赖」变成「一个 git 依赖」，即使 models.dev 域名和上游仓库同时消失，也保有全量历史数据。MIT 许可明确允许这样做。

**抓取频率建议**：models.dev 上游是每小时 cron，所以自己抓得比 1 小时更频繁没有意义。用 `If-None-Match` 条件请求每小时轮询一次即可，命中 304 时零成本。OpenRouter 的 `max-age=300` 说明其 CDN 缓存 5 分钟，同样不必更频繁。

---

## 7. 风险清单

| 源 | 许可 / ToS | 再分发+商用 | 限流（实测） | 主要风险 |
|---|---|---|---|---|
| **models.dev** | **MIT**（已核对 LICENSE 全文） | ✅ **明确允许** | 20 次连续请求全 200，未触发限流 | 仓库已从 `sst/` 迁移到 `anomalyco/models.dev`（**组织变更即治理风险**）；291 个 open issue；`license` 字段覆盖仅 9% 且未归一化；9 条日期为 `YYYY-MM`；部分数据源自 OpenRouter，存在血缘耦合 |
| **OpenRouter** `/v1/models` | **无明示数据许可**；ToS 禁止「使用脚本、机器人等自动化技术抓取或复制站点及服务上的任何信息」，并禁止「转售 API 访问或开发竞争性服务」 | ⚠️ **法律灰区** | 25 次连续请求全 200；响应头无 `x-ratelimit-*` | **最大风险是法律而非技术**。虽然这是文档化的公开 API、且 `access-control-allow-origin: *` 暗示了公开消费意图，但 ToS 的反复制条款措辞极宽（"copy any information"）。一个公开展示 LLM 元数据的网站，可能被解读为「竞争性服务」。**建议：仅取 OpenRouter 独有且经过实质加工的字段，不做原始 JSON 转存展示，页面保留指向 OpenRouter 的归属链接；主数据以 MIT 的 models.dev 为准** |
| **OpenRouter Data API** `/v1/datasets/*`、`/v1/benchmarks` | **CC BY 4.0**（明确「可复制、再分发、二次创作，包括商用，需署名 OpenRouter」） | ✅ 允许，需署名 | **需 key**；30 req/min per key，500 req/day per account | 法律上最干净的 OpenRouter 通路，但需要账号。明确规定「不得被重新提供为竞争性的免费 API」。若要用排行/基准数据，走这条而非 `/v1/models` |
| **LiteLLM** | **MIT**（`enterprise/` 目录除外，该 JSON 不在其中） | ✅ 允许 | GitHub raw，受 GitHub 通用限流 | 无发布日期（0%）；无模型名/描述；模态字段仅 12% 覆盖；文件已达 2MB 且持续膨胀；键名即模型 id，同一模型在不同 provider 下有多个 key，需去重 |
| **Vercel AI Gateway** | **无明示数据许可**（未找到针对 `/v1/models` 的数据条款） | ⚠️ 未知 | 未做压测；无 CDN 缓存头（`x-vercel-cache: MISS`） | 这是 Vercel 商业产品的附属 endpoint，**随时可能加 key 或下线**，不应作为关键路径。定价覆盖仅 68-78%。仅用于发布日期交叉校验这类可降级的用途 |
| **Artificial Analysis** | **免费层：仅限内部使用，禁止再分发**；Pro（$417/月/座）仍禁止再分发原始数据文件；Commercial 才有再分发权 | ❌ **免费/Pro 均禁止** | 免费层限额**文档自相矛盾**：`/data-api` 对比表写「100 requests/day」，`/api-reference` 写「1,000 requests per day」 | **对公开网站是法律禁区。** 另有一个隐蔽陷阱：**OpenRouter 的 `benchmarks.artificial_analysis` 字段（55% 覆盖）里直接带有 AA 的 `intelligence_index`/`coding_index`/`agentic_index`**。经由 OpenRouter 间接展示 AA 数据，实质上仍是再分发 AA 的数据，**建议主动剔除这个子字段**，不要因为「是从 OpenRouter 拿的」就认为规避了 AA 的条款 |
| **llm-stats.com** | 未获取（需注册） | 未知 | 宣称「免费、无使用上限」 | **主体身份混乱**：站点是 `llm-stats.com`，文档示例指向 `api.zeroeval.com`，而 401 报错让你去 `huggle.ai` 生成 key。**三个不同域名 = 显著的业务变动/被收购迹象**，作为上游依赖不稳定 |
| **Hugging Face** | 数据本身开放，各模型仓库许可各异 | ⚠️ 逐模型判断 | **本机不可达，未验证** | 未验证是本报告最大空缺；许可证是每个模型仓库自己的（`cardData.license` 可能缺失或写错）；无定价/上下文长度 |
| **厂商官方 endpoint** | 各自 ToS | ⚠️ | 需 key | 需维护 10+ 个 key 与适配器；返回字段极少；Cohere 连未授权请求都直接 403（Cloudflare 层），说明对自动化访问不友好；中国厂商与境外厂商需分别从不同网络区域访问 |
| **通用网络风险** | — | — | — | **测试机所在网络阻断 `api.openai.com`、`api.x.ai`、`api.mistral.ai`、`huggingface.co`**。若抓取任务部署在中国大陆，必须准备境外抓取节点，否则 HF（参数量+许可的唯一来源）完全拿不到 |

---

## 8. 新模型自动发现的时延（实测）

### 8.1 最新模型的跨源收录情况

取 OpenRouter 中 `created` 最新的 10 个 2026 年 8 月模型，检查各源是否已收录（调研时刻 2026-08-31）：

| 模型 | 发布日 | OpenRouter | models.dev | LiteLLM |
|---|---|---|---|---|
| `tencent/hy4-preview` | 08-28 | ✅ 1 | ✅ 1 | ❌ **0** |
| `inclusionai/ling-3.0-flash-fin` | 08-27 | ✅ 1 | ✅ 1 | ❌ **0** |
| `qwen/qwen3.8-flash` | 08-26 | ✅ 1 | ✅ 2 | ❌ **0** |
| `z-ai/glm-5.3-flash` | 08-26 | ✅ 2 | ✅ 1 | ✅ 2 |
| `z-ai/glm-5.3` | 08-14 | ✅ 3 | ✅ 2 | ✅ 5 |
| `tencent/hy-mt2-30b-a3b` | 08-20 | ✅ 1 | ❌ **0** | ❌ **0** |
| `meta/muse-spark-1.2` | 08-05 | ✅ 2 | ✅ 1 | ✅ 2 |
| `google/gemini-3.7-flash` | 08-13 | ✅ 2 | ✅ 1 | ✅ 4 |
| `nvidia/nemotron-3.5-lightning` | 08-11 | ✅ 2 | ✅ 1 | ✅ 1 |
| `upstage/solar-pro4` | 08-06 | ✅ 1 | ✅ 1 | ❌ **0** |

### 8.2 时延估算

**models.dev：约 0–24 小时。** 最强证据是 `tencent/hy4-preview` —— 发布日 2026-08-28，models.dev 的 `release_date` 就是 `2026-08-28`，且当天即收录。CI 每小时跑一次（`cron: "17 * * * *"`），所以对已接入自动同步的 provider，时延就是**最多 1 小时**。调研时刻（08-31 08:19 UTC）看到的最新同步提交是 06:50 UTC，即 1.5 小时前 —— 与 cron 周期吻合。

**OpenRouter：0 天（闭源大厂）到数周（中国厂商/开源权重）。** 见第 4 节数据：Anthropic/OpenAI/Google/DeepSeek 旗舰基本 day-one 上架（lag=0），但 ByteDance Seed 系列滞后 12–179 天，Meituan LongCat 滞后 20 天。**这个时延不均匀性是按厂商系统性分布的**，不是随机噪声。

**LiteLLM：数天到「永不收录」。** 10 个最新模型中有 **4 个完全缺失**（`hy4-preview`、`ling-3.0-flash-fin`、`qwen3.8-flash`、`solar-pro4`），全部是中国厂商或韩国 Upstage 的模型。而对已收录的模型它的条目数最多（`glm-5.3` 有 5 条，覆盖多个 provider 的不同报价）。**结论：LiteLLM 是「深度优先」而非「广度优先」的源，不能用于新模型发现。**

**覆盖盲区示例**：`tencent/hy-mt2-30b-a3b`（08-20 发布的翻译模型）**只有 OpenRouter 收录**，models.dev 和 LiteLLM 都没有。这类小众/专用模型是单源数据，必须在系统里标记出来。

### 8.3 对产品的含义

- 想做到「新模型发布当天上线」，**必须以 models.dev 为主源**（0–24 小时）并每小时轮询。仅靠 LiteLLM 会漏掉近半数新发布的中国模型。
- **新模型发现与元数据补全应当解耦**。OpenRouter 有 396 个模型、models.dev 的 `api.json` 有 3558 个去重 id —— 用最大的 id 集合做「发现」，用质量最高的源做「补全」，允许一个模型先以不完整状态出现在站上，随后逐步补齐字段。若要求字段齐全才展示，新模型的上线时延会被最慢的源拖到数周。
- 中国厂商模型的发布日期应额外校验。这是各源偏差最大的区域，也很可能是「大模型世界」这个产品最受关注的部分。

---

## 附：证据复现清单

```bash
# 无需 key，全部实测 HTTP 200
curl -s https://openrouter.ai/api/v1/models                  # 396 models, 655KB
curl -s https://models.dev/api.json                          # 212 providers / 7494 entries, 4.4MB
curl -s https://models.dev/models.json                       # 363 model facts, 293KB
curl -s https://models.dev/catalog.json                      # 合并视图, 4.7MB
curl -s https://ai-gateway.vercel.sh/v1/models               # 362 models, 368KB, 含 released
curl -s https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json  # 3408, 2MB
curl -s https://raw.githubusercontent.com/crmne/ruby_llm/main/lib/ruby_llm/models.json               # 1535, 2.1MB
curl -s https://router.requesty.ai/v1/models                 # 879KB
curl -s https://api.deepinfra.com/v1/openai/models           # 128KB

# 治理与许可核对
curl -s "https://api.github.com/repos/anomalyco/models.dev"  # license: MIT, stars 6658, 未归档
curl -s "https://api.github.com/repos/anomalyco/models.dev/commits?per_page=15"  # 每小时 sync 提交
curl -s https://raw.githubusercontent.com/anomalyco/models.dev/dev/.github/workflows/sync-models.yml  # cron "17 * * * *"
curl -s https://raw.githubusercontent.com/BerriAI/litellm/main/LICENSE            # MIT（enterprise/ 除外）

# 缓存头（决定轮询策略）
curl -sI https://openrouter.ai/api/v1/models   # max-age=300, stale-if-error=3600
curl -sI https://models.dev/api.json           # etag + must-revalidate

# 需 key（实测 401/403），示例
curl -s https://api.anthropic.com/v1/models                        # 401 x-api-key header is required
curl -s https://open.bigmodel.cn/api/paas/v4/models                # 401 Header中未收到Authorization参数
curl -s https://artificialanalysis.ai/api/v2/data/llms/models      # 401 API key is required
curl -s https://openrouter.ai/api/v1/benchmarks                    # 401（CC BY 4.0 数据需 key）

# 本机网络阻断（curl rc 35/60），需境外节点复验
curl -sv https://api.openai.com/v1/models      # rc 35, TLS Client Hello 后 RST
curl -sL https://huggingface.co/api/models     # rc 35（hf.co / hf-mirror.com 同样失败）
```
