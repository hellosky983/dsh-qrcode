# dsh-qrcode

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)


An offline QR code and barcode generator for DeepSeek Harness. Pure local computation — no network, no shell, no dependencies.

## Overview

DeepSeek Harness sessions often run with restricted network access (no npm, no CDN, no online encoder APIs), so generating a scannable code from inside a session is not trivial. This plugin solves that: it provides `qrcode` and `barcode` model tools that encode and render entirely locally, with zero runtime dependencies. It is for agents and users who need QR codes (URLs, WiFi, vCard, tel, sms) or 1D barcodes (Code128, EAN-13) as SVG / PNG / ASCII output inside any DSH session — including fully offline or sandboxed ones.

## Compatibility

- DSH version: `0.1.0-rc.6`
- Mainline: verified against `deepseek-harness` mainline snapshots of 2026-08-14
- Last verified: 2026-08-14

## Install / Uninstall

Install (from GitHub):

```bash
dsh plugin add github:hellosky983/dsh-qrcode
```

Or clone and install locally:

```bash
git clone https://github.com/hellosky983/dsh-qrcode.git
cd dsh-qrcode
dsh plugin add .
```

Upgrade: re-run the install command after `git pull`.

Disable temporarily: remove the plugin row from your profile composition, or run:

```bash
dsh plugin remove dsh-qrcode
```

Uninstall: remove the `dsh-qrcode` dependency and its bundle entry from the profile `package.json`, then `pnpm install`.

## Quick start

Tell the agent:

> 把这个链接做成二维码: https://example.com

or call the tools directly:

```bash
qrcode text="https://example.com" format=svg
barcode text="ABC-123" symbology=code128 format=svg
```

`qrcode` returns SVG markup (save to a `.svg` file), PNG data URLs, or ASCII previews. `barcode` supports `code128` and `ean13`.

## Configuration

| Tool | Option | Default | Description |
| --- | --- | --- | --- |
| `qrcode` | `text` | — (required) | Content to encode: URL, `WIFI:...`, vCard, tel/sms, or plain text |
| `qrcode` | `format` | `svg` | `svg` / `ascii` / `png` |
| `qrcode` | `ecl` | `M` | Error correction level L/M/Q/H |
| `qrcode` | `scale` / `border` / `fg` / `bg` / `mask` | 4 / 4 / #000 / #fff / auto | Rendering options |
| `barcode` | `text` | — (required) | Content for Code128 (ASCII) or EAN-13 (12/13 digits) |
| `barcode` | `symbology` | `code128` | `code128` / `ean13` |

No environment variables, no secrets.

## Permissions & data

- Reads: nothing (pure function of the input arguments).
- Writes: nothing. Tools return text/SVG/PNG data in the result.
- Network: none. Encoding and rendering are fully local.
- Credentials: none.

## Troubleshooting

- **Tool not visible after install**: restart dsh, or check that the bundle row appears in `dsh --dump-config`.
- **"cannot get property tools without inject"**: the plugin requires `inject = ['tools']`; reinstall from the latest commit which declares it.
- **PNG output is a data URL**: the agent should prefer `format=svg` and save the returned markup as a `.svg` file when a file artifact is needed.
- **Logs**: dsh profile logs under `~/.dsh/profiles/<name>/`.
- **Rollback**: revert to the previous plugin version by reinstalling the earlier git commit.

## Development

```bash
git clone https://github.com/hellosky983/dsh-qrcode.git
cd dsh-qrcode
node --check index.js
```

The encoder was validated against `zxing-cpp` (96/96 test vectors, versions 1–40, all masks/EC levels) and cross-checked with `segno` for mask scoring. The suite lives in the commit history of this repository.

Contributions: open issues and pull requests on GitHub. Keep changes dependency-free (the encoder is self-contained). Report bugs with a minimal reproduction case.

## License & security

MIT — see [LICENSE](LICENSE). No secrets are shipped; report security issues privately via GitHub issue (repo is public) or email to the repository owner.
