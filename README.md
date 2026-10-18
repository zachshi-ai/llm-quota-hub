# llm-quota-hub
大模型额度中枢 · 手机端单文件应用（Token Plan / Coding Plan / 余额）

## Android APK

当前版本 **v1.6.1**

- [下载 quota-hub-v1.6.1.apk](https://github.com/zachshi-ai/llm-quota-hub/releases/download/v1.6.1/quota-hub-v1.6.1.apk)
- 备用直链：[raw 地址](https://raw.githubusercontent.com/zachshi-ai/llm-quota-hub/main/apk/quota-hub-v1.6.1.apk)

安装：手机浏览器打开链接下载，点开安装包并允许「安装未知应用」。包名 `ai.zachshi.quotahub`，minSdk 24 / targetSdk 34，仅申请联网与网络状态两项权限。

### 数据来源与新鲜度

- `data/minimax.json` 由云端同步任务每 10 分钟刷新一次（OAuth 刷新令牌轮换后自动回写本地配置）。
- APK 取快照时按镜像顺序尝试：`raw.gitmirror.com` → `ghfast.top` → `gh-proxy.com` → `cdn.jsdelivr.net` → `raw.githubusercontent.com` → GitHub Pages；上次成功的源会被记住。
- 全部镜像不通时才回退到安装包内置副本，界面会明确标出「内置副本」。
- 顶栏与 MiniMax 卡片显示「绝对时间 · 相对时间 · 来源」，超过 45 分钟未更新会标「滞后」。

## 网页版

`index.html` 为同源单文件版本，可直接用浏览器打开。
