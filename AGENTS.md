# AGENTS.md · 给 AI 助手的操作索引

> 本文件写给**另一个 LLM / 编码助手**：你要在这个仓库里改东西时，先看这里，再按链接跳到细节。
> 人类读者请看 [README.md](README.md)；数据结构规范在 [docs/SCHEMA.md](docs/SCHEMA.md)。

---

## 0. 三十秒认识这个项目

**dsh-fishhome** 是一个 DeepSeek Harness（DSH）桌面端插件：在侧边栏里放一间 2.5D 等距小屋，屋里住着一只虚拟伙伴「大肥鱼」，行为跟着现实时间推进，状态存档在本地文件，房间/家具/事件全部是 `data/` 下的 JSON。

- **技术栈**：Host 半是 Node.js ESM 模块（`index.js`，提供 HTTP 路由）；Client 半是 React（通过 `window.__ModuleLoader__` 动态加载的单文件 `client.js`，由 `src/*.js` 拼接生成）。
- **没有构建工具链**：没有 npm 依赖、没有打包器。`node build.mjs` 就是构建。
- **没有网络**：全部离线，素材是本地 PNG。

### 目录速查

| 路径 | 是什么 | 改完要做什么 |
| --- | --- | --- |
| `index.js` | **Host**：路由、存档读写、静态资源发布 | **重启 Harness** |
| `src/*.js` | **Client 源码**（17 个片段，见 §3） | `node build.mjs` 后刷新面板 |
| `client.js` | **生成物**，浏览器加载的就是它 | ❌ 永远不要直接编辑 |
| `data/maps/<map>/` | 场景定义：`scene.json` / `background.json` / `furniture/` / `events/` | 刷新面板（编辑器里保存也行） |
| `packs/<pack>/` | 角色包：`pet.json` + `actions/` + PNG 素材 | 刷新面板 |
| `docs/` | `SCHEMA.md`（数据规范）、`STYLE.md`（美术规范） | — |
| `tools/check.mjs` | 零依赖自检 | 改完**必须**跑 |
| `test/*.test.js` | 四套自测 | 改完**必须**跑 |

---

## 1. 安装 / 启用（照着做就行）

插件有两种装法，**装完都要重启 Harness**（Host 半只在启动时注册路由）。

### 方式 A：作为 bundle 安装（给最终用户）

1. 用 DSH 的插件管理把本包装进当前 profile（包名 `dsh-fishhome`，`package.json` 里 `dsh.bundle.patch` 指向 `cordis.patch.yml`）。
2. 确认插件的 `client.js` 存在（仓库里已提交；若是从源码拿的，先 `node build.mjs`）。
3. 重启 Harness → 侧边栏出现「家园」入口。

### 方式 B：本地开发链接（改代码时用）

1. 把仓库链接进 profile：
   `%USERPROFILE%\.dsh\profiles\<profile>\node_modules\dsh-fishhome` → 本仓库目录（Windows 用 junction）。
2. 在 profile 的 `cordis.patch.yml` 里启用（同 id 覆盖默认值）：

```yaml
- insert:
    - id: fishhome
      name: dsh-fishhome
      config:
        characterName: 大肥鱼
        tickSeconds: 15
```

3. 重启 Harness。之后改 `src/` → `node build.mjs` → 刷新面板；改 `index.js` → 要再重启。

### 配置项（`cordis.patch.yml` 的 `config`）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `characterName` | `大肥鱼` | 角色默认名（运行时可在面板「设置」里改） |
| `tickSeconds` | `15` | 模拟时钟推进间隔（秒） |
| `packDir` | 仓库内 `packs/bigfish-adult` | 角色包目录 |
| `saveDir` | `%USERPROFILE%\.dsh\fishhome\saves` | 存档目录 |
| `map` | `bedroom` | 首次进入的房间 id |

### 装完自检

| 现象 | 先查什么 |
| --- | --- |
| 面板白屏 / 报错 | `client.js` 是否存在且比 `src/` 新（`node tools/check.mjs` 会说） |
| 侧边栏没有入口 | profile 的 `cordis.patch.yml` 是否启用了 `fishhome`；是否重启过 |
| 面板出来了但房间空 | 角色包 `packDir` 是否正确；`GET /fishhome/api/meta` 的 `packReady` |
| 图片全是占位块 | 素材文件名 / `rect` 是否对（`node tools/check.mjs` 会报缺图） |

---

## 2. 常用命令（照着抄）

```bash
# 构建（改了 src/ 之后必跑；不跑的话面板还是旧的）
node build.mjs

# 自检：构建是否最新 / 片段是否漏登记 / 文案是否缺失 / 有没有死代码 / 数据引用是否对得上
node tools/check.mjs

# 四套测试
node test/model.test.js    # 纯模型：时间、需求、调度、离线结算、动画帧换算
node test/ui.test.js       # 渲染树、几何、编辑器、日志文案
node test/host.test.js     # Host 路由：存档、静态资源、路径穿越防护、打开配置文件
node test/mount.test.js    # 挂载冒烟：面板能渲染、不无限重渲染
```

> Node 可执行文件在本机是 `D:\deepseek\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`；如果 `node` 不在 PATH 里就用全路径。

**改动完成后必须全部通过**：`node build.mjs` → `node tools/check.mjs` → 四个测试。

---

## 3. Client 片段与构建顺序

`build.mjs` 里的 `ORDER` 决定拼接顺序（顺序有意义：常量要先于使用）。

```
env.js          常量
locale.js       中英文字典 + makeTranslate
model.js        纯模型（不碰 DOM/React，可直接在 Node 里测）
store-save.js   存档适配 + 角色包载入
store.js        HomeStore 核心（状态 / 订阅 / 启动）
store-scene.js  场景切换          ┐
store-edit.js   布局编辑与写回     ├ 都作为 mixin 挂到 HomeStore.prototype
store-view.js   动画视图/时钟/行为 ┘
scene-data.js   场景/背景/家具数据加载
scene-geom.js   等距几何
scene-art.js    内置画法 preset
scene-light.js  窗光 / 屏幕光 / 时段色
scene-parts.js  家具绘制：锚点、可见性、变形、精灵、排序
scene-render.js SceneSvg 合成入口
ui.js           面板 React 组件
styles.js       样式
index.js        插件入口（返回 inject/apply）
```

**关键约束**：所有片段拼进**同一个函数作用域**，彼此不用 import/export，直接引用名字。因此：

- 新增片段必须同时改 `build.mjs` 的 `ORDER`，否则会被静默丢弃（`tools/check.mjs` 会拦住）。
- 不要在不同片段里重名（拼起来就是重复声明，直接语法错误）。

---

## 4. 三条铁律

1. **不要手改 `client.js`**。它由 `src/` 生成；改了会被下一次 `node build.mjs` 覆盖。
2. **Host（`index.js`）改动需要重启 Harness**；Client / 数据改动只需刷新面板。
3. **改完先跑 `node tools/check.mjs`**。它会检查你那句 `t('some.key')` 到底有没有文案、数据引用有没有断。

---

## 5. 常见任务的配方

### 5.1 改角色名字 / 房间名 / 自称

- 运行时：面板「设置」里改，存进存档。
- 默认值：`index.js` 的 `normalizeConfig()` 与 `cordis.patch.yml` 的 `config`。
- 文案里的占位符：`{name}`（角色名）、`{self}`（自称）、`{user}`（她怎么叫你），由 `model.js` 的 `fillText()` 替换。

### 5.2 加一件家具

1. 素材 PNG 放进 `packs/bigfish-adult/`。
2. 新建 `data/maps/<map>/furniture/<id>.json`：

```jsonc
{
  "id": "my_thing",
  "name": { "zh": "我的东西" },
  "type": "furniture",
  "parts": [
    { "id": "body", "z": 74, "sprite": { "src": "my-thing.png", "rect": [x, y, w, h] } }
  ],
  "click": { "type": "toggle", "key": "myThingOn" }   // 或 { "type": "event", "id": "read" }
}
```

3. 把 `id` 加进 `data/maps/<map>/scene.json` 的 `furniture` 数组。
4. `node tools/check.mjs` 会验证图片文件存在、`rect` 合法、事件/动作引用有效。

细节字段（`skew` / `flipX` / `rotate` / `surface` / `attach` / `repeat` / `animations`（内含锚点）/ `screenGlow`）见 [docs/SCHEMA.md §3.4](docs/SCHEMA.md)。

### 5.3 加一个行为（事件）

1. 新建 `data/maps/<map>/events/<id>.json`（字段：`spot` / `anim` / `duration` / `onTick` / `cooldown` / `weight` / `say` / `log` / `anchor`）。
2. 把 `id` 加进 `scene.json` 的 `events`。
3. **必须补文案**，否则界面上会显示原始键名：
   - `src/locale.js` 里加 `behavior.<id>`、`flavor.<id>`
   - 如果事件的 `log` 是自定义码，再加 `log.<code>`
4. `node tools/check.mjs` 会检查这三件事。

### 5.4 改灯光

| 想改什么 | 写在哪 |
| --- | --- |
| 窗户光斑 | `scene.json` → `light.sources[]`（`at` 是占墙比例，`spread` / `reach` / `alpha` / `wallGlow`） |
| 电视/显示器屏幕光 | **家具自己身上** → `screenGlow`（`prop` / `behavior` / `screen` 四比例 / `width` / `reach` / `alpha` / `offset`） |
| 窗帘挡光 | `scene.json` → `curtainLight: { blue, white }` |
| 房间灯何时亮 | `scene.json` → `roomLight: { mode: "prop", prop: "livingLamp" }`（否则按天黑自动） |
| 一次性关掉全部氛围特效 | `scene.json` → `"effects": false` |

**坑**：发光件必须画在**光源层**（`layer: "light"` 或代码里推入 `lightParts`），否则会被家具精灵本身盖住。

### 5.5 加一个场景（地图）

1. 建 `data/maps/<id>/`，至少要有 `scene.json` + `background.json`。
2. 把 `<id>` 加进 `data/maps/index.json` 的地图清单。
3. `scene.json` 关键字段：`room`（`cols`/`rows`/`wallHeight`/`canvas`/`projection`/`camera`）、`spots`、`spawn`、`furniture`、`events`、`controls`。

### 5.6 换角色素材 / 切片

- 角色包 `pet.json` 的 `assets` 声明图纸尺寸，`actions/*.json` 里每帧用 `rect` 从图纸裁一格。
- 动画可带 `bubble`（独立气泡素材）、帧级 `squash`（压高度 px）、`groupSize`（组内循环）、`randomStart` / `hold`。
- 切图注意：棋盘格底要用**边界洪水填充**清掉；按**连通块质心**归格；**底部对齐**。踩过的坑是「上边有脚、下边不完整」。

---

## 6. 调试入口

| 想知道 | 怎么做 |
| --- | --- |
| 当前状态/存档在哪 | 面板「设置」→ 配置文件列表，能直接打开 |
| 某个家具的 JSON | 面板「编辑」→ 选中家具 → 「打开 json」 |
| 某个事件的 JSON | 面板「编辑」→ 事件 → 「打开 json」 |
| Host 返回了什么 | `GET /fishhome/api/meta`（含 `packDir` / `dataDir` / `saveDir` / `mapPath`） |
| 存档在哪 | 默认 `%USERPROFILE%\.dsh\fishhome\saves\state.json`，可用 config `saveDir` 覆盖 |

### Host 路由

```
GET    /fishhome/api/meta          插件元信息（角色包、各目录、mapPath）
GET    /fishhome/api/maps          可用地图列表
GET    /fishhome/api/pack-files    角色包里的图片清单（编辑器换图下拉用）
GET    /fishhome/api/activity      DSH 会话活动快照（运行时聚合，不落盘）
POST   /fishhome/api/note          小屋便条：{ text }（预览或注入当前会话）
GET    /fishhome/api/state         读存档        POST 写存档        DELETE 删存档
POST   /fishhome/api/open          用系统程序打开配置文件 { kind: file|folder|reveal, path }
GET    /fishhome/pack/<file>       角色包静态资源（ETag + 304）
GET    /fishhome/data/<path>       场景定义（GET / POST 写 / DELETE），只能 .json
```

---

### DSH 会话是怎么接进来的

Host 半（`index.js` 的 `apply`）订阅这些 **emit 模式**事件，聚合成内存里的活动快照：

```
api-session/added | removed | status(running) | error | activity
agent/status | agent/error | agent/inbox/inserted
tools/result | subagent/start | workflow/start
```

`GET /fishhome/api/activity` 返回 `{ running, sessions, counters:{messages,tools,errors,workflows,subagents}, recent[] }`。
Client 每次 tick（5 秒）拉一次，然后：

| 会话状态 | 家园里的反应 |
| --- | --- |
| 有会话在跑 | `activityWeightMul()` 把 work 权重 ×(1.8+0.9×运行数)，idle ×0.4、sleep ×0.18；她自己去书桌前 |
| 0 → 有会话 | 日志 `log.sessionStart`；若她正闲着/睡着，切到 `work` |
| 有会话 → 0 | 日志 `log.sessionEnd`、心情 +4；她正在 work 就切 `stretch` |
| 出错数增加 | 日志 `log.sessionError`、心情 -5 |

### 小屋便条（L3）：把话送进当前会话

面板「会话」卡下面的输入框 → `POST /fishhome/api/note`。

**她先在屋里回一句**：`data/replies.json` 是回复表（关键词 → 台词 + 可选行为），发便条时立刻走 `matchReply()` 在头顶气泡里回你，跟有没有会话、`noteMode` 是什么无关。回复带 `behavior`（比如「累了」→ `nap`）且她正闲着时会顺势切过去。

| `noteMode` | 行为 |
| --- | --- |
**发进会话时带 `【家园】` 前缀**（`src/env.js` 的 `NOTE_MARK`）：模型看到就知道这是小屋便条。配套技能在 `skills/fishhome-note/SKILL.md`，装到 `<projectRoot>/.dsh/skills/` 或 `<dshHome>/skills/` 后会被 `dsh-skill-filesystem` 自动发现（有 watch，不用重启），指示模型「简短回一两句、别调工具」。

**Client 侧还有一条正式通道**：`ctx.get('sessions')` → `sessions.using(id)` → `session.prompt([{type:'text',text}], 'queue')`。这就是聊天输入框同款路径——消息会**真的出现在对话里**，并且空闲会话会被唤起跑一轮（LLM 会回）。插件优先走这条；拿不到 `sessions` 服务时退回 Host 的便条队列。

| `preview`（默认） | 只在她头顶的气泡里说 + 写日志 `log.noteQueued`，不进会话 |
| `inject` | 额外把她的话作为**一条用户消息**送进当前正在跑的会话 |

**目标会话可以在设置里指定**：`POST /fishhome/api/note-target { sessionId }`（空字符串 = 自动）。手动指定优先于自动，指定的会话被关掉时自动清空。

**会话标题**：`SessionSummary` 里没有标题字段，所以标题靠两条路取：`session/event` 的第一条 `user/message`，或者用 `session/created` 存下的 Session 引用调 `deriveMessages()` 回溯（插件启动前就发过消息的会话也能补上）。压平换行、截 24 字、只写一次；实在拿不到就退回短 id。

**版本号自查**：`/api/meta` 带 `hostRev`（`index.js` 的短哈希），client.js 里注入 `BUILD_REV`（src 的短哈希），设置面板底部会显示 `Host xxxx · 界面 yyyy`。改了 `index.js` 没重启、或改了 src 没刷新，看这行就知道哪边是旧的。

**自动时目标会话是唯一的**：Host 记录「最近一次开始运行/有新消息的会话」（`api-session/status(running)`、`agent/status`、`api-session/activity`），便条只会注入到这个会话的 `agent/pre-step`；别的 agent 进步骤时便把条留在队列里。目标超过 10 分钟没动静视为失效，只预览不注入。

注入走的是文档化水位 `agent/pre-step`（waterfall）：**先 `await next()` 拿到决策**，只在 `decision.kind === 'enter'` 时往 `messages` 里 push，绝不改写原有内容；任何异常都退回原决策。
消息形状照抄 `agent/inbox/inserted` 里最近一条真实 `UserMessage`（模板），没有模板就只预览。队列上限 5 条、每条 ≤200 字。

**不要**订阅 waterfall 事件（`approval/request`、`tools/pre-execute` 等）却不调用 `next()`，会卡住原有流程。

## 7. 踩过的坑（改之前先读）

1. **`filter().sort()` 结果必须赋回去**——曾经 `items.sort(...)` 丢弃返回值，导致 z 排序完全没生效。
2. **z 排序是全局的**：角色固定 `CHARACTER_Z = 100`；家具 `z` 75～95 之间会盖住角色（用来做「坐在沙发后面」）。
3. **锚点 ≠ spot**：事件同时有 `spot`（地板格兜底）和 `anchor: "家具id:动画id"`（精确落点）。锚点写在**家具的 `animations` 列表**里，不是 `interactionAnchors` 对象。
4. **`pivot` 属于每个动画条目**，不是家具全局。
5. **`t('key')` 没有对应字典项时会原样显示键名**——新增行为/控件/开关日志必须同时加文案（中英都要）。
6. **开关类日志码**由代码拼出来（`livingLampOn` / `curtainBlueClosedOff`），渲染规则是「动词 + prop 名词」，闭标志位（`*Closed`）语义要反过来。
7. **`rect` 是画布绝对坐标**（例如客厅画布 1800×987），不是相对家具的偏移。
8. **精灵跨格**：切片时若把相邻格的内容带进来，会出现「旁边的精灵侵入本格」。
9. **性能**：不要给压在动画 SVG 上的浮层加 `backdrop-filter`（曾导致渲染进程 OOM）；场景层已加 `contain: paint`。
10. **`_source/` 与 `_archive/` 不进仓库**：原始大图和归档素材在 `.gitignore` 里。

---

## 8. 提交前检查清单

```
[ ] node build.mjs          生成物已更新
[ ] node tools/check.mjs    自检通过（文案 / 死代码 / 数据引用）
[ ] 四套测试通过
[ ] 没有手改 client.js
[ ] 新增的 PNG 都在 packs/<pack>/ 下，且被某个 json 引用
[ ] 新增的文案中英都有
```

## 9. 参考文档

- [README.md](README.md) —— 面向人类：安装、玩法、功能清单
- [docs/SCHEMA.md](docs/SCHEMA.md) —— 数据规范：场景 / 背景 / 家具 / 事件 / 条件与权重 / z 轴
- [docs/STYLE.md](docs/STYLE.md) —— 美术规范：等距比例、光源方向、配色
- [TODO.md](TODO.md) —— 暂定搁置的待办（含回来时从哪下手）
