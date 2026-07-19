# Upstream Feature Port and Continued Optimization Implementation Plan

## Execution Status

- [x] Agent 流式连接、共享 Codex 会话、客户端隔离、生成任务状态查询、站点工具、模型调用脚本、Prompt 芯片、插件运行时、官方插件、画布侧栏/导出、Prompt Source 和 Next analytics 已完成代码接入。
- [x] 保留当前 Next.js App Router、Go 后端、登录/订阅/兑换码/公告/工单和浏览器本地持久化；未迁移 Vite 入口、未删除后端目录。
- [x] 上游同步记录：原定功能范围 `bd0ad0aebf613a5e4cfb44491017a9915e390808..bdca6b0a5c193b8c85dfbf7c6a433d62f02da9df`；补同步 Agent 更新 `062e4569aa6b0f3cba47cf92288d7557daf21490`、`5e1fd7a825ebcb89c0351ce0aec05076d1b7aa99`；上游 `plugins-dist` 清单提交 `dd1a3905bfe61dd0fcbe99856174fe499f9c6431`。
- [x] `bun test tests`、`bunx tsc --noEmit`、`canvas-agent npm test`、`canvas-agent npm run build`、`go test ./...` 和官方插件 registry 构建已通过。
- [x] 浏览器端真实 Agent、插件动态加载、四类模型脚本、Prompt Source 远程刷新和 analytics 请求已完成人工回归；对应事项已从 `docs/content/docs/progress/pending-test.mdx` 移入功能说明。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 e8331d4 到 bdca6b0 选择性移植上游新增能力，直接采用上游模型脚本、插件和 Prompt Source 脚本实现，同时保留当前 fork 的 Next.js App Router、Go 后端和业务定制。

**Architecture:** 以当前 codex/port-upstream-features 为集成分支，按功能域手工移植上游提交，不执行整段 merge/cherry-pick。框架无关的模型、插件、Agent 和 Prompt Source 逻辑尽量保持上游实现；涉及路由、页面入口和构建工具的部分改成当前 Next.js 文件位置和 API 形状。每个功能域独立提交，集成文件由主线程顺序合并。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Ant Design、Tailwind、Zustand、TanStack Query、Bun、Go/Gin/GORM、Canvas Agent MCP/HTTP。

---

## 1. Scope and Baseline

### 已完成，不重复移植

- f7c3a33：空白画布双击创建节点，对应上游 301fbce。
- 4ecb05f：图片透明背景选项，对应上游 2959b5d 及相关 UI 文案提交。
- 当前回滚点：sync-before-upstream-20260718。
- 当前集成基线：4ecb05f。

### 本计划直接纳入

| 功能域 | 上游提交 | 结果 |
| --- | --- | --- |
| Agent 流式消息和连接体验 | 864ce41, ebd8ae2, a5824f5, 57db0fe | 流式渲染、连接发现、历史会话和面板性能 |
| Agent 站点级工具 | 2adbe9e | 画布列表、工作台生图/视频、提示词搜索、素材查询和写入 |
| 模型调用脚本 | c57f7d6, 3963c6e, f0db29d | 在浏览器中使用 new Function() 执行渠道级 JS 请求脚本 |
| 画布插件运行时 | eef4d96, 8d3f244, 75aafc1, 2d2c7e3 | 动态注册、远程安装、启用/禁用、更新通知和 SDK |
| 官方插件 | 3f623ea, 3f179a6, 5f627d5, 13c508b, 4beadc6 | HTML、Markdown、全景、便利贴、SVG 节点 |
| Prompt 芯片 | 805573b, 66961ce, a2586ff | contentEditable 引用节点、缩略图和资源 token |
| 画布工作台优化 | cf1ea26, 187c499, e6dcd7a, cf0561d, 430d1bd, 219b3e8, 5107be0 | 纯逻辑拆分、侧栏、导出、资产卡和节点交互 |
| Prompt Source 脚本 | d4130bb, bdca6b0 | 浏览器本地脚本来源、调度器和 davidwu 默认源 |
| 流程细节 | e682933, 965d416 | 输入样式和默认模型选择修正 |

### 明确不纳入

- 不移植 vite.config.ts、web/src/main.tsx、web/src/router.tsx、web/index.html、web/src/pages/ 整体迁移和 react-router 依赖。
- 不删除 config/、handler/、middleware/、model/、repository/、router/、service/ 或 Go 入口。
- 不移植上游删除管理员、订阅、兑换码、公告、工单、发布接口和用户系统的提交。
- 不把上游 AGENTS.md、WORKSPACE_CONTEXT.md、Docker/Serverless 配置覆盖当前文件。
- 不把上游版本提交、整份 CHANGELOG.md、CI 重构和 Vercel 配置直接复制；版本与文档在最终阶段按当前 fork 规则整理。

## 2. File Ownership Map

### 当前 Next.js 宿主文件

- 画布页面：web/src/app/(user)/canvas/page.tsx、web/src/app/(user)/canvas/[id]/canvas-client-page.tsx。
- 画布组件：web/src/app/(user)/canvas/components/。
- 画布状态：web/src/app/(user)/canvas/stores/。
- 图片、视频和提示词页面：web/src/app/(user)/image/、web/src/app/(user)/video/、web/src/app/(user)/prompts/。
- 共享状态和服务：web/src/stores/、web/src/services/api/、web/src/services/image-storage.ts、web/src/services/file-storage.ts。
- 配置入口：web/src/components/layout/app-config-modal.tsx、web/src/app/(admin)/admin/settings/page.tsx、web/src/stores/use-config-store.ts。

### 允许新增的共享模块

- web/src/lib/canvas/：纯画布辅助、插件运行时、插件注册表和导出逻辑。
- web/src/types/canvas-plugin.ts：宿主插件契约。
- web/src/stores/canvas/use-plugin-store.ts：插件持久化状态。
- web/src/lib/agent/agent-site-tools.ts：浏览器本地站点工具。
- web/src/stores/use-agent-store.ts、web/src/stores/use-workbench-agent-store.ts：Agent 与工作台调度状态。
- web/src/services/api/model-plugin.ts：模型脚本执行和返回值归一化。
- web/src/services/api/prompt-source-runtime.ts、web/src/services/api/prompt-source-presets.ts：Prompt Source 脚本运行时和内置脚本。

### 上游路径转换规则

- 上游 web/src/pages/canvas/project.tsx 的逻辑迁入当前 canvas-client-page.tsx 及其组件，不创建 web/src/pages/。
- 上游 useNavigate() 替换为当前页面传入的 router.push() 回调，不安装 react-router-dom。
- 上游 import.meta.env.VITE_* 替换为 process.env.NEXT_PUBLIC_*，读取集中放在 web/src/constant/env.ts。
- 上游 web/src/stores/canvas/ 与当前画布 store 位置不一致时，保留当前 store 的路径和持久化 key，只移植字段和动作。
- 上游 Go 删除内容全部跳过；前端若依赖已存在的 /api 接口，继续调用当前 Go API。

## 3. Implementation Tasks

### Task 0: 建立选择性移植工作基线

**Files:**

- Read: sync-before-upstream-20260718
- Read: e8331d4..upstream/main
- Modify: no product source files

- [ ] **Step 1: 确认工作树和提交基线**

~~~powershell
git status --short --branch
git rev-parse --short HEAD
git show --no-patch --format=%H sync-before-upstream-20260718
~~~

Expected: 当前分支为 codex/port-upstream-features，HEAD 为 4ecb05f，工作树无未提交产品代码。

- [ ] **Step 2: 建立禁止路径检查清单**

每个功能提交后运行：

~~~powershell
git diff --name-only sync-before-upstream-20260718..HEAD
~~~

若出现 web/vite.config.ts、web/src/main.tsx、web/src/router.tsx、web/src/pages/、Go 业务文件删除或 react-router 依赖，先回退该功能提交，再按本计划的路径转换规则重做。

- [ ] **Step 3: 采用频繁提交边界**

后续提交信息固定使用以下前缀：

~~~text
port(upstream): extract canvas host helpers
port(upstream): add prompt reference chips
port(upstream): add agent site tools
port(upstream): add model call scripts
port(upstream): add canvas plugin runtime
port(upstream): add official canvas plugins
port(upstream): improve canvas side panel and assets
port(upstream): add prompt source scripts
~~~

### Task 1: 抽取当前画布宿主的纯逻辑和扩展入口

**Files:**

- Create: web/src/lib/canvas/canvas-generation-helpers.ts
- Create: web/src/lib/canvas/canvas-node-factory.ts
- Create: web/src/lib/canvas/canvas-node-geometry.ts
- Create: web/src/app/(user)/canvas/components/canvas-create-menus.tsx
- Create: web/src/app/(user)/canvas/components/canvas-refresh-shell.tsx
- Create: web/src/app/(user)/canvas/components/canvas-top-bar.tsx
- Create: web/src/app/(user)/canvas/hooks/use-agent-bridge.ts
- Create: web/src/app/(user)/canvas/hooks/use-plugin-host.tsx
- Modify: web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-node.tsx
- Modify: web/src/app/(user)/canvas/components/infinite-canvas.tsx

- [ ] **Step 1: 从当前页面提取生成、节点工厂和几何计算**

将当前 canvas-client-page.tsx、canvas-assistant-panel.tsx 和 infinite-canvas.tsx 中与 React 生命周期无关的函数移动到三个 web/src/lib/canvas/ 文件，保持当前函数参数和节点 metadata 字段不变。

- [ ] **Step 2: 提取创建菜单、刷新壳和顶部栏**

沿用上游 cf1ea26、187c499、e6dcd7a 的拆分结果，但把页面跳转、主题和当前 useCanvasStore 作为现有依赖注入，不改变路由结构。

- [ ] **Step 3: 把 Agent 和插件桥接从页面移到 hook**

沿用上游 cf0561d、430d1bd 的职责边界：Agent hook 只负责连接、状态快照和工具回调；插件 hook 只负责加载、激活和节点定义注入。当前页面继续负责组合两者。

- [ ] **Step 4: 验证抽取没有改变画布行为**

~~~powershell
git diff --check
bun test tests
~~~

Expected: 现有测试通过；双击建节点、节点拖动、缩放、生成配置节点和本地素材恢复逻辑仍由当前页面触发。

- [ ] **Step 5: Commit**

~~~powershell
git add web/src/lib/canvas web/src/app/(user)/canvas
git commit -m "port(upstream): extract canvas host helpers"
~~~

### Task 2: 移植 Prompt 芯片和资源引用输入

**Files:**

- Create: web/src/app/(user)/canvas/components/canvas-prompt-chip-input.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-node.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-config-composer.tsx
- Modify: web/src/lib/canvas/canvas-resource-references.ts
- Modify: web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
- Test: web/tests/canvas-prompt-chip-input.test.ts

- [ ] **Step 1: 定义可逆的文本表示**

输入组件内部使用 contentEditable 展示节点缩略图 chip，但提交值必须仍是纯文本 token：

~~~text
@[node:<node-id>]
~~~

粘贴、删除、重新加载和提交都以 token 文本为真值，不把 React 芯片 HTML 写入 canvas metadata。

- [ ] **Step 2: 移植上游 66961ce 组件**

保留上游的引用候选、缩略图、键盘删除、光标恢复和 token 解析逻辑；将主题读取改成当前 canvasThemes，将节点查询改成当前 canvas store。

- [ ] **Step 3: 接入手动输入和配置节点**

当前文本输入为空时保持原有 textarea 行为；存在引用时才渲染 chip 输入。生成请求仍从 canvas-resource-references.ts 解析 token，保持当前图像、视频和音频引用协议。

- [ ] **Step 4: 添加最小回归测试**

测试纯函数覆盖以下映射：普通文本不变、单个 token 保留、多个 token 顺序保留、删除 chip 后 token 被删除、未知节点 token 不阻塞提交。

- [ ] **Step 5: 手动验证**

在画布中连接文本节点和图片节点，确认输入框显示缩略图；保存并刷新项目后 token 仍能恢复；文生图、图生图和视频引用都能收到正确的节点 ID。

- [ ] **Step 6: Commit**

~~~powershell
git add web/src/app/(user)/canvas web/src/lib/canvas/canvas-resource-references.ts web/tests/canvas-prompt-chip-input.test.ts
git commit -m "port(upstream): add prompt reference chips"
~~~

### Task 3: 移植 Agent 流式渲染、连接体验和站点工具

**Files:**

- Create: web/src/lib/agent/agent-site-tools.ts
- Create: web/src/stores/use-agent-store.ts
- Create: web/src/stores/use-workbench-agent-store.ts
- Modify: web/package.json
- Modify: web/bun.lock
- Modify: web/src/app/(user)/canvas/components/canvas-local-agent-panel.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-agent-chat-ui.tsx
- Modify: web/src/components/image-settings-panel.tsx
- Modify: web/src/components/video-settings-panel.tsx
- Modify: web/src/app/(user)/image/page.tsx
- Modify: web/src/app/(user)/video/page.tsx
- Modify: web/src/services/api/prompts.ts
- Modify: web/src/stores/use-asset-store.ts
- Modify: canvas-agent/src/schemas.ts
- Modify: canvas-agent/src/canvas-session.ts
- Modify: canvas-agent/src/config.ts
- Modify: canvas-agent/src/http-server.ts
- Modify: canvas-agent/src/agents.ts
- Modify: canvas-agent/README.md

- [ ] **Step 1: 加入上游流式渲染依赖**

将上游 864ce41 使用的 streamdown 加入 web/package.json，用 Bun 更新 web/bun.lock，不引入 Vite 或 React Router。

- [ ] **Step 2: 接入真实增量消息渲染**

在 canvas-agent-chat-ui.tsx 中按上游 item.updated 的同一 message ID 合并增量，使用 streamdown 渲染 Markdown；完成事件到达后保留最终文本，不重复追加。工具调用日志仍单独显示。

- [ ] **Step 3: 移植站点工具协议**

沿用上游 2adbe9e 的工具名和输入输出：

~~~text
canvas_list_projects
workbench_image_get_config
workbench_image_generate
workbench_video_get_config
workbench_video_generate
prompts_search
assets_list
assets_add
~~~

canvas-agent/src/schemas.ts 负责 Zod schema，canvas-session.ts 负责把 site tool 转发到浏览器事件流；浏览器端 agent-site-tools.ts 直接读写当前 Zustand/localforage store。

- [ ] **Step 4: 保留当前 Next 路由适配**

上游 NavigateFunction 替换为 (path: string) => void，由当前页面用 useRouter().push(path) 提供。不能导入 react-router-dom。

- [ ] **Step 5: 接入工作台自动生成和素材写入**

沿用上游行为：

- workbench_image_generate 写入图片工作台配置，跳转 /image，默认触发当前生成按钮。
- workbench_video_generate 写入视频工作台配置，跳转 /video，默认触发当前生成按钮。
- assets_add 支持 text 和 image，图片通过现有 uploadImage() 写入本地文件存储，再调用 useAssetStore.addAsset()。
- 画布生成工具继续使用当前 canvas_apply_ops 和 run_generation 协议。

- [ ] **Step 6: 移植连接静默模式和历史会话体验**

按上游 ebd8ae2、a5824f5、57db0fe 补齐 Agent URL/token 自动发现、silent connect、Codex thread 历史、事件日志和细粒度 Zustand selector；不覆盖当前 Origin/token 绑定逻辑。

- [ ] **Step 7: 验证 Agent 工具链**

~~~powershell
bun test tests
Set-Location canvas-agent
npm run build
Set-Location ..
~~~

手动验证：连接本地 Agent、列出画布、搜索提示词、读取素材、添加文本素材、跳转生图并触发一次生成、跳转视频并提交一次生成、刷新页面后查看流式消息和历史会话。

- [ ] **Step 8: Commit**

~~~powershell
git add web/package.json web/bun.lock web/src/lib/agent/agent-site-tools.ts web/src/stores/use-agent-store.ts web/src/stores/use-workbench-agent-store.ts web/src/app/(user)/canvas/components/canvas-local-agent-panel.tsx web/src/app/(user)/canvas/components/canvas-agent-chat-ui.tsx web/src/components/image-settings-panel.tsx web/src/components/video-settings-panel.tsx web/src/app/(user)/image/page.tsx web/src/app/(user)/video/page.tsx web/src/services/api/prompts.ts web/src/stores/use-asset-store.ts canvas-agent/src/schemas.ts canvas-agent/src/canvas-session.ts canvas-agent/src/config.ts canvas-agent/src/http-server.ts canvas-agent/src/agents.ts canvas-agent/README.md
git commit -m "port(upstream): add agent site tools"
~~~

### Task 4: 移植模型调用脚本和渠道编辑器

**Files:**

- Create: web/src/services/api/model-plugin.ts
- Create: web/src/components/layout/model-script-editor.tsx
- Create: web/src/components/layout/channel-editor-drawer.tsx
- Create: web/src/components/layout/model-select-modal.tsx
- Modify: web/src/stores/use-config-store.ts
- Modify: web/src/services/api/image.ts
- Modify: web/src/services/api/video.ts
- Modify: web/src/services/api/audio.ts
- Modify: web/src/components/model-picker.tsx
- Modify: web/src/components/layout/app-config-modal.tsx
- Modify: web/src/app/(admin)/admin/settings/page.tsx
- Test: web/tests/model-plugin.test.ts

- [ ] **Step 1: 建立模型脚本输入输出契约**

直接采用上游 f0db29d 的 runModelPlugin() 形状，向脚本注入：

~~~text
prompt, images, messages, params,
model, baseUrl, apiKey, systemPrompt,
http, request, poll, sleep, signal, onDelta
~~~

脚本返回值由 normalizePluginImages()、视频结果、音频 Blob/base64 和文本增量分别归一化。

- [ ] **Step 2: 扩展 AiConfig 和渠道字段**

将上游 c57f7d6 的 capability、脚本和模型别名字段合并到当前 use-config-store.ts，继续使用当前 localforage 持久化和远程/本地渠道结构，不修改 Go 配置模型。

- [ ] **Step 3: 在四种请求路径中接入脚本分支**

修改 image.ts、video.ts、audio.ts 和当前文本请求路径：有脚本时调用 runModelPlugin()，无脚本时保留当前 OpenAI 兼容请求。脚本请求的 baseUrl、apiKey、headers 和轮询行为按上游实现透传。

- [ ] **Step 4: 移植编辑器和渠道 UI**

使用已安装的 CodeMirror 组件实现脚本编辑、变量说明、能力选择、模板插入和模型选择。将上游 channel-editor-drawer.tsx 的字段接入当前管理员设置页面，保留当前模型别名、订阅和设置保存流程。

- [ ] **Step 5: 添加返回值归一化测试**

model-plugin.test.ts 至少覆盖：图片 URL、图片 dataURL、b64_json 数组、空结果错误、AbortError 原样传播。测试不得真的调用远程模型接口。

- [ ] **Step 6: 手动验证四种脚本模板**

分别保存并调用 OpenAI/Gemini 图片、视频、音频和文本模板；确认没有脚本的现有渠道行为不变，文本 onDelta 在聊天面板逐步显示。

- [ ] **Step 7: Commit**

~~~powershell
git add web/src/stores/use-config-store.ts web/src/services/api web/src/components web/src/app/(admin)/admin/settings/page.tsx web/tests/model-plugin.test.ts
git commit -m "port(upstream): add model call scripts"
~~~

### Task 5: 移植画布插件运行时和远程插件管理

**Files:**

- Create: web/src/types/canvas-plugin.ts
- Create: web/src/lib/canvas/node-registry.ts
- Create: web/src/lib/canvas/plugin-loader.ts
- Create: web/src/lib/canvas/plugin-node-context.ts
- Create: web/src/lib/canvas/plugin-runtime.ts
- Create: web/src/lib/canvas/plugin-registry.ts
- Create: web/src/lib/canvas/canvas-event-bus.ts
- Create: web/src/stores/canvas/use-plugin-store.ts
- Create: web/src/components/canvas/canvas-plugin-manager-modal.tsx
- Modify: web/src/constant/env.ts
- Modify: web/src/app/(user)/canvas/components/canvas-node.tsx
- Modify: web/src/app/(user)/canvas/components/infinite-canvas.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-toolbar.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-mini-map.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx
- Modify: web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
- Modify: web/src/app/(user)/canvas/hooks/use-plugin-host.tsx

- [ ] **Step 1: 建立宿主契约**

直接整理上游 plugins/canvas/sdk/src/types.ts 到 web/src/types/canvas-plugin.ts，覆盖节点定义、上下游资源、主题 token、applyOps、事件总线、插件存储、toolbar、panel 和插件工厂。

- [ ] **Step 2: 建立节点注册表**

实现 registerNodeDefinitions()、unregisterPluginNodes() 和按 node type 查询的注册表；内置 image/text/config/video/audio 继续走当前节点分支，插件节点走统一 CanvasNodeDefinition。

- [ ] **Step 3: 移植动态插件加载**

沿用上游 plugin-loader.ts：从 URL 拉取源码，经 Blob URL 动态 import，读取默认导出或 plugin 导出，激活时注册节点和 CSS，禁用/卸载时清理 setup disposer 和节点定义。远程 URL 安装、覆盖更新和启用状态存储到 use-plugin-store。

- [ ] **Step 4: 接入官方插件清单和插件管理 UI**

沿用 plugin-registry.ts 的 manifest 读取、canvas-plugin-manager-modal.tsx 的安装/启用/卸载/升级按钮，以及 8d3f244 的工具栏扩展节点入口和点击外部关闭行为。将 VITE_PLUGIN_REGISTRY_URL 改为 NEXT_PUBLIC_PLUGIN_REGISTRY_URL。

- [ ] **Step 5: 将插件宿主接入当前 Canvas**

在当前 canvas-node.tsx 中根据 node type 查询插件定义；把 CanvasNodeContext 的节点查询、上下游遍历、metadata 更新、尺寸更新、操作分发、事件和插件私有 storage 绑定到当前 store。

- [ ] **Step 6: 验证插件生命周期**

用一个最小本地插件覆盖：安装、刷新后自动加载、禁用后节点不再渲染、启用后恢复、卸载后节点定义和样式清理、更新后版本与内容刷新。插件管理器应能显示官方 manifest 列表。

- [ ] **Step 7: Commit**

~~~powershell
git add web/src/types/canvas-plugin.ts web/src/lib/canvas/node-registry.ts web/src/lib/canvas/plugin-loader.ts web/src/lib/canvas/plugin-node-context.ts web/src/lib/canvas/plugin-runtime.ts web/src/lib/canvas/plugin-registry.ts web/src/lib/canvas/canvas-event-bus.ts web/src/stores/canvas/use-plugin-store.ts web/src/components/canvas/canvas-plugin-manager-modal.tsx web/src/constant/env.ts web/src/app/(user)/canvas/components/canvas-node.tsx web/src/app/(user)/canvas/components/infinite-canvas.tsx web/src/app/(user)/canvas/components/canvas-toolbar.tsx web/src/app/(user)/canvas/components/canvas-mini-map.tsx web/src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx web/src/app/(user)/canvas/[id]/canvas-client-page.tsx web/src/app/(user)/canvas/hooks/use-plugin-host.tsx
git commit -m "port(upstream): add canvas plugin runtime"
~~~

### Task 6: 添加官方 Canvas 插件和插件 SDK

**Files:**

- Create: plugins/canvas/sdk/
- Create: plugins/canvas/registry/
- Create: plugins/canvas/template/
- Create: plugins/canvas/html/
- Create: plugins/canvas/markdown/
- Create: plugins/canvas/panorama/
- Create: plugins/canvas/sticky-note/
- Create: plugins/canvas/svg/
- Modify: .github/workflows/publish-plugins.yml
- Modify: .gitignore

- [ ] **Step 1: 移植 SDK**

直接采用上游 75aafc1 的 define-plugin.ts、JSX runtime、React hook 转发、类型契约和 build 脚本，确保插件 bundle 使用宿主 React，不在插件中打包第二份 React。

- [ ] **Step 2: 移植五个插件源码**

按上游提交顺序移植：

- markdown：缓存 Markdown 解析结果和 DOM 更新，来自 4beadc6。
- svg：透明背景编辑和渲染，来自 13c508b。
- html：交互工具栏和编辑器，来自 3f623ea。
- panorama：全景查看和 AI 生成入口，来自 3f179a6。
- sticky-note：换色、编辑和拖拽衍生文本，来自 5f627d5。

- [ ] **Step 3: 生成官方 registry**

运行 plugins/canvas/registry/build.mjs，输出每个插件 bundle 和 official-plugins.json，确认清单中的 entry 都能被宿主 URL 解析。

~~~powershell
Set-Location plugins/canvas/registry
npm install
npm run build
Set-Location ../../..
~~~

- [ ] **Step 4: 手动验证插件和内置节点交互**

分别创建五类插件节点，检查节点缩放、主题、mini-map、上下游引用、插件私有 storage、工具栏和刷新恢复；HTML 插件检查 {{input}} 上游文本注入，panorama 检查上游图片输入。

- [ ] **Step 5: Commit**

~~~powershell
git add plugins .github/workflows/publish-plugins.yml .gitignore
git commit -m "port(upstream): add official canvas plugins"
~~~

### Task 7: 移植画布侧栏、批量导出和资产卡优化

**Files:**

- Create: web/src/stores/use-canvas-side-panel-store.ts
- Create: web/src/components/canvas/canvas-side-panel.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-top-bar.tsx
- Modify: web/src/app/(user)/canvas/components/canvas-node.tsx
- Modify: web/src/app/(user)/canvas/[id]/canvas-client-page.tsx
- Create or modify: web/src/lib/canvas/canvas-export.ts
- Modify: web/src/app/(user)/assets/asset-transfer.ts
- Modify: web/src/app/(user)/asset-library/page.tsx
- Modify: web/src/stores/use-asset-store.ts

- [ ] **Step 1: 移植侧栏状态**

按 219b3e8 增加侧栏宽度、收起状态和当前面板类型的 Zustand store；宽度变更使用稳定的 CSS/grid track，不改变画布 viewport 数据格式。

- [ ] **Step 2: 移植节点列表和跳转动画**

侧栏展示当前项目节点、按类型筛选、点击定位并选中节点；节点名称默认隐藏只影响展示，不修改节点标题字段和历史数据。

- [ ] **Step 3: 移植多选导出**

将 canvas-export.ts 的选中节点过滤、图片/视频文件读取、打包和下载逻辑接入当前 asset-transfer.ts 与 file-storage.ts，保持现有单项导出格式兼容。

- [ ] **Step 4: 重做资产卡动作**

按 5107be0 统一资产卡的新增、编辑、删除和节点名称展示，复用当前 useAssetStore、确认弹窗和本地持久化，不接入新的后端资产同步。

- [ ] **Step 5: 验证和 Commit**

~~~powershell
bun test tests
git diff --check
git add web/src/stores/use-canvas-side-panel-store.ts web/src/components/canvas/canvas-side-panel.tsx web/src/app/(user)/canvas/components/canvas-top-bar.tsx web/src/app/(user)/canvas/components/canvas-node.tsx web/src/app/(user)/canvas/[id]/canvas-client-page.tsx web/src/lib/canvas/canvas-export.ts web/src/app/(user)/assets/asset-transfer.ts web/src/app/(user)/asset-library/page.tsx web/src/stores/use-asset-store.ts
git commit -m "port(upstream): improve canvas side panel and assets"
~~~

### Task 8: 移植 Prompt Source 脚本和默认来源

**Files:**

- Create: web/src/services/api/prompt-source-runtime.ts
- Create: web/src/services/api/prompt-source-presets.ts
- Create: web/src/components/layout/config-prompt-sources.tsx
- Create: web/src/components/layout/prompt-source-content-modal.tsx
- Create: web/src/components/layout/prompt-source-editor-drawer.tsx
- Create: web/src/hooks/use-prompt-source-scheduler.ts
- Create: web/src/stores/use-prompt-source-store.ts
- Modify: web/src/services/api/prompts.ts
- Modify: web/src/stores/use-config-store.ts
- Modify: web/src/components/layout/app-config-modal.tsx
- Modify: web/src/components/layout/client-root-init.tsx
- Test: web/tests/prompt-source-runtime.test.ts

- [ ] **Step 1: 移植脚本执行器**

直接采用上游 d4130bb 的 runPromptSource() 和辅助函数：fetchText、fetchJson、splitSections、firstMatch、extractImages、absoluteUrl、tagsFromHeading、splitTags、markdownPreview、leftPad、makePrompt。脚本必须 return RawPrompt[]，结果按 id 去重并归一化。

- [ ] **Step 2: 移植默认脚本**

把 awesome-gpt-image、awesome-gpt4o-image-prompts、两个 YouMind 来源和 davidWuGptImage2Script 放入 DEFAULT_PROMPT_SOURCES，保持 enabled: true 和上游默认源名称、GitHub URL、脚本内容。

- [ ] **Step 3: 接入来源编辑和内容预览**

移植上游配置组件，支持新增、编辑、启用、禁用、手动刷新、查看原始内容和查看解析结果。来源数据使用当前浏览器 localforage/Zustand，不删除当前 Go 管理后台的 PromptSource API。

- [ ] **Step 4: 接入调度器**

将 use-prompt-source-scheduler.ts 接入 client-root-init.tsx，按配置间隔在浏览器端刷新启用来源。同步完成后更新本地提示词列表，失败时保留之前成功结果。

- [ ] **Step 5: 兼容当前提示词查询**

修改 web/src/services/api/prompts.ts，把本地脚本来源结果和现有 /api/prompts 返回结果合并到当前 PromptListResponse，保持现有首页、提示词页、选择弹窗和 Agent prompts_search 的分页字段。

- [ ] **Step 6: 添加脚本运行时测试**

使用内联 markdown 和 JSON fixture 测试：标题/提示词提取、相对图片 URL、标签拆分、重复 ID 去重、空结果错误和脚本执行失败错误。测试不依赖外部 GitHub 网络。

- [ ] **Step 7: Commit**

~~~powershell
git add web/src/services/api/prompts.ts web/src/services/api/prompt-source-runtime.ts web/src/services/api/prompt-source-presets.ts web/src/components/layout web/src/hooks/use-prompt-source-scheduler.ts web/src/stores/use-prompt-source-store.ts web/src/stores/use-config-store.ts web/tests/prompt-source-runtime.test.ts
git commit -m "port(upstream): add prompt source scripts"
~~~

### Task 9: 选择性接入运行时配置和统计

此任务不搬运上游 Vite 入口，只把 ca6efdf 的功能适配到 Next。它放在所有核心功能之后，避免和 Agent/配置页面同时改动。

**Files:**

- Create: web/src/components/layout/analytics-tracker.tsx
- Create: web/src/lib/analytics.ts
- Modify: web/src/constant/env.ts
- Modify: web/src/app/layout.tsx
- Modify: web/src/components/layout/app-providers.tsx
- Modify: .env.example
- Modify: Dockerfile only for Next runtime environment variables when required

- [ ] **Step 1: 定义 Next 环境变量**

使用 NEXT_PUBLIC_GA_MEASUREMENT_ID 和 NEXT_PUBLIC_BAIDU_ANALYTICS_ID，空值时不加载任何统计脚本。

- [ ] **Step 2: 将 tracker 挂到当前 App Router**

在 app/layout.tsx 或 AppProviders 中挂载 client component，依据 usePathname() 记录页面变更；不新增 Vite main.tsx、router 或 index.html。

- [ ] **Step 3: 验证空配置和启用配置**

空配置时页面源码不出现第三方脚本；配置测试 ID 后，浏览器 Network 中只出现对应统计请求，页面和 API 请求不被阻塞。

- [ ] **Step 4: Commit**

~~~powershell
git add web/src/constant/env.ts web/src/app/layout.tsx web/src/components/layout/app-providers.tsx web/src/components/layout/analytics-tracker.tsx web/src/lib/analytics.ts .env.example Dockerfile
git commit -m "port(upstream): add next runtime analytics"
~~~

### Task 10: 文档、变更记录和最终集成

**Files:**

- Modify: CHANGELOG.md
- Modify: docs/content/docs/overview/features.mdx
- Modify: docs/content/docs/progress/pending-test.mdx
- Modify: docs/content/docs/progress/todo.mdx
- Modify: docs/content/docs/canvas/canvas-node-manual.mdx
- Modify: docs/content/docs/development/local-codex-canvas.mdx only when the file already exists in the current branch
- Modify: canvas-agent/README.md
- Modify: README.md only for concise feature/usage links

- [ ] **Step 1: 更新 Unreleased**

只记录本次真实移植的功能域，不复制上游完整 CHANGELOG，也不修改版本号。

- [x] **Step 2: 更新待测试清单**

已将 Prompt 芯片、Agent site tools、模型脚本、插件节点、侧栏导出、Prompt Source 脚本和统计配置从 pending-test.mdx 移入 features.mdx。

- [x] **Step 3: 检查文档边界**

明确画布和“我的素材”仍主要存于浏览器本地，API Key 仍由浏览器前端直接请求 OpenAI 兼容接口，Go 后端和当前 Docker 路径未被删除或宣称已完成迁移。

- [x] **Step 4: 最终差异审计**

~~~powershell
git diff --check
git diff --stat sync-before-upstream-20260718..HEAD
git diff --name-status sync-before-upstream-20260718..HEAD
bun test tests
~~~

Expected: 无空白错误；现有测试通过；没有 Vite/React Router 整体迁移；没有 Go 后端删除；当前自定义业务目录仍存在。

- [ ] **Step 5: Commit**

~~~powershell
git add CHANGELOG.md README.md docs canvas-agent/README.md
git commit -m "docs: record continued upstream feature ports"
~~~

## 4. Subagent Execution Layout

使用独立 worktree，每个 worker 只拥有下列文件；共享集成文件由主线程在 worker 完成后顺序合并，避免多个 agent 同时改 canvas-node.tsx、canvas-client-page.tsx 和 use-config-store.ts。

| Worker | 负责 | 不得修改 |
| --- | --- | --- |
| Agent worker | Task 3、canvas-agent/、Agent stores/site tools | 插件 SDK、Prompt Source、Go 业务目录 |
| Model worker | Task 4、模型 API、脚本编辑器和测试 | Agent panel、插件运行时 |
| Plugin worker | Task 5、Task 6、plugins/canvas/ | 模型脚本、Prompt Source |
| Canvas worker | Task 1、Task 2、Task 7 | Agent site tools、模型脚本 |
| Main integrator | Task 0、Task 8、Task 9、Task 10、冲突整合和验收 | 不直接重写 worker 已完成模块 |

每个 worker 必须提供：提交哈希、修改文件清单、git diff --check 结果、测试命令和未解决冲突。主线程按 Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 顺序整合。

## 5. Validation Matrix

### 自动检查

~~~powershell
git diff --check
bun test tests
bunx tsc --noEmit
Set-Location canvas-agent
npm run build
Set-Location ..
~~~

bunx tsc --noEmit 若仍只报告当前已知的 video-settings-panel.tsx Segmented/隐式 any 基线错误，可以记录为基线；不得新增模型脚本、插件、Agent 或 Prompt Source 类型错误。完整 bun run build 按当前项目规则由用户在最终验收时执行。

### 浏览器回归

- /canvas：双击建节点、拖动、缩放、侧栏收起/调整宽度、节点跳转、多选导出。
- 生成节点：文本、图片、视频、音频配置和引用 token；透明背景选项继续有效。
- Agent：连接、静默连接、流式消息、工具日志、站点工具、工作台生图/视频、素材新增。
- 模型脚本：图片、视频、音频、文本四种能力，脚本和非脚本渠道各验证一次。
- 插件：官方 manifest、远程 URL 安装、启用/禁用、更新、卸载、五种官方插件节点。
- Prompt Source：默认五个来源、手动刷新、脚本编辑、解析预览、调度刷新、失败后保留旧数据。
- 现有定制：登录、兑换码、订阅、公告、工单、模型别名、Agnes、提示词服务端同步和本地持久化。

## 6. Rollback and Stop Conditions

- 每个 Task 一个提交；发现回归时只回退最近功能提交，不重置整个分支。
- 如果某个上游功能要求新增 Vite 根入口、删除 Go 文件或改变当前 API 响应结构，停止该功能并改为适配层，不扩大范围。
- 如果冲突同时涉及当前业务定制和上游功能逻辑，保留当前定制，重写最小适配函数；不使用 git checkout -- 覆盖文件。
- 全部功能验证失败时，保留当前分支和提交历史，使用 sync-before-upstream-20260718 作为人工回退基准。

## 7. Acceptance Criteria

- 所有指定上游功能域均有独立提交和可复现验证命令。
- web/package.json 仍使用 Next.js scripts，不出现 react-router、Vite 入口或 Vite 配置迁移。
- config/、handler/、model/、repository/、router/、service/ 和 Go 入口仍存在，当前后端接口继续工作。
- new Function() 模型脚本、Blob 动态插件、远程 Prompt Source 脚本、Agent 自动生成和素材写入均按上游行为接入，不额外增加新的护栏改造任务。
- 当前已完成的双击建节点和透明背景功能在最终回归中仍通过。
- 文档只描述已实际移植的能力，不把云同步、Docker 静态资源路径或生产验证写成已完成事实。
