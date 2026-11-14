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

- [ ] **L3 小屋便条的注入模式实测**
  - 现状：`noteMode` 默认 `preview`（只在屋里说，不进会话）。`inject` 走 `agent/pre-step` 水位追加一条用户消息，代码和 host 测试都通了，但**没在真实会话里跑过**。
  - 回来时：profile 的 `cordis.patch.yml` 加 `config.noteMode: inject` → 重启 Harness → 面板递一句 → 看下一轮是否收到这条用户消息。
  - 风险：会往真实会话里写消息，测的时候挑一个无关紧要的会话。

## 发布前

- [ ] `package.json` 里 `#{your-name}` 占位符换成真实 GitHub 用户名（`homepage` / `repository` / `bugs` / `author`）
- [ ] `git config user.name/email` 设成自己的（现在提交署名是 `dsh <dsh@local>`；想让历史也变，用 `git rebase --root --exec "git commit --amend --no-edit --reset-author"`）
- [ ] 可选的 GitHub Actions：`node build.mjs && node tools/check.mjs` + 四套测试
- [ ] 可选：`docs/images/` 放 2~3 张游戏截图（`docs/refs/` 是 gitignore 的临时调试图，别往里放）

## 代码整理（已完成的记在这里，避免重复提）

- [x] git 版本控制 + `.gitignore`
- [x] 素材归档（运行目录 18.5MB → 11.4MB）
- [x] 拆 `locale.js` / `scene.js`×6 / `store.js`×5
- [x] `tools/check.mjs` 零依赖自检（构建新鲜度 / 片段登记 / 文案 / 死代码 / 数据引用 / 日志码渲染分支）

## 还没排期的

- [ ] `test/ui.test.js` 还是 1100+ 行，可以按组件拆
- [ ] `spot`（地板格）与 `animations` 锚点两套定位并存，长期建议统一成「锚点优先、spot 兜底」并写进 SCHEMA
- [ ] `surface.attach` / `part.skew` / `rotate` / `flipX` 四套变形叠加顺序敏感，值得固化文档 + 一条回归测试
