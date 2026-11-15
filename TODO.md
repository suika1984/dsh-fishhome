# TODO · 待办与暂行搁置

> 记录「知道要做、但暂时先放着」的事，避免下次重新推理一遍。
> 新加待办请写清：**做什么 / 为什么现在不做 / 回来时从哪下手**。

## 暂定搁置

- [ ] **花园的工作工位**
  - 现状：会话开始后她会在「当前所在房间」干活——卧室坐书桌（`desk:sit` → `work45`）、客厅坐沙发（`sofa:work` → `sofa_work45`）。
    花园没有工位，所以她在那儿时会站着播 `work` 动画。
  - 回来时从这下手：`data/maps/garden/scene.json` 的 `spots`、`garden_bench.json` 加一条 `animations` 锚点（姿势可选 `lounge45`/`sofa_work45`），
    再把 `data/maps/garden/events/work.json` 的 `anchor` 指过去。花园本身还是占位场景，可能要一并补家具。
  - 为什么先不：花园场景本身还没做完，单独加工位意义不大。

- [ ] **L3 小屋便条的注入模式实测**（目标会话已可在「设置」里手动选，自动=最近活跃）
  - 现状：`noteMode` 默认 `preview`（只在屋里说，不进会话）。`inject` 走 `agent/pre-step` 水位追加一条用户消息，代码和 host 测试都通了，但**没在真实会话里跑过**。
  - 回来时：profile 的 `cordis.patch.yml` 加 `config.noteMode: inject` → 重启 Harness → 面板递一句 → 看下一轮是否收到这条用户消息。
  - 风险：会往真实会话里写消息，测的时候挑一个无关紧要的会话。
  - 备注：现在面板优先走客户端的 `session.prompt`，`inject` 只是拿不到 sessions 服务时的退路。

## 发布后可以做的

- [ ] **截图进 README**：`docs/images/` 目前只有窗户的合成预览，缺整间屋子的实机截图。
  - 做法：面板里截图 → 存 `docs/images/room-bedroom.png` / `room-living.png` → README 顶部加一段预览。
  - `docs/refs/` 是 gitignore 的临时调试图，别往里放。
- [ ] **仓库瘦身（可选）**：`.git` 约 36MB，主要在 `packs/bigfish-adult/` 的几张大图（fish-sheet 2.3MB 等）。
  如果以后要公开，可以考虑 `git lfs` 或把素材压一遍。

## 还没排期的

- [ ] `spot`（地板格）与 `animations` 锚点两套定位并存，长期建议统一成「锚点优先、spot 兜底」并写进 SCHEMA
- [ ] `surface.attach` / `part.skew` / `rotate` / `flipX` 四套变形叠加顺序敏感，值得固化文档 + 一条回归测试
- [ ] 落地窗/窗帘这套「素材切段 + repeat」的坐标换算，editor 里目前只能手动填 rect；

## 已完成

- [x] git 版本控制 + `.gitignore`
- [x] 素材归档（运行目录 18.5MB → 11.4MB）
- [x] 拆 `locale.js` / `scene.js`×6 / `store.js`×5
- [x] `tools/check.mjs` 零依赖自检（构建新鲜度 / 片段登记 / 文案 / 死代码 / 数据引用 / 日志码渲染分支）
- [x] `package.json` 占位符填成 `suika1984`，提交作者统一
- [x] 推到 GitHub：https://github.com/suika1984/dsh-fishhome
- [x] GitHub Actions：`.github/workflows/ci.yml` 跑构建 + 自检 + 四套测试
- [x] 客厅落地窗改推拉门（三段拼接 + 横版天空 + 三段窗帘杆）
- [x] 会话联动修复：`activitySignature` 漏定义导致权重失效
- [x] 日志去抖：同类事件按窗口去重、会话起停抖动合并
- [x] 作息修正：深夜困意压过精力，夜里睡饱了接着睡
- [x] 拆 `test/ui.test.js`（1468 行）→ `ui-harness.js` + `test/ui/{panel,editor,interact,scene,sessions}.test.js`，入口只剩 13 行
