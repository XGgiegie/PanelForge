# PanelForge

PanelForge 是面向 AI 漫剧制作的平台原型，基于 Electron、Vue 3、TypeScript、Vite、Naive UI、Pinia 和 Vue Router 构建。


## AI 漫剧制作流程

```text
剧本提取
  ↓
AI拆解剧情
  ↓
生成角色设定
  ↓
生成分镜脚本
  ↓
生成图片
  ↓
图片统一角色风格
  ↓
生成配音
  ↓
字幕生成
  ↓
视频合成
  ↓
导出漫剧
```

当前版本先搭建剧本库：用户可以自行导入 `.txt` / `.md` 剧本文本，系统会入库保存并自动提取章节。后续剧本提取、剧情拆解和制作流程将基于剧本库中的作品继续展开。
## 启动

新电脑首次启动建议直接执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

这个脚本会自动完成：

- 如果没有 `.env`，从 `.env.example` 创建一份。
- 检查 Node.js、pnpm 和 Docker。
- 安装依赖时自动使用 Electron 镜像，加快首次 `pnpm install`。
- 启动本地 Docker MinIO 容器 `panelforge-minio`。
- 初始化 MinIO Bucket：`panelforge-images`。
- 如果没有 `node_modules`，执行 `pnpm install`。
- 最后执行 `pnpm dev` 启动 Electron 开发窗口。

SQLite 数据库不需要手动初始化。应用启动后会在 Electron `userData` 目录自动创建 `panelforge.db`，并执行内置迁移。

如果只想准备环境、不启动项目：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 -NoStart
```

如果你已经手动准备好了 MinIO：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 -SkipMinio
```

手动启动方式：

```powershell
pnpm install
pnpm dev
```

`pnpm dev` 会启动 Vite 开发服务并拉起 Electron 窗口。渲染进程支持 Vite HMR，修改 Vue 页面会自动刷新；主进程和 preload 修改后会触发 Electron 重新加载。

## 常用命令

```powershell
pnpm dev
pnpm typecheck
pnpm build
pnpm dist
```

- `pnpm dev`：开发模式，启用热刷新。
- `pnpm typecheck`：运行 TypeScript/Vue 类型检查。
- `pnpm build`：生成 unpacked 桌面应用，产物在 `release/0.0.0/win-unpacked`。
- `pnpm dist`：按 `electron-builder.json5` 生成安装包。

## 自动更新

已接入 `electron-updater`。生产包会通过 preload 暴露的 `window.panelForge.updater` 和主进程 IPC 检查、下载、安装更新，设置页里也有对应按钮。

默认更新源在 `electron-builder.json5` 的 `publish.url` 中配置。发布前把示例地址替换成你的 HTTPS 更新目录，然后生成安装包：

```powershell
pnpm dist
```

把 `release/<version>` 下的安装包、blockmap 和 `latest.yml` 上传到这个目录。后续发布新版本时，先提升 `package.json` 的 `version`，再重新执行 `pnpm dist`。

需要临时覆盖更新源时，可以在启动打包后的应用前设置环境变量：

```powershell
$env:PANELFORGE_UPDATE_URL = 'https://your-domain.example.com/panelforge/'
.\release\0.0.0\win-unpacked\PanelForge.exe
```

如果 Electron 相关二进制下载较慢，可以先设置镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
```

## Project Layout

```text
electron/          Electron main process, preload bridge, and updater IPC
src/router/        Vue Router routes using hash history for desktop packaging
src/stores/        Pinia stores
src/views/         Route views
src/App.vue        Naive UI application shell
```

## Notes

- 渲染进程与 Node.js 隔离，通过 `electron/preload.ts` 暴露的 `window.panelForge` 调用桌面能力。
- Router 使用 `createWebHashHistory()`，便于打包后的 `file://` 环境稳定导航。

## 本地数据与初始化

当前项目已接入本地 SQLite，数据库文件位于 Electron `userData` 目录下：

```text
panelforge.db
```

SQLite 会由应用自动创建并执行内置迁移，不需要手动执行 SQL 初始化。

现阶段本地数据主要分为：

- AI 绘图生成记录索引：SQLite 表 `ai_image_records`
- 小说库：IndexedDB，库名 `panelforge-novel-library`
- 角色资产：IndexedDB，库名 `panelforge-character-assets`
- 画布资产：IndexedDB，库名 `panelforge-canvas-assets`
- AI 设置、章节分析、分镜草稿、漫剧生产状态：localStorage
- AI 绘图图片文件：MinIO Bucket `panelforge-images`

后续会逐步把小说、章节、角色、分镜等核心结构化数据从 IndexedDB/localStorage 迁移到 SQLite；图片和视频文件仍然放 MinIO，SQLite 只保存元数据和对象地址。
