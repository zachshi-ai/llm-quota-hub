# llm-quota-hub
大模型额度中枢 · 手机端单文件应用（Token Plan / Coding Plan / 余额）

## Android APK

| 版本 | 下载 | 说明 |
| --- | --- | --- |
| v1.6.0 | [quota-hub-v1.6.0.apk](https://github.com/zachshi-ai/llm-quota-hub/releases/download/v1.6.0/quota-hub-v1.6.0.apk) | 45 KB · 签名包 · minSdk 24 / targetSdk 34 |

安装：手机浏览器打开上面的链接下载，点开安装包允许「安装未知应用」。已在荣耀 MagicOS 以外的标准 Android 上验证包结构、签名与 48 项功能/安全/性能测试。

应用特性：

- 首页聚合 MiniMax（Token Plan）、智谱 GLM（Coding Plan）、Kimi、DeepSeek（余额）等平台额度
- API Key 只存在本机，AES-GCM 加密 + 访问 PIN，localStorage 不落明文
- 5 分钟无操作自动锁定，CSP 白名单限制外部请求，外链交给系统浏览器
- 数据快照优先读本仓库 `data/minimax.json`，离线回退到内置副本

## 网页版

`index.html` 为同源单文件版本，可直接浏览器打开。
