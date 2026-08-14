# dsh-qrcode 🔳

> DeepSeek Harness (DSH) 离线二维码生成插件：纯本地计算、零网络、零 shell、跨平台。给模型一个 `qrcode` 工具，让 Agent 随手把链接 / WiFi / 文本生成二维码。

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-4f8cff)](https://github.com/topics/dsh-plugin)

## 📖 项目简介

`dsh-qrcode` 是一个 DeepSeek Harness **插件包（bundle）**。它从零实现了完整的 QR 编码器（Reed-Solomon 纠错、GF(256) 运算、掩码评分、全部 40 个版本），**不依赖任何第三方库**，所以安装零构建、零网络请求、跨平台（Windows/macOS/Linux 都行）。

## ✨ 功能特性

- ✅ **离线纯本地**：无网络、无 shell，隐私安全、秒出结果
- ✅ **三种输出**：`svg`（矢量，可存文件）、`ascii`（终端预览）、`png`（data URL，可下载）
- ✅ **完整编码**：数字 / 字母数字 / 字节（UTF-8，支持中文和 emoji），4 级纠错 L/M/Q/H
- ✅ **可定制**：前景/背景色、尺寸、边距、强制掩码
- ✅ **已测验证**：用 zxing-cpp 解码器验证 96/96 个二维码全部正确解码

## 🚀 快速开始（傻瓜式）

**环境要求**：已安装 `dsh` CLI（DeepSeek Harness）。

```bash
# 从 GitHub 安装到你的 profile（把 <你的名字> 换成仓库作者名）
dsh plugin --profile web add github:<你的名字>/dsh-qrcode

# 从本地目录安装
dsh plugin --profile web add ./dsh-qrcode
```

重启你的 profile 后生效：

```bash
dsh --profile web
```

> 验证是否装好：`dsh --profile web --dump-config` 里应能看到 `# == dsh-qrcode` 这一层。

## 📖 使用说明

安装后，模型会多一个 **`qrcode`** 工具。直接对它说：

- 「把 `https://example.com` 生成二维码」
- 「生成 WiFi 二维码，SSID=HomeWiFi，密码=12345678」（内容写成 `WIFI:T:WPA;S:HomeWiFi;P:12345678;;`）

### 工具参数

| 参数 | 说明 | 默认值 |
|---|---|---|
| `text` | 要编码的内容（必填） | — |
| `format` | `svg` / `ascii` / `png` | `svg` |
| `ecl` | 纠错级别 `L` / `M` / `Q` / `H` | `M` |
| `scale` | 每个模块像素数（svg/png） | `4` |
| `border` | 静区宽度（模块数） | `4` |
| `fg` / `bg` | 前景/背景色（hex） | `#000000` / `#ffffff` |
| `mask` | 强制掩码 0–7（省略则自动选最优） | 自动 |

## 📁 项目结构

```
dsh-qrcode/
├── package.json        # 声明 dsh.bundle（插件的安装清单）
├── cordis.patch.yml    # 插入到 composition 的补丁层
├── index.js            # 插件入口：QR 编码器 + 注册 qrcode 工具
├── README.md
└── LICENSE
```

## ❓ 常见问题（FAQ）

- **Q：为什么 `dsh plugin add github:...` 装完没生效？**
  A：profile 要**重启**才生效。另外确认 `--dump-config` 里有 `dsh-qrcode` 层。
- **Q：需要网络吗？**
  A：生成二维码完全不需要网络；只有「安装插件」这一步需要联网（从 GitHub 拉取）。
- **Q：能商用吗？**
  A：MIT 协议，随便用。
- **Q：有图形界面吗？**
  A：当前版本只提供模型工具（`qrcode`）。浏览器面板（`dsh.client`）需要 TypeScript 构建，规划在后续版本。

## 🛠️ 技术栈

纯 JavaScript（ESM）· DeepSeek Harness bundle · `@deepseek-ai/dsh-tools`

## 📄 许可证

MIT © dsh-qrcode contributors
