/**
 * 会话与设置：活动卡、日志文案、便条、会话选择、构建版本号、抖动去抖、气泡换行、门
 * 拆分自 test/ui.test.js，顺序与原文件一致（由 test/ui.test.js 依次 import）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { assert, model, home, views, store, translate, registered, components, here } from '../ui-harness.js'

// 配置文件列表：每行有「打开」「定位」，点了带出正确的 kind/path
{
  const calls = []
  const settings = model.SettingsBar({
    t: translate,
    profile: { characterName: '大肥鱼' },
    paths: [],
    configs: [
      { label: '场景', path: 'data/maps/living/scene.json' },
      { label: '事件目录', path: 'data/maps/living/events', kind: 'folder' },
      { label: '存档', path: 'save/state.json' },
    ],
    openTip: '',
    onOpen: (kind, target) => calls.push([kind, target]),
    onChange() {}, onSave() {}, onClose() {},
  })
  const buttons = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
    if (n.type === 'button') buttons.push(n)
    walk(n.children)
  }
  walk(settings)
  assert.ok(buttons.length >= 6, '每个配置项两个按钮')
  // 第一行「打开」→ file + 场景路径
  const openBtn = buttons.find((b) => (b.children || []).includes(translate('settings.open')))
  assert.ok(openBtn, '有「打开」按钮')
  openBtn.props.onClick()
  assert.deepEqual(calls[0], ['file', 'data/maps/living/scene.json'], '打开场景文件')
  // 目录项的按钮文案是「打开目录」，kind 传 folder
  const folderBtn = buttons.find((b) => (b.children || []).includes(translate('settings.openFolder')))
  assert.ok(folderBtn, '目录项是「打开目录」')
  folderBtn.props.onClick()
  assert.deepEqual(calls[calls.length - 1], ['folder', 'data/maps/living/events'], '打开事件目录')
  // 「定位」传 reveal
  const revealBtn = buttons.find((b) => (b.children || []).includes(translate('settings.reveal')))
  revealBtn.props.onClick()
  assert.equal(calls[calls.length - 1][0], 'reveal', '定位走 reveal')
}

// 编辑器里选中家具后能直接打开它的 json
{
  const calls = []
  const bar = model.EditorBar({
    t: translate,
    edit: { on: true, selected: { defId: 'sofa', partId: '*', isSprite: true }, status: '' },
    info: null, objects: [], selectedId: 'sofa',
    canTransform: true, images: [], currentSrc: '', size: null, canUndo: false,
    mapId: 'living',
    onOpenSource: (spec) => calls.push(spec),
    onPickObject() {}, onBumpZ() {}, onRotate() {}, onFlip() {}, onImage() {}, onResize() {},
    onAdd() {}, onRemove() {}, onDuplicate() {}, eventsOpen: false, onToggleEvents() {},
    onSkew() {}, proj: 0.375, onSave() {}, onDiscard() {}, onExit() {},
  })
  const btns = []
  const walk2 = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk2); return }
    if (typeof n.type === 'function') { walk2(n.type(n.props || {})); return }
    if (n.type === 'button') btns.push(n)
    walk2(n.children)
  }
  walk2(bar)
  const openJson = btns.find((b) => (b.children || []).includes(translate('edit.openSource')))
  assert.ok(openJson, '编辑器有「打开 json」')
  openJson.props.onClick()
  assert.deepEqual(calls[0], { kind: 'file', path: 'data/maps/living/furniture/sofa.json' }, '打开选中家具的 json')
}
// 会话卡：有会话在跑时显示「运行中 N」、统计数字和最近活动
{
  const cardHome = model.createHome(Date.now(), '大肥鱼')
  const offline = model.ActivityCard({ t: translate, activity: null, home: cardHome, now: Date.now() })
  assert.equal(offline, null, '没有活动数据就不显示卡片')
  const card = model.ActivityCard({
    t: translate,
    home: cardHome,
    now: Date.now(),
    activity: {
      running: 2, sessions: 3,
      counters: { tools: 7, messages: 4, errors: 1, workflows: 0, subagents: 0 },
      recent: [{ at: Date.now() - 60000, kind: 'tool', detail: 'read' }, { at: Date.now(), kind: 'error', detail: 'boom' }],
    },
  })
  const texts = []
  const walk = (n) => {
    if (n === null || n === undefined || n === false) return
    if (typeof n === 'string' || typeof n === 'number') { texts.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
    walk(n.props ? n.props.children : undefined)
  }
  walk(card)
  const joined = texts.join('|')
  assert.ok(joined.includes('运行中 2') || joined.includes('2'), '显示运行中的会话数')
  assert.ok(joined.includes('7') && joined.includes('4') && joined.includes('1'), '显示工具/消息/出错计数')
  assert.ok(texts.some((x) => x.includes('调用工具')), '最近活动带种类标签')
}
// 会话结束文案：用 {user}/{name} 拼，且必须真的有渲染分支（曾缺 case 显示成「大肥鱼。」）
{
  const logHome = model.createHome(Date.now(), '大肥鱼')
  logHome.userName = '小明'
  const endText = model.fillText(model.logText(translate, { code: 'sessionEnd', arg: null }), logHome)
  assert.ok(endText.includes('工作完成'), '结束文案是「工作完成」而不是「会话结束」')
  assert.ok(endText.includes('小明') && endText.includes('大肥鱼'), '两个名字都替换了')
  assert.ok(endText.includes('伸了个懒腰'), '保留伸懒腰的动作')
  const startText = model.fillText(model.logText(translate, { code: 'sessionStart', arg: null }), logHome)
  assert.ok(startText.includes('书桌'), '开始文案有书桌')
  assert.ok(model.fillText(model.logText(translate, { code: 'sessionError', arg: null }), logHome).includes('担心'), '出错文案有担心')
}
// 便条输入：卡片上能有输入框和「递给她」，预览/注入模式提示不同
{
  const cardHome = model.createHome(Date.now(), '大肥鱼')
  const build = (mode) => model.ActivityCard({
    t: translate,
    home: cardHome,
    now: Date.now(),
    onNote: () => {},
    activity: {
      running: 1, sessions: 1,
      counters: { tools: 0, messages: 0, errors: 0 },
      recent: [],
      notes: { mode, pending: mode === 'inject' ? 2 : 0, injected: 0, preview: 0, canInject: true },
    },
  })
  const collect = (tree) => {
    const out = { tags: [], texts: [] }
    const walk = (n) => {
      if (n === null || n === undefined || n === false) return
      if (typeof n === 'string' || typeof n === 'number') { out.texts.push(String(n)); return }
      if (Array.isArray(n)) { n.forEach(walk); return }
      if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
      if (n.type) out.tags.push(n.type)
      walk(n.props ? n.props.children : undefined)
    }
    walk(tree)
    return out
  }
  const preview = collect(build('preview'))
  assert.ok(preview.tags.includes('input'), '有输入框')
  assert.ok(preview.texts.includes(translate('activity.noteSend')), '有「递给她」按钮')
  assert.ok(preview.texts.some((x) => x.includes(translate('activity.notePreview'))), '预览模式有提示')
  const inject = collect(build('inject'))
  assert.ok(inject.texts.some((x) => x.includes(translate('activity.noteInject'))), '注入模式提示不同')
  assert.ok(inject.texts.some((x) => x.includes('2')), '显示待递张数')
}
// 设置里能选会话：下拉框列出活会话，切换时把 id 回调出去
{
  const calls = []
  const bar = model.SettingsBar({
    t: translate,
    profile: { characterName: '大肥鱼' },
    paths: [], configs: [], openTip: '',
    sessionTargets: [
      { id: 'abc12345-9999', label: '测试会话', running: true },
      { id: 'def67890-1111', label: 'def67890', running: false },
    ],
    noteTarget: 'abc12345-9999',
    onNoteTarget: (id) => calls.push(id),
    onOpen() {}, onChange() {}, onSave() {}, onClose() {},
  })
  const selects = []
  const options = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
    if (n.type === 'select') selects.push(n)
    if (n.type === 'option') options.push(n)
    walk(n.children)
  }
  walk(bar)
  assert.equal(selects.length, 1, '有一个会话下拉框')
  assert.equal(selects[0].props.value, 'abc12345-9999', '默认选中当前指定会话')
  const labels = options.map((o) => [].concat(o.children).flat().join(''))
  assert.ok(labels.includes(translate('settings.noteTargetAuto')), '有「自动」选项')
  assert.ok(labels.some((x) => x.includes('运行中')), '运行中的会话有标记')
  selects[0].props.onChange({ target: { value: 'def67890-1111' } })
  assert.deepEqual(calls, ['def67890-1111'], '切换会回调出去')
}
// 设置底部显示两侧版本：改了 index.js 要重启、改了 src 要刷新，靠这两串哈希判断
{
  const bar = model.SettingsBar({
    t: translate, profile: {}, paths: [], configs: [], openTip: '',
    hostRev: 'host1234', sessionTargets: [], noteTarget: '', onNoteTarget() {},
    onOpen() {}, onChange() {}, onSave() {}, onClose() {},
  })
  const found = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
    if (n.props && String(n.props.className || '').includes('fh-build-info')) found.push(n)
    walk(n.children)
  }
  walk(bar)
  assert.equal(found.length, 1, '有版本信息行')
  const text = [].concat(found[0].children).flat(8).join('')
  assert.ok(text.includes('host1234'), '显示 Host 版本')
  assert.ok(/[0-9a-f]{8}/.test(text), '显示界面版本')
}
// 便条回复日志：{text} 要真的渲染进句子里
{
  const logHome = model.createHome(Date.now(), '大肥鱼')
  const text = model.fillText(model.logText(translate, { code: 'noteReply', arg: { text: '那我躺一下' } }), logHome)
  assert.ok(text.includes('那我躺一下'), '引用了她的回复')
  assert.ok(text.includes('大肥鱼'), '带上名字')
}
// 会话「一轮一停」抖动：起停日志只记一条，抖动时撤掉多余的收工
await (async () => {
  const store = new model.HomeStore()
  store.publish = () => {}
  store.scheduleSave = () => {}
  store.home = model.createHome(Date.now(), '大肥鱼')
  store.home.log.length = 0
  const snap = (running, messages) => ({ running, sessions: running, counters: { messages, tools: 1, errors: 0, workflows: 0, subagents: 0 }, recent: [], notes: null })
  ;[1, 0, 1, 0, 1, 0, 1].forEach((running, index) => store.applyActivity(snap(running, index + 1)))
  const codes = store.home.log.map((entry) => entry.code)
  assert.equal(codes.filter((c) => c === 'sessionStart').length, 1, '起工只记一条')
  assert.equal(codes.filter((c) => c === 'sessionEnd').length, 0, '抖动中的收工记录被撤掉')
})()

// 会话一直在跑时也要能把她推回书桌：连续两次工作之间的空档可能短到被轮询漏掉
await (async () => {
  const store = new model.HomeStore()
  store.publish = () => {}
  store.scheduleSave = () => {}
  store.home = model.createHome(Date.now(), '大肥鱼')
  store.home.character.behaviorId = 'read'
  const snapshot = { running: 1, sessions: 1, counters: { messages: 1, tools: 1, errors: 0 }, recent: [], notes: null }
  store.activity = { ...snapshot }
  store.activitySignature = 'something-different'
  store.applyActivity({ ...snapshot, counters: { messages: 2, tools: 1, errors: 0 } })
  assert.equal(store.home.character.behaviorId, 'work', '会话在跑时她回去工作')
  // 3 分钟内不重复推
  store.home.character.behaviorId = 'read'
  store.activitySignature = 'another'
  store.applyActivity({ ...snapshot, counters: { messages: 3, tools: 1, errors: 0 } })
  assert.equal(store.home.character.behaviorId, 'read', '刚推过就不再打断（避免每 5 秒推一次）')
})()

// 你刚手动指挥过她时，会话活动不抢人
await (async () => {
  const store = new model.HomeStore()
  store.publish = () => {}
  store.scheduleSave = () => {}
  store.home = model.createHome(Date.now(), '大肥鱼')
  store.home.character.behaviorId = 'read'
  store.lastUserActionAt = Date.now()
  store.lastWorkNudgeAt = 0
  store.activity = { running: 1, sessions: 1, counters: { messages: 1, tools: 0, errors: 0 }, recent: [], notes: null }
  store.activitySignature = 'x'
  store.applyActivity({ running: 1, sessions: 1, counters: { messages: 2, tools: 0, errors: 0 }, recent: [], notes: null })
  assert.equal(store.home.character.behaviorId, 'read', '刚点过东西，先不抢')
})()

// 便条走客户端 sessions 服务：等于在聊天框里发消息，会出现在对话里并触发一轮
await (async () => {
  const calls = []
  const store = new model.HomeStore()
  store.publish = () => {}
  store.scheduleSave = () => {}
  store.home = model.createHome(Date.now(), '大肥鱼')
  store.replies = model.normalizeReplies({ fallback: [{ zh: '嗯嗯', en: 'Mm' }] })
  store.activity = { running: 1, notes: { targetId: 'session-target-1', target: 'session-', sessions: [] } }
  store.clientSessions = {
    async using(id, options, callback) {
      calls.push(['using', id, options.source])
      return callback({ binding: { session: {
        async prompt(content, mode) {
          calls.push(['prompt', content[0].text, mode])
          return { ok: true, value: { accepted: true } }
        },
      } } })
    },
  }
  const result = await store.sendNote('一起吃个饭吧')
  assert.equal(result.delivered, true, '标记为已送达会话')
  assert.deepEqual(calls[0], ['using', 'session-target-1', 'gateway'], '按会话 id 取引用')
  assert.deepEqual(calls[1], ['prompt', '【家园】一起吃个饭吧', 'queue'], '用聊天框同款 prompt 发出去，带家园标记')
  assert.ok(store.home.character.say.text.length > 0, '屋里也回了一句')
  assert.equal(store.home.log[0].code, 'noteDelivered', '日志记了送达')
})()
// 会话回复：日志要念出来，气泡只更新一次
await (async () => {
  const store = new model.HomeStore()
  store.publish = () => {}
  store.scheduleSave = () => {}
  store.home = model.createHome(Date.now(), '大肥鱼')
  store.surfaceReply({ at: 111, text: '（眯起眼睛）诶嘿嘿…那我也回摸一下。' })
  assert.ok(store.home.character.say.text.includes('回摸一下'), '气泡换成会话的回复')
  assert.equal(store.home.log[0].code, 'agentReply', '日志记了 agentReply')
  const count = store.home.log.length
  store.surfaceReply({ at: 111, text: '同一句' })
  assert.equal(store.home.log.length, count, '同一时间戳不重复播')
})()

// agentReply 日志文本带出回复内容
{
  const logHome = model.createHome(Date.now(), '大肥鱼')
  const text = model.fillText(model.logText(translate, { code: 'agentReply', arg: { text: '回摸一下' } }), logHome)
  assert.ok(text.includes('回摸一下'), '日志里带回复文本')
}
// 人工指定的会话要进存档：setNoteTarget 成功后写 home.noteTarget
await (async () => {
  const store = new model.HomeStore()
  store.publish = () => {}
  store.scheduleSave = () => {}
  store.home = model.createHome(Date.now(), '大肥鱼')
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, notes: { mode: 'inject', pinned: 'session-keep' } }) })
  const before = store.home.noteTarget
  await store.setNoteTarget('session-keep')
  assert.equal(before, '', '默认没有指定')
  assert.equal(store.home.noteTarget, 'session-keep', 'noteTarget 写进存档')
  // 重启后可以从存档恢复
  const revived = model.normalizeHome(JSON.parse(JSON.stringify(store.home)), Date.now(), '大肥鱼')
  assert.equal(revived.noteTarget, 'session-keep', '存档归一化后仍带着目标会话')
})()
// 气泡换行：多行、算宽度、截断加省略号、不丢字符
{
  const wrap = model.wrapBubbleText
  const short = wrap('诶嘿嘿…摸头最好了。', { maxWidth: 250 })
  assert.equal(short.lines.length, 1, '短句一行')
  assert.ok(short.width > 100 && short.width <= 250, '宽度在范围内')
  const longCn = '（把耳朵凑过来，任你揉了两下）诶嘿嘿…摸头最好了，我今天一直在这儿陪着你。'
  const cn = wrap(longCn, { maxWidth: 250 })
  assert.ok(cn.lines.length >= 2, '长中文会换行')
  assert.equal(cn.lines.join(''), longCn, '换行不丢字符')
  cn.lines.forEach((line) => assert.ok(!line.startsWith(' ') && !line.endsWith(' '), '行首行尾无空格'))
  const en = wrap('Hello there, this is a longer English sentence that should wrap nicely across lines.', { maxWidth: 250 })
  assert.ok(en.lines.length >= 2, '英文也会换行')
  assert.equal(en.lines.join(' '), 'Hello there, this is a longer English sentence that should wrap nicely across lines.', '英文换行后拼接不变')
  const clipped = wrap('字'.repeat(60), { maxWidth: 250, maxLines: 3 })
  assert.equal(clipped.lines.length, 3, '最多三行')
  assert.equal(clipped.truncated, true, '标记截断')
  assert.ok(clipped.lines[2].endsWith('…'), '最后一行有省略号')
  assert.ok(clipped.lines.every((line) => model.wrapBubbleText ? true : true), '行数组可遍历')
}
// bench_rest 日志（花园长椅）要渲染成人话
{
  const logHome = model.createHome(Date.now(), '大肥鱼')
  const text = model.fillText(model.logText(translate, { code: 'bench_rest', arg: null }), logHome)
  assert.ok(text.includes('长椅'), '日志里提到长椅')
  assert.ok(text.includes('大肥鱼'), '带上名字')
}

// 会话卡合并重复事件：连着 3 次「调用工具 pwsh」只显示一行 ×3
{
  const now = Date.now()
  const activity = model.normalizeActivity({
    running: 2,
    counters: { messages: 8, tools: 23, errors: 0 },
    recent: [
      { at: now - 5000, kind: 'tool', detail: 'pwsh' },
      { at: now - 4000, kind: 'tool', detail: 'pwsh' },
      { at: now - 3000, kind: 'tool', detail: 'pwsh' },
      { at: now - 2000, kind: 'message', detail: '' },
      { at: now - 1000, kind: 'idle', detail: '' },
    ],
    notes: { mode: 'inject', target: '会话A' },
  })
  const tree = model.ActivityCard({ t: translate, activity, home: model.createHome(now, '大肥鱼'), now, onNote: async () => ({ ok: true }), canDeliver: true })
  const text = (node) => {
    if (node === null || node === undefined || node === false) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(text).join('')
    if (typeof node === 'object') {
      if (typeof node.type === 'function') return text(node.type(node.props || {}))
      return text(node.children)
    }
    return ''
  }
  const rows = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') { walk(n.type(n.props || {})); return }
    if (n.type === 'li') rows.push(text(n))
    walk(n.children)
  }
  walk(tree)
  assert.equal(rows.length, 3, '最近事件最多三行')
  const toolRow = rows.find((row) => row.includes('pwsh'))
  assert.ok(toolRow, '有工具那一行')
  assert.ok(toolRow.includes('×3'), '重复的合并成 ×3')
  assert.equal(rows.filter((row) => row.includes('pwsh')).length, 1, '不再连刷三行')
}
// 门：能渲染出来，点了会切场景
{
  const read = (rel) => JSON.parse(readFileSync(path.join(here, '..', 'data', 'maps', rel), 'utf8'))
  const scene = read('bedroom/scene.json')
  const furniture = scene.furniture.map((id) => read(`bedroom/furniture/${id}.json`))
  model.applyScene(scene)
  model.applyFurniture(furniture)
  let switched = ''
  const home = model.createHome(Date.now(), '大肥鱼')
  const tree = model.SceneSvg({
    home,
    views: {},
    t: translate,
    now: Date.now(),
    onProp: () => {},
    onToggle: () => {},
    onScene: (id) => { switched = id },
    edit: { on: false },
    onSelect: () => {},
    onDragStart: () => {},
    onResizeStart: () => {},
  })
  const found = { door: 0, activate: null }
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (typeof n.type === 'function') {
      // onActivate 挂在 PropGroup 这个组件上，不是它返回的 <g> 上
      const cls = n.props && typeof n.props.className === 'string' ? n.props.className : ''
      if (cls.includes('fh-prop-door')) {
        found.door += 1
        if (typeof n.props.onActivate === 'function') found.activate = n.props.onActivate
      }
      walk(n.type(n.props || {}))
      return
    }
    walk(n.children)
  }
  walk(tree)
  assert.ok(found.door > 0, '门渲染出来了')
  assert.equal(typeof found.activate, 'function', '门可以点')
  found.activate()
  assert.equal(switched, 'living', '点卧室的门去客厅')
  model.applyScene(null)
  model.applyFurniture([])
}
