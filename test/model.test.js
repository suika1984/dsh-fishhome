/**
 * 纯模型自测：不需要浏览器，也不启动 Harness。
 * 运行： node test/model.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.join(here, '..', 'client.js'), 'utf8')

let captured = null
const fakeWindow = {
  __ModuleLoader__: {
    load(entry) {
      captured = entry
    },
  },
}
new Function('window', source)(fakeWindow)

assert.ok(captured, 'client module should register itself')
assert.equal(captured.id, 'dsh-fishhome')

const ReactStub = {
  createElement() {},
  useState() {},
  useEffect() {},
  useRef() {},
  useMemo() {},
}
const plugin = captured.factory(() => ReactStub)
assert.equal(typeof plugin.apply, 'function')
const model = plugin.__internals
assert.ok(model, 'internals should be exported for tests')

const HOUR = 3600 * 1000

/* ---- 1. 创建 ---- */
const t0 = new Date('2026-11-02T13:10:00+08:00').getTime()
const home = model.createHome(t0, '大肥鱼')
assert.equal(home.kind, 'fishhome-state')
assert.equal(home.version, 1)
assert.equal(home.characterName, '大肥鱼')
assert.ok(home.character.energy > 0 && home.character.energy <= 100)
assert.equal(home.log.length, 1)
assert.equal(home.log[0].code, 'boot')

/* ---- 2. 连续跑 24 小时，状态必须始终合法 ---- */
let now = t0
let switches = 0
let lastBehavior = home.character.behaviorId
for (let i = 0; i < (24 * 60) / 5; i += 1) {
  now += 5 * 60 * 1000
  model.stepHome(home, now)
  if (home.character.behaviorId !== lastBehavior) {
    switches += 1
    lastBehavior = home.character.behaviorId
  }
  for (const key of ['energy', 'satiety', 'mood']) {
    const value = home.character[key]
    assert.ok(Number.isFinite(value), `${key} should stay finite`)
    assert.ok(value >= 0 && value <= 100, `${key} out of range: ${value}`)
  }
  assert.ok(model.BEHAVIOR_BY_ID[home.character.behaviorId], 'behavior id stays valid')
}
assert.ok(switches > 8, `a day should have some life, got ${switches} switches`)
assert.ok(home.log.length <= 40, 'log is capped')
assert.ok(home.character.energy > 12, 'it should have slept at some point')

/* ---- 3. 离线结算 ---- */
const offlineHome = { ...home, log: [...home.log] }
const settled = model.settleOffline(offlineHome, now + 6 * HOUR)
assert.equal(settled, true)
assert.equal(offlineHome.log[0].code, 'offline')
assert.ok(offlineHome.updatedAt === now + 6 * HOUR)

/* ---- 4. 调度权重 ---- */
const clockNight = model.timeSnapshot(new Date('2026-11-02T02:00:00+08:00'), 'zh')
const clockNoon = model.timeSnapshot(new Date('2026-11-02T12:00:00+08:00'), 'zh')
const sleepy = { energy: 20, satiety: 80, mood: 60, behaviorId: 'idle', cooldowns: {} }
const rested = { energy: 95, satiety: 80, mood: 60, behaviorId: 'idle', cooldowns: {} }
const sleepAtNight = model.behaviorWeight(model.BEHAVIOR_BY_ID.sleep, sleepy, clockNight, { deskLamp: false, curtainOpen: true })
const sleepAtNoon = model.behaviorWeight(model.BEHAVIOR_BY_ID.sleep, rested, clockNoon, { deskLamp: false, curtainOpen: true })
assert.ok(sleepAtNight > sleepAtNoon, 'night + low energy should favour sleeping')

/* ---- 5. 动画帧换算 ---- */
const animations = [
  { id: 'pack:idle', tags: ['idle'], frames: [{ asset: 'daily', rect: [38, 0, 372, 512], durationMs: 900 }] },
  { id: 'pack:read', tags: ['read'], frames: [{ asset: 'daily', rect: [38, 512, 372, 512], durationMs: 900 }] },
]
const assets = { daily: { path: 'daily.png', width: 1536, height: 1024 } }
const view = model.buildAnimationView(animations, assets, 'read')
assert.equal(view.frames.length, 1)
assert.ok(view.frames[0].url.endsWith('/pack/daily.png'))
// 帧矩形与整图尺寸：SVG 端靠它们做嵌套 viewBox 裁切
assert.deepEqual(view.frames[0].rect, { x: 38, y: 512, w: 372, h: 512 })
assert.deepEqual(view.frames[0].sheet, { w: 1536, h: 1024 })

/* ---- 6. 时间与环境 ---- */
const snap = model.timeSnapshot(new Date('2026-11-02T22:32:00+08:00'), 'zh')
assert.equal(snap.clock, '22:32')
assert.equal(snap.season, 'autumn')
assert.equal(snap.period, 'night')
assert.ok(snap.daylight < 0.05)

/* ---- 7. 场景几何：由 scene.json 决定 ---- */
const geom = model.applyScene({
  room: { cols: 16, rows: 12, wallHeight: 200, canvas: [1200, 800], margin: { x: 20, top: 40 } },
})
assert.equal(geom.cols, 16)
assert.equal(geom.rows, 12)
assert.equal(geom.wall, 200)
assert.equal(geom.canvasW, 1200)
assert.equal(geom.canvasH, 800)
// 菱形宽度 = 画布宽 - 两侧留白；kx 由此反推
assert.ok(Math.abs((16 + 12) * geom.kx - (1200 - 40)) < 0.001)
assert.ok(Math.abs(geom.ky - geom.kx / 2) < 1e-9)
// 左角正好落在左边距上
assert.ok(Math.abs(model.project(0, 12)[0] - 20) < 1e-6)
// 后角（0,0）的 y = 顶部留白 + 墙高
assert.ok(Math.abs(model.project(0, 0)[1] - (40 + 200)) < 1e-6)

// 数据缺失时回退到默认房间，不抛错
const fallback = model.applyScene(null)
assert.equal(fallback.cols, 12)
assert.equal(fallback.rows, 12)

// 背景层：自定义两层也能生效，renderOrder 按数据走
const bg = model.applyBackground({
  layers: [
    { id: 'floor', kind: 'floor', fill: { stops: [{ at: 0, color: '#111111' }] } },
    { id: 'wall_left', kind: 'wall', side: 'fx0', height: 120, trim: { top: { color: '#222222', height: 10 } } },
  ],
  renderOrder: ['wall_left', 'floor'],
})
assert.equal(bg.layers.length, 2)
assert.deepEqual(bg.renderOrder, ['wall_left', 'floor'])
// 坏数据不覆盖已有背景
const kept = model.applyBackground({ layers: [] })
assert.equal(kept.layers.length, 2)

// 路径解析：相对 scene.json 所在目录
assert.equal(model.resolveDataPath('maps/bedroom/scene.json', 'background.json'), 'maps/bedroom/background.json')
assert.equal(model.resolveDataPath('maps/bedroom/scene.json', '../shared/x.json'), 'maps/shared/x.json')
assert.equal(model.resolveDataPath('maps/bedroom/scene.json', '/abs.json'), 'abs.json')

/* ---- 8. 家具定义 ---- */
const before = model.furnitureRef.value.length
// 合法定义替换
const applied = model.applyFurniture([
  { id: 'sofa', parts: [{ id: 'body', z: 42 }, { id: 'cushion', z: 99 }] },
])
assert.equal(applied.length, 1)
assert.equal(applied[0].parts[1].z, 99)
// 非法定义（没有 parts / 没有 id）整条跳过，全部非法时保留原有
const keptFurniture = model.applyFurniture([{ id: 'bad' }, { parts: [] }])
assert.equal(keptFurniture.length, 1)
assert.equal(keptFurniture[0].id, 'sofa')

// 可见条件：家具状态 + 角色当前事件
const fakeHome = { character: { behaviorId: 'sleep' }, world: { props: { deskLamp: true } } }
assert.equal(model.partVisible({}, fakeHome), true)
assert.equal(model.partVisible({ visibleWhen: { characterEvent: ['sleep', 'nap'] } }, fakeHome), true)
assert.equal(model.partVisible({ visibleWhen: { characterEvent: ['play'] } }, fakeHome), false)
assert.equal(model.partVisible({ visibleWhen: { state: { deskLamp: true } } }, fakeHome), true)
assert.equal(model.partVisible({ visibleWhen: { state: { deskLamp: false } } }, fakeHome), false)

// 偏移换算成屏幕位移：+1 格 fx = (+kx, +ky)，跟着当前房间几何走
const shift = model.partOffsetTransform({ offset: { fx: 1, fy: 0 } })
assert.ok(shift.startsWith('translate('))
const [sx, sy] = shift.slice('translate('.length, -1).split(',').map(Number)
assert.ok(Math.abs(sx - model.geom.kx) < 0.05, `offset x ${sx}`)
assert.ok(Math.abs(sy - model.geom.ky) < 0.05, `offset y ${sy}`)
assert.equal(model.partOffsetTransform({ offset: { fx: 0, fy: 0 } }), null)
assert.equal(model.partOffsetTransform({}), null)

/* ---- 9. 素材图变换：镜像 / 切变 / 旋转 ---- */
const plain = model.spriteTransform({ rect: [100, 200, 300, 150] })
assert.equal(plain.transform, 'translate(100, 200) skewY(0.000)')
assert.equal(plain.rotate, 0)
assert.equal(plain.pivot, 'bottom')

const mirrored = model.spriteTransform({ rect: [100, 200, 300, 150], flipX: true, skew: -0.14 })
assert.ok(mirrored.transform.startsWith('translate(400, 200) scale(-1, 1) skewY(-7.9'), `mirrored: ${mirrored.transform}`)

const rotated = model.spriteTransform({ rect: [100, 200, 300, 150], rotate: 15 })
// 绕底边中点（250, 350）转
assert.ok(rotated.transform.startsWith('translate(250.00 350.00) rotate(15) translate(-250.00 -350.00)'))
assert.ok(rotated.transform.endsWith('translate(100, 200) skewY(0.000)'))
assert.deepEqual(rotated.pivotPoint, [250, 350])

const centerPivot = model.spriteTransform({ rect: [100, 200, 300, 150], rotate: 90, pivot: 'center' })
assert.deepEqual(centerPivot.pivotPoint, [250, 275])
assert.ok(centerPivot.transform.includes('rotate(90)'))

// 恢复默认家具，避免影响后续
model.applyFurniture(model.DEFAULT_FURNITURE)
assert.ok(model.furnitureRef.value.length >= before)

/* ---- 10. 事件表：数据驱动 ---- */
const clockLike = { hour: 12, minute: 0, period: 'day', daylight: 1, sleepiness: 0 }
// 数据里写了 weight 就以数据为准：base 1 × moodLow 2 = 2
model.applyEvents([
  { id: 'custom', spot: 'desk', anim: 'work', duration: [10, 20], weight: { base: 1, mods: [{ when: 'moodLow', mul: 2 }] } },
])
assert.equal(model.BEHAVIORS.length, 1)
assert.equal(model.behaviorWeight(model.BEHAVIOR_BY_ID.custom, { mood: 50, energy: 80, satiety: 80 }, clockLike, {}), 2)
assert.equal(model.behaviorWeight(model.BEHAVIOR_BY_ID.custom, { mood: 90, energy: 80, satiety: 80 }, clockLike, {}), 1)
// 数据里没写 weight 就走旧公式
model.applyEvents([{ id: 'snack', spot: 'desk', duration: [30, 50] }])
assert.ok(model.behaviorWeight(model.BEHAVIOR_BY_ID.snack, { satiety: 40, mood: 80, energy: 80 }, clockLike, {}) > 1)
// 非法事件被丢掉；全空时退回内置表
const normalized = model.normalizeEvent({ id: 'x', duration: [0, -3] })
assert.deepEqual(normalized.duration, [60, 60])
assert.deepEqual(normalized.onTick, {})
assert.equal(normalized.anim, 'idle')
assert.equal(model.normalizeEvent({ duration: [1, 2] }), null)
model.applyEvents([])
assert.equal(model.BEHAVIORS.length, 9, 'empty data should fall back to built-in events')
assert.ok(model.BEHAVIOR_BY_ID.idle && model.BEHAVIOR_BY_ID.sleep)

/* ---- 11. 称呼 / 自称 / 房间名 ---- */
const namedHome = model.createHome(Date.now(), '大肥鱼')
assert.equal(namedHome.selfName, '我')
assert.equal(namedHome.roomName, '大肥鱼的小屋')

// 老存档没有这两个字段：自称补「我」，房间名跟着（可能改过的）称呼走
const legacyHome = model.normalizeHome({
  kind: 'fishhome-state',
  version: 1,
  characterName: '小鱼',
  createdAt: 1,
  updatedAt: 1,
}, Date.now(), '大肥鱼')
assert.equal(legacyHome.characterName, '小鱼')
assert.equal(legacyHome.selfName, '我')
assert.equal(legacyHome.roomName, '小鱼的小屋')

// 存档里改过的名字要保留
const customHome = model.normalizeHome({
  kind: 'fishhome-state',
  version: 1,
  characterName: '小鱼',
  selfName: '本鱼',
  roomName: '海边的屋子',
  createdAt: 1,
  updatedAt: 1,
}, Date.now(), '大肥鱼')
assert.equal(customHome.selfName, '本鱼')
assert.equal(customHome.roomName, '海边的屋子')

// updateProfile：去空格、空值回落、太长截断
const profileStore = new model.HomeStore()
profileStore.home = model.createHome(Date.now(), '大肥鱼')
profileStore.updateProfile({ characterName: '  小鱼  ', selfName: '', roomName: '海边的屋子' })
assert.equal(profileStore.home.characterName, '小鱼')
assert.equal(profileStore.home.selfName, '我')
assert.equal(profileStore.home.roomName, '海边的屋子')
profileStore.updateProfile({ characterName: '一二三四五六七八九十十一十二十三' })
assert.equal(profileStore.home.characterName.length, 12, 'long names are truncated')
profileStore.updateProfile(null)
assert.equal(profileStore.home.characterName.length, 12, 'bad input is ignored')
if (profileStore.saveTimer) clearTimeout(profileStore.saveTimer)

/* ---- 12. 白天不睡大觉 ---- */
// sleepy 在 7:00-21:00 是 0.08，白天不应该挑「睡整觉」（除非累垮）
const daytime = { hour: 11.8, minute: 0, sleepiness: 0.08, daylight: 1, period: 'morning' }
const charOK = { energy: 60, mood: 80, satiety: 70 }
const charTired = { energy: 45, mood: 80, satiety: 70 }
const charExhausted = { energy: 25, mood: 80, satiety: 70 }
assert.equal(model.behaviorWeight(model.BEHAVIOR_BY_ID.sleep, charOK, daytime, {}), 0, '白天精神一般不该睡整觉')
assert.equal(model.behaviorWeight(model.BEHAVIOR_BY_ID.sleep, charTired, daytime, {}), 0, '白天有点累也不该睡整觉')
assert.ok(model.behaviorWeight(model.BEHAVIOR_BY_ID.sleep, charExhausted, daytime, {}) > 0, '累垮了才允许白天睡')
assert.ok(model.behaviorWeight(model.BEHAVIOR_BY_ID.nap, charTired, daytime, {}) > 0, '白天累应该打盹')
// 夜里正常睡
const night = { hour: 23, minute: 0, sleepiness: 0.75, daylight: 0, period: 'night' }
assert.ok(model.behaviorWeight(model.BEHAVIOR_BY_ID.sleep, charTired, night, {}) > 0.5, '夜里累了应该明显倾向于睡')
assert.ok(model.behaviorWeight(model.BEHAVIOR_BY_ID.sleep, charTired, night, {}) > model.behaviorWeight(model.BEHAVIOR_BY_ID.nap, charTired, night, {}), '夜里睡整觉应该压过打盹')

/* ---- 13. 同一事件连续发生不重复记日志 ---- */
{
  const now = Date.parse('2026-11-05T12:00:00+08:00')
  const home = model.createHome(now, '大肥鱼')
  home.log.length = 0
  const read = model.BEHAVIOR_BY_ID.read
  const windowSeat = model.BEHAVIOR_BY_ID.window
  model.enterBehavior(home, read, now)
  assert.equal(home.log.length, 1, '第一次要记')
  model.enterBehavior(home, read, now + 5000)
  assert.equal(home.log.length, 1, '同一事件紧接着又来一次不再记')
  model.enterBehavior(home, windowSeat, now + 12000)
  assert.equal(home.log.length, 2, '换了事件要记')
  model.enterBehavior(home, read, now + 20000)
  assert.equal(home.log.length, 2, '同一种事件在窗口内再回来也不重复记（不然会刷屏）')
  model.enterBehavior(home, read, now + 46 * 60 * 1000)
  assert.equal(home.log.length, 3, '过了去重窗口再发生要记')
}

/* ---- 14. 用户请求可能被拒绝 ---- */
{
  const reqEvent = model.normalizeEvent({
    id: 'sleepyReq',
    kind: 'interactive',
    spot: 'bed',
    anim: 'sleep',
    duration: [10, 10],
    request: {
      accept: ['night', 'energyLow'],
      refuse: { lines: [{ zh: '还不困', en: 'Not sleepy' }], anim: null, mood: -1 },
    },
  })
  assert.ok(reqEvent.request, 'request 配置要被保留')
  assert.deepEqual(reqEvent.request.accept, ['night', 'energyLow'])
  const dayClock = { hour: 14, minute: 0, sleepiness: 0.08, daylight: 1, period: 'afternoon' }
  const nightClock = { hour: 23, minute: 0, sleepiness: 0.75, daylight: 0, period: 'night' }
  assert.equal(model.requestAccepted(reqEvent, { energy: 85, mood: 80, satiety: 70 }, dayClock, {}), false, '白天精力充沛应该拒绝')
  assert.equal(model.requestAccepted(reqEvent, { energy: 30, mood: 80, satiety: 70 }, dayClock, {}), true, '精力低应该答应')
  assert.equal(model.requestAccepted(reqEvent, { energy: 85, mood: 80, satiety: 70 }, nightClock, {}), true, '夜里应该答应')
  assert.equal(model.requestAccepted(model.normalizeEvent({ id: 'plain' }), { energy: 99 }, dayClock, {}), true, '没配 request 的一律答应')
  assert.equal(model.refusalText(reqEvent, 'zh'), '还不困')
  assert.equal(model.refusalText(reqEvent, 'en'), 'Not sleepy')
  assert.equal(model.refusalText(model.normalizeEvent({ id: 'plain' }), 'zh'), '', '没配台词就返回空串')
  // 未知的词汇被过滤掉
  const bogus = model.normalizeEvent({ id: 'bogus', request: { accept: ['nope', 'night'] } })
  assert.deepEqual(bogus.request.accept, ['night'])
}

/* ---- 15. 小动静 & 回家打招呼 ---- */
{
  const t0 = Date.parse('2026-11-05T10:00:00+08:00')
  const sleeper = model.createHome(t0, '大肥鱼')
  sleeper.character.behaviorId = 'sleep'
  for (let i = 1; i <= 30; i += 1) model.stepHome(sleeper, t0 + i * 1000, 1)
  assert.equal(sleeper.character.emote, null, '睡觉时不该有小动静')

  const idler = model.createHome(t0, '大肥鱼')
  idler.character.behaviorId = 'idle'
  idler.character.cooldowns = { read: t0 + 99999999, work: t0 + 99999999, window: t0 + 99999999, play: t0 + 99999999, snack: t0 + 99999999, nap: t0 + 99999999, sleep: t0 + 99999999 }
  let sawEmote = false
  for (let i = 1; i <= 900 && !sawEmote; i += 1) {
    model.stepHome(idler, t0 + i * 1000, 1)
    if (idler.character.emote && idler.character.emote.until > t0 + i * 1000) sawEmote = true
  }
  assert.ok(sawEmote, '发呆时应该偶尔有小动静（伸懒腰/晃两下）')

  const back = model.createHome(t0, '大肥鱼')
  back.updatedAt = t0 - 3 * 3600 * 1000
  model.settleOffline(back, t0)
  assert.ok(back.character.say && ['back', 'backMorning', 'backNight'].includes(back.character.say.code), '离线两小时以上要打招呼')

  const quick = model.createHome(t0, '大肥鱼')
  quick.updatedAt = t0 - 10 * 60 * 1000
  quick.character.say = null
  model.settleOffline(quick, t0)
  assert.equal(quick.character.say, null, '只离线十分钟不要吵')
}

/* ---- 16. 事件台词 ---- */
{
  const withSay = model.normalizeEvent({ id: 's1', say: { chance: 1, lines: [{ zh: '嗨', en: 'Hi' }] } })
  assert.ok(withSay.say, 'say 要被保留')
  assert.equal(withSay.say.chance, 1)
  assert.equal(model.pickSay(withSay, 'zh'), '嗨')
  assert.equal(model.pickSay(withSay, 'en'), 'Hi')
  const dflt = model.normalizeEvent({ id: 's2', say: { lines: ['纯字符串'] } })
  assert.equal(dflt.say.chance, 0.4, 'chance 默认 0.4')
  assert.equal(model.pickSay(dflt, 'zh'), '纯字符串')
  assert.equal(model.pickSay(model.normalizeEvent({ id: 's3' }), 'zh'), '', '没配就返回空串')
}

const zh = model.makeTranslate('zh')
const en = model.makeTranslate('en')
assert.ok(zh('panel.title').length > 0)
assert.notEqual(zh('panel.title'), en('panel.title'))
assert.equal(zh('status.remain', { seconds: 30 }).includes('30'), true)

// 称呼：三个名字 + 台词里的 {user}/{name}/{self} 占位符
{
  const home = model.createHome(Date.now(), '大肥鱼')
  assert.equal(home.userName, '用户', '默认称呼是「用户」')
  assert.equal(home.selfName, '我', '默认自称是「我」')
  const oldSave = model.normalizeHome({ kind: 'fishhome-state', characterName: '大肥鱼' }, Date.now(), '大肥鱼')
  assert.equal(oldSave.userName, '用户', '老存档补上默认称呼')
  home.userName = '小主人'
  assert.equal(model.fillText('{user}，{name}在{self}的房间里', home), '小主人，大肥鱼在我的房间里', '占位符按名字替换')
  assert.equal(model.fillText('没有占位符', home), '没有占位符', '没有占位符就原样返回')
  assert.equal(model.fillText('', home), '', '空字符串返回空')
}

// DSH 会话活动：有人干活时，工作权重上升、发呆/睡觉权重下降
{
  model.setActivity({ running: 0 })
  assert.equal(model.activityWeightMul('work'), 1, '没有会话时权重不变')
  model.setActivity({ running: 2, counters: { tools: 3 } })
  assert.ok(model.activityWeightMul('work') > 1.5, '有会话时偏向工作')
  assert.ok(model.activityWeightMul('idle') < 1, '发呆权重被压低')
  assert.ok(model.activityWeightMul('sleep') < model.activityWeightMul('read'), '睡觉比看书更该被压低')
  const normalized = model.normalizeActivity({ running: '2', counters: { tools: '5' }, recent: [{ at: 1, kind: 'tool', detail: 'read' }, { bad: true }] })
  assert.equal(normalized.running, 2, '字符串数字也能归一化')
  assert.equal(normalized.counters.tools, 5)
  assert.equal(normalized.recent.length, 1, '坏条目被丢掉')
  assert.equal(model.normalizeActivity(null), null, '空快照返回 null')
  model.setActivity(null)
}
// 便条回复：关键词命中规则、没命中用兜底、中英文都取得到
{
  const doc = model.normalizeReplies({
    fallback: [{ zh: '嗯嗯', en: 'Mm' }],
    rules: [
      { contains: ['累', '睡'], behavior: 'nap', say: [{ zh: '那我躺一下', en: 'Lying down' }] },
      { contains: ['吃'], behavior: 'eat', say: [{ zh: '吃饭！', en: 'Food!' }] },
    ],
  })
  assert.equal(doc.rules.length, 2, '规则解析出来了')
  const nap = model.matchReply(doc, '我好累', 'zh')
  assert.equal(nap.text, '那我躺一下', '命中「累」')
  assert.equal(nap.behavior, 'nap', '带上行为')
  assert.equal(model.matchReply(doc, '吃饭时间', 'en').text, 'Food!', '英文取 en')
  const other = model.matchReply(doc, '随便聊聊', 'zh')
  assert.equal(other.text, '嗯嗯', '没命中用兜底')
  assert.equal(other.behavior, null, '兜底不带行为')
  assert.equal(model.matchReply({ rules: [], fallback: [] }, '累', 'zh').text, '', '空表返回空文本不崩')
}
// 作息：深夜该睡、白天不睡整觉、冷却压不过困意
{
  const weightsAt = (hour, energy) => {
    const at = new Date(2026, 10, 14, hour, 0, 0)
    const home = model.createHome(at.getTime(), '大肥鱼')
    home.character.energy = energy
    const clock = model.timeSnapshot(at, 'zh')
    const list = model.BEHAVIORS.map((b) => ({ id: b.id, w: model.behaviorWeight(b, home.character, clock, home.world.props) }))
    return { home, clock, list, by: Object.fromEntries(list.map((r) => [r.id, r.w])) }
  }
  const deep = weightsAt(2, 90)
  const otherMax = Math.max(...deep.list.filter((r) => r.id !== 'sleep').map((r) => r.w))
  assert.ok(deep.by.sleep > otherMax * 5, '凌晨 2 点精力 90 也想睡（权重压倒其它行为）')
  const noon = weightsAt(15, 80)
  assert.equal(noon.by.sleep, 0, '下午不睡整觉')
  const evening = weightsAt(22, 80)
  assert.ok(evening.by.sleep > evening.by.play, '晚上 22 点开始想睡')
  // 冷却压不过困意：凌晨带 3 小时冷却也能选到睡
  const blocked = weightsAt(3, 88)
  blocked.home.character.cooldowns.sleep = new Date(2026, 10, 14, 6, 0, 0).getTime()
  // 单次 pick 有随机性：抽 60 次看比例（冷却若能压住睡，sleep 会完全抽不到）
  const originalRandom = Math.random
  let seed = 424242
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  let sleepCount = 0
  try {
    for (let i = 0; i < 60; i += 1) {
      blocked.home.character.cooldowns.sleep = new Date(2026, 10, 14, 6, 0, 0).getTime()
      const picked = model.pickBehavior(blocked.home, blocked.clock, blocked.home.world.props, new Date(2026, 10, 14, 3, 0, 0).getTime())
      if (picked.id === 'sleep') sleepCount += 1
    }
  } finally {
    Math.random = originalRandom
  }
  assert.ok(sleepCount > 30, `深夜无视睡眠冷却（60 次抽到 ${sleepCount} 次睡）`)
}
// 连续模拟：夜里大部分时间在睡，白天不睡整觉（固定随机种子，避免测试抖动）
{
  const originalRandom = Math.random
  let seed = 20261114
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  try {
  const start = new Date(2026, 10, 14, 12, 0, 0).getTime()
  const home = model.createHome(start, '大肥鱼')
  home.character.energy = 85
  home.updatedAt = start
  const rows = []
  for (let t = start; t <= start + 24 * 3600 * 1000; t += 5 * 60 * 1000) {
    model.stepHome(home, t, 300)
    rows.push({ hour: new Date(t).getHours(), id: home.character.behaviorId })
  }
  const night = rows.filter((r) => r.hour >= 23 || r.hour < 6)
  const nightSleep = night.filter((r) => r.id === 'sleep' || r.id === 'nap').length
  assert.ok(nightSleep / night.length > 0.7, '深夜七成以上时间在睡')
  const day = rows.filter((r) => r.hour >= 10 && r.hour < 18)
  assert.equal(day.filter((r) => r.id === 'sleep').length, 0, '白天不睡整觉')
  } finally {
    Math.random = originalRandom
  }
}
// 日志不刷屏：同类事件在窗口内只记一次，便条/会话这类该每次都记
{
  const originalRandom = Math.random
  let seed = 777
  Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  try {
    model.setActivity({ running: 1, sessions: 1, counters: { messages: 3, tools: 8, errors: 0 }, recent: [], notes: null })
    const start = new Date(2026, 10, 15, 10, 0, 0).getTime()
    const home = model.createHome(start, '大肥鱼')
    home.updatedAt = start
    for (let t = start; t <= start + 2 * 3600 * 1000; t += 60 * 1000) model.stepHome(home, t, 60)
    assert.ok(home.log.length <= 14, `2 小时日志不该刷屏（实际 ${home.log.length} 条）`)
    const workEntries = home.log.filter((e) => e.code === 'work')
    assert.ok(workEntries.length <= 3, '工作日志被合并（一小时内最多一条）')
    for (let i = 1; i < workEntries.length; i += 1) {
      assert.ok(workEntries[i - 1].at - workEntries[i].at >= 60 * 60 * 1000 - 1000, '工作日志间隔不少于一小时')
    }
    // 便条这类用户触发的必须每次都记
    const countNotes = () => home.log.filter((e) => e.code === 'noteReply').length
    const before = countNotes()
    model.pushLog(home, start + 1000, 'noteReply', { text: 'a' })
    model.pushLog(home, start + 2000, 'noteReply', { text: 'b' })
    assert.equal(countNotes() - before, 2, '便条回复不合并')
  } finally {
    Math.random = originalRandom
    model.setActivity(null)
  }
}
// 门：卧室和客厅之间互通，用的是鲸鱼门素材；花园不需要门
{
  const root = path.join(here, '..', 'data', 'maps')
  const maps = ['bedroom', 'living']
  for (const map of maps) {
    const scene = JSON.parse(readFileSync(path.join(root, map, 'scene.json'), 'utf8'))
    assert.ok(scene.furniture.includes('door'), `${map} 有门`)
    const door = JSON.parse(readFileSync(path.join(root, map, 'furniture', 'door.json'), 'utf8'))
    assert.equal(door.click.type, 'scene', `${map} 的门点了切场景`)
    assert.ok(maps.includes(door.click.id), `${map} 的门指向存在的场景`)
    assert.equal(door.parts[0].sprite.src, 'door-whale.png', `${map} 的门用鲸鱼门素材`)
    assert.equal(door.parts[0].preset, undefined, `${map} 的门不再用内置画法`)
  }
  const garden = JSON.parse(readFileSync(path.join(root, 'garden', 'scene.json'), 'utf8'))
  assert.ok(!garden.furniture.includes('door'), '花园不需要门')
}
// 客厅落地窗：框体是 W-03 + W-01 拼的推拉门，天空层还透得出来
{
  const root = path.join(here, '..', 'data', 'maps', 'living', 'furniture')
  const win = JSON.parse(readFileSync(path.join(root, 'living_window.json'), 'utf8'))
  const frame = win.parts.find((part) => part.id === 'frame')
  assert.ok(frame, '有框体')
  assert.equal(frame.sprite.src, 'win-panel.png', '框体用推拉门单元素材')
  assert.equal(frame.sprite.repeat.count, 3, '框体拼三段，拉长落地窗')
  assert.equal(frame.sprite.repeat.dx, 137, '每段等距拼接')
  assert.ok(frame.sprite.rect[2] * frame.sprite.repeat.count >= 380, '总宽度够长')
  const sky = win.parts.filter((part) => /^sky-/.test(part.id))
  assert.ok(sky.length >= 3, '天空还是按时间段分层')
  assert.ok(sky.every((part) => part.z < frame.z), '天空在框体下面')
}
// 关帘要能盖住整扇窗（窗户拉长后，帘子宽度也得跟上，不然中间漏缝）
{
  const root = path.join(here, '..', 'data', 'maps', 'living', 'furniture')
  const win = JSON.parse(readFileSync(path.join(root, 'living_window.json'), 'utf8'))
  const frame = win.parts.find((part) => part.id === 'frame')
  const frameX0 = frame.sprite.rect[0]
  const frameX1 = frameX0 + frame.sprite.rect[2] * frame.sprite.repeat.count
  for (const key of ['curtain-blue-closed', 'curtain-white-closed']) {
    const left = win.parts.find((part) => part.id === `${key}-left`)
    const right = win.parts.find((part) => part.id === `${key}-right`)
    assert.ok(left && right, `${key} 左右两片都在`)
    const l0 = left.sprite.rect[0]
    const l1 = l0 + left.sprite.rect[2]
    const r0 = right.sprite.rect[0]
    const r1 = r0 + right.sprite.rect[2]
    assert.ok(l0 <= frameX0, `${key} 左侧盖住窗边`)
    assert.ok(r1 >= frameX1, `${key} 右侧盖住窗边`)
    assert.ok(l1 >= r0, `${key} 中间合拢不漏缝（${l1} >= ${r0}）`)
  }
}
console.log('model tests passed:', {
  switches,
  energy: Math.round(home.character.energy),
  satiety: Math.round(home.character.satiety),
  mood: Math.round(home.character.mood),
  logs: home.log.length,
})
