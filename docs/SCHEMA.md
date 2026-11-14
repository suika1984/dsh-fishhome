# 家园 · 数据规范（Schema）

> 状态：v0.1 草案，可讨论
> 约定：✅ 已确定 ｜ ⚠️ 待讨论（不确定的不会写成"规范"）
> 适用：`dsh-fishhome` ≥ 0.2.0（当前 0.1.x 是把数据写死在代码里的版本，本文是迁移目标）
> 范围：单角色、单家具互动、单地图（多地图/多角色只留字段，不做实现）

---

## 0. 三条铁律

1. **定义、状态、派生分开。**
   定义随包发布、可手改；状态进存档；派生（屏幕坐标、动画帧、光照）每次重算。
2. **只存事实。**
   存时间戳不存季节；存灯 `on/off` 不存光晕；存当前事件不存"下一步做什么"。
3. **稳定 ID。**
   家具、事件、锚点、动画都用字符串 id 引用；换贴图、换美术不动 id。

---

## 1. 坐标与单位

| 概念 | 形式 | 说明 |
| --- | --- | --- |
| 地板坐标 | `{ "fx": 5.2, "fy": 9.4 }` | 浮点，单位「格」，范围 `0..cols` / `0..rows`。家具位置、角色位置、锚点全用这个 |
| 屏幕坐标 | 派生 | `sx = cx + (fx - fy) * kx`，`sy = cy + (fx + fy) * ky`；永远不写进存档 |
| 墙面坐标 | `{ "u": 3.5, "lift": 92 }` | 仅背景层与挂画用：`u` 是沿墙方向的格数，`lift` 是离地像素 |
| 角度 | `skew` 系数 | 素材图不是等距绘制时用切变系数校正（床 `-0.14`），不用角度值 |
| 时间 | 毫秒时间戳 | 时长用 ms；衰减率用「每秒」 |
| 数值 | `0..100` 浮点 | 需求值域，越界一律钳制 |

> ✅ 坐标统一用**地板格**。编辑器拖动 → 反投影得到格子 → 写文件；换画布尺寸时只需重算投影参数，数据不动。

---

## 2. 三层模型

| 层 | 存放 | 谁写 | 例子 |
| --- | --- | --- | --- |
| **定义** | `data/**.json` | 人 / 编辑器 | 房间尺寸、背景分层、家具锚点、事件阶段 |
| **状态** | `saves/state.json` | 运行时 | 灯的开关、心情、当前事件与阶段 |
| **派生** | 内存 | 渲染器 | 屏幕坐标、当前帧、光晕、可否点击 |

实测校验的方向永远是「定义 + 状态 → 派生」，派生结果不回写。

---

## 3. 定义层

### 3.1 目录

```text
data/
├── maps/
│   └── bedroom/
│       ├── scene.json                 # 地图入口
│       ├── background.json            # 地板 / 上墙 / 右墙
│       ├── furniture/
│       │   ├── bed.json
│       │   ├── desk.json
│       │   ├── shelf.json
│       │   ├── rug.json
│       │   ├── plant.json
│       │   └── night_lamp.json
│       └── events/
│           ├── nap.json
│           ├── read.json
│           ├── work.json
│           └── ...
├── characters/
│   └── fish-chibi/
│       ├── character.json
│       ├── chibi.png
│       └── animations.json
└── shared/
    └── events/                        # 跨地图复用的事件（可选）
```

### 3.2 `scene.json` — 地图入口

```jsonc
{
  "id": "bedroom",
  "name": { "zh": "大肥鱼的小屋", "en": "Fish's room" },
  "version": 1,
  "room": {
    "cols": 12,          // fx 方向格数（右墙长度）
    "rows": 16,          // fy 方向格数（左/上墙长度）
    "wallHeight": 175,   // 墙高（像素，投影后在屏幕上）
    "canvas": [1000, 700]
  },
  "background": "background.json",
  "furniture": ["bed", "desk", "shelf", "rug", "plant", "night_lamp"],
  "spots": {                        // 无家具的落脚点；家具自己的锚点写在 furniture 里
    "center": { "fx": 5.2, "fy": 9.4 },
    "door":   { "fx": 1.0, "fy": 14.0 }
  },
  "spawn": { "fx": 1.0, "fy": 14.0 }
}
```

### 3.3 `background.json` — 三层循环渲染 ✅

房间背景拆成**地板 / 上墙面 / 右墙面**三层，每层独立定义、独立渲染，按 `renderOrder` 依次绘制；每层都可以是「程序化填充」或「循环贴图」。

```jsonc
{
  "layers": [
    {
      "id": "floor",
      "kind": "floor",
      "tile": {
        "art": null,               // null = 程序化填充；有图时按格子循环贴
        "size": [3, 3],            // 一块贴图覆盖 3×3 格
        "repeat": "uv"             // uv = 两个方向循环
      },
      "fill": { "type": "linear", "angle": 90, "stops": [
        { "at": 0, "color": "#ddcaac" }, { "at": 1, "color": "#c9b18d" }
      ]},
      "grid": { "color": "#b89f7c", "opacity": 0.35, "step": 1 },
      "variants": {                // 季节/主题皮肤，按 key 覆盖 fill / tile
        "winter": { "fill": { "type": "linear", "angle": 90, "stops": [
          { "at": 0, "color": "#e7e2d8" }, { "at": 1, "color": "#cfc8bc" }
        ]}}
      }
    },
    {
      "id": "wall_left",
      "kind": "wall",
      "side": "fx0",               // fx=0 那面（画面上方向左退）
      "height": 175,
      "tile": { "art": null, "size": [3, 1], "repeat": "u" },   // 沿墙长循环
      "fill": { "type": "linear", "angle": 40, "stops": [
        { "at": 0, "color": "#efe0cb" }, { "at": 1, "color": "#ead9c2" }
      ]},
      "trim": {
        "top":  { "color": "#8a6748", "height": 18 },
        "base": { "color": "#c4a887", "height": 9 }
      }
    },
    {
      "id": "wall_right",
      "kind": "wall",
      "side": "fy0",               // fy=0 那面（画面上方向右退）
      "height": 175,
      "tile": { "art": null, "size": [3, 1], "repeat": "u" },
      "fill": { "type": "linear", "angle": 40, "stops": [
        { "at": 0, "color": "#f3e6d3" }, { "at": 1, "color": "#e6d4bb" }
      ]},
      "trim": {
        "top":  { "color": "#6f5137", "height": 18 },
        "base": { "color": "#cdb392", "height": 9 }
      }
    }
  ],
  "renderOrder": ["floor", "wall_left", "wall_right"]
}
```

**「循环渲染」怎么算**

- 地板：按 `cols × rows` 遍历，每 `size` 格放一块贴图；`repeat: "xy"` 时一块贴图平铺，`"x"` 只在 `fx` 方向平铺。
- 墙面：沿墙长 `u` 从 0 走到该墙长度（上墙 = `rows`，右墙 = `cols`），按 `size[0]` 步进绘制；高度方向按 `size[1]` 铺到 `height`。
- `art` 为 `null` 时跳过贴图，只画 `fill` 和 `trim`（就是现在这版的效果），所以有无素材都能跑。
- 贴图本身必须是**已按等距画好的平面**（菱形地板块 / 平行四边形墙面块），渲染器只做平移，不做投影变形。
- 接缝：`size` 建议取整数格，且 `canvas` 的投影参数固定，否则会出现 1px 缝。

**渲染顺序（整场）**

```text
按 z 升序绘制：背景三层 → 家具的各个 part 与角色（交错排序） → 光照/夜色叠加 → UI
```

背景三层固定压在最底（不参与 z 排序），角色参与 z 排序，规则见 §3.8。

### 3.4 `furniture/*.json` — 家具

家具是一件一个文件（`furniture/<id>.json`），由若干 part 组成——**part 是排序单位**：每个 part 有自己的 z、可见条件和画法。

```jsonc
// data/maps/bedroom/furniture/bed.json（已实现）
{
  "id": "bed",
  "name": { "zh": "床", "en": "Bed" },
  "type": "furniture",                 // furniture | light | surface | container
  "parts": [
    {
      "id": "frame",
      "z": 85,                         // 整数，越大越靠前（见 §3.8）
      "sprite": {                      // 一张素材图
        "src": "bed.png",              // 相对角色包目录，走 /fishhome/pack/…
        "rect": [451, 189, 390, 307],  // 屏幕坐标 [x, y, w, h]，画布是 1000×700
        "skew": -0.14,                 // 切变，适配等距地面线
        "flipX": true,                 // 左右镜像
        "rotate": 0,                   // 旋转角度（度，顺时针为正）
        "pivot": "bottom"              // 旋转支点：bottom（默认，底边中点）| center
      }
    }
  ],
  "click": { "type": "event", "id": "bed" }
}
```

**旋转支点**：默认绕 `rect` 的底边中点转（也就是落地接触点），这样调角度时家具不会整体漂走；写 `"pivot": "center"` 改成绕矩形中心转。变换顺序是「先切变/镜像，再绕支点旋转」，和编辑器里看到的一致。

**`skew` 存的是斜率（tan），不是角度**：`0.375` 会先转成 `atan(0.375) ≈ 20.56°` 再传给 SVG 的 `skewY()`。墙面/地面的斜率就是 `room.projection`，所以贴在墙上的挂画写同一个数就等于跟墙平行；贴地的东西写 0 就是「正对镜头」。

**家具的动画列表（`animations`）**：每件家具声明「角色能在这里播哪些动作、各自摆在哪」，事件用 `"anchor": "家具id:锚点id"` 引用。写了锚点的事件，角色不再站在 `spot` 落脚点，而是按锚点的位置 / 朝向 / 动画 / 层级落位；两种方式可以混用。

```jsonc
"animations": [
  {
    "id": "sleep",
    "position": { "x": 0.5, "y": 0.46 },  // 相对这件家具「精灵图矩形」的比例（0~1）
    "facing": "front_left",               // 含 "left" 就水平镜像
    "pose": "sleep",                      // 语义姿势；没写 animation 时当兜底
    "pivot": [0, -62],                    // 接触点偏移（画布像素）：坐姿的屁股、躺姿的背，家具自己定
    "renderLayer": "on_furniture",        // 见下表
    "animation": "sleep"                  // 播放的动画标签
  }
]
```

| `renderLayer` | 角色 z |
| --- | --- |
| `front`（默认） | `CHARACTER_Z`（100，压在所有家具上） |
| `on_furniture` | 该家具 z + 1（躺/坐在家具上，比如床） |
| `behind_furniture` / `behind_blanket` | 该家具 z − 1（被家具挡住，比如钻进被子） |
| 数字 | 直接用这个 z |

**`attach`（贴面）**：声明这块素材贴在哪个面上，畸变（斜率）自动等于这个面的斜率，**不用手填数字**，换房间投影比例也不会歪。

```jsonc
{ "id": "frames", "sprite": { "src": "wall-art.png", "rect": [80, 90, 120, 90], "attach": "wallRight" } }
```

| `attach` | 自动斜率 | 用在哪 |
| --- | --- | --- |
| `wallRight` | `+projection`（右墙往右下退） | 右墙上的挂画、贴纸 |
| `wallLeft` | `-projection`（左墙往左下退） | 左墙上的挂画 |
| `floorX` | `+projection` | 沿 +fx 方向铺的地垫 |
| `floorY` | `-projection` | 沿 +fy 方向铺的地垫 |

规则来自投影：墙面底边斜率 = `ky / kx = projection`（卧室/客厅都是 0.375，即 20.56°）。**手填了 `skew` 就以手填的为准**，`attach` 只负责没填时的默认值。

**`surface`（整件贴一个面）**：一件由多个部件拼成的家具（窗户、窗帘、贴纸墙），在 **家具级**声明贴在哪个面，所有部件**先按平面坐标排好，再以同一个原点整体切变**。这跟给每个部件单独写 `attach` 的结果**不一样**——单独写的话每个部件绕自己的左上角切变，拼接处会错位。

```jsonc
{
  "id": "living_window",
  "surface": { "attach": "wallRight" },   // 整件贴右墙，部件内部不用再写 attach
  "parts": [
    { "id": "sky",   "z": -104, "sprite": { "src": "win-sky-sunny.png",  "rect": [866, 137, 270, 250] } },
    { "id": "frame", "z": -103, "sprite": { "src": "win-frame.png",      "rect": [866, 137, 270, 250] } },
    { "id": "rod",   "z": -102, "sprite": { "src": "win-rod.png",        "rect": [846, 123, 310, 32] } },
    { "id": "curtain-left",  "z": -101, "sprite": { "src": "win-curtain-blue.png",  "rect": [858, 107, 101, 238] } }
  ]
}
```

切变原点取所有部件 `rect[0]` 的最小值，公式等价于：屏幕 y = Y + k·(X − P)，k = ±projection。

**`repeat`（拼接）**：同一张图按固定间距重复画，用来把「一小段」拼成「一大件」——窗框、窗帘、窗帘杆都适用。

```jsonc
{ "id": "unit", "sprite": { "src": "win-unit.png", "rect": [100, 80, 80, 150],
                            "repeat": { "count": 4, "dx": 80, "dy": 0 } } }
```

- `count` 画几份（1~40），`dx` / `dy` 是每份相对前一份的位移（画布像素）
- 每个单元按 `rect` 缩放，所以改变 `rect` 的宽高就能拉长 / 压扁单元
- 「左右端头 + 中间重复」的结构拆成三个 part：左端头、中间（带 `repeat`）、右端头

一件家具可以声明**多个**动画，事件按 id 引用（沙发能坐也能躺）：

```jsonc
"animations": [
  { "id": "sit", "animation": "sit",   "event": "watch_tv", "position": { "x": 0.5,  "y": 0.62 }, "pivot": [0, -62], "renderLayer": "on_furniture" },
  { "id": "lie", "animation": "sleep", "event": "nap",      "position": { "x": 0.46, "y": 0.56 }, "pivot": [0, -28], "renderLayer": "on_furniture" }
]
```

- 事件里分别写 `"anchor": "sofa:sit"` / `"anchor": "sofa:lie"`
- 写了 `event` 的动画会参与**点击循环**：点第一下播第一条的事件，第二下第二条，再点回到第一条。没写 `event` 的动画不参与循环（只能由事件主动引用）

> `behind_blanket` 目前等同「被整张床挡住」——真要露出上半身，得把床拆成「床架 / 被子」两个 part 分层画。

**点击类型**（家具/部件的 `click`）：

| type | 含义 |
| --- | --- |
| `event` | 触发一个事件（`id` 是事件 id） |
| `toggle` | 切换一个开关（`key` 是 `DEFAULT_PROPS` 里的键） |
| `scene` | 切到另一个场景（`id` 是 `data/maps/` 下的场景目录名），比如客厅的落地玻璃门 → 花园 |

**底部按钮（`scene.json` 的 `controls`）**：每个场景一套，房间下方的操作条完全由数据决定；不写就退回内置那套（台灯/床头灯/窗帘/鲸鱼/看书/躺下/回中间）。

```jsonc
"controls": [
  { "kind": "toggle", "key": "livingLamp", "label": { "zh": "客厅灯", "en": "Lamp" }, "suffix": "state" },
  { "kind": "toggle", "key": "curtainOpen", "label": { "zh": "窗帘" },
    "variants": { "on": { "zh": "拉上窗帘" }, "off": { "zh": "拉开窗帘" } } },
  { "kind": "event", "id": "watch_tv", "label": { "zh": "看电视" } },
  { "kind": "reset", "label": { "zh": "回到中间" } }
]
```

| `kind` | 作用 |
| --- | --- |
| `toggle` | 切换 `word.props` 里的开关；`suffix: "state"` 显示「开/关」，`variants` 则按状态换整句文案 |
| `event` | 触发一个事件（和点家具同一条路径） |
| `reset` | 回到屋子中间 |

**场景光（`scene.json` 的 `light`）**：

```jsonc
"light": {
  "sources": [
    { "from": "right", "at": 0.72, "spread": 4.2, "reach": 3.2, "skew": 1.2, "alpha": 0.62, "wallGlow": 150 },
    { "from": "right", "at": 0.35, "spread": 1.6, "reach": 1.6, "skew": 0.6, "alpha": 0.3,  "wallGlow": 70 }
  ]
}
```

`at` / `spread` / `reach` 都是格子数或 0~1 比例；光斑颜色按**时段**自动取（早上暖黄、正午偏白、傍晚偏橙），夜里（`daylight < 0.12`）完全消失。不写 `color` 就跟随时段，写了就固定。

两类 part：

| 画法 | 字段 | 用在哪 |
| --- | --- | --- |
| 素材图 | `sprite: { src, rect, skew?, flipX?, rotate?, pivot? }` | 床、书桌（像素素材） |
| 内置绘制 | `preset: "desk" / "desk_glow" / "shelf" / "rug" / "plant" / "night_lamp" / "night_lamp_glow"` | 书架、地毯、绿植、床头灯——代码画，数据只挑用哪个 |

part 还能带：

```jsonc
{
  "offset": { "fx": 1.0, "fy": -0.5 },       // 整体挪动（地板格），preset 内部坐标不用改
  "layer": "light",                           // 画在环境光之上（灯、屏幕这类发光件）
  "visibleWhen": {                            // 什么时候才画
    "state": { "bedLamp": true },             // 状态匹配
    "characterEvent": ["sleep", "nap"],       // 角色当前在做什么
    "period": ["morning", "noon", "afternoon"] // 时间段匹配（dawn/noon/evening/night/…）
  }
}
```

点击只有两种，不写脚本：

```jsonc
"click": { "type": "toggle", "key": "bedLamp" }   // 切 world.props 里的开关
"click": { "type": "event",  "id": "work" }       // 开一个事件
```

#### 屏幕光（`screenGlow`，电视/显示器这类会发光的家具）

发光配置写在**家具自己身上**，所以哪台电视想发光就在谁身上配，可以有多台：

```jsonc
// data/maps/living/furniture/tv_stand.json（已实现）
{
  "id": "tv_stand",
  "parts": [{ "id": "body", "z": 74, "sprite": { "src": "act-tv_unit.png", "rect": [297, 200, 336, 305] } }],
  "click": { "type": "toggle", "key": "tvOn" },
  "screenGlow": {
    "prop": "tvOn",                 // 哪个开关打开时发光
    "behavior": "watch_tv",         // 或者角色正在做这个行为时也发光
    "screen": [0.22, 0.02, 0.58, 0.46], // 屏幕在家具 rect 里的比例 [x, y, w, h]
    "width": 1.5,                    // 地面光池半宽（地板格）
    "reach": 2.4,                    // 地面光池铺多远（地板格）
    "alpha": 0.55,                   // 基础亮度（越暗越明显，房间灯开着时自动压暗）
    "offset": [135, 45]              // 地面光池整体位移（画布像素，正数向右/向下）
  }
}
```

渲染分三层，都在**光源层**（`mix-blend-mode: screen`，画在家具之上，否则会被自己的精灵盖住）：

| 元素 | 位置 | 受 `offset` 影响 |
| --- | --- | --- |
| 屏幕光晕（径向渐变椭圆） | 以 `screen` 矩形中心为中心 | 否 |
| 屏幕提亮（白色叠加） | 正好盖住 `screen` 矩形 | 否 |
| 地面光池（四边形） | 家具落脚点 + `offset` | 是 |

> ✅ 已实现：`parts[]`（sprite / preset / offset / visibleWhen / z）、`click` 的两种类型、`screenGlow`、一件一个文件、坏文件跳过不连带。
> ⚠️ 还没实现，留到后面：`footprint`（编辑器吸附、碰撞）、`anchors`（交互点）、`events`（enter/idle/exit 引用）、`states`（家具可变状态的声明）。现在家具状态直接读写 `world.props` 里的 `deskLamp` / `bedLamp` / `curtainOpen`，事件系统落地后再换成 `states`。

### 3.5 `events/*.json` — 事件（v1 已实现）

一个事件 = 去哪（`spot`）+ 播什么（`anim`）+ 待多久（`duration`）+ 每秒影响（`onTick`）+ 调度参数。

```jsonc
// data/maps/bedroom/events/nap.json
{
  "id": "nap",
  "kind": "autonomous",              // interaction（用户点）| autonomous（自己选）| ambient（环境）
  "label": { "zh": "打盹", "en": "Nap" },
  "spot": "bed",                     // 落脚点（scene.json 的 spots）
  "anim": "sleep",                   // 语义动画标签，由角色包决定播哪套帧
  "duration": [900, 1500],           // 秒，区间内随机
  "log": "nap",                      // 完成后写进「屋子里的动静」的日志码
  "cooldown": 900,                   // 秒，冷却期内不参与挑选
  "onTick": { "energy": 0.02, "satiety": -0.001 }   // 每秒变化
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `spot` | 去哪；必须是 `scene.json` 里的落脚点，写错退回 `center` |
| `anim` | 语义动画标签（idle / walk / read / work / play / stretch / sleep） |
| `duration` | 秒，`[min, max]`，非法值退回 60/60 |
| `onTick` | 每秒对 `energy` / `satiety` / `mood` 的影响（写成 `perSecond` 也认） |
| `cooldown` / `log` | 冷却秒数、日志码 |
| `anchor` | 可选。指向家具的互动物锚点，写 `"bed:sleep"`。写了之后角色按锚点落位（位置 / 朝向 / 动画 / z），不再用 `spot` |
| `say` | 进入这个事件时说的话：`chance` 触发概率（默认 0.4），`lines` 台词数组（`{zh,en}` 或纯字符串）。用户点出来的事件、以及接受后进入的事件都会用到 |
| `request` | 只有「用户点出来的事件」才需要：`accept` 列出「什么情况下会答应」（§3.6 的词汇表条件，命中任一即可），不满足就冒 `refuse.lines` 里随机一句台词；`refuse.anim` 是拒绝时临时播的动作（不写就沿用当前动作）；`refuse.mood` 是拒绝时的心情变化 |
| `weight` | 可选。写了就是 `base × mods[].mul`；没写就用内置公式。`mods[].when` 见 §3.6 |

> ✅ 已实现：事件表从数据载入（一件一个文件），坏文件跳过、全坏退回内置表；编辑器里能直接改 JSON、应用、保存。
> ⚠️ 还没实现：`phases`（enter/loop/exit 分段）、`requires`（硬条件）、`priority` / `interruptible`（打断规则）、`target.anchor`。现在一个事件就是「去 → 播 → 待着 → 每秒变」。

### 3.6 条件与权重 ✅（v1 用固定词表）

`requires` 里的条件用**固定词表 + 区间比较**：

```jsonc
{ "stats": [{ "energy": { "lte": 60 } }],
  "time":  { "period": ["night"], "season": ["autumn"] },
  "furniture": { "night_lamp": { "on": true } } }
```

`weight.mods[].when` 用**命名开关**（不写表达式，不做解析）。实现见 `src/model.js` 的 `WEIGHT_VOCAB`：

| 开关 | 含义 |
| --- | --- |
| `morning` | `6 < hour < 10` |
| `workHours` | `8 < hour < 22` |
| `evening` | `14 < hour < 23` |
| `night` | `period ∈ {night, deepNight}` |
| `daylight` | `daylight > 0.22` |
| `lampOn` | `deskLamp == true` |
| `curtainClosed` | `curtainOpen == false` |
| `noLight` | 台灯没开且天不亮 |
| `hungry` | `satiety < 45` |
| `moodLow` / `moodVeryLow` | `mood < 60` / `< 55` |
| `energyLow` / `energyUnder35` / `energyVeryLow` | `energy < 55` / `< 35` / `< 22` |
| `energyHigh` | `energy > 72` |

> ✅ 已定：v1 用固定词表（零解析成本，现有 9 条事件足够）。
> 词表不够用时再上「受限表达式」（可读 `stat.* / time.* / furniture.<id>.state.*`，只允许比较、四则、`and/or/not`、`in`，无函数调用、无赋值）——到时候另开一版，不偷偷改语义。

### 3.7 `characters/*/character.json` — 角色

```jsonc
{
  "id": "fish-chibi",
  "name": { "zh": "大肥鱼 · Q版" },
  "pack": { "sheet": "chibi.png", "canvas": [112, 128] },  // 每格尺寸
  "z": 100,                          // 固定 z，见 §3.8

  "stats": {                         // 值域与衰减都写在这里
    "mood":    { "default": 78, "decayPerSecond": 0.00035, "driftTo": 60 },
    "satiety": { "default": 66, "decayPerSecond": 0.0026 },
    "energy":  { "default": 72, "decayPerSecond": 0.0016 }
  },

  "anims": {                         // 动画标签 → 精灵图里的动画组
    "idle": ["idle"], "walk": ["walk"], "read": ["read"],
    "work": ["working"], "play": ["success"],
    "stretch": ["greeting"], "sleep": ["sleep"]
  },

  "movement": { "transitionMs": 1100, "speed": 3.0 }   // speed 单位：格/秒
}
```

### 3.8 Z 轴与遮挡 ✅

场景里**每个可见件**（家具的每个 part、角色）都有一个整数 `z`，**数字越大越靠前**，渲染时按 z 升序排。背景三层不参与排序（永远最底）。

- `z.mode: "auto"` → `round((fx + fy) * 10)`，格子越靠前数字越大；
- `z.mode: "manual"` → 直接用 `value`（0..999）；
- **角色只有一个固定 z**（`character.json` 的 `z`，默认 100）。

一套典型数值：

| 对象 | z | 效果 |
| --- | --- | --- |
| 地板 / 墙 | 不参与 | 永远最底 |
| 家具主体（床架、书桌、柜子） | 60–90 | 永远在角色后面 |
| **角色** | **100** | 基准 |
| 床的被子 / 窗帘下摆 | 110 | 盖住角色的身体 |
| 前景物件（画框下沿、垂下的帘子） | 120+ | 盖住角色 |

> ⚠️ 固定 z 的代价：角色走到「深度更大」的家具后面时，家具也不会挡她——这是用可控性换自动正确性。后续可以给每个落脚点或按角色当前位置补一个 z 覆盖（`spot.z` / 动态 z），格式先留空。

实现约束：要真正交错遮挡，**整场必须画在同一个 SVG 里按 z 排序**，角色不能是浮在上面的 HTML 层。角色帧用嵌套 `<svg viewBox="帧矩形">` 裁切精灵图来画。

> ✅ 已落地：`SceneSvg` 把所有可见件收进一张 `{z, node}` 表，按 z 升序画；角色是 SVG 内绘制（嵌套 viewBox 裁帧），跟着一起排序。
> **z 现在来自数据**：家具每个 part 的 `parts[].z`（`data/maps/bedroom/furniture/*.json`）。只有三类固定在代码里：装饰件 `DECOR_Z`（窗 -100 / 挂画 -90 / 窗光 6）、角色 `CHARACTER_Z = 100`、夜色叠加 `OVERLAY_Z = 10000`。

**角色帧的裁剪方式（给不熟前端的人）**：精灵图是一张整图，每个动作是图上的一个矩形。给 `<image>` 外面套一个 `<svg viewBox="x y w h">`，就等于给这段区域开了一个「取景框」——只显示矩形内的部分，外面的被裁掉。这样不用位图工具切图，也不用 canvas，靠 SVG 自己裁剪。

---

## 4. 运行时状态（存档）

`<DSH_HOME>/fishhome/saves/state.json`：

```jsonc
{
  "schemaVersion": 2,
  "savedAt": 1793600000000,

  // 显示用的三个名字：都能在面板「设置」里改
  "characterName": "大肥鱼",        // 称呼
  "selfName": "我",                 // 自称（接对白时用）
  "roomName": "大肥鱼的小屋",       // 房间徽章上的名字

  "world": {
    "mapId": "bedroom",
    "clock": { "updatedAt": 1793600000000 },   // 只存时间戳，季节/时段现算
    "furniture": {
      "bed":        { "made": true },
      "night_lamp": { "on": false }
    }
  },

  "character": {
    "stats": { "mood": 78, "satiety": 66, "energy": 72 },
    "pos": { "fx": 5.2, "fy": 9.4 },
    "facing": "front",
    "target": { "type": "spot", "id": "center" },          // spot | furniture
    "event": null,                                          // 见 §6
    "cooldowns": { "nap": 1793609000000 }
  },

  "log": [ { "at": 1793600000000, "code": "boot", "arg": null } ]
}
```

事件进行中的样子（`character.event`）：

```jsonc
{
  "id": "nap",
  "phase": "loop",
  "status": "running",            // running | interrupted | finishing
  "startedAt": 1793599000000,
  "endsAt": 1793599300000,
  "furniture": { "id": "bed", "anchor": "lie" }
}
```

**不允许写进存档的东西**：屏幕坐标、当前帧、光照值、季节/时段、候选行为列表、任何可以「根据事实算出来」的东西。

---

## 5. 派生规则

| 派生值 | 来源 |
| --- | --- |
| 角色屏幕坐标 | `pos` + 投影参数 |
| 当前动画 | `event.id` + `phase` → 阶段里的 `anim`；无事件时 `idle` |
| 家具贴图变体 | `sprite` + 命中的 `states` |
| 光晕/室内亮度 | `type: light` 的家具状态 + 时段 |
| 绘制顺序 | 背景三层 → 所有 part 与角色按 `z` 升序（见 §3.8） |
| 可否点击 | `requires` 是否满足 + 当前事件是否 `interruptible` |
| 候选事件池 | 所有 `kind: autonomous` 且 `requires` 通过、冷却结束的事件 |

---

## 6. 事件状态机

```text
                    requires 通过
   idle ──start()──▶ running(phase=enter) ──时长到──▶ running(phase=loop)
                                                          │
                    ┌── 用户点击 / 更高优先级 ─────────────┤ 时长到
                    ▼                                     ▼
      interrupted ──▶ running(phase=exit) ──▶ idle    running(phase=exit) ──▶ idle
                                            │
                                            └──▶ 队列里的新事件启动
```

规则：

1. 阶段按 `phases` 顺序推进，`duration` 到点进入下一段；最后一段结束回 `idle`。
2. **被打断时先补播 `exit` 阶段**（「从床上起来」「把书合上」），exit 演完才真正切到新事件；事件没有 `exit` 阶段就直接切。
3. `exit` 阶段本身**不可打断**——避免连续点击把角色卡在过渡里；期间到达的新事件进队列，等 exit 结束再启动。
4. `priority` 更高的事件可以打断正在进行的低优先级事件；同优先级不打断。
5. `cooldown` 在**进入**时开始计，完成后才可再次进入。
6. 离线结算按同样的状态机跑，但只跑「粗粒度步长」，不逐帧。

> ✅ 已定：打断 = 先补播 exit 再切（观感连续），exit 期间不接第二刀。


---

## 7. 校验、缺省与回退

| 情况 | 处理 |
| --- | --- |
| 定义里出现未知字段 | 忽略，保留日志警告（方便将来加字段） |
| 缺少必填（`id` / `pos` / `sprite.src`） | 该家具/事件跳过，不中断渲染 |
| 事件引用不存在的 id | 该引用失效，回退到 `idle` |
| 贴图 404 | 用占位色块（现有实现已有） |
| 存档版本低于当前 | 走迁移表，失败则备份并新建 |
| 数值越界 | 钳制到 `0..100` |

---

## 8. 版本与迁移

- 定义文件各自带 `version`；修改字段语义时 +1。
- 存档 `schemaVersion` 与代码常量对齐；`migrate(save)` 按版本逐级升级。
- 迁移前把旧档复制到 `saves/backups/state-v<旧版本>.json`。
- 不兼容改动（删字段）必须写迁移函数，不能静默丢弃。

---

## 9. 与现有代码的映射 / 迁移步骤

| 现状 | 目标 |
| --- | --- |
| `ROOM = { cols, rows, kx, ky, cx, cy, wall }` | `scene.json → room` + 投影参数（投影参数可留在代码） |
| `PALETTE` + `Walls/WindowView` 里的颜色 | `background.json` 的三层 `fill/trim/grid` |
| `BED_ART` / `NIGHT_LAMP` 屏幕常量 | 家具 `parts[].sprite` + `pos`（屏幕坐标由投影算出来） |
| `SPOTS` 常量 | `scene.spots` + 家具 `anchors` |
| `world.props`（`deskLamp/bedLamp/curtainOpen`） | `world.furniture[x].state` |
| `BEHAVIORS`（9 条，含权重与 onTick） | `events/*.json`（`weight` + `phases.perSecond`） |
| `ANIM_TAGS` | `character.json` 的 `anims` |
| 角色是浮在 SVG 上的 HTML div | 角色挪进 SVG，按 z 与家具交错排序 |
| `state.json`（v1） | `schemaVersion: 2` + 迁移函数 |

迁移顺序（每步都能单独跑、单独回滚）：

1. `scene.json` + `background.json` 落地，渲染器读房间尺寸与三层背景（贴图暂缺，用 `fill`）。
2. 角色改成 SVG 内绘制 + 家具拆 `parts` + z 排序（这一步改完遮挡就按 §3.8 走）。
3. 家具定义落地（先床、床头灯两件带素材图的），屏幕坐标改由投影计算。
4. 事件定义落地，`BEHAVIORS` 退化成「调度器读事件表」。
5. 存档升到 v2，写迁移函数。

---

## 10. 待讨论（⚠️ 不定稿不写死）

1. **权重模型**：加权随机（现在）还是 utility 评分（可解释、可调试）？
2. **循环贴图的接缝**：贴图在「屏幕空间」平铺还是「世界格」平铺（后者在斜向会露出接缝，需要美术按格切图）。
3. **角色移动**：瞬移 / 补间 / 寻路（绕开家具）。现在只有补间。
4. **固定 z 的补充**：是否给 `spot` 或「角色当前深度」加一个 z 覆盖，解决「角色走到家具后面也不被挡」。
5. **多地图切换**：先留 `mapId` 字段，不做实现。
6. **环境事件**（天气、节假日）是否需要 `kind: ambient` 的真实触发源。

