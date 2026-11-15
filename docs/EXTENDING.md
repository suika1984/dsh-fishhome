# 扩展指南 · 加互动 / 把花园做完

> 面向想自己动手的人（以及你自己的 AI 助手）。
> 先读 [AGENTS.md](../AGENTS.md)（命令与片段顺序）和 [docs/SCHEMA.md](SCHEMA.md)（字段规范），再看这篇。

---

## 1. 加一个互动：从「点一下长椅」说起

「互动」在这里是一条很短的链路，**全部是数据，不用改代码**：

```
点家具 → furniture.click → 触发事件 → 事件播动画 + 冒气泡 + 记日志
                                   ↘ 落在锚点（或地板格）上
```

### 1.1 决定触发方式

`data/maps/<map>/furniture/<id>.json` 里的 `click` 有三种：

| `click.type` | 含义 | 例子 |
| --- | --- | --- |
| `toggle` | 切一个开关（灯光 / 窗帘 / 电视） | `{ "type": "toggle", "key": "tvOn" }` |
| `event` | 触发一个**行为事件**（她会做点什么） | `{ "type": "event", "id": "bench_rest" }` |
| `scene` | 切到另一个房间 | `{ "type": "scene", "id": "living" }` |

### 1.2 写事件 JSON

`data/maps/<map>/events/<id>.json`，最小可用长这样：

```jsonc
{
  "id": "bench_rest",
  "label": { "zh": "在长椅上歇会儿", "en": "Rest on the bench" },
  "kind": "autonomous",          // autonomous 自主行为 / request 只能被请求
  "spot": "bench",               // 地板格兜底：scene.json 的 spots 里的名字
  "anchor": "garden_bench:rest", // 精确落点：家具id:锚点id（见 1.3，可省）
  "anim": "lounge45",            // 角色包里的动画 id（actions/*.json）
  "duration": [120, 300],        // 秒，随机取区间
  "cooldown": 180,               // 冷却秒数，防刷屏
  "onTick": { "energy": -0.001, "mood": 0.015 },   // 每秒影响
  "weight": {                    // 被随机挑中的权重；null = 走内置公式
    "base": 0.5,
    "mods": [
      { "when": "energyHigh", "mul": 1.4 },
      { "when": "energyUnder35", "mul": 0.3 }
    ]
  },
  "say": { "chance": 0.5, "lines": [{ "zh": "花园里坐一会儿～", "en": "Sitting in the garden~" }] },
  "log": "bench_rest",           // 日志码，见 1.4
  "request": null                // 你想让它能被「用户请求」拒绝时，写 accept 条件
}
```

`mods[].when` 可用的名字（`src/model.js` 的 `WEIGHT_VOCAB`）：
`morning` `workHours` `evening` `night` `daylight` `lampOn` `curtainClosed` `noLight`
`hungry` `moodLow` `moodVeryLow` `energyLow` `energyUnder35` `energyVeryLow` `energyHigh`

### 1.3 锚点：让她坐在该坐的地方

锚点写在**家具的 `animations` 列表**里（不是单独的对象）：

```jsonc
// data/maps/garden/furniture/garden_bench.json
{
  "click": { "type": "event", "id": "bench_rest" },
  "animations": [
    {
      "id": "rest",
      "animation": "lounge45",     // 播这个动画
      "event": "bench_rest",       // 可选：点一下也算「她在这儿的互动」（会进点击循环）
      "position": { "x": 0.5, "y": 0.62 },  // 相对家具 rect 的比例
      "pivot": [0, -44],           // 接触点偏移（像素）
      "facing": "front",           // front / front_left …（侧身素材会镜像）
      "pose": "sit",               // sit / lie / stand，影响动画选择
      "renderLayer": "behind_furniture"  // 让她被家具挡住（坐在沙发/长椅后面）
    }
  ]
}
```

- `position` 是**相对家具矩形**的 0~1 比例，改家具位置时锚点自动跟着走 ✓
- 省掉 `anchor` 也能跑，她就站在 `spot` 的地板格上

### 1.4 文案（不做会被自检拦下）

三处都要补，中英各一份：

| 键 | 用在哪 |
| --- | --- |
| `behavior.<事件id>` | 「此刻」卡里她正在做什么 |
| `flavor.<事件id>` | 行为下面那句碎碎念 |
| `log.<日志码>` | 「屋子里的动静」日志 |

> 如果日志码是新的，还要在 `src/ui.js` 的 `logText` 里加 `case`，否则只会显示原始码。
> `node tools/check.mjs` 会检查这三件事，缺一个就报错。

### 1.5 验收

```bash
node tools/check.mjs
node test/model.test.js && node test/ui.test.js && node test/host.test.js && node test/mount.test.js
```

然后**刷新面板**（数据改动不用重启 Harness），点一下那件家具看她有没有照做。

> 本节就是以 **花园长椅**为例实现的：`garden_bench.json` 的 `click` → `events/bench_rest.json` → 锚点 `garden_bench:rest`。
> 它在 `test/model.test.js` 里有对应的断言，可以照抄改成你自己的。

---

## 2. 花园现在是什么状态

花园是**骨架已就位、素材和行为都没做**的占位场景：

| 部分 | 现状 |
| --- | --- |
| 背景 `background.json` | 只有一层地板渐变（没有围墙、远景、小径纹理） |
| 家具 | 5 件（小径 / 长椅 / 树 / 花丛 / 栅栏），`parts` 里**只有 `rect`、没有 `sprite`** → 渲染成占位方块 |
| 事件 | `idle` / `stretch` / `play` / `bench_rest`（最后那个就是上一节的例子） |
| 素材 | `packs/bigfish-adult/` 里**没有任何 garden 素材** |
| 睡觉 | 会被 `syncSleepRoom()` 拉回卧室（床只在卧室），所以在花园不会睡 |

所以「花园看起来不像花园」是正常的 —— 它现在只是一张标注好坐标的施工图。

---

## 3. 把花园做完的顺序

### 3.1 先做素材（见 §4）

每件家具一张透明底 PNG，量好它在画布上的 `rect`（花园画布 1200×502）。

### 3.2 把 `rect` 接上图

```jsonc
// data/maps/garden/furniture/garden_bench.json
"parts": [
  { "id": "body", "z": 70, "sprite": { "src": "garden-bench.png", "rect": [418, 65, 200, 120] } }
]
```

### 3.3 补背景层

参考 `data/maps/bedroom/background.json` 的 `wall` 层写法；花园 `wallHeight` 只有 60（户外，矮墙/栅栏即可），
所以更适合用 `fence` 精灵件而不是画墙面。

### 3.4 补事件

| 想要的效果 | 需要什么 |
| --- | --- |
| 在长椅上打盹 | 事件 `nap`，`anchor` 指向长椅的躺/靠锚点，`anim: "doze45"` |
| 园艺 / 浇花 | 需要一件「花圃」家具 + 对应姿势锚点（可用 `work45`） |
| 跟小鲸鱼玩 | 花园已经有 `play`，把 `spot` 换成你喜欢的落脚点即可 |
| 真的在花园里睡 | 需要改 `env.js` 的 `SLEEP_ROOM`，或者给花园加一张床/吊床并放宽 `syncSleepRoom` 的逻辑 |

### 3.5 文案 + 验收

同上 §1.4 / §1.5。**每加一件家具或事件，都要跑一次 `node tools/check.mjs`。**

---

## 4. 素材怎么来（自己画 / AI 生成都行）

### 4.1 规格

- **透明底 PNG**，放在 `packs/bigfish-adult/`，命名建议 `garden-*.png`
- 出图时按 **2 倍**尺寸出（显示尺寸 × 2），缩下来更清晰
- 视角：等距（2:1），光源左上方；配色参考 [docs/STYLE.md](STYLE.md)
- 不写 `sizes`，只写 `rect`：`[x, y, 宽, 高]` 是**画布绝对坐标**

### 4.2 生成 → 可用的一条流水线

```
AI 出图（正面 / 像素风，浅色背景）
  ↓ 去底：从四边做洪水填充（棋盘格底、纯色底都适用）
  ↓ 裁到内容 bbox
  ↓ 缩放到目标显示尺寸的 2 倍
  ↓ 放进 packs/bigfish-adult/
  ↓ 在 furniture JSON 里填 sprite.src + rect
```

去底用 Python + Pillow 十几行就够：

```python
from PIL import Image, ImageDraw
im = Image.open("in.png").convert("RGBA")
w, h = im.size
# 从四角洪水填充，把背景变透明
ImageDraw.floodfill(im, (0, 0), (0, 0, 0, 0), thresh=40)
im = im.crop(im.getbbox())
im = im.resize((w2, h2), Image.LANCZOS)   # 2 倍目标尺寸
im.save("packs/bigfish-adult/garden-bench.png", optimize=True)
```

> 素材缓存：`/fishhome/pack/<file>` 用「大小 + 修改时间」当 ETag，**同名覆盖后刷新页面就会更新**。
> 只有角色动作素材（`pet.json` 的 actions）才需要给 `version` 带上 `?v=` 来强制刷新。

### 4.3 素材没做好之前也能先搭交互

家具 `sprite` 缺 `src` 时会画成「虚线占位块 + 部件名」，**不影响点击和事件**。
所以可以先按 §1 把互动跑通，再慢慢补图。

---

## 5. 交给你的 AI 助手来做

这套项目本来就是「给 LLM 看文档就能改」的结构（仓库里的 `AGENTS.md` 就是为此写的）。给它的提示词可以这样：

```text
你在 D:\...\dsh-fishhome 这个仓库里工作（DSH 插件，无构建工具链）。
先读 AGENTS.md、docs/EXTENDING.md、docs/SCHEMA.md、TODO.md。

任务：把「花园」场景从占位做成可用场景。
1) 先给 garden_bench / garden_tree / garden_flowers / garden_fence / garden_path 补 sprite 素材
   （没有真实素材时，用纯色块 + 描边做一版临时素材也行，先把链路跑通）
2) 修 rect 让它们落在花园画布 1200×502 内
3) 补事件：长椅上打盹（doze45）、花圃浇水（work45）
4) 每加一个事件，补 behavior./flavor./log. 中英文案，并在 logText 里加对应 case
5) 完成前必须全过：node build.mjs → node tools/check.mjs → 四个测试
6) 不要手改 client.js（它是 src/ 拼接生成的）；改了 index.js 提醒我重启 Harness
```

要求它遵守的三条硬规矩（和 `AGENTS.md` 一致）：

1. **不要手改 `client.js`**——它由 `node build.mjs` 从 `src/` 生成
2. 改完必须跑 `node build.mjs` → `node tools/check.mjs` → 四套测试
3. `index.js`（Host 半）改动**必须重启 Harness**，其余刷新面板即可

---

## 6. 提交前检查清单

```
[ ] node build.mjs            生成物已更新（改了 src/ 才需要）
[ ] node tools/check.mjs      自检通过（素材存在 / 文案齐全 / 日志分支 / 数据引用）
[ ] 四套测试通过
[ ] 新 PNG 在 packs/<pack>/ 下，且被某个 json 的 sprite.src 引用
[ ] 新文案中英都有
[ ] 没有手改 client.js
```
