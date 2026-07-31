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