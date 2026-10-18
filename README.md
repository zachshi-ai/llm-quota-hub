# LLM Quota Hub · 大模型额度中枢

一个零依赖的本地 Web 应用，把你在各家平台登录的模型接口、可用额度和真实使用状态收拢到一个面板里。
同时提供「本机联动登录」：面板里点一下，就能在这台机器上发起 OAuth 或绑定 Key，登录结果直接供命令行/智能体调用。

## 快速开始

```bash
node server.js          # 默认 http://127.0.0.1:8787
PORT=9000 node server.js    # 换端口
HOST=0.0.0.0 node server.js # 局域网可访问（注意安全）
```

要求 Node 18+（本机 v22 已验证），无需 npm install，无任何第三方依赖。

配置文件：`~/.llm-dashboard/providers.json`（自动创建，权限 600）
可用 `LLM_DASHBOARD_DIR` 环境变量改配置目录。

## 额度形态（四种，已做展示预留）

| 类型 | 含义 | 典型平台 | 展示方式 |
|---|---|---|---|
| `token_plan` | 周期配额（当期 / 本周） | MiniMax Token Plan | 剩余百分比 + 进度条 + 重置时间 |
| `coding_plan` | 套餐额度 | 智谱 GLM Coding Plan | 状态 + 控制台入口；接口开放后填真实数字 |
| `balance` | 账户余额（按量计费） | Kimi / DeepSeek | 大字余额 + 币种 |
| `usage` | 按量明细 / 运行时状态 | STEPX Neo、自定义平台 | 预留卡片 / 运行时指标 |

读到的额度是哪一类，卡片就按那一类的样式渲染，不需要改前端。

## 已接入的适配器

| 平台 | 鉴权 | 数据来源 | 状态 |
|---|---|---|---|
| STEPX Neo（本机助手） | 无需 Key | 云端同步 `data/runtime.json`（模型/上下文/生效时间） | 运行时状态 ✅ |
| MiniMax | OAuth（复用 `mmx` CLI 凭证） | `mmx quota --output json` | 实时额度 ✅ |
| Kimi / Moonshot | API Key | `/v1/users/me/balance` | 实时余额 ✅ |
| DeepSeek | API Key | `/user/balance` | 实时余额 ✅ |
| 智谱 GLM | API Key | 无公开额度接口 → 鉴权探测 + 控制台入口 | 连通性 ✅ |

## 登录联动

- **MiniMax**：面板点「登录 / 换号」→ 后端本机执行 `mmx auth login --recommend --region=cn` → 前端拿到授权链接与授权码 → 你确认后凭证落到 `~/.mmx/config.json`，命令行立刻可用。
- **Kimi / DeepSeek / GLM**：面板内粘贴 API Key，写入本机配置文件（600），保存即验证。
- 任何平台都能点「换号 / 重登」覆盖旧凭证。

## HTTP 接口

```
GET    /api/statuses                 所有平台额度（前端主接口）
GET    /api/providers                平台配置（Key 脱敏）
POST   /api/providers                新增平台（预留卡片）
POST   /api/providers/:id/key        绑定 / 更新 API Key
DELETE /api/providers/:id/key        解绑
POST   /api/providers/:id/toggle     启停
POST   /api/providers/:id/login      发起登录（OAuth 返回 url+code / 或提示 api_key）
GET    /api/providers/:id/login      查询登录进度，成功后自动带一次额度
GET    /api/providers/:id/status     单平台刷新
```

## 扩展一个新平台

1. 在 `server.js` 的 `ADAPTERS` 里加一个函数，返回统一结构：

```js
{
  id, name, type: 'token_plan' | 'coding_plan' | 'balance' | 'usage',
  status: 'ok' | 'expiring' | 'unauthenticated' | 'error',
  balance: { amount: 12.34, currency: 'CNY' },   // balance 类型才需要
  metrics: [{ label: '主模型', percentLeft: 88, text: '当期 12/100 次', resetAt: '...' }],
  note: '一句话说明',
  links: [{ label: '控制台', url: 'https://...' }]
}
```

2. 在 `DEFAULT_PROVIDERS`（或 `~/.llm-dashboard/providers.json`）里加对应条目即可，前端不用动。

## 密钥安全模型

**写入**：前端输入框是 `password` 类型（默认不可见，可临时点「显示/隐藏」），提交成功后输入框立即清空，明文不在页面里多停一秒。

**落盘**：密钥用 AES-256-GCM 加密后存进 `providers.json`，主密钥单独存在 `~/.llm-dashboard/.masterkey`；两者权限都是 600，所在目录 700。直接用编辑器/其他工具打开配置文件只能看到 `v1:iv:tag:密文`。

**回显**：任何接口、任何页面都不返回 Key 本体，只返回指纹（SHA-256 前 10 位）和更新时间。指纹能让你确认「是不是换过钥匙」，但反推不出原值。Key 保存后再进面板，看到的就是「已加密保存 · 指纹 xxxx」。

**调用**：`keyvault.getKey()` 只在发请求的那一瞬间解密到内存，不写日志、不进响应体、不落中间文件。我做本机调用时走 `cli.js`，它自己解密发请求，我看不到也不需要看到明文。

**更新 / 解绑**：面板「替换 Key」直接覆盖密文并刷新指纹；「解绑」会连同密文一起删除，配置里不留残渣。

**OAuth 优先**：MiniMax 走 OAuth，根本不产生 API Key，凭证是短期令牌（可在面板看到到期时间）。Kimi / DeepSeek / 智谱目前官方没有面向 CLI 的 OAuth 设备码流程，只能 API Key，所以这三家用加密保管这条路。

**能力边界**：本机加密能防的是「文件被顺手扫到、配置被备份带走、仓库误提交」这类场景。如果有人已经拿到这台机器的 root，理论上可以读内存或主密钥——这是所有本机加密的共同上限，不是这个应用特有的漏洞。

## 本机调用（给智能体用）

```bash
node cli.js list                      # 平台 + 密钥指纹，不显示明文
node cli.js status minimax            # 查额度
node cli.js status kimi               # 查余额
node cli.js chat kimi "你好"           # 直接调用模型
```

`cli.js` 复用同一套加密存储，调用时才解密，输出里永远不会出现 Key。
