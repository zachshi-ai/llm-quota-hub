# llm-quota-hub
大模型额度中枢 · 手机端单文件应用（Token Plan / Coding Plan / 余额）

## Android APK

当前版本 **v1.8.0**

- [下载 quota-hub-v1.8.0.apk](https://github.com/zachshi-ai/llm-quota-hub/releases/download/v1.8.0/quota-hub-v1.8.0.apk)
- 备用直链：[raw 地址](https://raw.githubusercontent.com/zachshi-ai/llm-quota-hub/main/apk/quota-hub-v1.8.0.apk)

安装：手机浏览器打开链接下载，点开安装包并允许「安装未知应用」。包名 `ai.zachshi.quotahub`，minSdk 24 / targetSdk 34，仅申请联网与网络状态两项权限。

### 自动巡查 / 静态看板（v1.8.0）

- 自动巡查开：后台按间隔（15 分钟 – 12 小时，默认 30 分钟）拉最新数据并缓存，提醒按最新额度判定，断网或秒开用缓存兜底
- 自动巡查关：静态看板，只在打开应用时拉一次，无后台网络请求

### 提醒（v1.7.0）

- 重置前提醒：5 小时窗口与每周窗口重置前通知，提前量自定义（1 分钟 – 168 小时）
- 额度快用完提醒：剩余百分比低于自定义阈值（1%–50%）时通知
- 两个开关独立；后台每 15 分钟检查一次并拉最新快照，同一窗口只提醒一次
- 首次使用需在设置页申请系统通知权限，可先发一条测试通知确认

### 数据来源与新鲜度

- `data/minimax.json` 由云端同步任务每 10 分钟刷新一次（OAuth 刷新令牌轮换后自动回写本地配置）。
- APK 取快照时按镜像顺序尝试：`raw.gitmirror.com` → `ghfast.top` → `gh-proxy.com` → `cdn.jsdelivr.net` → `raw.githubusercontent.com` → GitHub Pages；上次成功的源会被记住。
- 全部镜像不通时才回退到安装包内置副本，界面会明确标出「内置副本」。
- 顶栏与 MiniMax 卡片显示「绝对时间 · 相对时间 · 来源」，超过 45 分钟未更新会标「滞后」。

## 网页版

`index.html` 为同源单文件版本，可直接用浏览器打开。
