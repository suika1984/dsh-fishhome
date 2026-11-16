/**
 * 大肥鱼的家园 · Client 半。
 *
 * 分成两层：
 *   1. 纯模型（时间 / 需求 / 行为调度 / 离线结算 / 存档形状）—— 不碰 DOM、不碰 React，
 *      可以直接在 Node 里跑测试（见返回值的 __internals）。
 *   2. 表现层 —— 等距小屋 SVG、精灵动画、状态栏与交互。
 *
 * 模型只认稳定 ID（行为 ID、物件 ID、角色包动画标签），不认具体图片，
 * 所以换一套角色包或换一间屋子时，行为逻辑不用改。
 */
window.__ModuleLoader__.load({
  id: 'dsh-fishhome',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo } = React
    const BUILD_REV = 'b1563009'

    const PANEL_ID = 'fishhome'
    const NS = 'fishhome'
    const ROUTE = '/fishhome'
    const MODEL_VERSION = 1
    const LS_KEY = 'dsh-fishhome:state'
    const TICK_MS = 5000
    const SAVE_DEBOUNCE_MS = 9000
    const OFFLINE_MIN_GAP_MS = 15 * 60 * 1000
    const OFFLINE_CAP_MS = 12 * 60 * 60 * 1000
    const OFFLINE_STEP_MS = 5 * 60 * 1000
    const MAX_LOG = 40
/** 有床的房间：睡觉一律回这里（床只在卧室） */
const SLEEP_ROOM = 'bedroom'
/** 会话「一轮一停」的抖动窗口：这段时间内的起停只算一次，避免日志出现两条一样的 */
const SESSION_FLAP_MS = 5 * 60 * 1000
/** 有会话在跑时，把她推回书桌的最小间隔（防止每 5 秒轮询反复推） */
const WORK_NUDGE_MS = 3 * 60 * 1000
/** 你刚手动点过东西时，这段时间内不打断你（用户优先） */
const USER_PRIORITY_MS = 10 * 60 * 1000
/** 便条发进会话时带的前缀：提示模型这是小屋来的小便条，简短回应即可 */
const NOTE_MARK = '【家园】'

    /* ======================================================================
     * 8. 多语言（内联字典：即使 locale 服务不可用也能显示）
     * ==================================================================== */

    const ZH = {
      'panel.title': '家园',
      'panel.subtitle': '大肥鱼的小屋 · 跟着现实时间过日子',
      'room.title': '{name}的小屋',
      'room.hint': '点一点屋子里的东西，看看它有什么反应。',
      'scene.aria': '一间等距视角的小屋：左边是床和书桌，右边是书架和窗，地上铺着地毯。',
      'scene.desk': '书桌',
      'scene.bookshelf': '书架',
      'scene.shelf': '书架',
      'scene.bed': '床',
      'scene.nightstand': '床头柜',
      'scene.night_lamp': '床头灯',
      'map.bedroom': '卧室',
      'map.living': '客厅',
      'map.garden': '花园',
      'scene.door': '门',
      'scene.window': '窗户',
      'scene.rug': '地毯',
      'scene.plant': '绿植',
      'action.pat': '摸摸头',
      'action.character': '陪它一会儿',
      'head.refresh': '刷新',
      'head.edit': '编辑',
      'head.settings': '设置',
      'head.map': '房间',
      'head.zoom': '视野',
      'head.elsewhere': '{name}在 {room}（点这里叫过来）',
      'head.callHint': '让大肥鱼来到你正在看的房间',
      'zoom.near': '近景',
      'zoom.mid': '远景 75%',
      'zoom.far': '远景 50%',
      'zoom.fit': '整间屋子',
      'settings.title': '称呼与房间',
      'settings.hint': '改完点保存，立刻生效并存档',
      'settings.characterName': '称呼',
      'settings.selfName': '自称',
      'settings.roomName': '房间名',
      'settings.userName': '她怎么叫你',
      'settings.save': '保存',
      'settings.close': '关闭',
      'settings.files': '文件位置（点一下复制路径）',
      'settings.configs': '配置文件（点「打开」用系统程序直接打开）',
      'settings.open': '打开',
      'settings.openFolder': '打开目录',
      'settings.reveal': '定位',
      'settings.opened': '已打开：{path}{via}',
      'settings.openFailedCopied': '\n路径已复制：{path}',
      'settings.copy': '复制路径',
      'settings.copied': '路径已复制，粘到资源管理器地址栏（Ctrl+L）即可：{path}',
      'settings.copyFailed': '复制失败，手动复制这个路径：{path}',
      'settings.openFailed': '打不开：{error}',
      'settings.file.scene': '场景',
      'settings.file.background': '背景 / 墙纸',
      'settings.file.events': '事件目录',
      'settings.file.furniture': '家具目录',
      'settings.file.pet': '角色包',
      'settings.file.actions': '动作目录',
      'settings.file.save': '存档',
      'settings.noteTarget': '便条送进哪个会话',
      'settings.noteTargetAuto': '自动（最近活跃的会话）',
      'settings.noteTargetHint': '只有 noteMode 为 inject 时才会真的送进会话',
      'settings.buildInfo': 'Host {host} · 界面 {client}（改了 index.js 要重启，改了 src 要刷新）',
      'edit.title': '布局编辑',
      'edit.none': '点一下家具选中它',
      'edit.save': '保存',
      'edit.discard': '放弃改动',
      'edit.exit': '退出编辑',
      'edit.openSource': '打开 json',
      'edit.openSourceHint': '用系统默认程序打开这个配置文件',
      'edit.flip': '左右镜像',
      'edit.addFurniture': '＋ 家具',
      'edit.removeFurniture': '删除家具',
      'edit.duplicate': '复制',
      'edit.undo': '撤销',
      'edit.undoHint': 'Ctrl/⌘ + Z 也能撤销',
      'edit.pickObject': '选择对象…',
      'edit.pickObjectHint': '选一件家具来编辑它的位置、层级、切变和图片',
      'edit.skew': '畸变',
      'edit.skewHint': '平行四边形畸变（斜率）：0 = 正对镜头；等于房间的 projection 就跟墙平行',
      'edit.skewLeft': '贴左墙',
      'edit.skewLeftHint': '左墙往左下退，斜率取 -projection',
      'edit.skewRight': '贴右墙',
      'edit.skewRightHint': '右墙往右下退，斜率取 +projection',
      'say.back': '{user}，你回来啦～',
      'say.backMorning': '早上好，{user}～',
      'say.backNight': '{user}，这么晚了还不睡吗？',
      'say.pat1': '{user}摸得很舒服…',
      'say.pat2': '{user}，再摸摸嘛～',
      'say.pat3': '唔…{user}，要摸摸头',
      'say.refuse': '现在还不行哦',
      'edit.dragHint': '拖拽可直接移动选中的物件',
      'edit.image': '换图',
      'edit.size': '尺寸',
      'edit.events': '事件表',
      'edit.apply': '应用',
      'edit.field.label': '标签',
      'edit.field.spot': '落脚点',
      'edit.field.anim': '动画',
      'edit.field.duration': '时长',
      'edit.field.cooldown': '冷却',
      'edit.field.log': '日志码',
      'edit.field.ontick': '每秒影响',
      'edit.field.weight': '权重',
      'edit.unit.second': '秒',
      'edit.weightEnable': '按数据算（不勾就用默认公式）',
      'edit.addMod': '加一条修正',
      'edit.remove': '删掉',
      'edit.eventsHint': '改完点「应用」立刻生效（还没写盘），点上面的「保存」才写回 events/*.json。落脚点来自 scene.json；动画标签由角色包决定；不勾权重就用内置公式。',
      'edit.hint': '方向键移动（Shift 加速），PageUp/PageDown 调 z，[ / ] 旋转（Shift 15°），F 左右镜像，Esc 取消选中；改完记得保存。',
      'head.saved': '已存档',
      'head.saving': '存档中',
      'head.offline': '只存在本机浏览器里',
      'head.pending': '等待存档',
      'state.on': '开',
      'state.off': '关',
      'prop.deskLamp': '台灯',
      'prop.bedLamp': '床头灯',
      'prop.curtainOpen': '拉开窗帘',
      'prop.curtainClose': '拉上窗帘',
      'prop.tv': '电视',
      'prop.toggle.curtainOpen': '窗帘',
      'prop.toggle.curtainBlueClosed': '蓝帘',
      'prop.toggle.curtainWhiteClosed': '白纱',
      'prop.toggle.tvOn': '电视',
      'prop.toggle.livingLamp': '客厅灯',
      'prop.toggle.deskLamp': '台灯',
      'prop.toggle.bedLamp': '床头灯',
      'state.openIt': '拉开',
      'state.closeIt': '拉上',
      'prop.livingLamp': '客厅灯',
      'prop.tvOn': '电视',
      'prop.curtainBlueClosed': '蓝帘',
      'prop.curtainWhiteClosed': '白纱',
      'log.toggle': '{name}把{what}{state}了。',
      'behavior.bench_rest': '在长椅上歇着',
      'behavior.sit': '坐着发呆',
      'behavior.sofa_play': '在沙发上玩',
      'behavior.watch_tv': '看电视',
      'behavior.eat': '吃饭',
      'behavior.cook': '做饭',
      'behavior.doze': '趴在桌上打盹',
      'flavor.bench_rest': '花园里的长椅，晒着太阳正好发会儿呆。',
      'flavor.sit': '沙发很软，坐着就有点困了。',
      'flavor.sofa_play': '手柄握在手里，谁也别想让她停下来。',
      'flavor.watch_tv': '节目演到哪儿其实不重要，重要的是有人陪着看。',
      'flavor.eat': '吃饭的时候最专心了。',
      'flavor.cook': '锅铲翻动的声音，比键盘好听。',
      'flavor.doze': '就趴一下下……说好的就一下下。',
      'prop.whale': '小鲸鱼',
      'prop.book': '看书',
      'prop.bed': '躺一会儿',
      'prop.reset': '回到屋中间',
      'status.title': '此刻',
      'status.remain': '大约还有 {seconds} 秒',
      'needs.title': '{name}的状态',
      'needs.day': '第 {days} 天',
      'needs.energy': '精力',
      'needs.satiety': '饱腹',
      'needs.mood': '心情',
      'needs.energyHint.low': '眼睛快睁不开了',
      'needs.energyHint.mid': '还能再撑一会儿',
      'needs.energyHint.high': '精神很好',
      'needs.satietyHint.low': '肚子在叫',
      'needs.satietyHint.mid': '有点想吃东西',
      'needs.satietyHint.high': '刚吃饱',
      'needs.moodHint.low': '有点蔫，想被陪一会儿',
      'needs.moodHint.mid': '平平常常的一天',
      'needs.moodHint.high': '心情不错',
      'log.title': '屋子里的动静',
      'log.count': '{count} 条',
      'log.empty': '还没有什么动静。',
      'log.boot': '屋子亮起了灯，{name}抬头看了看你。',
      'log.read': '{name}抱着一本书坐到了书架边。',
      'log.work': '{name}把键盘搬到了书桌上。',
      'log.window': '{name}趴在窗边看外面的光。',
      'log.play': '{name}滚去和小鲸鱼玩了一会儿。',
      'log.snack': '{name}翻出了一点零食。',
      'log.nap': '{name}躺在床上打了个小盹。',
      'log.sleep': '{name}把灯关了，睡下了。',
      'log.roomOut': '你推开门，去了{room}。',
      'log.goBedroom': '{name}回卧室睡觉了。',
      'log.backHere': '{name}睡醒了，回到你这边。',
      'door.leave': '要走啦？我送你到门口。',
      'log.wake': '{name}睡醒啦，伸了个懒腰。',
      'log.pat': '你摸了摸{name}的头。',
      'log.deskLampOn': '台灯亮了。',
      'log.deskLampOff': '台灯关了。',
      'log.bedLampOn': '床头灯亮了。',
      'log.bedLampOff': '床头灯关了。',
      'log.curtainOpen': '{name}把窗帘拉开了。',
      'log.curtainClose': '{name}把窗帘拉上了。',
      'activity.title': '会话',
      'activity.busy': '运行中 {count}',
      'activity.idle': '空闲',
      'activity.hintBusy': '{name}也坐到了书桌前，跟你一起忙。',
      'activity.hintIdle': '现在没有会话在跑，她在屋里自己转悠。',
      'activity.tools': '工具',
      'activity.messages': '消息',
      'activity.errors': '出错',
      'activity.recent': '最近',
      'activity.kind.session-start': '会话开始',
      'activity.kind.session-end': '会话结束',
      'activity.kind.running': '开始运行',
      'activity.kind.idle': '空闲下来',
      'activity.kind.tool': '调用工具',
      'activity.kind.message': '新消息',
      'activity.kind.error': '出错',
      'activity.kind.subagent': '分派子任务',
      'activity.kind.workflow': '跑工作流',
      'log.sessionStart': '你开始干活了，{name}也坐到了书桌前。',
      'log.sessionEnd': '{user}的工作完成啦，{name}伸了个懒腰。',
      'log.sessionError': '好像出了点问题，{name}有点担心。',
      'activity.noteTitle': '跟她说一句',
      'activity.notePlaceholder': '想对她说点什么…',
      'activity.noteSend': '递给她',
      'activity.notePreview': '只在屋子里说',
      'activity.noteInject': '会作为一条消息发进会话',
      'activity.notePending': '{count} 张待递',
      'activity.noteTarget': '会送进会话 {target}',
      'activity.noteNoTarget': '当前没有运行中的会话，便条会等她开始',
      'log.noteQueued': '你把话递给了{name}。',
      'log.noteReply': '{name}回你：{text}',
      'log.noteDelivered': '{name}的话已经发进会话了。',
      'log.agentReply': '会话里回了一句，{name}念给你听：{text}',
      'activity.noteSent': '已发送到会话',
      'log.offline': '你离开了 {span}，{name}自己过了这段日子。',
      'log.move': '{name}凑到你面前来了。',
      'log.bench_rest': '{name}在花园的长椅上歇了一会儿。',
      'log.sit': '{name}在沙发上发了会儿呆。',
      'log.watch_tv': '{name}窝在沙发上看电视。',
      'log.cook': '{name}在厨房忙活了一阵。',
      'log.eat': '{name}端着碗吃了起来。',
      'log.doze': '{name}趴在桌上打了个盹。',
      'log.sofa_play': '{name}在沙发上玩了一会儿。',
      'log.stretch': '{name}伸了个懒腰。',
      'log.idle': '{name}发着呆，看着窗外。',
      'log.fallback': '{name}{label}。',
      'log.unknown': '屋子里发生了什么。',
      'span.minutes': '{minutes} 分钟',
      'span.hours': '{hours} 小时',
      'span.hoursMinutes': '{hours} 小时 {minutes} 分钟',
      'season.spring': '春天',
      'season.summer': '夏天',
      'season.autumn': '秋天',
      'season.winter': '冬天',
      'period.deepNight': '深夜',
      'period.dawn': '清晨',
      'period.morning': '上午',
      'period.noon': '中午',
      'period.afternoon': '下午',
      'period.evening': '傍晚',
      'period.night': '夜里',
      'behavior.idle': '在屋子中间发呆',
      'behavior.read': '在看书',
      'behavior.work': '在敲键盘',
      'behavior.window': '在看窗外',
      'behavior.play': '在和小鲸鱼玩',
      'behavior.stretch': '在伸懒腰',
      'behavior.snack': '在翻零食',
      'behavior.nap': '在打盹',
      'behavior.sleep': '在睡觉',
      'flavor.idle': '什么也不做，听着窗外的声音。',
      'flavor.read': '书翻到哪一页都不重要，重要的是慢慢看。',
      'flavor.work': '键盘声很轻，偶尔停下来想一想。',
      'flavor.window': '外面的光一点点变了颜色。',
      'flavor.play': '把鲸鱼玩偶抛起来，再接住。',
      'flavor.stretch': '把手臂举过头顶，尾巴跟着晃了一下。',
      'flavor.snack': '据说零食是另一个胃。',
      'flavor.nap': '只是闭一会儿眼睛。',
      'flavor.sleep': '被子拉到下巴，呼吸很轻。',
      'loading.title': '正在点亮小屋…',
      'loading.hint': '读取角色包和上一次的存档。',
      'error.title': '小屋没能亮起来',
      'error.retry': '再试一次',
      'saved.at': '上次存档 {time}',
      'saved.never': '还没存过',
    }

    const EN = {
      'panel.title': 'Fish Home',
      'panel.subtitle': "Big Fish's room · living on the real clock",
      'room.title': "{name}'s room",
      'room.hint': 'Click anything in the room and see how it reacts.',
      'scene.aria': 'An isometric room: a bed and desk on the left, a bookshelf and window on the right, a rug in the middle.',
      'scene.desk': 'Desk',
      'scene.bookshelf': 'Bookshelf',
      'scene.shelf': 'Shelf',
      'scene.bed': 'Bed',
      'scene.nightstand': 'Nightstand',
      'scene.night_lamp': 'Bedside lamp',
      'map.bedroom': 'Bedroom',
      'map.living': 'Living room',
      'map.garden': 'Garden',
      'scene.door': 'Door',
      'scene.window': 'Window',
      'scene.rug': 'Rug',
      'scene.plant': 'Plant',
      'action.pat': 'Pat',
      'action.character': 'Spend time',
      'head.refresh': 'Refresh',
      'head.edit': 'Edit',
      'head.settings': 'Settings',
      'head.map': 'Room',
      'head.zoom': 'View',
      'head.elsewhere': 'She is in {room} (click to call)',
      'head.callHint': 'Bring her to the room you are viewing',
      'zoom.near': 'Close',
      'zoom.mid': 'Far 75%',
      'zoom.far': 'Far 50%',
      'zoom.fit': 'Whole room',
      'settings.title': 'Names',
      'settings.hint': 'Save applies immediately and persists',
      'settings.characterName': 'Name',
      'settings.selfName': 'Self-reference',
      'settings.roomName': 'Room name',
      'settings.userName': 'How she calls you',
      'settings.save': 'Save',
      'settings.close': 'Close',
      'settings.files': 'File locations (click to copy)',
      'settings.configs': 'Config files (open with your default app)',
      'settings.open': 'Open',
      'settings.openFolder': 'Open folder',
      'settings.reveal': 'Reveal',
      'settings.opened': 'Opened: {path}{via}',
      'settings.openFailedCopied': '\nPath copied: {path}',
      'settings.copy': 'Copy path',
      'settings.copied': 'Path copied — paste it into the Explorer address bar (Ctrl+L): {path}',
      'settings.copyFailed': 'Copy failed, copy this path manually: {path}',
      'settings.openFailed': 'Cannot open: {error}',
      'settings.file.scene': 'Scene',
      'settings.file.background': 'Background',
      'settings.file.events': 'Events folder',
      'settings.file.furniture': 'Furniture folder',
      'settings.file.pet': 'Character pack',
      'settings.file.actions': 'Actions folder',
      'settings.file.save': 'Save file',
      'settings.noteTarget': 'Which session gets the note',
      'settings.noteTargetAuto': 'Auto (most recent session)',
      'settings.noteTargetHint': 'Only delivered when noteMode is inject',
      'settings.buildInfo': 'Host {host} · UI {client} (restart after index.js, refresh after src)',
      'edit.title': 'Layout editor',
      'edit.none': 'Click a piece of furniture to select it',
      'edit.save': 'Save',
      'edit.discard': 'Discard',
      'edit.exit': 'Exit',
      'edit.openSource': 'Open JSON',
      'edit.openSourceHint': 'Open this config file with your default app',
      'edit.flip': 'Mirror',
      'edit.addFurniture': '+ Furniture',
      'edit.removeFurniture': 'Delete furniture',
      'edit.duplicate': 'Duplicate',
      'edit.undo': 'Undo',
      'edit.undoHint': 'Ctrl/⌘ + Z works too',
      'edit.pickObject': 'Pick an object…',
      'edit.pickObjectHint': 'Pick a piece of furniture to edit position, z, skew and image',
      'edit.skew': 'Skew',
      'edit.skewHint': 'Parallelogram skew (slope): 0 faces the camera; ±projection matches a wall',
      'edit.skewLeft': 'Left wall',
      'edit.skewLeftHint': 'Left wall recedes down-left: -projection',
      'edit.skewRight': 'Right wall',
      'edit.skewRightHint': 'Right wall recedes down-right: +projection',
      'say.back': '{user}, you are back~',
      'say.backMorning': 'Morning! Sleep well?',
      'say.backNight': 'Still up?',
      'say.pat1': 'Hehe... that feels nice',
      'say.pat2': 'More pets~',
      'say.pat3': 'I want head pats',
      'say.refuse': 'Not right now',
      'edit.dragHint': 'Drag a piece to move it',
      'edit.image': 'Image',
      'edit.size': 'Size',
      'edit.events': 'Events',
      'edit.apply': 'Apply',
      'edit.field.label': 'Label',
      'edit.field.spot': 'Spot',
      'edit.field.anim': 'Animation',
      'edit.field.duration': 'Duration',
      'edit.field.cooldown': 'Cooldown',
      'edit.field.log': 'Log code',
      'edit.field.ontick': 'Per second',
      'edit.field.weight': 'Weight',
      'edit.unit.second': 's',
      'edit.weightEnable': 'Use data weight (else built-in formula)',
      'edit.addMod': 'Add modifier',
      'edit.remove': 'Remove',
      'edit.eventsHint': 'Apply takes effect immediately; Save writes events/*.json. Spots come from scene.json; animation tags come from the character pack; untick weight to use the built-in formula.',
      'edit.hint': 'Arrow keys move (Shift = faster), PageUp/PageDown change z, [ / ] rotate (Shift = 15°), F mirrors, Esc deselects. Remember to save.',
      'head.saved': 'Saved',
      'head.saving': 'Saving',
      'head.offline': 'Browser only',
      'head.pending': 'Pending save',
      'state.on': 'on',
      'state.off': 'off',
      'prop.deskLamp': 'Desk lamp',
      'prop.bedLamp': 'Bedside lamp',
      'prop.curtainOpen': 'Open curtain',
      'prop.curtainClose': 'Close curtain',
      'prop.tv': 'TV',
      'prop.toggle.curtainOpen': 'curtain',
      'prop.toggle.curtainBlueClosed': 'blue curtain',
      'prop.toggle.curtainWhiteClosed': 'sheer',
      'prop.toggle.tvOn': 'TV',
      'prop.toggle.livingLamp': 'living lamp',
      'prop.toggle.deskLamp': 'desk lamp',
      'prop.toggle.bedLamp': 'bedside lamp',
      'state.openIt': 'open',
      'state.closeIt': 'close',
      'prop.livingLamp': 'Living lamp',
      'prop.tvOn': 'TV',
      'prop.curtainBlueClosed': 'Blue curtain',
      'prop.curtainWhiteClosed': 'Sheer',
      'log.toggle': '{name} turned the {what} {state}.',
      'behavior.bench_rest': 'Resting on the bench',
      'behavior.sit': 'Sitting around',
      'behavior.sofa_play': 'Playing on the sofa',
      'behavior.watch_tv': 'Watching TV',
      'behavior.eat': 'Eating',
      'behavior.cook': 'Cooking',
      'behavior.doze': 'Dozing at the desk',
      'flavor.bench_rest': 'A bench in the garden — perfect for a sunbath and a daydream.',
      'flavor.sit': 'The sofa is soft; sitting turns into dozing.',
      'flavor.sofa_play': 'Controller in hand, nothing can stop her.',
      'flavor.watch_tv': "What's on matters less than watching together.",
      'flavor.eat': 'She is fully focused when eating.',
      'flavor.cook': 'The pan sounds better than the keyboard.',
      'flavor.doze': 'Just a tiny nap... she promised.',
      'prop.whale': 'Whale plush',
      'prop.book': 'Read',
      'prop.bed': 'Lie down',
      'prop.reset': 'Back to middle',
      'status.title': 'Right now',
      'status.remain': 'about {seconds}s left',
      'needs.title': 'How it feels',
      'needs.day': 'Day {days}',
      'needs.energy': 'Energy',
      'needs.satiety': 'Fullness',
      'needs.mood': 'Mood',
      'needs.energyHint.low': 'Eyes almost closed',
      'needs.energyHint.mid': 'Still going',
      'needs.energyHint.high': 'Wide awake',
      'needs.satietyHint.low': 'Stomach is growling',
      'needs.satietyHint.mid': 'Could nibble something',
      'needs.satietyHint.high': 'Just ate',
      'needs.moodHint.low': 'A bit down, wants company',
      'needs.moodHint.mid': 'An ordinary day',
      'needs.moodHint.high': 'In a good mood',
      'log.title': 'What happened here',
      'log.count': '{count} entries',
      'log.empty': 'Nothing yet.',
      'log.boot': 'The lights came on and it looked up at you.',
      'log.read': 'It sat down by the shelf with a book.',
      'log.work': 'It carried the keyboard over to the desk.',
      'log.window': 'It leaned by the window, watching the light.',
      'log.play': 'It rolled around with the whale plush.',
      'log.snack': 'It dug out a snack.',
      'log.nap': 'It lay down for a short nap.',
      'log.sleep': 'It turned the light off and went to sleep.',
      'log.roomOut': 'You opened the door and went to {room}.',
      'log.goBedroom': '{name} went to the bedroom to sleep.',
      'log.backHere': '{name} woke up and came back to you.',
      'door.leave': 'Leaving already? I\'ll see you to the door.',
      'log.wake': 'It woke up and stretched.',
      'log.pat': 'You patted its head.',
      'log.deskLampOn': 'Desk lamp on.',
      'log.deskLampOff': 'Desk lamp off.',
      'log.bedLampOn': 'Bedside lamp on.',
      'log.bedLampOff': 'Bedside lamp off.',
      'log.curtainOpen': 'The curtain opened.',
      'log.curtainClose': 'The curtain closed.',
      'activity.title': 'Sessions',
      'activity.busy': '{count} running',
      'activity.idle': 'idle',
      'activity.hintBusy': '{name} sat down at the desk to work alongside you.',
      'activity.hintIdle': 'No session is running; she wanders around on her own.',
      'activity.tools': 'Tools',
      'activity.messages': 'Messages',
      'activity.errors': 'Errors',
      'activity.recent': 'Recent',
      'activity.kind.session-start': 'session started',
      'activity.kind.session-end': 'session ended',
      'activity.kind.running': 'started running',
      'activity.kind.idle': 'went idle',
      'activity.kind.tool': 'tool call',
      'activity.kind.message': 'new message',
      'activity.kind.error': 'error',
      'activity.kind.subagent': 'subagent',
      'activity.kind.workflow': 'workflow',
      'log.sessionStart': 'You started working; {name} sat down at the desk too.',
      'log.sessionEnd': "{user}'s work is done — {name} stretched.",
      'log.sessionError': 'Something went wrong; {name} looks worried.',
      'activity.noteTitle': 'Say something to her',
      'activity.notePlaceholder': 'A few words for her…',
      'activity.noteSend': 'Hand it over',
      'activity.notePreview': 'Only in the room',
      'activity.noteInject': 'Will be sent into the session',
      'activity.notePending': '{count} pending',
      'activity.noteTarget': 'Delivered to session {target}',
      'activity.noteNoTarget': 'No session is running; the note waits for her',
      'log.noteQueued': 'You handed {name} a note.',
      'log.noteReply': '{name} replied: {text}',
      'log.noteDelivered': 'Your note was sent into the session.',
      'log.agentReply': 'A reply came back — {name} reads it aloud: {text}',
      'activity.noteSent': 'Sent to session',
      'log.offline': 'You were away for {span}; it kept living.',
      'log.move': 'It came over to you.',
      'log.bench_rest': 'It rested on the garden bench.',
      'log.sit': 'It spaced out on the sofa.',
      'log.watch_tv': 'It curled up watching TV.',
      'log.cook': 'It busied around the kitchen.',
      'log.eat': 'It had something to eat.',
      'log.doze': 'It dozed off at the desk.',
      'log.sofa_play': 'It played on the sofa.',
      'log.stretch': 'It stretched.',
      'log.idle': 'It stared out of the window.',
      'log.fallback': 'It {label}.',
      'log.unknown': 'Something happened.',
      'span.minutes': '{minutes} min',
      'span.hours': '{hours} h',
      'span.hoursMinutes': '{hours} h {minutes} min',
      'season.spring': 'spring',
      'season.summer': 'summer',
      'season.autumn': 'autumn',
      'season.winter': 'winter',
      'period.deepNight': 'late night',
      'period.dawn': 'dawn',
      'period.morning': 'morning',
      'period.noon': 'noon',
      'period.afternoon': 'afternoon',
      'period.evening': 'evening',
      'period.night': 'night',
      'behavior.idle': 'drifting in the middle of the room',
      'behavior.read': 'reading',
      'behavior.work': 'typing away',
      'behavior.window': 'looking outside',
      'behavior.play': 'playing with the whale plush',
      'behavior.stretch': 'stretching',
      'behavior.snack': 'hunting for snacks',
      'behavior.nap': 'napping',
      'behavior.sleep': 'sleeping',
      'flavor.idle': 'Doing nothing, listening to the room.',
      'flavor.read': 'The page does not matter; reading slowly does.',
      'flavor.work': 'Soft keystrokes, with pauses to think.',
      'flavor.window': 'The light outside changes color slowly.',
      'flavor.play': 'Tossing the plush up, catching it again.',
      'flavor.stretch': 'Arms overhead, tail flicking.',
      'flavor.snack': 'Snacks go to a second stomach, allegedly.',
      'flavor.nap': 'Just closing the eyes for a bit.',
      'flavor.sleep': 'Blanket up to the chin, breathing quietly.',
      'loading.title': 'Lighting the room…',
      'loading.hint': 'Loading the character pack and your last save.',
      'error.title': 'The room would not light up',
      'error.retry': 'Try again',
      'saved.at': 'Last saved {time}',
      'saved.never': 'never saved',
    }

    let localeRef = { value: 'zh' }

    function isZhLocale(locale) {
      return typeof locale === 'string' ? /^zh/i.test(locale) : true
    }

    function readLocaleId(snapshot) {
      if (!snapshot) return 'zh'
      if (typeof snapshot === 'string') return snapshot
      const id = snapshot.id || snapshot.locale || snapshot.language || snapshot.current
      return typeof id === 'string' ? id : 'zh'
    }

    function makeTranslate(locale) {
      const dict = isZhLocale(locale) ? ZH : EN
      const fallback = ZH
      return (key, params) => {
        let template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : fallback[key]
        if (typeof template !== 'string') template = key
        if (!params) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => (
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
        ))
      }
    }
    /* ======================================================================
     * 1. 纯模型：时间与环境
     * ==================================================================== */

    function clampNumber(value, min, max, fallback) {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return fallback
      return Math.min(max, Math.max(min, n))
    }

    function clamp01(value) {
      return Math.min(1, Math.max(0, value))
    }

    function pad2(n) {
      return String(n).padStart(2, '0')
    }

    const SEASONS = ['spring', 'summer', 'autumn', 'winter']

    function seasonOf(date) {
      const month = date.getMonth()
      if (month >= 2 && month <= 4) return 'spring'
      if (month >= 5 && month <= 7) return 'summer'
      if (month >= 8 && month <= 10) return 'autumn'
      return 'winter'
    }

    function periodOf(hour) {
      if (hour < 5) return 'deepNight'
      if (hour < 7) return 'dawn'
      if (hour < 11) return 'morning'
      if (hour < 13) return 'noon'
      if (hour < 17) return 'afternoon'
      if (hour < 20) return 'evening'
      return 'night'
    }

    /** 0 = 全黑，1 = 正午。用来做灯光、窗帘与行为倾向，不写死整点。 */
    function daylight(hour) {
      const x = (hour - 6) / 12
      if (x <= 0 || x >= 1) return 0
      return Math.sin(Math.PI * x)
    }

    /** 0 = 完全不困，1 = 深夜。 */
    function sleepiness(hour) {
      const h = ((hour % 24) + 24) % 24
      if (h < 5) return 1
      if (h < 7) return 0.55 - (h - 5) * 0.15
      if (h < 21) return 0.08
      if (h < 23) return 0.35 + (h - 21) * 0.2
      return 0.95
    }

    const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六']
    const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    function timeSnapshot(date, locale) {
      const zh = isZhLocale(locale)
      const hour = date.getHours()
      const minute = date.getMinutes()
      const month = date.getMonth() + 1
      const day = date.getDate()
      return {
        season: seasonOf(date),
        period: periodOf(hour),
        hour,
        minute,
        clock: `${pad2(hour)}:${pad2(minute)}`,
        dateText: zh
          ? `${month} 月 ${day} 日 · 周${WEEKDAYS_ZH[date.getDay()]}`
          : `${month}/${day} · ${WEEKDAYS_EN[date.getDay()]}`,
        daylight: daylight(hour + minute / 60),
        sleepiness: sleepiness(hour + minute / 60),
      }
    }

    function indoorTemperature(season) {
      if (season === 'summer') return 27
      if (season === 'winter') return 18
      if (season === 'spring') return 22
      return 21
    }

    /* ======================================================================
     * 2. 纯模型：需求、行为与调度
     * ==================================================================== */

    /**
     * 默认事件表。正常运行读 data/maps/<map>/events/*.json；
     * 这份内置表在数据缺失时兜底，内容和默认数据文件一致。
     *
     * id 稳定，动画只给语义标签；spot 是落脚点；duration 是秒。
     * weight 可选：写了就用「base × 若干具名修正」，没写就走 legacyWeight()。
     */
    const DEFAULT_EVENTS = [
      {
        id: 'idle', spot: 'center', anim: 'idle', duration: [60, 140],
        log: null, onTick: { mood: 0.003 },
      },
      {
        id: 'read', spot: 'bookshelf', anim: 'read', duration: [180, 360],
        log: 'read', cooldown: 240, onTick: { mood: 0.01, energy: -0.003 },
      },
      {
        id: 'work', spot: 'desk', anim: 'work', duration: [240, 480],
        log: 'work', cooldown: 180, onTick: { mood: 0.002, energy: -0.005 },
      },
      {
        id: 'window', spot: 'window', anim: 'idle', duration: [90, 180],
        log: 'window', cooldown: 200, onTick: { mood: 0.012 },
      },
      {
        id: 'play', spot: 'rug', anim: 'play', duration: [60, 120],
        log: 'play', cooldown: 300, onTick: { mood: 0.035, energy: -0.02, satiety: -0.008 },
      },
      {
        id: 'stretch', spot: 'center', anim: 'stretch', duration: [14, 22],
        log: null, cooldown: 420, onTick: { mood: 0.02, energy: 0.3 },
      },
      {
        id: 'snack', spot: 'desk', anim: 'idle', duration: [30, 50],
        log: 'snack', cooldown: 600, onTick: { mood: 0.02, satiety: 0.9 },
      },
      {
        id: 'nap', spot: 'bed', anim: 'sleep', duration: [900, 1500],
        log: 'nap', cooldown: 900, onTick: { energy: 0.02, satiety: -0.001 },
      },
      {
        id: 'sleep', spot: 'bed', anim: 'sleep', duration: [3600, 5400],
        log: 'sleep', cooldown: 0, onTick: { energy: 0.006, satiety: -0.0015 },
      },
    ]

    /** 运行时事件表：从数据载入后原地替换，引用（BEHAVIORS / BEHAVIOR_BY_ID）保持有效 */
    const BEHAVIORS = []
    const BEHAVIOR_BY_ID = Object.create(null)

    /**
     * 权重里能用的具名条件（固定词汇表，不写表达式）。
     * 数据里写 { "when": "moodLow", "mul": 1.35 }，这里负责判断真假。
     */
    const WEIGHT_VOCAB = {
      morning: (c, clock) => clock.hour > 6 && clock.hour < 10,
      workHours: (c, clock) => clock.hour > 8 && clock.hour < 22,
      evening: (c, clock) => clock.hour > 14 && clock.hour < 23,
      night: (c, clock) => clock.period === 'night' || clock.period === 'deepNight',
      daylight: (c, clock) => clock.daylight > 0.22,
      lampOn: (c, clock, props) => props.deskLamp === true,
      curtainClosed: (c, clock, props) => props.curtainOpen !== true,
      noLight: (c, clock, props) => !(props.deskLamp === true || clock.daylight > 0.3),
      hungry: (c) => c.satiety < 45,
      moodLow: (c) => c.mood < 60,
      moodVeryLow: (c) => c.mood < 55,
      energyLow: (c) => c.energy < 55,
      energyUnder35: (c) => c.energy < 35,
      energyVeryLow: (c) => c.energy < 22,
      energyHigh: (c) => c.energy > 72,
    }

    const SPOTS = {
      center: { fx: 5.2, fy: 9.4, scale: 1 },
      desk: { fx: 1.6, fy: 8.0, scale: 0.96 },
      window: { fx: 3.4, fy: 5.0, scale: 0.94 },
      bookshelf: { fx: 2.6, fy: 10.8, scale: 0.94 },
      bed: { fx: 4.4, fy: 8.0, scale: 0.98 },
      rug: { fx: 4.6, fy: 10.6, scale: 1 },
    }

    const DEFAULT_PROPS = {
      deskLamp: false,
      bedLamp: false,
      livingLamp: false,
      curtainOpen: true,
      // 双层窗帘：蓝帘在外、白纱在内，各自可以单独拉上
      curtainBlueClosed: false,
      curtainWhiteClosed: false,
      // 电视开着（点电视切换；看 TV 事件期间也算开着）
      tvOn: false,
      whaleOnBed: true,
    }

    /** 事件定义归一化：坏字段给安全默认值，缺 id / duration 的直接丢掉 */
    function normalizeEvent(raw) {
      if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || raw.id === '') return null
      const duration = Array.isArray(raw.duration) ? raw.duration.map(Number) : []
      const min = Number.isFinite(duration[0]) && duration[0] > 0 ? duration[0] : 60
      const max = Number.isFinite(duration[1]) && duration[1] > min ? duration[1] : min
      const tick = raw.onTick && typeof raw.onTick === 'object' ? raw.onTick : raw.perSecond
      const onTick = {}
      if (tick && typeof tick === 'object') {
        for (const key of ['energy', 'satiety', 'mood']) {
          const value = Number(tick[key])
          if (Number.isFinite(value) && value !== 0) onTick[key] = value
        }
      }
      return {
        ...raw,
        id: raw.id,
        kind: typeof raw.kind === 'string' && raw.kind !== '' ? raw.kind : 'autonomous',
        label: raw.label && typeof raw.label === 'object' ? raw.label : null,
        spot: typeof raw.spot === 'string' && SPOTS[raw.spot] ? raw.spot : 'center',
        anim: typeof raw.anim === 'string' && raw.anim !== '' ? raw.anim : 'idle',
        duration: [min, max],
        log: typeof raw.log === 'string' && raw.log !== '' ? raw.log : null,
        cooldown: Number.isFinite(Number(raw.cooldown)) ? Number(raw.cooldown) : 0,
        onTick,
        weight: raw.weight && typeof raw.weight === 'object' ? raw.weight : null,
        request: normalizeRequest(raw.request),
        say: normalizeSay(raw.say),
      }
    }

    /** 事件台词：chance 是触发概率（默认 0.4），lines 是可选台词 */
    function normalizeSay(raw) {
      if (!raw || typeof raw !== 'object') return null
      const lines = Array.isArray(raw.lines)
        ? raw.lines.filter((line) => line && (typeof line === 'string' || typeof line === 'object'))
        : []
      if (lines.length === 0) return null
      const chance = Number(raw.chance)
      return { chance: Number.isFinite(chance) ? Math.max(0, Math.min(1, chance)) : 0.4, lines }
    }

    /** 从事件台词里按语言挑一句 */
    function pickSay(event, locale) {
      const say = event && event.say
      if (!say || !Array.isArray(say.lines) || say.lines.length === 0) return ''
      const line = say.lines[Math.floor(Math.random() * say.lines.length)]
      if (typeof line === 'string') return line
      const zh = isZhLocale(locale)
      if (zh) return typeof line.zh === 'string' ? line.zh : ''
      return typeof line.en === 'string' ? line.en : (typeof line.zh === 'string' ? line.zh : '')
    }

    /** 用户请求配置：accept 是「什么情况下会答应」，refuse 是拒绝时说的话 / 动作 */
    function normalizeRequest(raw) {
      if (!raw || typeof raw !== 'object') return null
      const accept = Array.isArray(raw.accept)
        ? raw.accept.map((key) => String(key)).filter((key) => Object.prototype.hasOwnProperty.call(WEIGHT_VOCAB, key))
        : []
      const refuseRaw = raw.refuse && typeof raw.refuse === 'object' ? raw.refuse : {}
      const lines = Array.isArray(refuseRaw.lines)
        ? refuseRaw.lines.filter((line) => line && (typeof line === 'string' || typeof line === 'object'))
        : []
      return {
        accept,
        refuse: {
          lines,
          anim: typeof refuseRaw.anim === 'string' && refuseRaw.anim !== '' ? refuseRaw.anim : null,
          mood: Number.isFinite(Number(refuseRaw.mood)) ? Number(refuseRaw.mood) : 0,
        },
      }
    }

    /** 这个用户请求会不会被答应（没有 request 配置就一律答应） */
    function requestAccepted(event, character, clock, props) {
      const request = event && event.request
      if (!request) return true
      if (!Array.isArray(request.accept) || request.accept.length === 0) return true
      return request.accept.some((key) => {
        const check = WEIGHT_VOCAB[key]
        return typeof check === 'function' ? !!check(character, clock, props || {}) : false
      })
    }

    /** 拒绝时说的话（按语言取；没有配置就返回空串） */
    function refusalText(event, locale) {
      const request = event && event.request
      const lines = request && request.refuse && Array.isArray(request.refuse.lines) ? request.refuse.lines : []
      if (lines.length === 0) return ''
      const zh = isZhLocale(locale)
      const line = lines[Math.floor(Math.random() * lines.length)]
      if (typeof line === 'string') return line
      if (zh) return typeof line.zh === 'string' ? line.zh : ''
      return typeof line.en === 'string' ? line.en : (typeof line.zh === 'string' ? line.zh : '')
    }

    function replaceEvents(list) {
      BEHAVIORS.length = 0
      for (const key of Object.keys(BEHAVIOR_BY_ID)) delete BEHAVIOR_BY_ID[key]
      for (const event of list) {
        BEHAVIORS.push(event)
        BEHAVIOR_BY_ID[event.id] = event
      }
    }

    /** 载入事件表；数据为空/全坏时退回内置表 */
    function applyEvents(list) {
      const clean = (Array.isArray(list) ? list : []).map(normalizeEvent).filter(Boolean)
      replaceEvents(clean.length > 0 ? clean : DEFAULT_EVENTS.map(normalizeEvent).filter(Boolean))
      return BEHAVIORS
    }

    applyEvents(null)

    /**
     * 旧版按 id 调参的权重公式，保留为「数据里没写 weight 时」的默认值。
     * 数据里写了 weight: { base, mods } 就以数据为准。
     */
    function legacyWeight(id, character, clock, props) {
      const hour = clock.hour + clock.minute / 60
      const day = clock.daylight
      const sleepy = clock.sleepiness
      switch (id) {
        case 'idle':
          return 0.75
        case 'read':
          return (hour > 14 && hour < 23 ? 1.45 : 0.75) * (character.mood < 60 ? 1.35 : 1) *
            (character.energy > 12 ? 1 : 0.2)
        case 'work':
          return (hour > 8 && hour < 22 ? 1.1 : 0.35) *
            (props.deskLamp || day > 0.3 ? 1 : 0.6) * (character.energy > 20 ? 1 : 0.2)
        case 'window':
          return (day > 0.22 ? 1.15 : 0.15) * (props.curtainOpen ? 1.25 : 0.25)
        case 'play':
          return (character.mood < 55 ? 1.9 : 0.85) * (character.energy > 22 ? 1 : 0.12)
        case 'stretch':
          return (hour > 6 && hour < 10 ? 1.4 : 0.45) * (character.energy < 72 ? 1 : 0.55)
        case 'snack':
          return character.satiety < 45 ? 3.6 : 0.12
        case 'nap':
          return (character.energy < 55 ? 2.1 : 0.12) * (character.energy < 35 ? 2 : 1)
        case 'sleep': {
          // 白天不睡「大觉」：困意低（约 7:00-21:00）且没累垮时，睡整觉的权重直接归零，
          // 白天想睡就走 nap（打盹）。真的累垮（energy <= 30）才允许白天睡整觉。
          if (sleepy < 0.25 && character.energy > 30) return 0
          // 深夜（>=23:00 / 0:00-5:00 困意 >= 0.85）：按作息睡，不能因为精力好就不睡。
          // 精力只做小幅修正（已经睡饱了少睡点，但别完全不睡）
          if (sleepy >= 0.85) {
            const tired = character.energy < 55 ? 2.2 : 1
            return 12 * tired * (character.energy >= 96 ? 0.55 : 1)
          }
          const tired = character.energy < 55
            ? 1 + ((55 - character.energy) / 55) * 3
            : 1.1
          return (0.15 + sleepy * 2.4) * tired
        }
        default:
          return 0.2
      }
    }

    /** 数据驱动的权重：base 乘上一串具名修正 */
    function weightFromData(weight, character, clock, props) {
      let value = Number(weight.base)
      if (!Number.isFinite(value)) return null
      const mods = Array.isArray(weight.mods) ? weight.mods : []
      for (const mod of mods) {
        if (!mod || typeof mod.when !== 'string') continue
        const check = WEIGHT_VOCAB[mod.when]
        if (!check || !check(character, clock, props)) continue
        const mul = Number(mod.mul)
        if (Number.isFinite(mul)) value *= mul
      }
      return value
    }


    /* ---------------------------------------------------------------------
     * 小屋便条的回复（data/replies.json）
     *
     * 她先在屋里回一句，再去判断要不要把话送进会话——这样即使会话空闲、
     * 或者 noteMode 是 preview，你也能立刻看到她的反应。
     * ------------------------------------------------------------------- */

    /** 归一化 replies.json */
    function normalizeReplies(raw) {
      if (!raw || typeof raw !== 'object') return { rules: [], fallback: [] }
      const pickLines = (value) => (Array.isArray(value)
        ? value
          .filter((line) => line && (typeof line === 'string' || typeof line === 'object'))
          .map((line) => (typeof line === 'string' ? { zh: line, en: line } : line))
        : [])
      const rules = (Array.isArray(raw.rules) ? raw.rules : [])
        .filter((rule) => rule && typeof rule === 'object')
        .map((rule) => ({
          contains: (Array.isArray(rule.contains) ? rule.contains : []).filter((word) => typeof word === 'string' && word !== ''),
          behavior: typeof rule.behavior === 'string' && rule.behavior !== '' ? rule.behavior : null,
          say: pickLines(rule.say),
        }))
      return { rules, fallback: pickLines(raw.fallback) }
    }

    /** 按关键词挑一句回复：{ text, behavior } */
    function matchReply(doc, text, locale) {
      const source = doc && typeof doc === 'object' ? doc : { rules: [], fallback: [] }
      const lower = typeof text === 'string' ? text.toLowerCase() : ''
      const zh = isZhLocale(locale)
      const lineOf = (line) => {
        if (!line) return ''
        if (typeof line === 'string') return line
        const picked = zh ? line.zh : line.en
        return typeof picked === 'string' && picked !== '' ? picked : (typeof line.zh === 'string' ? line.zh : '')
      }
      const choose = (lines) => {
        if (!Array.isArray(lines) || lines.length === 0) return ''
        return lineOf(lines[Math.floor(Math.random() * lines.length)])
      }
      if (lower !== '') {
        for (const rule of Array.isArray(source.rules) ? source.rules : []) {
          if (!rule || !Array.isArray(rule.contains) || rule.contains.length === 0) continue
          if (!rule.contains.some((word) => lower.includes(String(word).toLowerCase()))) continue
          const text2 = choose(rule.say) || choose(source.fallback)
          return { text: text2, behavior: rule.behavior || null }
        }
      }
      return { text: choose(source.fallback), behavior: null }
    }
    /* ---------------------------------------------------------------------
     * DSH 会话活动（运行时注入，不进存档）
     *
     * Host 半把「有几个会话在跑、调了多少工具、有没有出错」聚合成快照，
     * Client 每次 tick 取回来后塞到这里；调度时用它修正权重：
     * 你在干活，她也会去书桌前忙；没人干活她就闲下来。
     * ------------------------------------------------------------------- */

    const activityRef = { current: null }

    /** 归一化 Host 返回的活动快照，形状不对就当没有 */
    function normalizeActivity(raw) {
      if (!raw || typeof raw !== 'object') return null
      const counters = raw.counters && typeof raw.counters === 'object' ? raw.counters : {}
      const pick = (key) => (Number.isFinite(Number(counters[key])) ? Number(counters[key]) : 0)
      const recent = Array.isArray(raw.recent)
        ? raw.recent
          .filter((item) => item && typeof item === 'object' && typeof item.kind === 'string')
          .slice(-8)
          .map((item) => ({ at: Number(item.at) || 0, kind: item.kind, detail: typeof item.detail === 'string' ? item.detail : '' }))
        : []
      return {
        running: Number.isFinite(Number(raw.running)) ? Number(raw.running) : 0,
        sessions: Number.isFinite(Number(raw.sessions)) ? Number(raw.sessions) : 0,
        counters: { messages: pick('messages'), tools: pick('tools'), errors: pick('errors'), workflows: pick('workflows'), subagents: pick('subagents') },
        recent,
        at: Date.now(),
        idleMs: Number.isFinite(Number(raw.idleMs)) ? Number(raw.idleMs) : -1,
        // 小屋便条的状态（预览/注入模式、待递张数）
        notes: raw.notes && typeof raw.notes === 'object'
          ? {
            mode: raw.notes.mode === 'inject' ? 'inject' : 'preview',
            pending: Number(raw.notes.pending) || 0,
            injected: Number(raw.notes.injected) || 0,
            preview: Number(raw.notes.preview) || 0,
            canInject: raw.notes.canInject === true,
            target: typeof raw.notes.target === 'string' ? raw.notes.target : '',
            targetId: typeof raw.notes.targetFull === 'string' ? raw.notes.targetFull : '',
            targetFresh: raw.notes.targetFresh === true,
            pinned: typeof raw.notes.pinned === 'string' ? raw.notes.pinned : '',
            lastReply: raw.notes.lastReply && typeof raw.notes.lastReply === 'object' && typeof raw.notes.lastReply.text === 'string'
              ? { at: Number(raw.notes.lastReply.at) || 0, text: raw.notes.lastReply.text.slice(0, 240) }
              : null,
            sessions: Array.isArray(raw.notes.sessions)
              ? raw.notes.sessions
                .filter((item) => item && typeof item.id === 'string')
                .slice(0, 12)
                .map((item) => ({
                  id: item.id,
                  label: typeof item.label === 'string' && item.label !== '' ? item.label : item.id.slice(0, 8),
                  running: item.running === true,
                }))
              : [],
          }
          : null,
      }
    }

    function setActivity(raw) {
      activityRef.current = raw === null ? null : normalizeActivity(raw)
      return activityRef.current
    }

    /** 会话活动对行为权重的修正：有人干活 → 偏向「工作」，别睡别发呆 */
    function activityWeightMul(behaviorId) {
      const activity = activityRef.current
      const running = activity && Number.isFinite(activity.running) ? activity.running : 0
      if (running <= 0) return 1
      if (behaviorId === 'work') return 1.8 + Math.min(3, running) * 0.9
      if (behaviorId === 'read') return 1.35
      if (behaviorId === 'idle') return 0.4
      if (behaviorId === 'sleep' || behaviorId === 'nap') return 0.18
      return 1
    }

    function behaviorWeight(behavior, character, clock, props) {
      if (behavior && behavior.weight) {
        const fromData = weightFromData(behavior.weight, character, clock, props)
        if (fromData !== null) return fromData
      }
      return legacyWeight(behavior ? behavior.id : '', character, clock, props)
    }

    function pickBehavior(home, clock, props, now) {
      const character = home.character
      const at = Number.isFinite(now) ? now : Date.now()
      const candidates = []
      for (const behavior of BEHAVIORS) {
        // 冷却时间用模拟时间比较，离线结算时才不会把“未来”当成当前
        const cooldownUntil = character.cooldowns[behavior.id] || 0
        // 深夜的睡意压过冷却：否则白天残留的「睡醒冷却」会让她凌晨两点还在屋里溜达
        const deepNightSleep = behavior.id === 'sleep' && clock.sleepiness >= 0.85
        if (cooldownUntil > at && !deepNightSleep) continue
        let weight = behaviorWeight(behavior, character, clock, props)
        // 有会话在跑 → 她也会坐去书桌前忙
        weight *= activityWeightMul(behavior.id)
        if (character.behaviorId === behavior.id) weight *= 0.35
        weight *= 0.72 + Math.random() * 0.56
        if (weight > 0) candidates.push({ behavior, weight })
      }
      if (candidates.length === 0) return BEHAVIOR_BY_ID.idle
      let total = 0
      for (const candidate of candidates) total += candidate.weight
      let roll = Math.random() * total
      for (const candidate of candidates) {
        roll -= candidate.weight
        if (roll <= 0) return candidate.behavior
      }
      return candidates[candidates.length - 1].behavior
    }

    function pickDuration(behavior) {
      const [min, max] = behavior.duration
      return (min + Math.random() * (max - min)) * 1000
    }

    /** 同一个事件连续发生（中间没有别的事件）时不重复记日志；隔了 20 分钟以上才算新一轮 */
    const LOG_DEDUPE_MS = 20 * 60 * 1000

    /**
     * 每种日志的最小间隔（毫秒）。同一种事件在这段时间内重复出现就不再记录——
     * 不然「工作 → 看书 → 工作」这种节奏会把日志刷满，把真正有意义的事挤掉。
     */
    const LOG_WINDOWS = {
      work: 60 * 60 * 1000,
      idle: 60 * 60 * 1000,
      nap: 60 * 60 * 1000,
      cook: 60 * 60 * 1000,
      watch_tv: 60 * 60 * 1000,
      read: 45 * 60 * 1000,
      window: 45 * 60 * 1000,
      play: 45 * 60 * 1000,
      snack: 45 * 60 * 1000,
      stretch: 45 * 60 * 1000,
      sit: 45 * 60 * 1000,
      sofa_play: 45 * 60 * 1000,
      // 这几类必须每次都记：睡眠、醒来、便条、会话起停、出错
      sleep: 0,
      wake: 0,
      eat: 0,
      boot: 0,
      offline: 0,
      // 会话起停会随「一轮结束 / 下一轮开始」抖动，5 分钟内只记一条；出错仍每次都记
      sessionStart: 5 * 60 * 1000,
      sessionEnd: 5 * 60 * 1000,
      sessionError: 0,
      noteQueued: 0,
      noteReply: 0,
      noteDelivered: 0,
      agentReply: 0,
    }
    const LOG_DEDUPE_DEFAULT = 20 * 60 * 1000

    function pushLog(home, at, code, arg) {
      const window = LOG_WINDOWS[code] !== undefined ? LOG_WINDOWS[code] : LOG_DEDUPE_DEFAULT
      if (window > 0) {
        // log 是倒序的，遇到比自己更早的记录就可以停
        for (const entry of home.log) {
          if (entry.code !== code) {
            if (at - entry.at >= window) break
            continue
          }
          if (at - entry.at < window) return
          break
        }
      }
      home.log.unshift({ at, code, arg: arg === undefined ? null : arg })
      if (home.log.length > MAX_LOG) home.log.length = MAX_LOG
    }

    function enterBehavior(home, behavior, now) {
      const character = home.character
      // 同一个事件接着再来一次（中间没换过别的事件）就不再记日志
      const repeat = character.lastEventId === behavior.id &&
        Number.isFinite(character.lastEventAt) && now - character.lastEventAt < LOG_DEDUPE_MS
      character.behaviorId = behavior.id
      character.since = now
      character.until = now + pickDuration(behavior)
      if (behavior.log && !repeat) pushLog(home, now, behavior.log, null)
      character.lastEventId = behavior.id
      character.lastEventAt = now
      if (behavior.cooldown) character.cooldowns[behavior.id] = now + behavior.cooldown * 1000
    }

    function createHome(now, characterName) {
      const behavior = BEHAVIOR_BY_ID.idle || BEHAVIORS[0] || null
      const name = characterName || '大肥鱼'
      return {
        kind: 'fishhome-state',
        version: MODEL_VERSION,
        createdAt: now,
        updatedAt: now,
        // 三个可编辑的名字：称呼（别人怎么叫它）、自称（它怎么称自己）、房间名
        characterName: name,
        selfName: '我',
        // 她怎么称呼用户（默认「用户」），可改
        userName: '用户',
        roomName: `${name}的小屋`,
        // 人工指定的便条目标会话（跟着存档走，重启后还能记住）
        noteTarget: '',
        world: {
          season: seasonOf(new Date(now)),
          period: periodOf(new Date(now).getHours()),
          temperature: indoorTemperature(seasonOf(new Date(now))),
          map: '',
        mapName: '',
        props: { ...DEFAULT_PROPS },
        },
        character: {
          energy: 72,
          satiety: 66,
          mood: 78,
          behaviorId: behavior.id,
          since: now,
          until: now + pickDuration(behavior),
          cooldowns: {},
          emote: null,
          say: null,
          patCount: 0,
        },
        log: [
          { at: now, code: 'boot', arg: null },
        ],
        stats: { daysLived: 1 },
      }
    }

    function finiteOr(value, fallback) {
      return Number.isFinite(value) ? value : fallback
    }

    function clampCharacter(character) {
      character.energy = clamp01(finiteOr(character.energy, 72) / 100) * 100
      character.satiety = clamp01(finiteOr(character.satiety, 66) / 100) * 100
      character.mood = clamp01(finiteOr(character.mood, 78) / 100) * 100
      character.patCount = Number.isFinite(character.patCount) ? character.patCount : 0
      if (!BEHAVIOR_BY_ID[character.behaviorId]) character.behaviorId = 'idle'
      if (!Number.isFinite(character.since)) character.since = Date.now()
      if (!Number.isFinite(character.until)) character.until = character.since + 60000
      if (!character.cooldowns || typeof character.cooldowns !== 'object') character.cooldowns = {}
      if (character.emote && !Number.isFinite(character.emote.until)) character.emote = null
      return character
    }

    /**
     * 台词 / 日志里的占位符：
     *   {user} 她怎么叫用户（默认「用户」）
     *   {name} 用户怎么叫她（characterName）
     *   {self} 她怎么自称（selfName）
     */
    function fillText(text, home) {
      if (typeof text !== 'string' || text === '') return ''
      const user = (home && home.userName) || '用户'
      const name = (home && home.characterName) || ''
      const self = (home && home.selfName) || '我'
      return text
        .replace(/\{user\}/g, user)
        .replace(/\{name\}/g, name)
        .replace(/\{self\}/g, self)
    }

    function normalizeHome(raw, now, fallbackName) {
      const home = createHome(now, fallbackName)
      if (!raw || typeof raw !== 'object') return home
      home.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : now
      home.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : now
      home.characterName = typeof raw.characterName === 'string' && raw.characterName.trim() !== ''
        ? raw.characterName.trim()
        : (fallbackName || home.characterName)
      // 自称与房间名：老存档没有这两项，用默认值补上
      home.selfName = typeof raw.selfName === 'string' && raw.selfName.trim() !== ''
        ? raw.selfName.trim()
        : home.selfName
      home.userName = typeof raw.userName === 'string' && raw.userName.trim() !== ''
        ? raw.userName.trim()
        : home.userName
      home.noteTarget = typeof raw.noteTarget === 'string' ? raw.noteTarget : ''
      home.roomName = typeof raw.roomName === 'string' && raw.roomName.trim() !== ''
        ? raw.roomName.trim()
        : `${home.characterName}的小屋`
      const world = raw.world && typeof raw.world === 'object' ? raw.world : {}
      home.world = {
        season: SEASONS.includes(world.season) ? world.season : seasonOf(new Date(now)),
        period: typeof world.period === 'string' ? world.period : periodOf(new Date(now).getHours()),
        temperature: Number.isFinite(world.temperature) ? world.temperature : indoorTemperature(seasonOf(new Date(now))),
        // 她人现在在哪个场景（和「用户正在看哪个场景」是两回事）
        map: typeof world.map === 'string' && world.map !== '' ? world.map : home.world.map,
        mapName: typeof world.mapName === 'string' && world.mapName !== '' ? world.mapName : home.world.mapName,
        props: { ...DEFAULT_PROPS, ...(world.props && typeof world.props === 'object' ? world.props : {}) },
      }
      if (raw.character && typeof raw.character === 'object') {
        home.character = clampCharacter({ ...home.character, ...raw.character })
        if (!home.character.emote) home.character.emote = null
      }
      if (Array.isArray(raw.log)) {
        home.log = raw.log
          .filter((entry) => entry && typeof entry.code === 'string' && Number.isFinite(entry.at))
          .slice(0, MAX_LOG)
      }
      if (raw.stats && typeof raw.stats === 'object') {
        home.stats = {
          daysLived: Math.max(1, Math.floor((now - home.createdAt) / 86400000) + 1),
        }
      }
      return home
    }

    /** 一次模拟步：结束旧行为、结算衰减、必要时挑选新行为。纯函数式地改 home。 */
    function stepHome(home, now, dtOverride) {
      const previous = home.updatedAt
      const gapMs = now - previous
      const dt = clampNumber(
        dtOverride === undefined ? gapMs / 1000 : dtOverride,
        0,
        Math.max(1, gapMs / 1000),
      )
      if (!Number.isFinite(dt) || dt <= 0) {
        home.updatedAt = Math.max(previous, now)
        return home
      }
      const date = new Date(now)
      const clock = timeSnapshot(date, 'zh')
      home.world.season = clock.season
      home.world.period = clock.period
      home.world.temperature = indoorTemperature(clock.season)

      const behavior = BEHAVIOR_BY_ID[home.character.behaviorId] || BEHAVIOR_BY_ID.idle
      const character = home.character

      // 连续衰减与行为效果
      character.satiety -= 0.0026 * dt
      if (behavior.id !== 'sleep' && behavior.id !== 'nap') character.energy -= 0.0016 * dt
      for (const key of ['energy', 'satiety', 'mood']) {
        const delta = behavior.onTick && behavior.onTick[key]
        if (typeof delta === 'number') character[key] += delta * dt
      }
      character.mood += (60 - character.mood) * 0.00035 * dt
      if (character.emote && character.emote.until <= now) character.emote = null
      // 小动静：发呆时偶尔伸个懒腰 / 晃两下，不影响当前事件
      if (!character.emote && behavior.id !== 'sleep' && behavior.id !== 'nap' && dt > 0 && dt < 120) {
        const rhythm = behavior.id === 'idle' ? 42 : 110
        if (Math.random() < dt / rhythm) {
          character.emote = {
            tag: Math.random() < 0.65 ? 'stretch' : 'play',
            until: now + 1100 + Math.random() * 900,
          }
        }
      }

      // 睡饱了会自己起来（并让睡眠冷却一会儿，避免“刚醒又睡”）；
      // 没睡够就翻个身接着睡，而不是被计时器叫起来。
      if (behavior.id === 'sleep' && character.energy >= 98 && clock.sleepiness < 0.5) {
        character.energy = 100
        character.cooldowns.sleep = now + 3 * 3600 * 1000
        pushLog(home, now, 'wake', null)
        enterBehavior(home, pickBehavior(home, clock, home.world.props, now), now)
      } else if (behavior.id === 'sleep' && character.energy >= 98) {
        // 夜里（含清晨 5-7 点）睡饱了也接着睡，等困意真正退了才起
        character.energy = 100
        character.until = now + 1800 * 1000
      } else if (behavior.id === 'nap' && character.energy >= 92) {
        character.cooldowns.nap = now + 45 * 60 * 1000
        pushLog(home, now, 'wake', null)
        enterBehavior(home, pickBehavior(home, clock, home.world.props, now), now)
      } else if (behavior.id === 'sleep' && now >= character.until && character.energy < 96 &&
        (clock.sleepiness > 0.35 || character.energy < 58)) {
        character.until = now + 1800 * 1000
      } else if (now >= character.until) {
        enterBehavior(home, pickBehavior(home, clock, home.world.props, now), now)
      }

      clampCharacter(character)
      home.updatedAt = now
      home.stats.daysLived = Math.max(1, Math.floor((now - home.createdAt) / 86400000) + 1)
      return home
    }

    /**
     * 离线结算：不逐帧补，只用粗粒度步长补一段有限时间，
     * 并把期间发生的可记录事件写进日志（时间戳是模拟出来的）。
     */
    function settleOffline(home, now) {
      const gap = now - home.updatedAt
      if (!Number.isFinite(gap) || gap < OFFLINE_MIN_GAP_MS) return false
      const capped = Math.min(gap, OFFLINE_CAP_MS)
      let cursor = now - capped
      let steps = 0
      while (cursor < now && steps < 220) {
        const next = Math.min(now, cursor + OFFLINE_STEP_MS)
        stepHome(home, next, (next - cursor) / 1000)
        cursor = next
        steps += 1
      }
      home.updatedAt = now
      pushLog(home, now, 'offline', { minutes: Math.round(capped / 60000), capped: gap > capped })
      // 隔了两小时以上才打招呼，不然太吵
      if (gap >= 2 * 3600 * 1000) {
        const hour = new Date(now).getHours()
        const code = hour >= 5 && hour < 11 ? 'backMorning' : (hour >= 21 || hour < 5 ? 'backNight' : 'back')
        home.character.say = { code, text: null, until: now + 4500 }
        home.character.emote = { tag: 'stretch', until: now + 2600 }
      }
      return true
    }

    /* ======================================================================
     * 3. 角色包：把动画标签解析成可播放的帧序列
     * ==================================================================== */

    const ANIM_TAGS = {
      idle: ['idle'],
      walk: ['walk', 'moving'],
      read: ['read'],
      work: ['working', 'writing', 'typing'],
      play: ['success', 'happy'],
      stretch: ['greeting', 'stretch'],
      sleep: ['sleep'],
    }

    function findAnimation(animations, tag) {
      const tags = ANIM_TAGS[tag] || [tag]
      for (const wanted of tags) {
        const direct = animations.find((anim) => (anim.tags || []).includes(wanted))
        if (direct) return direct
      }
      for (const wanted of tags) {
        const byId = animations.find((anim) => typeof anim.id === 'string' && anim.id.endsWith(`:${wanted}`))
        if (byId) return byId
      }
      return null
    }

    function buildAnimationView(animations, assets, tag, cell) {
      const anim = findAnimation(animations, tag) || findAnimation(animations, 'idle') || animations[0]
      if (!anim || !Array.isArray(anim.frames) || anim.frames.length === 0) return null
      const frames = []
      for (const frame of anim.frames) {
        const asset = assets[frame.asset]
        if (!asset || typeof asset.path !== 'string') continue
        const rect = Array.isArray(frame.rect) ? frame.rect : null
        const x = rect ? rect[0] : 0
        const y = rect ? rect[1] : 0
        const w = rect ? rect[2] : asset.width
        const hh = rect ? rect[3] : asset.height
        if (!(w > 0 && hh > 0)) continue
        frames.push({
          url: `${ROUTE}/pack/${encodeURIComponent(asset.path)}${anim.version ? `?v=${encodeURIComponent(anim.version)}` : ''}`,
          // 帧在精灵图上的裁剪框 + 整张图尺寸，SVG 端用嵌套 viewBox 裁切
          rect: { x, y, w, h: hh },
          sheet: { w: asset.width, h: asset.height },
          ms: clampNumber(frame.durationMs, 60, 6000, 400),
          // squash：这一帧把显示高度压掉几个像素（做吃饭/呼吸的小起伏）
          squash: Number(frame.squash) > 0 ? Number(frame.squash) : 0,
        })
      }
      if (frames.length === 0) return null
      // 显示尺寸统一按「格子」算，避免逐帧换宽高比导致小人忽大忽小；
      // 动画可以自带 cell（比如 45° 那张图纸格子是 256×342），不写就用 pet 的默认格子
      const first = frames[0]
      const ownCell = Array.isArray(anim.cell) && anim.cell.length >= 2
        ? { width: Number(anim.cell[0]), height: Number(anim.cell[1]) }
        : null
      const useCell = ownCell && ownCell.width > 0 && ownCell.height > 0 ? ownCell : cell
      const cellW = useCell && Number(useCell.width) > 0 ? Number(useCell.width) : first.rect.w
      const cellH = useCell && Number(useCell.height) > 0 ? Number(useCell.height) : first.rect.h
      // bubble：思考气泡是单独素材，挂在动作上，渲染时画在头顶
      const bubbleSrc = anim.bubble && typeof anim.bubble.src === 'string' ? anim.bubble.src : ''
      const bubble = bubbleSrc
        ? {
          url: `${ROUTE}/pack/${encodeURIComponent(bubbleSrc)}${anim.version ? `?v=${encodeURIComponent(anim.version)}` : ''}`,
          size: Number(anim.bubble.size) > 0 ? Number(anim.bubble.size) : 120,
          dx: Number.isFinite(Number(anim.bubble.dx)) ? Number(anim.bubble.dx) : 0,
          dy: Number.isFinite(Number(anim.bubble.dy)) ? Number(anim.bubble.dy) : 0,
          aspect: Number(anim.bubble.aspect) > 0 ? Number(anim.bubble.aspect) : 0.8,
        }
        : null
      // scale：整套图纸里人物占格子的比例不同（比如 45° 那张带思考泡泡，格子更大），
      // 用它把显示尺寸拉回和站着时一致
      const scale = Number(anim.scale) > 0 ? Number(anim.scale) : 1
      return {
        key: anim.id || tag,
        frames,
        cell: { w: cellW, h: cellH },
        scale,
        // randomStart：每次出现随机挑一帧（点心就是随机出一种）
        bubble,
        randomStart: anim.randomStart === true,
        // hold：停在当前帧不往下走
        hold: anim.hold === true,
        // groupSize：帧按组循环（比如每种食物 2 帧：正常 + 压 5px），
        // 配合 randomStart 就是「随机出一种食物，然后只在这两帧之间起伏」
        groupSize: Number(anim.groupSize) > 1 ? Math.round(Number(anim.groupSize)) : 1,
      }
    }

    /* ======================================================================
     * 存档适配 + 角色包载入（Host 文件优先，localStorage 兜底）
     * ==================================================================== */

    /* ======================================================================
     * 4. 存档适配：Host 文件优先，localStorage 兜底
     * ==================================================================== */

    async function fetchJson(url, init) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null
      try {
        const response = await fetch(url, {
          ...init,
          signal: controller ? controller.signal : undefined,
          headers: { accept: 'application/json', ...(init && init.headers ? init.headers : {}) },
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return await response.json()
      } finally {
        if (timer !== null) clearTimeout(timer)
      }
    }

    /** 载入小屋便条的回复表（data/replies.json）；拿不到就用空表 */
    async function loadReplies() {
      try {
        const payload = await fetchJson(`${ROUTE}/data/replies.json`)
        return normalizeReplies(payload)
      } catch {
        return { rules: [], fallback: [] }
      }
    }

    async function readSave() {
      try {
        const payload = await fetchJson(`${ROUTE}/api/state`)
        if (payload && payload.state) return payload.state
        if (payload && payload.corrupt) return readLocalSave()
      } catch {
        return readLocalSave()
      }
      return readLocalSave()
    }

    function readLocalSave() {
      try {
        const raw = window.localStorage.getItem(LS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && parsed.kind === 'fishhome-state' ? parsed : null
      } catch {
        return null
      }
    }

    function writeLocalSave(home) {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(home))
      } catch {
        /* 存不进去就只留内存状态 */
      }
    }

    /**
 * 角色动作：优先读角色包里的 actions/ 目录（一个动作一个文件 + index.json），
 * 没有就退回整张 animations.json（老格式）。
 */
async function loadCharacterActions(pack) {
  // 素材会被同名覆盖，用角色包版本号做缓存戳，换图后不用清浏览器缓存
  const stamp = pack && typeof pack.version === 'string' && pack.version !== '' ? `?v=${encodeURIComponent(pack.version)}` : ''
  try {
    const index = await fetchJson(`${ROUTE}/pack/actions/index.json${stamp}`)
    const names = Array.isArray(index && index.actions) ? index.actions : []
    const list = []
    for (const name of names) {
      if (typeof name !== 'string' || name === '') continue
      try {
        const action = await fetchJson(`${ROUTE}/pack/actions/${encodeURIComponent(name)}.json${stamp}`)
        if (!action || !Array.isArray(action.frames) || action.frames.length === 0) continue
        list.push({
          id: `action:${action.id || name}`,
          name: action.name || action.id || name,
          tags: Array.isArray(action.tags) ? action.tags : [action.id || name],
          // 动作可以自带显示格（图纸格子比例不同时用），必须带下去
          cell: Array.isArray(action.cell) && action.cell.length >= 2 ? action.cell : undefined,
          version: stamp ? stamp.slice(3) : undefined,
          scale: Number(action.scale) > 0 ? Number(action.scale) : undefined,
          randomStart: action.randomStart === true ? true : undefined,
          hold: action.hold === true ? true : undefined,
          groupSize: Number(action.groupSize) > 1 ? Number(action.groupSize) : undefined,
          bubble: action.bubble && typeof action.bubble === 'object' ? action.bubble : undefined,
          frames: action.frames.map((frame) => ({
            asset: frame.asset || action.asset || 'sheet',
            rect: frame.rect,
            durationMs: frame.durationMs,
            squash: Number(frame.squash) > 0 ? Number(frame.squash) : 0,
          })),
        })
      } catch {
        /* 单个动作坏了跳过 */
      }
    }
    if (list.length > 0) return list
  } catch {
    /* 没有 actions 目录，走老格式 */
  }
  try {
    const animationsFile = encodeURIComponent((pack && pack.animations) || 'animations.json')
    const animations = await fetchJson(`${ROUTE}/pack/${animationsFile}${stamp}`)
    return Array.isArray(animations) ? animations : []
  } catch {
    return []
  }
}

async function writeSave(home) {
      writeLocalSave(home)
      try {
        const response = await fetch(`${ROUTE}/api/state`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(home),
        })
        return response.ok
      } catch {
        return false
      }
    }

    /* ======================================================================
     * 5. HomeStore：把模型、存档和订阅串起来
     * ==================================================================== */

    /** 素材图 rect 的指纹：同尺寸的多个 part（不同状态）视为一组 */
    function spriteRectSignature(sprite) {
      return Array.isArray(sprite && sprite.rect) ? sprite.rect.map(Number).join(",") : ""
    }

    /** 事件表的默认清单（scene.json 没写 events 时用） */
    const EVENT_IDS = ['idle', 'read', 'work', 'window', 'play', 'stretch', 'snack', 'nap', 'sleep']

    /** 深拷贝（场景数据都是纯 JSON，没有函数/循环引用） */
    function cloneJson(value) {
      return value === undefined ? value : JSON.parse(JSON.stringify(value))
    }
    /* ======================================================================
     * 4. HomeStore 核心：状态、订阅、启动、时钟
     *    其余能力按职责挂在 store-scene / store-edit / store-view（见下）
     * ==================================================================== */


    class HomeStore {
      constructor() {
        this.home = null
        // DSH 会话活动（运行时，不存档）
        this.activity = null
        // 便条回复表（data/replies.json）
        this.replies = { rules: [], fallback: [] }
        // 客户端 sessions 服务（有它就能像聊天框一样把话发进会话）
        this.clientSessions = null
        this.activityBusy = false
        this.meta = null
        this.animations = null
        this.packViews = null
        this.phase = 'loading'
        this.error = null
        this.sceneWarning = null
        this.saveState = 'idle'
        this.mapPath = null
        this.furnitureSource = null
        this.sceneDoc = null
        this.sceneSource = null
        this.sceneDirty = false
        this.removedFurniture = []
      this.history = []
      this.historyKey = ''
      this.historyAt = 0
        this.listeners = new Set()
        this.timer = null
        this.saveTimer = null
        this.saving = false
        this.pendingSave = false
        this.snapshot = {
          phase: 'loading',
          error: null,
          home: null,
          now: Date.now(),
          meta: null,
          views: null,
          saveState: 'idle',
          lastSavedAt: 0,
        }
      }

      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      }

      getSnapshot() {
        return this.snapshot
      }

      publish() {
        this.snapshot = {
          phase: this.phase,
          error: this.error,
          home: this.home,
          now: Date.now(),
          meta: this.meta,
          views: this.packViews,
          activity: this.activity,
          saveState: this.saveState,
          lastSavedAt: this.lastSavedAt || 0,
        }
        for (const listener of this.listeners) listener(this.snapshot)
      }

      start() {
        if (this.timer !== null) return
        this.timer = setInterval(() => this.tick(), TICK_MS)
        void this.boot()
      }

      stop() {
        if (this.timer !== null) clearInterval(this.timer)
        if (this.saveTimer !== null) clearTimeout(this.saveTimer)
        this.timer = null
        this.saveTimer = null
        if (this.home) void writeSave(this.home)
      }

      async boot() {
        this.phase = 'loading'
        this.error = null
        this.publish()
        try {
          const meta = await fetchJson(`${ROUTE}/api/meta`)
          if (!meta || !meta.ok) throw new Error('家园服务没有响应')
          this.meta = meta
          // 先读存档：优先打开「她所在的场景」，其次才是上次看的场景
          const savedEarly = await readSave()
          const herMap = savedEarly && savedEarly.world && typeof savedEarly.world.map === 'string' ? savedEarly.world.map : ''
          const remembered = this.currentMap()
          meta.map = herMap || remembered || meta.map
          // mapPath 也要跟着改，否则 Host 给的还是配置里的默认场景
          meta.mapPath = `maps/${meta.map}/scene.json`
          await this.loadScene(meta)
          // 角色包缺失不拦启动：角色会画成占位块，方便先调房间和逻辑
          if (meta.pack) {
            this.animations = await loadCharacterActions(meta.pack)
        this.replies = await loadReplies()
        void this.restoreNoteTarget()
            this.packWarning = null
          } else {
            this.animations = []
            this.packWarning = '角色包没有就绪：角色先用占位块'
          }
          this.packViews = this.buildViews()
          const saved = savedEarly
          const now = Date.now()
          this.home = normalizeHome(saved, now, meta.characterName)
          // 老存档没有 world.map：就认为她一直在当前场景
          if (!this.home.world.map) this.home.world.map = meta.map || 'bedroom'
          settleOffline(this.home, now)
          this.lastSavedAt = meta.savedAt || 0
          this.phase = 'ready'
          this.publish()
          this.scheduleSave()
        } catch (error) {
          this.phase = 'error'
          this.error = error instanceof Error ? error.message : String(error)
          this.publish()
        }
      }
    }
    /* ======================================================================
     * 场景切换：地图列表 / 载入 / 她人在哪个房间
     * ==================================================================== */

    const SCENE_METHODS = {
      /**
       * 读场景定义（scene.json + background.json）。
       * 读不到就退回内置默认房间，不让整块面板挂掉。
       */
      /** 点门出门：切到另一个场景（她自己留不留下由 bringPetHere 决定） */
      async gotoScene(mapId) {
        if (typeof mapId !== 'string' || mapId === '') return false
        const now = Date.now()
        if (this.home) {
          // 点门 = 你要去别的屋：她抬头看一眼，记一条日志
          pushLog(this.home, now, 'roomOut', { map: mapId })
          if (this.home.character) {
            this.home.character.emote = { tag: 'walk', until: now + 1400 }
            const translate = makeTranslate(localeRef.value)
            this.home.character.say = { text: fillText(translate('door.leave'), this.home), until: now + 2600 }
          }
          this.publish()
        }
        await this.setMap(mapId)
        return true
      },
      /** 当前场景 id（localStorage 记住，下次打开还是它） */
      currentMap() {
        try {
          const saved = window.localStorage.getItem(`${LS_KEY}:map`)
          if (typeof saved === 'string' && saved !== '') return saved
        } catch {
          /* 隐私模式忽略 */
        }
        return ''
      },
      /** 切场景：重新拉 scene/background/furniture/events */
      async setMap(mapId) {
        if (typeof mapId !== 'string' || mapId === '') return false
        try {
          window.localStorage.setItem(`${LS_KEY}:map`, mapId)
        } catch {
          /* 忽略 */
        }
        // 注意：这里只换「你在看哪」，不改变 home.world.map——她留在原地
        this.history = []
        const loaded = await this.loadScene({ map: mapId })
        // 被后一次切换顶掉（晚到的响应）就别改面板上的场景下拉了
        if (loaded !== true) return false
        // meta 也更新一份，面板上的场景下拉才会跟着变
        this.meta = { ...(this.meta || {}), map: mapId, mapPath: `maps/${mapId}/scene.json` }
        this.publish()
        return true
      },
      /** data/maps 下有哪些场景（Host 提供；老版本 Host 没有这个接口就只会返回当前场景） */
      async loadMaps() {
        try {
          const data = await fetchJson(`${ROUTE}/api/maps`)
          if (Array.isArray(data && data.maps) && data.maps.length > 0) return data.maps
        } catch {
          /* 老 Host 没有这个接口 */
        }
        // 退回数据文件：data/maps/index.json（不用重启 Host 也能切场景）
        try {
          const fallback = await fetchJson(`${ROUTE}/data/maps/index.json`)
          if (Array.isArray(fallback && fallback.maps) && fallback.maps.length > 0) return fallback.maps
        } catch {
          /* 也没有就只显示当前场景 */
        }
        return []
      },
      async loadScene(meta) {
        // 竞态保护：连续切房间时只认最后一次加载。
        // 而且「先全部读完、最后一次性落地」，避免半新半旧——否则会出现「卧室的场景 + 客厅的落地窗」。
        const token = (this.sceneToken || 0) + 1
        this.sceneToken = token
        const alive = () => this.sceneToken === token
        const mapPath = typeof meta.mapPath === 'string' && meta.mapPath !== ''
          ? meta.mapPath
          : `maps/${typeof meta.map === 'string' && meta.map !== '' ? meta.map : 'bedroom'}/scene.json`
        this.mapPath = mapPath
        try {
          const scene = await fetchJson(`${ROUTE}/data/${mapPath}`)
          if (!alive()) return false
          const bgFile = scene && typeof scene.background === 'string' && scene.background !== ''
            ? scene.background
            : 'background.json'
          const bgPath = resolveDataPath(mapPath, bgFile)
          const bg = await fetchJson(`${ROUTE}/data/${bgPath}`)
          if (!alive()) return false
          // 家具：一件一个文件，坏了一件就跳过，不影响其它
          const list = scene && Array.isArray(scene.furniture) ? scene.furniture : []
          const defs = await Promise.all(list.map(async (id) => {
            if (typeof id !== 'string' || id === '') return null
            try {
              return await fetchJson(`${ROUTE}/data/${resolveDataPath(mapPath, `furniture/${id}.json`)}`)
            } catch {
              return null
            }
          }))
          if (!alive()) return false
          // 事件：同样一件一个文件；全读不到就用内置事件表
          const eventList = scene && Array.isArray(scene.events) && scene.events.length > 0
            ? scene.events
            : EVENT_IDS
          const eventDefs = await Promise.all(eventList.map(async (id) => {
            if (typeof id !== 'string' || id === '') return null
            try {
              return await fetchJson(`${ROUTE}/data/${resolveDataPath(mapPath, `events/${id}.json`)}`)
            } catch {
              return null
            }
          }))
          if (!alive()) return false
          // ---- 到这里才开始落地：场景 / 背景 / 家具 / 事件一起换 ----
          const loaded = defs.filter(Boolean)
          const loadedEvents = eventDefs.filter(Boolean)
          // 给每件家具记上归属场景：渲染时只画本场景的，防止任何路径把旧房间的家具混进来
          const sceneId = scene && typeof scene.id === 'string' ? scene.id : ''
          if (sceneId) for (const def of loaded) def.__scene = sceneId
          applyScene(scene)
          applyBackground(bg)
          applyFurniture(loaded)
          applyEvents(loadedEvents)
          // 如果加载的正好是她所在的场景，记住名字（切到别的房间时用来提示）
          if (this.home && this.home.world && scene && scene.id === this.home.world.map) {
            this.home.world.mapName = (scene.name && (scene.name.zh || scene.name.en)) || scene.id
          }
          this.furnitureSource = cloneJson(loaded)
          // 记住 scene.json 原文：增删家具要同步它的 furniture 清单
          this.sceneDoc = cloneJson(scene) || null
          this.sceneSource = cloneJson(scene) || null
          this.sceneDirty = false
          this.removedFurniture = []
          this.eventsSource = cloneJson(loadedEvents)
          this.sceneWarning = null
          return true
        } catch (error) {
          if (!alive()) return false
          applyScene(null)
          applyBackground(null)
          this.sceneWarning = error instanceof Error ? error.message : String(error)
          return false
        }
      },
      furnitureUrl(id) {
        return `${ROUTE}/data/${resolveDataPath(this.mapPath || 'maps/bedroom/scene.json', `furniture/${id}.json`)}`
      },
      /** 某个互动物在画面上的 x（用来决定往哪边偏头）。interact 的 target 和数据的 click 不是一套名字，这里做映射 */
      targetScreenX(target) {
        const aliases = {
          desk: ['work', 'desk'],
          work: ['work', 'desk'],
          bookshelf: ['read', 'shelf'],
          read: ['read', 'shelf'],
          window: ['window', 'curtainOpen'],
          curtain: ['curtainOpen', 'window'],
          bed: ['bed'],
          deskLamp: ['deskLamp', 'lamp'],
          bedLamp: ['bedLamp'],
          whale: ['play', 'whale'],
          play: ['play', 'whale'],
        }[target] || [target]
        for (const def of furnitureRef.value) {
          const click = def.click || {}
          const keys = [def.id, click.id, click.key].filter(Boolean)
          if (!keys.some((key) => aliases.includes(key))) continue
          const part = (def.parts || []).find((item) => item.sprite && Array.isArray(item.sprite.rect))
          if (part) return Number(part.sprite.rect[0]) + Number(part.sprite.rect[2]) / 2
        }
        return null
      },
      /** 角色当前站在画面的 x */
      characterScreenX() {
        const behavior = BEHAVIOR_BY_ID[this.home.character.behaviorId] || BEHAVIOR_BY_ID.idle
        const spot = SPOTS[behavior.spot] || SPOTS.center
        return project(spot.fx, spot.fy)[0]
      },
      /** 往 target 偏一下头（dir = 1 右 / -1 左） */
      leanToward(target) {
        const targetX = typeof target === 'number' ? target : this.targetScreenX(target)
        const selfX = this.characterScreenX()
        if (!Number.isFinite(targetX)) return
        const dir = targetX < selfX ? -1 : 1
        this.home.character.lean = { dir, until: Date.now() + 1200 }
        this.home.character.face = dir
      },
      /** 她当前所在的场景 id（存档里那个） */
      petScene() {
        return this.home && this.home.world ? this.home.world.map || '' : ''
      },
      /** 你正在看的场景 id */
      viewScene() {
        const sceneId = sceneRef.value && typeof sceneRef.value.id === 'string' ? sceneRef.value.id : ''
        return sceneId || (this.meta && this.meta.map) || ''
      },
      /**
       * 让大肥鱼到「你现在看的这个房间」来。
       * 手动切场景不会调用它（你只是去别的房间看了一眼）；互动或点名才会。
       */
      bringPetHere() {
        const view = this.viewScene()
        if (!view || !this.home || !this.home.world) return false
        if (this.home.world.map === view) return false
        this.home.world.map = view
        const name = sceneRef.value && sceneRef.value.name
        this.home.world.mapName = (name && (name.zh || name.en)) || view
        // 2 分钟内只记一次「她过来了」，避免连点几下刷屏
        const last = this.home.log && this.home.log[0]
        if (!last || last.code !== 'move' || Date.now() - last.at > 2 * 60 * 1000) {
          pushLog(this.home, Date.now(), 'move', null)
        }
        return true
      },
    }

    Object.assign(HomeStore.prototype, SCENE_METHODS)
    /* ======================================================================
     * 布局编辑：改部件、撤销、增删家具、写回 data/
     * ==================================================================== */

    const EDIT_METHODS = {
      /** 选中件的 part 拿一份深拷贝改完再整体替换，保证 React 能看出变化 */
      updatePart(defId, partId, mutate) {
        const defs = cloneJson(furnitureRef.value)
        const def = defs.find((item) => item.id === defId)
        if (!def) return false
        const part = def.parts.find((item) => (item.id || 'part') === partId)
        if (!part) return false
        mutate(part)
        applyFurniture(defs)
        this.publish()
        return true
      },
      /**
       * 同一件家具里的「状态变体」（比如书桌的关灯/开灯两张）在改位置、尺寸、角度、层级时
       * 要整组一起改，否则切换状态会跳。
       *
       * 分组规则（按优先级）：
       *   1. 显式写了 `sprite.group: "body"` → 同名 group 一起改（推荐，位置漂了也不会分家）
       *   2. 没写 group → 退回到「rect 完全一样」的旧判定
       *
       * build(target) 返回 { sprite?, part? }：按目标算出要写的值，
       * 整组都写同一份，所以即使某个变体之前漂了，改一次就对回一起。
       */
      applyToVariantGroup(defId, partId, build) {
        const defs = cloneJson(furnitureRef.value)
        const def = defs.find((item) => item.id === defId)
        if (!def) return false
        // partId === '*'：整件家具一起改（拼出来的窗户/窗帘就是这么当一件拖的）
        if (partId === '*') {
          this.pushHistory(`${defId}:*`)
          for (const part of def.parts) {
            const change = build(part)
            if (!change) continue
            if (change.part) Object.assign(part, change.part)
            if (change.sprite && part.sprite) Object.assign(part.sprite, change.sprite)
          }
          applyFurniture(defs)
          this.publish()
          return true
        }
        const target = def.parts.find((item) => (item.id || 'part') === partId)
        if (!target) return false
        const targetSprite = target.sprite
        const group = targetSprite && typeof targetSprite.group === 'string' ? targetSprite.group : ''
        const signature = targetSprite ? spriteRectSignature(targetSprite) : null
        const change = build(target)
        if (!change) return false
        this.pushHistory(`${defId}:${partId}`)
        const sameGroup = (part) => {
          if (part === target) return true
          if (!targetSprite || !part.sprite) return false
          const partGroup = typeof part.sprite.group === 'string' ? part.sprite.group : ''
          if (group !== '' && partGroup === group) return true
          if (group === '' && partGroup === '' && signature !== '' &&
            spriteRectSignature(part.sprite) === signature) return true
          return false
        }
        for (const part of def.parts) {
          if (!sameGroup(part)) continue
          if (change.part) Object.assign(part, change.part)
          if (change.sprite) {
            if (!part.sprite) continue
            Object.assign(part.sprite, change.sprite)
          }
        }
        applyFurniture(defs)
        this.publish()
        return true
      },
      /** 屏幕像素位移 → 素材图直接改 rect；preset 换算成地板 offset */
      movePart(defId, partId, dxPx, dyPx) {
        if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx)) return false
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (part.sprite && Array.isArray(part.sprite.rect)) {
            const rect = part.sprite.rect.map(Number)
            return { sprite: { rect: [rect[0] + dxPx, rect[1] + dyPx, rect[2], rect[3]] } }
          }
          const fx = (dxPx / geom.kx + dyPx / geom.ky) / 2
          const fy = (dyPx / geom.ky - dxPx / geom.kx) / 2
          const offset = part.offset || { fx: 0, fy: 0 }
          return {
            part: {
              offset: {
                fx: Math.round(((Number(offset.fx) || 0) + fx) * 100) / 100,
                fy: Math.round(((Number(offset.fy) || 0) + fy) * 100) / 100,
              },
            },
          }
        })
      },
      movePartByGrid(defId, partId, dfx, dfy) {
        if (!Number.isFinite(dfx) || !Number.isFinite(dfy)) return false
        return this.updatePart(defId, partId, (part) => {
          const offset = part.offset || { fx: 0, fy: 0 }
          part.offset = {
            fx: Math.round(((Number(offset.fx) || 0) + dfx) * 100) / 100,
            fy: Math.round(((Number(offset.fy) || 0) + dfy) * 100) / 100,
          }
        })
      },
      bumpPartZ(defId, partId, delta) {
        return this.applyToVariantGroup(defId, partId, (part) => ({
          part: { z: (Number(part.z) || 0) + delta },
        }))
      },
      /** 改之前先拍一张快照；同一个物件 600ms 内的连续改动合并成一步（拖拽/长按方向键不会塞满历史） */
      pushHistory(key = '') {
        const now = Date.now()
        if (key && key === this.historyKey && now - this.historyAt < 600) {
          this.historyAt = now
          return
        }
        this.history.push({
          furniture: cloneJson(furnitureRef.value),
          removed: this.removedFurniture.slice(),
        })
        if (this.history.length > 60) this.history.shift()
        this.historyKey = key
        this.historyAt = now
      },
      canUndo() {
        return this.history.length > 0
      },
      /**
       * 用系统默认程序打开配置文件，或在资源管理器里定位。
       * target 形如 data/maps/living/scene.json、pack/pet.json、save/state.json
       */
      /** data/… pack/… save/… → 绝对路径（DSH 的原生打开要绝对路径） */
      absolutePathFor(target) {
        const meta = this.meta || {}
        const match = /^(data|pack|save)\/(.+)$/.exec(String(target || ''))
        if (!match) return ''
        const root = match[1] === 'data' ? meta.dataDir : match[1] === 'pack' ? meta.packDir : meta.saveDir
        if (typeof root !== 'string' || root === '') return ''
        const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
        return `${base}/${match[2]}`
      },
      async openPath(kind, target) {
        const mode = kind === 'folder' || kind === 'reveal' ? kind : 'file'
        const absolute = this.absolutePathFor(target)
        // 先交给 DSH 自己（Host 的 sessionController 用原生方式打开）
        if (absolute !== '' && typeof this.openRemote === 'function') {
          // 「打开目录」= 用默认程序打开这个目录（资源管理器），不能当成 reveal：
          // reveal 在 Windows 上是「在父目录里选中它」，对目录经常什么都不弹。
          // 目录：资源管理器对「打开目录」经常没反应，改成 reveal 目录里的一个子文件，
          // 效果就是打开这个目录并选中那个文件。file/reveal 照旧。
          let remoteTarget = absolute
          let remoteReveal = mode === 'reveal'
          if (mode === 'folder') {
            try {
              const probe = await fetchJson(`${ROUTE}/api/probe`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ path: target }),
              })
              if (probe && probe.ok && probe.child) {
                remoteTarget = String(probe.child).replace(/\\/g, '/')
                remoteReveal = true
              }
            } catch {
              /* probe 失败就退回直接打开目录 */
            }
          }
          const remote = await this.openRemote(remoteTarget, remoteReveal)
          if (remote === 'ok') return { ok: true, error: '', openedWith: 'dsh', absolute }
          // 原生通道明确报错（比如 Host 不认这个路径）就别再 spawn explorer 了：
          // 那只会弹一个系统错误提示，还打开不了。直接失败，让前端把路径复制给你。
          if (remote !== 'unavailable') {
            return { ok: false, error: `DSH 原生打开失败：${remote}`, openedWith: '', absolute }
          }
          this.lastOpenRemoteError = remote
        }
        // 目录 / 定位必须有原生通道：没有的话回退到 spawn 只会「打开错的东西」或弹系统报错
        if (mode !== 'file' && typeof this.openRemote !== 'function') {
          return {
            ok: false,
            error: '当前环境拿不到 DSH 的原生打开通道（ctx.remote），无法打开目录；路径已复制',
            openedWith: '',
            absolute,
          }
        }
        try {
          const payload = await fetchJson(`${ROUTE}/api/open`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ kind: mode, path: target }),
          })
          const remoteNote = this.lastOpenRemoteError && this.lastOpenRemoteError !== 'unavailable'
            ? ` ｜ DSH 原生打开：${this.lastOpenRemoteError}`
            : ''
          return {
            ok: !!(payload && payload.ok),
            error: payload && payload.error ? `${String(payload.error)}${remoteNote}` : '',
            // electron / spawn / dry-run：看出到底走的哪条路（排查「提示成功但没窗口」）
            openedWith: payload && payload.openedWith ? String(payload.openedWith) : '',
            absolute: payload && payload.absolute ? String(payload.absolute) : '',
          }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
      /** 回退一步：家具表、删除清单、scene 清单一起回滚 */
      undo() {
        const snapshot = this.history.pop()
        if (!snapshot) return false
        this.historyKey = ''
        this.historyAt = 0
        this.removedFurniture = (snapshot.removed || []).slice()
        applyFurniture(snapshot.furniture)
        this.syncSceneFurniture(snapshot.furniture.map((def) => def.id))
        this.publish()
        return true
      },
      /** scene.json 的 furniture 清单跟着内存里的家具表走 */
      syncSceneFurniture(ids) {
        if (!this.sceneDoc) return
        this.sceneDoc.furniture = ids.slice()
        this.sceneDirty = true
      },
      /** 新建一件家具：先给个占位块（没有图），选中后可以用「换图」换成素材 */
      addFurniture() {
        this.pushHistory('add')
        const defs = cloneJson(furnitureRef.value)
        let index = 1
        let id = `item-${index}`
        while (defs.some((def) => def.id === id)) {
          index += 1
          id = `item-${index}`
        }
        defs.push({
          id,
          name: { zh: '新家具', en: 'New item' },
          type: 'furniture',
          parts: [
            {
              id: 'body',
              z: 90,
              sprite: { rect: [430, 250, 160, 160] },
            },
          ],
        })
        this.removedFurniture = this.removedFurniture.filter((gone) => gone !== id)
        applyFurniture(defs)
        this.syncSceneFurniture(defs.map((def) => def.id))
        this.publish()
        return id
      },
      /** 复制一件家具：新 id 自动避让，精灵图往右前挪一格 */
      duplicateFurniture(defId) {
        const defs = cloneJson(furnitureRef.value)
        const source = defs.find((def) => def.id === defId)
        if (!source) return null
        this.pushHistory('duplicate')
        let index = 1
        let id = `${defId}-copy`
        while (defs.some((def) => def.id === id)) {
          index += 1
          id = `${defId}-copy${index}`
        }
        const copy = cloneJson(source)
        copy.id = id
        for (const part of copy.parts || []) {
          if (part.sprite && Array.isArray(part.sprite.rect)) {
            const rect = part.sprite.rect.map(Number)
            part.sprite.rect = [rect[0] + geom.kx, rect[1] + geom.ky, rect[2], rect[3]]
          } else {
            const offset = part.offset || { fx: 0, fy: 0 }
            part.offset = { fx: Math.round(((Number(offset.fx) || 0) + 1) * 100) / 100, fy: offset.fy || 0 }
          }
        }
        defs.push(copy)
        this.removedFurniture = this.removedFurniture.filter((gone) => gone !== id)
        applyFurniture(defs)
        this.syncSceneFurniture(defs.map((def) => def.id))
        this.publish()
        return id
      },
      /** 删除一件家具：先从内存里拿掉，保存时才真正删文件 */
      removeFurniture(defId) {
        this.pushHistory('remove')
        const defs = cloneJson(furnitureRef.value)
        const index = defs.findIndex((def) => def.id === defId)
        if (index < 0) return false
        defs.splice(index, 1)
        if (!this.removedFurniture.includes(defId)) this.removedFurniture.push(defId)
        applyFurniture(defs)
        this.syncSceneFurniture(defs.map((def) => def.id))
        this.publish()
        return true
      },
      /** 把当前家具定义逐件写回 data/（每件一个文件），并同步 scene.json / 删掉被移除的文件 */
      async saveFurniture() {
        const defs = furnitureRef.value
        let saved = 0
        for (const def of defs) {
          if (!def || typeof def.id !== 'string') continue
          const response = await fetch(this.furnitureUrl(def.id), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(def),
          })
          if (!response.ok) {
            throw new Error(`保存 ${def.id} 失败：HTTP ${response.status}`)
          }
          saved += 1
        }
        if (this.sceneDirty && this.sceneDoc) {
          const response = await fetch(`${ROUTE}/data/${this.mapPath || 'maps/bedroom/scene.json'}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(this.sceneDoc),
          })
          if (!response.ok) throw new Error(`保存 scene.json 失败：HTTP ${response.status}`)
          this.sceneSource = cloneJson(this.sceneDoc)
          this.sceneDirty = false
        }
        for (const gone of this.removedFurniture.splice(0)) {
          const response = await fetch(this.furnitureUrl(gone), { method: 'DELETE' })
          if (!response.ok && response.status !== 404) {
            throw new Error(`删除 ${gone} 失败：HTTP ${response.status}`)
          }
        }
        this.furnitureSource = cloneJson(defs)
        return saved
      },
      /** 放弃未保存的改动，回到上次读到的状态 */
      discardFurniture() {
        applyFurniture(cloneJson(this.furnitureSource || DEFAULT_FURNITURE))
        this.sceneDoc = cloneJson(this.sceneSource)
        this.sceneDirty = false
        this.removedFurniture = []
        this.publish()
      },
      /** 只对素材图有意义：绕支点转 deg 度 */
      rotatePart(defId, partId, deg) {
        if (!Number.isFinite(deg)) return false
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          const next = (Number(part.sprite.rotate) || 0) + deg
          return { sprite: { rotate: Math.round(next * 10) / 10 } }
        })
      },
      /** 平行四边形畸变：sprite.skew 存斜率（tan），0 = 正对镜头，0.375 = 跟墙/地平行 */
      setPartSkew(defId, partId, value) {
        const num = Number(value)
        if (!Number.isFinite(num)) return false
        const clamped = Math.max(-0.8, Math.min(0.8, num))
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          return { sprite: { skew: Math.round(clamped * 1000) / 1000 } }
        })
      },
      /** 左右镜像 */
      flipPart(defId, partId) {
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite) return null
          return { sprite: { flipX: part.sprite.flipX !== true } }
        })
      },
      /** 改素材图的显示尺寸（底边保持不动） */
      resizePart(defId, partId, width, height) {
        return this.applyToVariantGroup(defId, partId, (part) => {
          if (!part.sprite || !Array.isArray(part.sprite.rect)) return null
          const rect = part.sprite.rect.map(Number)
          const w = Math.max(8, Math.round(Number(width) || rect[2]))
          const hh = Math.max(8, Math.round(Number(height) || rect[3]))
          return { sprite: { rect: [rect[0], rect[1] + (rect[3] - hh), w, hh] } }
        })
      },
      /**
       * 换图：只换源、不动尺寸（尺寸自己用「尺寸」两个数字框调），
       * 这样换状态图不会把调好的大小重置掉。
       */
      setPartImage(defId, partId, src) {
        if (typeof src !== 'string' || src === '') return false
        return this.updatePart(defId, partId, (part) => {
          if (!part.sprite) return
          part.sprite.src = src
          if (!Array.isArray(part.sprite.rect)) part.sprite.rect = [320, 220, 200, 200]
        })
      },
      /** 角色包目录里能用哪些图（换图下拉框） */
      async loadPackFiles() {
        if (Array.isArray(this.packFiles)) return this.packFiles
        try {
          const data = await fetchJson(`${ROUTE}/api/pack-files`)
          this.packFiles = Array.isArray(data.files) ? data.files : []
        } catch {
          this.packFiles = []
        }
        return this.packFiles
      },
      /** 改称呼 / 自称 / 房间名：纯显示字段，立刻存档 */
      updateProfile(patch) {
        if (!this.home || !patch || typeof patch !== 'object') return false
        const clean = (value, fallback, max) => {
          if (typeof value !== 'string') return fallback
          const trimmed = value.trim().slice(0, max)
          return trimmed === '' ? fallback : trimmed
        }
        this.home.characterName = clean(patch.characterName, this.home.characterName, 12)
        this.home.selfName = clean(patch.selfName, this.home.selfName, 8)
        this.home.roomName = clean(patch.roomName, this.home.roomName, 16)
        this.home.userName = clean(patch.userName, this.home.userName, 8)
        this.publish()
        this.scheduleSave(600)
        return true
      },
      /** 改一个事件定义（内存里，保存才写盘） */
      updateEvent(id, raw) {
        if (!raw || typeof raw !== 'object') return false
        const list = cloneJson(BEHAVIORS)
        const index = list.findIndex((event) => event.id === id)
        if (index < 0) return false
        list[index] = { ...raw, id }
        applyEvents(list)
        this.publish()
        return true
      },
      /** 把事件表逐件写回 data/maps/<map>/events/*.json */
      async saveEvents() {
        let saved = 0
        for (const event of BEHAVIORS) {
          const response = await fetch(`${ROUTE}/data/${resolveDataPath(this.mapPath || 'maps/bedroom/scene.json', `events/${event.id}.json`)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(event),
          })
          if (!response.ok) throw new Error(`保存事件 ${event.id} 失败：HTTP ${response.status}`)
          saved += 1
        }
        this.eventsSource = cloneJson(BEHAVIORS)
        return saved
      },
    }

    Object.assign(HomeStore.prototype, EDIT_METHODS)
    /* ======================================================================
     * 动画视图、时钟推进、行为调度与互动
     * ==================================================================== */

    /**
     * 活动快照的指纹：只有它变了才需要重渲染 / 重算权重。
     * （之前漏了函数体，applyActivity 每 5 秒抛 ReferenceError，导致会话权重从来没生效过）
     */
    function activitySignature(snapshot) {
      if (!snapshot) return ''
      const counters = snapshot.counters || {}
      const recent = Array.isArray(snapshot.recent) ? snapshot.recent[snapshot.recent.length - 1] : null
      const notes = snapshot.notes || {}
      return [
        snapshot.running,
        counters.messages,
        counters.tools,
        counters.errors,
        counters.workflows,
        counters.subagents,
        recent ? `${recent.at}:${recent.kind}` : '',
        notes.mode,
        notes.pending,
        notes.injected,
        notes.preview,
        notes.pinned,
        notes.targetFull,
        notes.lastReply ? notes.lastReply.at : '',
        Array.isArray(notes.sessions) ? notes.sessions.length : 0,
      ].join('|')
    }

    const VIEW_METHODS = {
      buildViews() {
        const assets = (this.meta && this.meta.pack && this.meta.pack.assets) || {}
        const cell = this.meta && this.meta.pack ? this.meta.pack.canvas : null
        const animations = this.animations || []
        const views = {}
        // 先把每个动画声明的所有 tag 都构一遍（work45 / doze45 / lounge45 这类新动作就是这么进视图表的），
        // 否则 views[tag] 查不到就永远退回 idle
        for (const anim of animations) {
          const tags = Array.isArray(anim.tags) && anim.tags.length > 0 ? anim.tags : [anim.id]
          for (const tag of tags) {
            if (typeof tag !== 'string' || views[tag]) continue
            const view = buildAnimationView(animations, assets, tag, cell)
            if (view) views[tag] = view
          }
        }
        for (const tag of ['idle', 'walk', 'read', 'work', 'play', 'stretch', 'sleep']) {
          if (views[tag]) continue
          const view = buildAnimationView(animations, assets, tag, cell)
          if (view) views[tag] = view
        }
        if (!views.idle) {
          const fallback = buildAnimationView(animations, assets, 'idle', cell)
          if (fallback) views.idle = fallback
        }
        return views
      },
      tick() {
        if (this.phase !== 'ready' || !this.home) return
        const now = Date.now()
        const gap = now - this.home.updatedAt
        if (gap > OFFLINE_MIN_GAP_MS) {
          settleOffline(this.home, now)
        } else {
          stepHome(this.home, now)
          // 睡眠时也保持“当前行为”的可读性：行为本身在 stepHome 里切换
        }
        this.syncSleepRoom(now)
        // 顺带问一下 DSH 会话在干什么（异步，不阻塞时钟）
        void this.refreshActivity()
        this.publish()
        this.scheduleSave()
      },
      /**
       * 睡觉回卧室：床只在卧室，所以在别的房间睡着时把她送回卧室（她不在客厅/花园里"站着睡"）；
       * 醒来后再回到你正在看的房间，免得早上看不见人。
       */
      syncSleepRoom(now) {
        const home = this.home
        if (!home || !home.character || !home.world) return
        const sleeping = home.character.behaviorId === 'sleep' || home.character.behaviorId === 'nap'
        const current = typeof home.world.map === 'string' && home.world.map !== '' ? home.world.map : SLEEP_ROOM
        if (sleeping) {
          if (current !== SLEEP_ROOM) {
            home.world.map = SLEEP_ROOM
            pushLog(home, now, 'goBedroom', null)
            this.lastSleeping = true
          }
          return
        }
        // 刚醒：回到你正在看的房间（她"下楼找你"）
        if (this.lastSleeping) {
          this.lastSleeping = false
          const viewed = this.currentMap()
          if (viewed && viewed !== home.world.map) {
            home.world.map = viewed
            pushLog(home, now, 'backHere', null)
          }
        }
      },
      /**
       * 取一次 DSH 会话活动，并按「开始/结束/出错」做一次性反应。
       * Host 没有 webserver 或没有会话服务时，这里只会拿到空快照，静默降级。
       */
      async refreshActivity() {
        if (this.activityBusy) return this.activity
        this.activityBusy = true
        try {
          const payload = await fetchJson(`${ROUTE}/api/activity`)
          const next = normalizeActivity(payload)
          if (next) this.applyActivity(next)
        } catch {
          /* 拿不到就保持上一次 */
        } finally {
          this.activityBusy = false
        }
        return this.activity
      },
      /** 会话里对便条的回复 → 让她在屋里说出来（气泡 + 日志） */
      surfaceReply(reply) {
        if (!reply || typeof reply.text !== 'string' || reply.text === '') return
        if (this.lastReplyAt === reply.at) return
        this.lastReplyAt = reply.at
        const now = Date.now()
        if (this.home && this.home.character) {
          this.home.character.say = { text: reply.text, until: now + 9000 }
          pushLog(this.home, now, 'agentReply', { text: reply.text })
          this.publish()
        }
      },
      /** 活动变化 → 她的反应（只在「状态跳变」时触发，避免每 5 秒刷屏） */
      applyActivity(next) {
        if (next.notes && next.notes.lastReply) this.surfaceReply(next.notes.lastReply)
        // 快照没变（每 5 秒轮询一次）就不要重复 setActivity/publish，否则整块面板白重渲染
        const signature = activitySignature(next)
        const unchanged = signature === this.activitySignature
        this.activitySignature = signature
        const previous = this.activity
        if (unchanged && previous) return
        this.activity = next
        setActivity(next)
        if (!this.home || !this.home.character) return
        const now = Date.now()
        const character = this.home.character
        const wasRunning = previous ? previous.running : 0
        const nowRunning = next.running
        // 你开始干活 → 她也坐到书桌前（只在她闲着/发呆/躺着的时候打断）
        // 会话是「一轮一停」的，一轮结束马上又开下一轮会让 running 反复抖；
        // 起停的日志与收工反应都用 SESSION_FLAP_MS 兜一层，抖动只算一次。
        const passive = ['idle', 'sleep', 'nap', 'read', 'stretch', 'window']
        if (nowRunning > 0 && wasRunning === 0) {
          const flapping = now - (Number(this.lastSessionStartAt) || 0) < SESSION_FLAP_MS
          if (!flapping) {
            this.lastSessionStartAt = now
            pushLog(this.home, now, 'sessionStart', null)
          } else {
            // 抖动：上一轮刚记的「收工」其实是同一次连续工作，撤掉它
            const stale = this.home.log.findIndex((entry) => entry.code === 'sessionEnd')
            if (stale >= 0 && now - this.home.log[stale].at < SESSION_FLAP_MS) this.home.log.splice(stale, 1)
          }
          if (passive.includes(character.behaviorId)) {
            this.lastWorkNudgeAt = now
            this.forceBehavior('work')
          }
        }
        // 会话「一直在跑」时也盯着：连续第二次工作时，中间的空档可能短到被 5 秒轮询漏掉，
        // 只看 0→1 的跳变会漏。所以只要会话在跑、她又闲下来了，就再推一次（有间隔和用户优先保护）。
        if (nowRunning > 0 && passive.includes(character.behaviorId)) {
          const sinceNudge = now - (Number(this.lastWorkNudgeAt) || 0)
          const sinceUserAction = now - (Number(this.lastUserActionAt) || 0)
          if (sinceNudge > WORK_NUDGE_MS && sinceUserAction > USER_PRIORITY_MS) {
            this.lastWorkNudgeAt = now
            this.forceBehavior('work')
          }
        }
        // 会话跑完 → 她收工：心情好一点，从「工作」里松下来
        // （一轮一停的抖动不重复触发：会话可能几秒后又开下一轮）
        if (nowRunning === 0 && wasRunning > 0) {
          const flapping = now - (Number(this.lastSessionEndAt) || 0) < SESSION_FLAP_MS
          if (!flapping) {
            this.lastSessionEndAt = now
            pushLog(this.home, now, 'sessionEnd', null)
            character.mood = clampNumber(character.mood + 4, 0, 100, character.mood)
            if (character.behaviorId === 'work') this.forceBehavior('stretch')
          }
        }
        // 出错了 → 她有点担心
        const previousErrors = previous ? previous.counters.errors : 0
        if (next.counters.errors > previousErrors) {
          pushLog(this.home, now, 'sessionError', null)
          character.mood = clampNumber(character.mood - 5, 0, 100, character.mood)
        }
      },
      /**
       * 小屋便条：跟她说一句话（L3）。
       * 先在屋子里说出来（气泡 + 日志），再交给 Host 决定要不要送进当前会话。
       */
      async sendNote(text) {
        const clean = typeof text === 'string' ? text.trim() : ''
        if (clean === '') return { ok: false, error: '空便条' }
        if (!this.home) return { ok: false, error: '还没准备好' }
        const now = Date.now()
        // 1) 先进屋回一句（跟会话是否可达无关）
        this.replyLocally(clean, now)
        // 2) 有客户端 sessions 服务时，像聊天框一样把话发进目标会话：
        //    它会出现在对话里，并让那个会话真的跑一轮（LLM 会回）
        const targetId =
          (this.activity && this.activity.notes && this.activity.notes.targetId) ||
          (this.home && typeof this.home.noteTarget === 'string' ? this.home.noteTarget : '')
        if (this.clientSessions && targetId) {
          // 带个标记：模型看到就知道这是「家园小便条」，回一句就够，别展开、别调工具
          const delivered = await this.promptSession(targetId, `${NOTE_MARK}${clean}`)
          if (delivered) {
            // 告诉 Host「这个会话在等回话」，好把她的回复捞回来显示在屋里
            void fetchJson(`${ROUTE}/api/note`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: clean, delivered: true, sessionId: targetId, clientSessions: true }),
            }).catch(() => {})
            pushLog(this.home, now, 'noteDelivered', null)
            this.publish()
            return { ok: true, delivered: true, target: targetId }
          }
        }
        // 3) 否则退回 Host 的便条队列（preview / inject）
        try {
          const payload = await fetchJson(`${ROUTE}/api/note`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: clean, clientSessions: !!this.clientSessions, sessionId: targetId }),
          })
          this.publish()
          void this.refreshActivity()
          return { ok: true, mode: payload && payload.mode ? payload.mode : 'preview', pending: payload && payload.pending ? payload.pending : 0 }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false, error: message }
        }
      },
      /** 在小屋里回一句（气泡 + 日志 + 可能的动作），不依赖会话 */
      replyLocally(text, now) {
        const character = this.home && this.home.character
        if (!character) return
        const reply = matchReply(this.replies, text, localeRef.value)
        pushLog(this.home, now, 'noteQueued', null)
        if (reply.text) pushLog(this.home, now, 'noteReply', { text: reply.text })
        // 顺序：先切行为再写气泡，否则切换被拒时的提示会盖掉她的回复
        const passive = ['idle', 'read', 'stretch', 'window']
        if (reply.behavior && passive.includes(character.behaviorId)) {
          this.forceBehavior(reply.behavior)
        }
        character.say = { text: reply.text || text, until: now + 6000 }
      },
      /** 用客户端 sessions 服务把一句话发进会话（等同在聊天框里发消息） */
      async promptSession(sessionId, text) {
        try {
          let delivered = false
          await this.clientSessions.using(sessionId, { source: 'gateway' }, async (reference) => {
            const session = reference && reference.binding && reference.binding.session
            if (!session || typeof session.prompt !== 'function') return
            const result = await session.prompt([{ type: 'text', text }], 'queue')
            delivered = !!(result && result.ok)
          })
          return delivered
        } catch {
          return false
        }
      },
      /** 设置里的下拉框：指定便条送进哪个会话（空 = 自动） */
      async setNoteTarget(sessionId) {
        const wanted = typeof sessionId === 'string' ? sessionId : ''
        try {
          const payload = await fetchJson(`${ROUTE}/api/note-target`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: wanted }),
          })
          // 立刻用返回的便条状态刷新（不等 5 秒轮询，否则下拉框看起来像"没选上"）
          const nextNotes = normalizeActivity({ notes: payload }) 
          if (nextNotes && nextNotes.notes) {
            this.activity = { ...(this.activity || normalizeActivity({})), notes: nextNotes.notes }
            this.publish()
          }
          // 记住这个人选的会话（跟着存档走）
          if (this.home) {
            this.home.noteTarget = wanted
            this.publish()
            this.scheduleSave(400)
          }
          return { ok: true }
        } catch (error) {
          // 会话已经不在了：清掉存档里的记录，避免每次启动都白试一次
          if (this.home && this.home.noteTarget === wanted) {
            this.home.noteTarget = ''
            this.publish()
            this.scheduleSave(400)
          }
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        }
      },
      /** 启动时把存档里记住的目标会话重新登记给 Host */
      async restoreNoteTarget() {
        const saved = this.home && typeof this.home.noteTarget === 'string' ? this.home.noteTarget : ''
        if (saved === '') return
        await this.setNoteTarget(saved)
      },
      /** 给面板用的活动快照（没有就是 null） */
      activityView() {
        return this.activity || null
      },
      scheduleSave(delayMs) {
        if (!this.home) return
        if (this.saveTimer !== null) return
        this.saveState = 'dirty'
        this.saveTimer = setTimeout(() => {
          this.saveTimer = null
          void this.flushSave()
        }, delayMs === undefined ? SAVE_DEBOUNCE_MS : delayMs)
      },
      async flushSave() {
        if (!this.home) return
        if (this.saving) {
          this.pendingSave = true
          return
        }
        this.saving = true
        this.saveState = 'saving'
        this.publish()
        const ok = await writeSave(this.home)
        this.saving = false
        this.saveState = ok ? 'saved' : 'offline'
        if (ok) this.lastSavedAt = Date.now()
        if (this.pendingSave) {
          this.pendingSave = false
          this.scheduleSave(1200)
        }
        this.publish()
      },
      async reload() {
        if (this.phase === 'error') {
          void this.boot()
          return
        }
        try {
          const saved = await readSave()
          if (!saved) return
          const now = Date.now()
          this.home = normalizeHome(saved, now, this.meta ? this.meta.characterName : undefined)
          settleOffline(this.home, now)
          this.publish()
        } catch {
          /* 读不到就保持现状 */
        }
      },
      toggleProp(key) {
        if (!this.home || !(key in DEFAULT_PROPS)) return
        const props = this.home.world.props
        props[key] = !props[key]
        const code = `${key}${props[key] ? 'On' : 'Off'}`
        pushLog(this.home, Date.now(), code, null)
        if (key === 'curtainOpen') {
          this.home.log[0].code = props[key] ? 'curtainOpen' : 'curtainClose'
        }
        this.publish()
        this.scheduleSave(1500)
      },
      interact(target, furnitureId) {
        if (!this.home) return
        // 你在这个房间点了东西 → 她过来（手动切场景不会触发）
        const moved = this.bringPetHere()
        const now = Date.now()
        // 记一笔：你刚手动指挥过她，短时间内别被会话活动拽走（用户优先）
        this.lastUserActionAt = now
        if (target && target !== 'reset') this.leanToward(target)
        // 家具声明了多个互动动画时：每点一次按顺序切到下一个
        const def = typeof furnitureId === 'string'
          ? furnitureRef.value.find((item) => item && item.id === furnitureId)
          : null
        const cycle = def && Array.isArray(def.animations)
          ? def.animations.filter((item) => item && typeof item.event === 'string')
          : []
        if (cycle.length > 0) {
          const key = def.id
          const index = Number(this.cycleIndex && this.cycleIndex[key]) || 0
          const next = cycle[index % cycle.length]
          this.cycleIndex = this.cycleIndex || {}
          this.cycleIndex[key] = (index + 1) % cycle.length
          return this.forceBehavior(next.event)
        }
        const props = this.home.world.props
        if (target === 'desk' || target === 'work') return this.forceBehavior('work')
        if (target === 'bed') {
          const sleepy = this.home.character.energy < 42
          return this.forceBehavior(sleepy ? 'sleep' : 'nap')
        }
        if (target === 'window') return this.forceBehavior('window')
        if (target === 'bookshelf' || target === 'read') return this.forceBehavior('read')
        if (target === 'whale' || target === 'play') return this.forceBehavior('play')
        if (target === 'deskLamp') return this.toggleProp('deskLamp')
        if (target === 'bedLamp') return this.toggleProp('bedLamp')
        if (target === 'curtain') return this.toggleProp('curtainOpen')
        if (target === 'pat') {
          this.home.character.mood = Math.min(100, this.home.character.mood + 6)
          this.home.character.patCount += 1
          this.home.character.emote = { tag: 'stretch', until: now + 4200 }
          const quietPat = now - (Number(this.home.character.lastSaidAt) || 0)
          if (quietPat > 90 * 1000 || Math.random() < 0.45) {
            const n = 1 + Math.floor(Math.random() * 3)
            this.home.character.say = { code: `pat${n}`, text: null, until: now + 2600 }
            this.home.character.lastSaidAt = now
          }
          pushLog(this.home, now, 'pat', null)
          this.publish()
          this.scheduleSave(1500)
          return
        }
        // 任意事件 id 都能直接点（客厅的 watch_tv / cook / eat 走这里）
        if (typeof target === 'string' && BEHAVIOR_BY_ID[target]) {
          return this.forceBehavior(target)
        }
        // 任意开关（沙发旁的落地灯之类）：键名在 DEFAULT_PROPS 里就直接切换
        if (typeof target === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_PROPS, target)) {
          return this.toggleProp(target)
        }
        if (target === 'reset') {
          this.forceBehavior('idle')
        }
      },
      /** 用户请求：可能被拒绝。拒绝了就冒个气泡（动作沿用当前，除非事件里指定了 refuse.anim） */
      forceBehavior(id) {
        if (!this.home || !BEHAVIOR_BY_ID[id]) return false
        const behavior = BEHAVIOR_BY_ID[id]
        const now = Date.now()
        const clock = timeSnapshot(new Date(now), localeRef.value)
        const character = this.home.character
        if (!requestAccepted(behavior, character, clock, this.home.world.props)) {
          const request = behavior.request || {}
          const refuse = request.refuse || {}
          const text = refusalText(behavior, localeRef.value)
          if (text) character.say = { text, until: now + 3200 }
          if (refuse.anim && BEHAVIOR_BY_ID[refuse.anim]) {
            character.emote = { tag: refuse.anim, until: now + 3000 }
          }
          if (Number.isFinite(refuse.mood) && refuse.mood !== 0) {
            character.mood = Math.max(0, Math.min(100, Number(character.mood || 0) + refuse.mood))
          }
          this.publish()
          this.scheduleSave(1200)
          return false
        }
        enterBehavior(this.home, behavior, now)
        // 台词：上一次说话隔了 90 秒以上就一定会说，否则按配置的概率（避免连点刷屏）
        const quietFor = now - (Number(character.lastSaidAt) || 0)
        const shouldSay = behavior.say && (quietFor > 90 * 1000 || Math.random() < behavior.say.chance)
        if (shouldSay) {
          const text = pickSay(behavior, localeRef.value)
          if (text) {
            character.say = { text, until: now + 3200 }
            character.lastSaidAt = now
          }
        }
        this.publish()
        this.scheduleSave(1500)
        return true
      },
    }

    Object.assign(HomeStore.prototype, VIEW_METHODS)
    /* ======================================================================
     * 场景 / 背景 / 家具数据的加载与默认值
     * ==================================================================== */
    /* ======================================================================
     * 6. 等距小屋
     * ==================================================================== */

    /**
     * 场景几何。由 data/maps/<map>/scene.json 决定；
     * 数据没加载（或加载失败）时用这里的默认值，保证画面不空。
     */
    const DEFAULT_ROOM = {
      cols: 12,
      rows: 12,
      wallHeight: 280,
      canvas: [1000, 643],
      margin: { x: 24, top: 4 },
      projection: 0.375,
    }

    // 先占位，模块加载完会用 applyScene(null) 按 DEFAULT_ROOM 重新算一遍
    const geom = {
      canvasW: 1000,
      canvasH: 643,
      cols: 12,
      rows: 12,
      wall: 280,
      kx: 39.67,
      ky: 14.88,
      cx: 500,
      cy: 284,
      camera: { mode: 'fixed', windowW: 1000, windowH: 643, follow: 1 },
    }

    const sceneRef = { value: null }
    const bgRef = { value: null }

    /** 相对路径解析：把 background.json 之类的引用拼到 scene.json 所在目录 */
    function resolveDataPath(baseFile, relative) {
      if (typeof relative !== 'string' || relative === '') return baseFile
      if (relative.startsWith('/')) return relative.replace(/^\/+/, '')
      const baseDir = baseFile.includes('/') ? baseFile.slice(0, baseFile.lastIndexOf('/') + 1) : ''
      const out = []
      for (const part of `${baseDir}${relative}`.split('/')) {
        if (part === '' || part === '.') continue
        if (part === '..') out.pop()
        else out.push(part)
      }
      return out.join('/')
    }

    function applyScene(scene) {
      const room = scene && typeof scene === 'object' && scene.room && typeof scene.room === 'object'
        ? scene.room
        : DEFAULT_ROOM
      const cols = clampNumber(room.cols, 4, 64, DEFAULT_ROOM.cols)
      const rows = clampNumber(room.rows, 4, 64, DEFAULT_ROOM.rows)
      const wall = clampNumber(room.wallHeight, 60, 1200, DEFAULT_ROOM.wallHeight)
      const canvas = Array.isArray(room.canvas) ? room.canvas : DEFAULT_ROOM.canvas
      const canvasW = clampNumber(canvas[0], 400, 4000, DEFAULT_ROOM.canvas[0])
      const canvasH = clampNumber(canvas[1], 300, 4000, DEFAULT_ROOM.canvas[1])
      const margin = room.margin && typeof room.margin === 'object' ? room.margin : DEFAULT_ROOM.margin
      const mx = clampNumber(margin.x, 0, 240, DEFAULT_ROOM.margin.x)
      const top = clampNumber(margin.top, 0, 240, DEFAULT_ROOM.margin.top)
      // 菱形正好落在画布里：宽度反推 kx，ky 固定 2:1
      const kx = (canvasW - 2 * mx) / (cols + rows)
      geom.canvasW = canvasW
      geom.canvasH = canvasH
      geom.cols = cols
      geom.rows = rows
      geom.wall = wall
      geom.kx = kx
      geom.ky = kx * clampNumber(Number(room && room.projection), 0.3, 0.6, 0.5)
      geom.cx = mx + rows * kx
      geom.cy = top + wall
      // 镜头：fixed（全景固定，默认）| follow（跟住角色）| soft（只轻微跟随）
      const cameraRaw = room.camera && typeof room.camera === 'object' ? room.camera : {}
      const mode = cameraRaw.mode === 'follow' || cameraRaw.mode === 'soft' ? cameraRaw.mode : 'fixed'
      const winW = clampNumber(Array.isArray(cameraRaw.window) ? cameraRaw.window[0] : cameraRaw.window, 200, canvasW, canvasW)
      const winH = clampNumber(Array.isArray(cameraRaw.window) ? cameraRaw.window[1] : cameraRaw.window, 150, canvasH, canvasH)
      geom.camera = { mode, windowW: winW, windowH: winH, follow: clampNumber(cameraRaw.follow, 0, 1, mode === 'soft' ? 0.35 : 1) }
      sceneRef.value = scene && typeof scene === 'object' ? scene : null
      // scene.spots 可以覆盖/追加落脚点（家具锚点等第 3 步再进来）
      const spots = scene && typeof scene === 'object' && scene.spots && typeof scene.spots === 'object'
        ? scene.spots
        : null
      if (spots) {
        for (const key of Object.keys(spots)) {
          const spot = spots[key]
          if (!spot || typeof spot !== 'object') continue
          const fx = Number(spot.fx)
          const fy = Number(spot.fy)
          if (!Number.isFinite(fx) || !Number.isFinite(fy)) continue
          SPOTS[key] = { fx, fy, scale: 1 }
        }
      }
      return geom
    }

    // 模块加载时先用默认房间算一遍几何，避免「常量」和「数据」两份对不上
    applyScene(null)

    /** 背景三层：floor / wall_left / wall_right。数据缺失时用内置默认值。 */
    const DEFAULT_BACKGROUND = {
      layers: [
        {
          id: 'floor',
          kind: 'floor',
          fill: { type: 'linear', angle: 90, stops: [{ at: 0, color: '#ddcaac' }, { at: 1, color: '#c9b18d' }] },
          grid: { color: '#b89f7c', opacity: 0.35, step: 1 },
        },
        {
          id: 'wall_left',
          kind: 'wall',
          side: 'fx0',
          fill: { type: 'linear', angle: 27, stops: [{ at: 0, color: '#efe0cb' }, { at: 1, color: '#ead9c2' }] },
          trim: { top: { color: '#8a6748', height: 18 }, base: { color: '#c4a887', height: 9 } },
        },
        {
          id: 'wall_right',
          kind: 'wall',
          side: 'fy0',
          fill: { type: 'linear', angle: 27, stops: [{ at: 0, color: '#f3e6d3' }, { at: 1, color: '#e6d4bb' }] },
          trim: { top: { color: '#6f5137', height: 18 }, base: { color: '#cdb392', height: 9 } },
        },
      ],
      renderOrder: ['floor', 'wall_left', 'wall_right'],
    }

    bgRef.value = DEFAULT_BACKGROUND

    function applyBackground(bg) {
      if (!bg || typeof bg !== 'object' || !Array.isArray(bg.layers)) return bgRef.value
      const layers = bg.layers.filter((layer) => layer && typeof layer.id === 'string' &&
        (layer.kind === 'floor' || layer.kind === 'wall'))
      if (layers.length === 0) return bgRef.value
      const renderOrder = Array.isArray(bg.renderOrder) && bg.renderOrder.length > 0
        ? bg.renderOrder
        : layers.map((layer) => layer.id)
      bgRef.value = { layers, renderOrder }
      return bgRef.value
    }

    /**
     * 家具定义（data/maps/<map>/furniture/*.json）。
     * 每一件由若干 part 组成，part 是排序单位：它带自己的 z、可见条件，
     * 以及「画什么」——preset（代码里的绘制函数）或 sprite（一张图）。
     */
    const DEFAULT_FURNITURE = [
      { id: 'rug', parts: [{ id: 'body', preset: 'rug', z: 5 }] },
      {
        id: 'desk',
        parts: [
          { id: 'body', preset: 'desk', z: 70 },
          {
            id: 'glow',
            preset: 'desk_glow',
            layer: 'light',
            z: 70,
            visibleWhen: { state: { deskLamp: true } },
          },
        ],
        click: { type: 'event', id: 'work' },
      },
      { id: 'shelf', parts: [{ id: 'body', preset: 'shelf', z: 80 }], click: { type: 'event', id: 'read' } },
      {
        id: 'bed',
        parts: [{
          id: 'frame',
          z: 85,
          sprite: { src: 'bed.png', rect: [451, 189, 390, 307], skew: -0.14, flipX: true },
        }],
        click: { type: 'event', id: 'bed' },
      },
      {
        id: 'night_lamp',
        parts: [
          { id: 'body', preset: 'night_lamp', z: 95 },
          {
            id: 'glow',
            preset: 'night_lamp_glow',
            layer: 'light',
            z: 95,
            visibleWhen: { state: { bedLamp: true } },
          },
        ],
        click: { type: 'toggle', key: 'bedLamp' },
      },
      { id: 'plant', parts: [{ id: 'body', preset: 'plant', z: 120 }] },
    ]

    const furnitureRef = { value: DEFAULT_FURNITURE }

    function applyFurniture(defs) {
      if (!Array.isArray(defs)) return furnitureRef.value
      // 空数组是合法的（删掉最后一件家具），但「输入里全是坏数据」不能把场景清空
      if (defs.length === 0) {
        furnitureRef.value = []
        return furnitureRef.value
      }
      const clean = defs.filter((def) => def && typeof def.id === 'string' && Array.isArray(def.parts) && def.parts.length > 0)
      if (clean.length === 0) return furnitureRef.value
      furnitureRef.value = clean
      return furnitureRef.value
    }
    /* ======================================================================
     * 等距几何：投影、多边形、等距立方体、渐变向量
     * ==================================================================== */
    function project(fx, fy) {
      return [geom.cx + (fx - fy) * geom.kx, geom.cy + (fx + fy) * geom.ky]
    }

    function points(list) {
      return list.map((p) => `${Math.round(p[0] * 10) / 10},${Math.round(p[1] * 10) / 10}`).join(' ')
    }

    function raise(p, dy) {
      return [p[0], p[1] - dy]
    }

    function isoBox(fx0, fy0, fx1, fy1, height, palette) {
      const a = project(fx0, fy0)
      const b = project(fx1, fy0)
      const c = project(fx1, fy1)
      const d = project(fx0, fy1)
      const hh = height
      return h(
        'g',
        null,
        h('polygon', {
          points: points([raise(d, hh), raise(c, hh), c, d]),
          fill: palette.left,
          stroke: palette.stroke || 'rgba(80,52,30,0.16)',
          strokeWidth: palette.strokeWidth || 1,
        }),
        h('polygon', {
          points: points([raise(b, hh), raise(c, hh), c, b]),
          fill: palette.right,
          stroke: palette.stroke || 'rgba(80,52,30,0.16)',
          strokeWidth: palette.strokeWidth || 1,
        }),
        h('polygon', {
          points: points([raise(a, hh), raise(b, hh), raise(c, hh), raise(d, hh)]),
          fill: palette.top,
          stroke: palette.stroke || 'rgba(80,52,30,0.16)',
          strokeWidth: palette.strokeWidth || 1,
        }),
      )
    }

    const PALETTE = {
      floorA: '#ddcaac',
      floorB: '#c9b18d',
      floorLine: '#b89f7c',
      wallLeft: '#ead9c2',
      wallRight: '#f3e6d3',
      wallTrim: '#8a6748',
      wallTrimDark: '#6f5137',
      woodTop: '#c99a6d',
      woodRight: '#a87a52',
      woodLeft: '#8a6039',
      bedTop: '#d6ab7c',
      cream: '#fbf7ef',
      linen: '#f7f2e6',
      blanket: '#a9cde9',
      blanketDeep: '#7fb0d8',
      rug: '#d9c6a6',
      rugDark: '#c3ac89',
      plant: '#6f9a63',
      plantDark: '#4f7a49',
      metal: '#7b6a58',
      screen: '#8fd0e8',
      glass: '#f8fbff',
    }

    /** 角度 → objectBoundingBox 的渐变向量 */
    function gradientVector(angle) {
      const rad = (clampNumber(angle, 0, 360, 90) * Math.PI) / 180
      const dx = Math.cos(rad) / 2
      const dy = Math.sin(rad) / 2
      return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy }
    }
    /* ======================================================================
     * 内置画法（preset）：背景、书桌、床头灯、书架、地毯、绿植
     * ==================================================================== */
    /** 背景三层的渐变定义，id 统一是 fh-bg-<layer.id> */
    function BackgroundDefs() {
      const bg = bgRef.value
      return bg.layers.map((layer) => {
        const fill = layer.fill && typeof layer.fill === 'object' ? layer.fill : {}
        const stops = Array.isArray(fill.stops) && fill.stops.length > 0
          ? fill.stops
          : [{ at: 0, color: '#ffffff' }, { at: 1, color: '#dddddd' }]
        return h(
          'linearGradient',
          { key: `bg-${layer.id}`, id: `fh-bg-${layer.id}`, ...gradientVector(fill.angle) },
          stops.map((stop, index) => h('stop', {
            key: index,
            offset: `${clamp01(Number(stop.at) || 0) * 100}%`,
            stopColor: typeof stop.color === 'string' ? stop.color : '#cccccc',
          })),
        )
      })
    }

    /** 墙面 / 地板的平铺贴图：把「正面视角」的纹理按等距轴斜切后重复铺满 */
    function texturePattern(layer) {
      const tile = layer && layer.tile && typeof layer.tile === 'object' ? layer.tile : null
      if (!tile || typeof tile.art !== 'string' || tile.art === '') return null
      const size = Array.isArray(tile.size) ? tile.size.map(Number) : []
      const tw = Number.isFinite(size[0]) && size[0] > 0.1 ? size[0] : 2
      const th = Number.isFinite(size[1]) && size[1] > 0.1 ? size[1] : 2
      const kx = geom.kx
      const ky = geom.ky
      const side = layer.side === 'fx0' ? -1 : 1
      const transform = layer.kind === 'floor'
        ? `matrix(${kx} ${ky} ${-kx} ${ky} 0 0)`
        : `matrix(${side * kx} ${ky} 0 -1 ${geom.cx} ${geom.cy})`
      return h(
        'pattern',
        {
          key: `tex-${layer.id}`,
          id: `fh-tex-${layer.id}`,
          patternUnits: 'userSpaceOnUse',
          width: tw,
          height: th,
          patternTransform: transform,
        },
        h('image', {
          href: `${ROUTE}/pack/${encodeURIComponent(tile.art)}`,
          x: 0,
          y: 0,
          width: tw,
          height: th,
          preserveAspectRatio: 'none',
        }),
      )
    }

    function RoomDefs() {
      return h(
        'defs',
        null,
        BackgroundDefs(),
        (bgRef.value.layers || []).map((layer) => texturePattern(layer)),
        h('radialGradient', { id: 'fh-shadow' },
          h('stop', { offset: '0%', stopColor: '#000000', stopOpacity: 0.35 }),
          h('stop', { offset: '100%', stopColor: '#000000', stopOpacity: 0 }),
        ),
        h('radialGradient', { id: 'fh-lamp-glow' },
          h('stop', { offset: '0%', stopColor: '#ffd79a', stopOpacity: 0.95 }),
          h('stop', { offset: '100%', stopColor: '#ffd79a', stopOpacity: 0 }),
        ),
        // 电视屏幕的光晕：冷白偏蓝，中心亮边缘散
        h('radialGradient', { id: 'fh-tv-halo' },
          h('stop', { offset: '0%', stopColor: '#ffffff', stopOpacity: 0.9 }),
          h('stop', { offset: '45%', stopColor: '#dbe9ff', stopOpacity: 0.45 }),
          h('stop', { offset: '100%', stopColor: '#cfe0ff', stopOpacity: 0 }),
        ),
        h('radialGradient', { id: 'fh-sun-light' },
          h('stop', { offset: '0%', stopColor: '#fff0c9', stopOpacity: 0.85 }),
          h('stop', { offset: '100%', stopColor: '#fff0c9', stopOpacity: 0 }),
        ),
        // 房间灯（吸顶灯）的暖光池：夜里开灯时铺满屋子
        h('radialGradient', { id: 'fh-room-light' },
          h('stop', { offset: '0%', stopColor: '#fff1d2', stopOpacity: 0.5 }),
          h('stop', { offset: '58%', stopColor: '#ffd9a6', stopOpacity: 0.16 }),
          h('stop', { offset: '100%', stopColor: '#ffd9a6', stopOpacity: 0 }),
        ),

        h('linearGradient', { id: 'fh-sky-dawn', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: '#5d5a86' }),
          h('stop', { offset: '55%', stopColor: '#d79a86' }),
          h('stop', { offset: '100%', stopColor: '#f4cda2' }),
        ),
        h('linearGradient', { id: 'fh-sky-morning', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: '#a7cfec' }),
          h('stop', { offset: '100%', stopColor: '#e9f4fb' }),
        ),
        h('linearGradient', { id: 'fh-sky-noon', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: '#8ec2ef' }),
          h('stop', { offset: '100%', stopColor: '#f2f9fe' }),
        ),
        h('linearGradient', { id: 'fh-sky-afternoon', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: '#a2c8e6' }),
          h('stop', { offset: '100%', stopColor: '#f8edda' }),
        ),
        h('linearGradient', { id: 'fh-sky-evening', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: '#5d4e78' }),
          h('stop', { offset: '60%', stopColor: '#dd9a83' }),
          h('stop', { offset: '100%', stopColor: '#f6cfa2' }),
        ),
        h('linearGradient', { id: 'fh-sky-night', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: '#1b2444' }),
          h('stop', { offset: '100%', stopColor: '#3b4775' }),
        ),
        h('linearGradient', { id: 'fh-sky-deepNight', x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0%', stopColor: '#131a33' }),
          h('stop', { offset: '100%', stopColor: '#26305a' }),
        ),
        h('filter', { id: 'fh-soft', x: '-20%', y: '-20%', width: '140%', height: '140%' },
          h('feGaussianBlur', { stdDeviation: 9 }),
        ),
      )
    }

    /**
     * 背景三层：按 background.json 的 renderOrder 依次画地板、上墙、右墙。
     * 每层只有 fill + 可选 grid / trim；贴图（tile.art）留到有素材时再接。
     */
    function Backdrop() {
      const bg = bgRef.value
      const cols = geom.cols
      const rows = geom.rows
      const a = project(0, 0)
      const b = project(cols, 0)
      const c = project(cols, rows)
      const d = project(0, rows)
      const up = (p, dy) => [p[0], p[1] - dy]
      const ordered = (bg.renderOrder || [])
        .map((id) => bg.layers.find((layer) => layer.id === id))
        .filter(Boolean)
      const out = []

      for (const layer of ordered) {
        if (layer.kind === 'floor') {
          out.push(h('polygon', {
            key: `${layer.id}-fill`,
            points: points([a, b, c, d]),
            fill: `url(#fh-bg-${layer.id})`,
          }))
          if (layer.tile && typeof layer.tile.art === 'string' && layer.tile.art !== '') {
            out.push(h('polygon', {
              key: `${layer.id}-tex`,
              points: points([a, b, c, d]),
              fill: `url(#fh-tex-${layer.id})`,
            }))
          }
          const grid = layer.grid && typeof layer.grid === 'object' ? layer.grid : null
          if (grid) {
            const step = clampNumber(grid.step, 0.5, 8, 1)
            const color = typeof grid.color === 'string' ? grid.color : '#b89f7c'
            const opacity = clampNumber(grid.opacity, 0, 1, 0.35)
            const lines = []
            for (let fx = step; fx < cols - 0.001; fx += step) {
              lines.push(h('line', {
                key: `gx-${fx.toFixed(2)}`,
                x1: project(fx, 0)[0], y1: project(fx, 0)[1],
                x2: project(fx, rows)[0], y2: project(fx, rows)[1],
                stroke: color, strokeWidth: 1, opacity,
              }))
            }
            for (let fy = step; fy < rows - 0.001; fy += step) {
              lines.push(h('line', {
                key: `gy-${fy.toFixed(2)}`,
                x1: project(0, fy)[0], y1: project(0, fy)[1],
                x2: project(cols, fy)[0], y2: project(cols, fy)[1],
                stroke: color, strokeWidth: 1, opacity: opacity * 0.62,
              }))
            }
            out.push(h('g', { key: `${layer.id}-grid`, pointerEvents: 'none' }, lines))
          }
          continue
        }

        if (layer.kind === 'wall') {
          const height = clampNumber(layer.height, 40, 1600, geom.wall)
          const quad = layer.side === 'fx0'
            ? [a, d, up(d, height), up(a, height)]
            : [a, b, up(b, height), up(a, height)]
          out.push(h('polygon', {
            key: `${layer.id}-fill`,
            points: points(quad),
            fill: `url(#fh-bg-${layer.id})`,
          }))
          if (layer.tile && typeof layer.tile.art === 'string' && layer.tile.art !== '') {
            out.push(h('polygon', {
              key: `${layer.id}-tex`,
              points: points(quad),
              fill: `url(#fh-tex-${layer.id})`,
            }))
          }
          const trim = layer.trim && typeof layer.trim === 'object' ? layer.trim : {}

          const base = trim.base
          if (base && typeof base.color === 'string') {
            const baseH = clampNumber(base.height, 2, 40, 9)
            out.push(h('polyline', {
              key: `${layer.id}-base`,
              points: points(layer.side === 'fx0' ? [up(a, 8), up(d, 8), d] : [up(a, 8), up(b, 8), b]),
              fill: 'none',
              stroke: base.color,
              strokeWidth: baseH,
              opacity: 0.9,
            }))
          }

          const top = trim.top
          if (top && typeof top.color === 'string') {
            const topH = clampNumber(top.height, 2, 60, 18)
            const dy = height - topH - 8
            out.push(h('polyline', {
              key: `${layer.id}-beam`,
              points: points(layer.side === 'fx0' ? [up(a, dy), up(d, dy)] : [up(a, dy), up(b, dy)]),
              fill: 'none',
              stroke: top.color,
              strokeWidth: topH,
              strokeLinecap: 'round',
            }))
          }
        }
      }

      // 两墙交界处的立柱，颜色沿用右墙的横梁色；墙没有横梁（trim.top）时也不画，
      // 免得墙顶留一条深色竖条显得房间被压矮
      const rightWall = bg.layers.find((layer) => layer.kind === 'wall' && layer.side === 'fy0')
      const rightTop = rightWall && rightWall.trim && rightWall.trim.top
      if (rightTop && typeof rightTop.color === 'string') {
        const rightHeight = clampNumber(rightWall && rightWall.height, 40, 500, geom.wall)
        out.push(h('polygon', {
          key: 'corner',
          points: points([
            up(a, rightHeight - 40),
            up(a, rightHeight - 12),
            [up(a, rightHeight - 12)[0] + 12, up(a, rightHeight - 12)[1]],
            [up(a, rightHeight - 40)[0] + 12, up(a, rightHeight - 40)[1]],
          ]),
          fill: rightTop.color,
        }))
      }

      return h('g', { className: 'fh-backdrop' }, out)
    }


    function DeskView(props) {
      const { lamp, glow } = props
      const lampBase = project(2.0, 5.6)
      return h(
        'g',
        { className: 'fh-desk' },
        isoBox(0.5, 2.6, 2.5, 6.4, 64, { top: PALETTE.woodTop, right: PALETTE.woodRight, left: PALETTE.woodLeft }),
        // 桌腿
        h('rect', {
          x: project(0.7, 6.4)[0] - 3, y: project(0.7, 6.4)[1] - 62, width: 6, height: 62,
          fill: PALETTE.woodLeft, opacity: 0.85,
        }),
        // 笔记本
        isoBox(0.95, 3.5, 1.85, 4.3, 74, { top: '#4a4550', right: '#38333f', left: '#2c2734' }),
        h('polygon', {
          points: points([
            raise(project(1.0, 3.5), 78),
            raise(project(1.8, 3.5), 78),
            raise(project(1.8, 3.5), 116),
            raise(project(1.0, 3.5), 116),
          ]),
          fill: PALETTE.screen,
          stroke: '#4a4550',
          strokeWidth: 2,
        }),
        // 书
        isoBox(0.75, 4.9, 1.45, 5.5, 72, { top: '#c9a06f', right: '#a8825a', left: '#8a6a48' }),
        isoBox(0.8, 4.96, 1.4, 5.44, 82, { top: '#8f9bd0', right: '#7883b6', left: '#626c9b' }),
        // 马克杯
        h('circle', {
          cx: project(2.1, 4.4)[0],
          cy: raise(project(2.1, 4.4), 68)[1],
          r: 7,
          fill: '#f2ece0',
          stroke: '#c7b49b',
          strokeWidth: 1.5,
        }),
        // 台灯（矢量：灯杆 + 灯罩，开灯时亮）；光晕单独渲染在环境光之上
        h('rect', {
          x: lampBase[0] - 2,
          y: lampBase[1] - 78,
          width: 4,
          height: 78,
          fill: PALETTE.metal,
        }),
        h('polygon', {
          points: points([
            [lampBase[0] - 22, lampBase[1] - 74],
            [lampBase[0] + 22, lampBase[1] - 74],
            [lampBase[0] + 13, lampBase[1] - 96],
            [lampBase[0] - 13, lampBase[1] - 96],
          ]),
          fill: lamp ? '#f7d79b' : '#b9a48c',
          stroke: '#8a7358',
          strokeWidth: 1.5,
        }),
      )
    }

    /** 书桌台灯的光：单独一层，画在环境光之上，夜里不会被压暗 */
    function DeskGlow(props) {
      const { lamp, glow } = props
      if (!lamp) return null
      const lampBase = project(2.0, 5.6)
      return h(
        'g',
        { className: 'fh-light-source' },
        h('ellipse', {
          cx: lampBase[0],
          cy: lampBase[1] - 62,
          rx: 120,
          ry: 62,
          fill: 'url(#fh-lamp-glow)',
          opacity: 0.55,
        }),
        glow
          ? h('ellipse', {
            cx: project(1.8, 5.6)[0],
            cy: project(1.8, 5.6)[1] + 8,
            rx: 140,
            ry: 62,
            fill: 'url(#fh-lamp-glow)',
            opacity: 0.22,
          })
          : null,
      )
    }

    /** 床头灯素材：关 / 开 两张，交叉淡入；灯座就是床头柜本身。 */
    const NIGHT_LAMP = {
      off: `${ROUTE}/pack/lamp-off.png`,
      on: `${ROUTE}/pack/lamp-on.png`,
      x: 848,
      y: 352,
      width: 72,
      height: 128,
      skew: 0,
    }

    function NightLampView(props) {
      const { lamp } = props
      const { off, on, x, y, width, height, skew } = NIGHT_LAMP
      return h(
        'g',
        { className: 'fh-nightstand' },
        h(
          'g',
          { transform: `translate(${x}, ${y}) skewY(${(Math.atan(skew) * 180 / Math.PI).toFixed(3)})` },
          h('image', {
            href: off,
            x: 0,
            y: 0,
            width,
            height,
            preserveAspectRatio: 'none',
            className: 'fh-lamp-img',
            style: { opacity: lamp ? 0 : 1 },
          }),
          h('image', {
            href: on,
            x: 0,
            y: 0,
            width,
            height,
            preserveAspectRatio: 'none',
            className: 'fh-lamp-img',
            style: { opacity: lamp ? 1 : 0 },
          }),
        ),
      )
    }

    /** 床头灯的光：同样单独一层 */
    function NightLampGlow(props) {
      const { lamp } = props
      if (!lamp) return null
      const { x, y, width, height } = NIGHT_LAMP
      return h(
        'g',
        { className: 'fh-light-source' },
        h('ellipse', {
          cx: x + width / 2,
          cy: y + height * 0.28,
          rx: 96,
          ry: 58,
          fill: 'url(#fh-lamp-glow)',
          opacity: 0.55,
        }),
      )
    }

    function ShelfView() {
      return h(
        'g',
        { className: 'fh-shelf' },
        isoBox(0.5, 8.6, 2.3, 10.2, 148, { top: PALETTE.woodTop, right: PALETTE.woodRight, left: PALETTE.woodLeft }),
        h('polygon', {
          points: points([
            raise(project(0.5, 10.2), 146),
            raise(project(2.3, 10.2), 146),
            raise(project(2.3, 10.2), 4),
            raise(project(0.5, 10.2), 4),
          ]),
          fill: '#5d4530',
          opacity: 0.5,
        }),
        [44, 84, 124].map((dy) => h('line', {
          key: `shelf-${dy}`,
          x1: raise(project(0.5, 10.2), dy)[0],
          y1: raise(project(0.5, 10.2), dy)[1],
          x2: raise(project(2.3, 10.2), dy)[0],
          y2: raise(project(2.3, 10.2), dy)[1],
          stroke: '#6b4e34',
          strokeWidth: 3,
        })),
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const fx = 0.72 + (i % 4) * 0.36
          const dy = 14 + Math.floor(i / 4) * 40
          const p = raise(project(fx, 10.2), dy)
          return h('rect', {
            key: `book-${i}`,
            x: p[0] - 4,
            y: p[1] - 24,
            width: 8,
            height: 24,
            rx: 1,
            fill: ['#e0a98f', '#9fb6d8', '#a9c49a', '#d3b0d0', '#e6cb92', '#8fc0bc', '#d99a9a', '#b0b6d8'][i % 8],
          })
        }),
      )
    }

    function RugView() {
      return h(
        'g',
        null,
        h('polygon', {
          points: points([project(2.4, 8.8), project(6.4, 8.8), project(6.4, 12.4), project(2.4, 12.4)]),
          fill: PALETTE.rug,
          opacity: 0.85,
          stroke: PALETTE.rugDark,
          strokeWidth: 2,
        }),
        h('polygon', {
          points: points([project(2.9, 9.3), project(5.9, 9.3), project(5.9, 11.9), project(2.9, 11.9)]),
          fill: 'none',
          stroke: '#efdfc2',
          strokeWidth: 2,
          opacity: 0.7,
        }),
      )
    }

    function PlantView() {
      const p = project(10.85, 6.05)
      return h(
        'g',
        { className: 'fh-plant' },
        isoBox(10.4, 5.6, 11.3, 6.5, 32, { top: '#c98c6c', right: '#a9714f', left: '#8b5c3f' }),
        h('path', {
          d: `M ${p[0]} ${p[1] - 32} C ${p[0] - 27} ${p[1] - 72} ${p[0] - 10} ${p[1] - 98} ${p[0] + 4} ${p[1] - 76} C ${p[0] + 18} ${p[1] - 102} ${p[0] + 31} ${p[1] - 68} ${p[0] + 6} ${p[1] - 42} Z`,
          fill: PALETTE.plant,
        }),
        h('path', {
          d: `M ${p[0] + 2} ${p[1] - 34} C ${p[0] - 10} ${p[1] - 48} ${p[0] - 31} ${p[1] - 56} ${p[0] - 25} ${p[1] - 38} Z`,
          fill: PALETTE.plantDark,
        }),
      )
    }
    /* ======================================================================
     * 光影：窗光、屏幕光（TVGlow）、时段色、文案与按钮归一化
     * ==================================================================== */
    /**
     * 窗外投进来的光：数据写在 scene.json 的 light.window 里。
     * 白天在地面上铺一块柔和的光斑（越晚越淡），夜里完全消失。
     * 这样墙上不用硬画一扇窗，也能读出「右边有光」。
     */
    // 不同时段的光色：早上偏暖黄、正午偏白、傍晚偏橙
    const DAYLIGHT_TINTS = {
      dawn: '#ffd0a2',
      morning: '#fff0c8',
      noon: '#fffbe4',
      afternoon: '#ffeecb',
      evening: '#ffb27a',
      night: '#9db4e0',
      deepNight: '#8fa6d6',
    }

    function windowLightColor(spec, period) {
      if (spec && typeof spec.color === 'string' && spec.color !== '') return spec.color
      return DAYLIGHT_TINTS[period] || '#ffe9c4'
    }

    function WindowLight(props) {
      const { specs, day, period } = props
      const list = Array.isArray(specs) ? specs : (specs ? [specs] : [])
      if (list.length === 0 || !Number.isFinite(day) || day < 0.12) return null
      return h('g', { className: 'fh-window-lights', pointerEvents: 'none' },
        list.map((spec, index) => renderWindowLight(spec, day, period, index)))
    }

    function renderWindowLight(spec, day, period, index) {
      if (!spec || typeof spec !== 'object') return null
      const color = windowLightColor(spec, period)
      const fromRight = spec.from !== 'left'
      const cols = geom.cols
      const rows = geom.rows
      const at = clampNumber(spec.at, 0, 1, 0.62)
      const spread = clampNumber(spec.spread, 0.5, 16, 3)
      const reach = clampNumber(spec.reach, 0.5, rows, 2.8)
      const skew = clampNumber(spec.skew, -3, 3, fromRight ? 0.9 : -0.9)
      const center = fromRight ? at * cols : (1 - at) * cols
      const half = spread / 2
      const near = 0.12
      const quad = [
        [center - half, near],
        [center + half, near],
        [center + half + skew, Math.min(rows, near + reach)],
        [center - half + skew, Math.min(rows, near + reach)],
      ]
      const alpha = (0.16 + day * 0.4) * clampNumber(spec.alpha, 0, 1, 0.55)
      return h(
        'g',
        { className: 'fh-window-light', pointerEvents: 'none' },
        h('polygon', {
          points: points(quad.map(([fx, fy]) => project(fx, fy))),
          fill: color,
          opacity: alpha,
          filter: 'url(#fh-soft)',
        }),
        // 光打在墙面上的那一小块：贴着墙脚、往上一小截
        h('polygon', {
          points: points([
            project(quad[0][0], near),
            project(quad[1][0], near),
            [project(quad[1][0], near)[0], project(quad[1][0], near)[1] - clampNumber(spec.wallGlow, 0, 300, 90)],
            [project(quad[0][0], near)[0], project(quad[0][0], near)[1] - clampNumber(spec.wallGlow, 0, 300, 90)],
          ]),
          fill: color,
          opacity: alpha * 0.55,
          filter: 'url(#fh-soft)',
        }),
      )
    }

    /**
     * 电视屏幕前的白光：从电视底部朝房间里铺一块亮区，越暗越明显。
     * 位置来自 scene.json 的 tvGlow（指定哪件家具、铺多远多宽）。
     */
    /**
     * 电视屏幕光：光晕绑定在「屏幕」上（家具 rect 里的一个比例区域），
     * 所以电视在编辑器里挪动/缩放，光会跟着屏幕走。
     *
     * spec = { screen:[x,y,w,h] 屏幕在家具 rect 里的比例, width, reach, alpha }
     */
    function TVGlow(props) {
      const { spec, rect, on, day, roomLit } = props
      if (!on || !spec || !Array.isArray(rect)) return null
      const ratio = Array.isArray(spec.screen) && spec.screen.length === 4
        ? spec.screen.map((v) => clampNumber(v, 0, 1, 0))
        : [0.22, 0.02, 0.58, 0.46]
      // 屏幕在画布上的实际矩形（和精灵图同一坐标系）
      const sx = rect[0] + rect[2] * ratio[0]
      const sy = rect[1] + rect[3] * ratio[1]
      const sw = Math.max(8, rect[2] * ratio[2])
      const sh = Math.max(8, rect[3] * ratio[3])
      const scx = sx + sw / 2
      const scy = sy + sh / 2
      const night = 1 - clampNumber(day, 0, 1, 1)
      const baseAlpha = clampNumber(spec.alpha, 0, 1, 0.55)
      const alpha = baseAlpha * (0.2 + night * 0.8) * (roomLit ? 0.4 : 1)
      if (alpha <= 0.01) return null
      // 地面光池：从家具落脚点往房间里铺，宽度按屏幕宽度换算成地板格子
      const bx = rect[0] + rect[2] / 2
      const by = rect[1] + rect[3]
      const gfx = ((bx - geom.cx) / geom.kx + (by - geom.cy) / geom.ky) / 2
      const gfy = ((by - geom.cy) / geom.ky - (bx - geom.cx) / geom.kx) / 2
      const halfW = clampNumber(spec.width, 0.2, 12, (sw / geom.kx) * 0.75)
      const reach = clampNumber(spec.reach, 0.3, 10, 2.4)
      // offset：地面光池的整体位移（canvas 像素），用来微调光落在地上的位置
      const offX = Array.isArray(spec.offset) ? clampNumber(spec.offset[0], -600, 600, 0) : 0
      const offY = Array.isArray(spec.offset) ? clampNumber(spec.offset[1], -600, 600, 0) : 0
      const pool = [
        project(gfx - halfW, Math.max(0, gfy - 0.1)),
        project(gfx + halfW, Math.max(0, gfy - 0.1)),
        project(gfx + halfW * 1.3, gfy + reach),
        project(gfx - halfW * 1.3, gfy + reach),
      ].map((pt) => [pt[0] + offX, pt[1] + offY])
      const halo = Math.max(sw, sh) * 0.7
      return h('g', { className: 'fh-tv-glow', pointerEvents: 'none' },
        // 地面光池
        h('polygon', { points: points(pool), fill: '#eef4ff', opacity: alpha * 0.85, filter: 'url(#fh-soft)' }),
        // 屏幕光晕（绑在屏幕中心）
        h('ellipse', { cx: scx, cy: scy, rx: halo, ry: halo * 0.8, fill: 'url(#fh-tv-halo)', opacity: Math.min(0.95, alpha * 1.25) }),
        // 屏幕表面的一层提亮，看起来像「真的在发光」
        h('rect', { x: sx, y: sy, width: sw, height: sh, fill: '#ffffff', opacity: Math.min(0.35, alpha * 0.45) }),
      )
    }
    /** 场景数据里的文字：字符串原样返回，{zh,en} 按当前语言取 */
    function localizeText(text, locale) {
      if (typeof text === 'string') return text
      if (!text || typeof text !== 'object') return ''
      const lang = locale === 'en' ? 'en' : 'zh'
      return text[lang] || text.zh || text.en || ''
    }
    /* ======================================================================
     * 家具绘制：锚点、可见性、变形、精灵、选中框、排序、环境光
     * ==================================================================== */
    /**
     * 房间底部的按钮：由 scene.json 的 controls 决定，每个场景一套。
     *   { kind: 'toggle', key: 'deskLamp', label, suffix: 'state' }   开关类，suffix:state 就显示「开/关」
     *   { kind: 'toggle', key: 'curtainOpen', label, variants: { on, off } }  文案随状态换的开关
     *   { kind: 'event', id: 'read', label }                          触发事件
     *   { kind: 'reset', label }                                      回到屋子中间
     */

    function normalizeControls(raw) {
      if (!Array.isArray(raw)) return []
      const out = []
      raw.forEach((item, index) => {
        if (!item || typeof item !== 'object') return
        const kind = typeof item.kind === 'string' ? item.kind : ''
        const key = `ctrl-${index}`
        if (kind === 'toggle' && typeof item.key === 'string' && item.key !== '') {
          out.push({ kind, key, prop: item.key, label: item.label, suffix: item.suffix === 'state', variants: item.variants && typeof item.variants === 'object' ? item.variants : null })
        } else if (kind === 'event' && typeof item.id === 'string' && item.id !== '') {
          out.push({ kind, key, id: item.id, label: item.label })
        } else if (kind === 'reset') {
          out.push({ kind, key, label: item.label })
        }
      })
      return out
    }

    function PropGroup(props) {
      const { className, label, onActivate, onPointerDown, children } = props
      if (typeof onActivate !== 'function') return h('g', { className }, children)
      return h(
        'g',
        {
          className: `fh-prop ${className}`,
          role: 'button',
          tabIndex: 0,
          'aria-label': label,
          onPointerDown: typeof onPointerDown === 'function' ? onPointerDown : undefined,
          onClick: (event) => {
            event.stopPropagation()
            onActivate()
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onActivate()
            }
          },
        },
        children,
      )
    }

    /**
     * preset 注册表：数据里写 preset 名字，代码里负责怎么画（位置用 offset 调）。
     * 带 _glow 的是「光源」：数据里配 layer: "light"，会画在环境光之上。
     */
    const PRESETS = {
      desk: (props) => h(DeskView, { lamp: props.home.world.props.deskLamp }),
      desk_glow: (props) => h(DeskGlow, {
        lamp: props.home.world.props.deskLamp,
        glow: props.home.world.props.deskLamp || props.home.world.props.bedLamp,
      }),
      shelf: () => h(ShelfView, null),
      rug: () => h(RugView, null),
      plant: () => h(PlantView, null),
      night_lamp: (props) => h(NightLampView, { lamp: props.home.world.props.bedLamp }),
      night_lamp_glow: (props) => h(NightLampGlow, { lamp: props.home.world.props.bedLamp }),
      // 通用灯罩发光：位置取 part.rect（灯罩光晕 + 地面光池），客厅落地灯用
      lamp_glow: (props) => {
        const part = props.part || {}
        const r = Array.isArray(part.rect) ? part.rect.map(Number) : null
        if (!r) return null
        const cx = r[0] + r[2] / 2
        const headY = r[1] + r[3] * 0.16
        return h('g', { className: 'fh-lamp-glow', pointerEvents: 'none' },
          h('circle', { cx, cy: headY, r: Math.max(r[2], 70) * 1.25, fill: 'url(#fh-lamp-glow)', opacity: 0.7 }),
          h('ellipse', { cx, cy: r[1] + r[3], rx: r[2] * 2.2, ry: r[2] * 0.55, fill: 'url(#fh-lamp-glow)', opacity: 0.45 }),
        )
      },
    }

    // 装饰件（窗、挂画、窗光）不属于家具，顺序固定；角色和夜色叠加各占一个固定 z
    /** 装饰件的固定层级（屏幕光已改由家具 screenGlow 声明，画在光源层） */
    const DECOR_Z = { windowLight: 7 }
    const CHARACTER_Z = 100
    const OVERLAY_Z = 10000

    /* ======================================================================
     * 互动物锚点：家具可以挂 interactionAnchors，事件用 "bed:sleep" 引用。
     * 锚点决定角色站/躺/坐在哪（相对家具矩形 0~1）、朝哪边、播什么动画、压在什么 z。
     * ==================================================================== */

    /** 归一化一个锚点定义 */
    function normalizeAnchor(raw) {
      const source = raw && typeof raw === 'object' ? raw : {}
      const position = source.position && typeof source.position === 'object' ? source.position : {}
      const facing = typeof source.facing === 'string' && source.facing !== '' ? source.facing : 'front'
      const layer = source.renderLayer
      return {
        id: typeof source.id === 'string' && source.id !== '' ? source.id : 'default',
        position: {
          x: clampNumber(position.x, 0, 1, 0.5),
          y: clampNumber(position.y, 0, 1, 0.92),
        },
        facing,
        pose: typeof source.pose === 'string' && source.pose !== '' ? source.pose : null,
        renderLayer: typeof layer === 'string' ? layer : (Number.isFinite(Number(layer)) ? Number(layer) : 'front'),
        animation: typeof source.animation === 'string' && source.animation !== '' ? source.animation : null,
        // 接触点偏移（画布像素）：家具自己决定「角色落点相对接触点该偏多少」
        pivot: Array.isArray(source.pivot)
          ? [Number(source.pivot[0]) || 0, Number(source.pivot[1]) || 0]
          : [0, 0],
      }
    }

    /** "bed:sleep" -> { furnitureId: 'bed', anchorId: 'sleep' } */
    function parseAnchorRef(ref) {
      if (typeof ref !== 'string' || ref === '') return null
      const parts = ref.split(':')
      return {
        furnitureId: parts[0],
        anchorId: parts.length > 1 && parts[1] !== '' ? parts[1] : 'default',
      }
    }

    /** 锚点在画面上的落点 + 该用的 z */
    function resolveAnchor(ref) {
      const parsed = parseAnchorRef(ref)
      if (!parsed) return null
      const def = furnitureRef.value.find((item) => item && item.id === parsed.furnitureId)
      if (!def) return null
      // 家具的「动画列表」：每个动画自带位置 / 朝向 / 层级 / pivot
      const list = Array.isArray(def.animations)
        ? def.animations
        : (Array.isArray(def.interactionAnchors) ? def.interactionAnchors : [])
      if (list.length === 0) return null
      const raw = list.find((item) => item && (item.id || 'default') === parsed.anchorId) || list[0]
      const anchor = normalizeAnchor(raw)
      const part = (def.parts || []).find((item) => item && item.sprite && Array.isArray(item.sprite.rect))
      if (!part) return null
      const rect = part.sprite.rect.map(Number)
      const [rx, ry, rw, rh] = rect
      const baseZ = Number(part.z) || 0
      const layer = anchor.renderLayer
      const z = Number.isFinite(layer)
        ? layer
        : layer === 'behind' || layer === 'behind_furniture' || layer === 'behind_blanket'
          ? baseZ - 1
          : layer === 'on_furniture' || layer === 'on'
            ? baseZ + 1
            : CHARACTER_Z
      return {
        def,
        anchor,
        x: rx + rw * anchor.position.x + anchor.pivot[0],
        y: ry + rh * anchor.position.y + anchor.pivot[1],
        z,
        facing: anchor.facing,
        animation: anchor.animation || anchor.pose || null,
      }
    }

    /** part 的可见条件：家具状态 / 角色当前事件 */
    /** 行为 -> 落脚点（兜底 center） */
    function spotOf(behavior) {
      return (behavior && SPOTS[behavior.spot]) || SPOTS.center
    }

    function partVisible(part, home) {
      const when = part && part.visibleWhen
      if (!when || typeof when !== 'object') return true
      if (Array.isArray(when.characterEvent) && !when.characterEvent.includes(home.character.behaviorId)) {
        return false
      }
      // 反向条件：角色「不在」这些事件里才画（比如没人睡的被子）
      if (Array.isArray(when.characterEventNot) && when.characterEventNot.includes(home.character.behaviorId)) {
        return false
      }
      if (Array.isArray(when.period) && !when.period.includes(home.world.period)) {
        return false
      }
      if (when.state && typeof when.state === 'object') {
        for (const key of Object.keys(when.state)) {
          if (home.world.props[key] !== when.state[key]) return false
        }
      }
      return true
    }

    /** part 的地板偏移 → 屏幕位移；preset 内部的绘制坐标不用动 */
    function partOffsetTransform(part) {
      const offset = part && part.offset
      if (!offset || typeof offset !== 'object') return null
      const fx = Number(offset.fx) || 0
      const fy = Number(offset.fy) || 0
      if (fx === 0 && fy === 0) return null
      return `translate(${((fx - fy) * geom.kx).toFixed(2)}, ${((fx + fy) * geom.ky).toFixed(2)})`
    }

    /**
     * 素材图的变换：镜像 / 切变 / 旋转。
     * 旋转永远绕「支点」做（默认底边中点 = 落地接触点，也可选 rect 中心），
     * 这样调角度时家具不会整体漂走。
     */
    function spriteTransform(sprite, pivotX) {
      const rect = Array.isArray(sprite && sprite.rect) ? sprite.rect.map(Number) : [0, 0, 100, 100]
      const [x, y, w, hh] = rect
      // attach：贴在哪个面上，畸变（斜率）自动等于该面的斜率，不用手填
      //   wallRight / floorX → +projection     wallLeft / floorY → -projection
      const attach = sprite && typeof sprite.attach === 'string' ? sprite.attach.toLowerCase() : ''
      const manualSkew = sprite && sprite.skew !== undefined && sprite.skew !== null ? Number(sprite.skew) : NaN
      const projNow = geom && geom.kx ? geom.ky / geom.kx : 0.375
      const attachSkew = /left|y$/.test(attach) ? -projNow : projNow
      const skew = Number.isFinite(manualSkew) ? manualSkew : (attach ? attachSkew : 0)
      const rotate = Number(sprite && sprite.rotate) || 0
      const pivot = sprite && sprite.pivot === 'center' ? 'center' : 'bottom'
      const px = x + w / 2
      const py = y + (pivot === 'center' ? hh / 2 : hh)
      // skew 存的是斜率（tan），SVG 要的是角度
      const skewDeg = Math.atan(skew) * 180 / Math.PI
      // pivotX：整件家具共享一个切变原点时，补偿「各自的 x 造成的 y 偏移」，
      // 这样同一组部件切变后相对位置不变（拼接窗户/窗帘必须这么干）
      // 共享切变原点 P：部件自己的局部坐标从 x 开始，所以补偿量是 skew*(x0 - P)，
      // 展开后屏幕 y = Y + skew*(X - P)，等价于整组以 P 为原点一起切变。
      // 镜像时局部坐标是反的，锚点要用右边界 x + w。
      const anchorX = sprite && sprite.flipX === true ? x + w : x
      const compensate = Number.isFinite(pivotX) ? skew * (anchorX - pivotX) : 0
      const base = sprite && sprite.flipX === true
        ? `translate(${x + w}, ${y + compensate}) scale(-1, 1) skewY(${skewDeg.toFixed(3)})`
        : `translate(${x}, ${y + compensate}) skewY(${skewDeg.toFixed(3)})`
      const transform = rotate === 0
        ? base
        : `translate(${px.toFixed(2)} ${py.toFixed(2)}) rotate(${rotate}) ` +
          `translate(${(-px).toFixed(2)} ${(-py).toFixed(2)}) ${base}`
      return { rect, base, transform, rotate, pivot, pivotPoint: [px, py] }
    }

    /** 由字符串算一个稳定的色相，占位块之间颜色不同、同一件每次一样 */
    function labelHue(label) {
      let hash = 0
      for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) % 360
      return hash
    }

    /**
     * 缺图占位块：半透明填色 + 虚线框 + 文字。
     * 用来在还没画素材时先把位置、大小、遮挡顺序调对。
     */
    function Placeholder(props) {
      const { rect, label, note } = props
      const [x, y, w, hh] = rect
      const hue = labelHue(label)
      const fontSize = Math.max(11, Math.min(18, Math.round(w / 12)))
      return h(
        'g',
        { className: 'fh-placeholder' },
        h('rect', {
          x,
          y,
          width: w,
          height: hh,
          rx: Math.min(8, Math.min(w, hh) * 0.1),
          fill: `hsla(${hue}, 55%, 70%, 0.35)`,
          stroke: `hsla(${hue}, 45%, 45%, 0.9)`,
          strokeWidth: 2,
          strokeDasharray: '8 5',
        }),
        h('text', {
          x: x + w / 2,
          y: y + hh / 2 - (note ? 7 : 0),
          textAnchor: 'middle',
          dominantBaseline: 'middle',
          fontSize,
          fill: `hsl(${hue}, 45%, 32%)`,
          fontFamily: 'inherit',
        }, label),
        note
          ? h('text', {
            x: x + w / 2,
            y: y + hh / 2 + 11,
            textAnchor: 'middle',
            dominantBaseline: 'middle',
            fontSize: 10,
            fill: `hsl(${hue}, 30%, 40%)`,
            opacity: 0.85,
            fontFamily: 'inherit',
          }, note)
          : null,
      )
    }

    /**
     * 一张素材图；没有 src、rect 无效、或者图片 404，都退成占位块，
     * 这样不用等美术也能把逻辑跑通。
     */
    function SpritePart(props) {
      const { sprite, label, pivotX } = props
      const [failed, setFailed] = useState(false)
      const src = sprite && typeof sprite.src === 'string' ? sprite.src : ''
      const url = src ? `${ROUTE}/pack/${encodeURIComponent(src)}` : ''
      // 先探一次图片，404 就把这一格换成占位块（<image onError> 在个别场景不触发）
      useEffect(() => {
        if (!url || typeof Image !== 'function') return undefined
        let alive = true
        const probe = new Image()
        probe.onerror = () => {
          if (alive) setFailed(true)
        }
        probe.src = url
        return () => {
          alive = false
        }
      }, [url])
      const rect = Array.isArray(sprite && sprite.rect) ? sprite.rect.map(Number) : null
      if (!src) {
        return h(Placeholder, { rect: rect || [40, 60, 160, 120], label, note: '缺图' })
      }
      if (!rect || !(rect[2] > 0 && rect[3] > 0)) {
        return h(Placeholder, { rect: rect || [40, 60, 160, 120], label, note: 'rect 无效' })
      }
      if (failed) {
        return h(Placeholder, { rect, label, note: '图片加载失败' })
      }
      // 坏 rect（比如编辑器里拖出个几万像素）会让浏览器按尺寸分配超大纹理，直接渲崩，这里硬性夹住
      const MAX_PART_PX = 4000
      const [x, y, rawW, rawH] = rect
      const w = Math.min(MAX_PART_PX, Math.max(1, rawW))
      const hh = Math.min(MAX_PART_PX, Math.max(1, rawH))
      // repeat：同一张图按格子重复拼接，用来把「一小段窗框 / 一片窗帘 / 一截窗帘杆」拼成大件
      const repeat = sprite && sprite.repeat && typeof sprite.repeat === 'object' ? sprite.repeat : null
      const count = repeat ? clampNumber(repeat.count, 1, 40, 1) : 1
      const stepX = repeat && Number.isFinite(Number(repeat.dx)) ? Number(repeat.dx) : 0
      const stepY = repeat && Number.isFinite(Number(repeat.dy)) ? Number(repeat.dy) : 0
      const images = []
      for (let index = 0; index < count; index += 1) {
        images.push(h('image', {
          key: `piece-${index}`,
          href: url,
          x: index * stepX,
          y: index * stepY,
          width: w,
          height: hh,
          preserveAspectRatio: 'none',
          draggable: false,
          onError: () => setFailed(true),
        }))
      }
      return h(
        'g',
        { transform: spriteTransform(sprite, pivotX).transform, className: 'fh-sprite-part' },
        count === 1 ? images[0] : images,
      )
    }

    /** 把家具定义展开成可排序的绘制项：每个 part 一项，带自己的 z */
    /** 编辑器选中件的虚线框（只有素材图知道自己的屏幕矩形），跟着镜像/旋转一起走 */
    function SelectedBox(props) {
      const { sprite, onResizeStart, pivotX } = props
      const geo = spriteTransform(sprite, pivotX)
      const rect = geo.rect
      if (!rect || !(rect[2] > 0 && rect[3] > 0)) return null
      const resizable = typeof onResizeStart === 'function'
      // geo.transform 里已经把 rect 的左上角 translate 过了，所以框要画在「局部坐标」(0,0) 起
      return h(
        'g',
        { transform: geo.transform },
        h('rect', {
          x: -3,
          y: -3,
          width: rect[2] + 6,
          height: rect[3] + 6,
          fill: 'none',
          stroke: '#e07a2f',
          strokeWidth: 2,
          strokeDasharray: '7 5',
          pointerEvents: 'none',
        }),
        resizable
          ? h('rect', {
            className: 'fh-resize-handle',
            // flipX 时局部 x 方向是镜像的，手柄要放在「视觉上」的右下角
            x: sprite && sprite.flipX === true ? 10 : rect[2] - 10,
            y: rect[3] - 10,
            width: 14,
            height: 14,
            rx: 3,
            fill: '#e07a2f',
            stroke: '#fff',
            strokeWidth: 2,
            style: { cursor: 'nwse-resize' },
            onPointerDown: (event) => {
              if (typeof event.stopPropagation === 'function') event.stopPropagation()
              onResizeStart(event)
            },
          })
          : null,
      )
    }

    /** 整件编辑时，把各部件的 rect 并成一个外框（用于画选中框） */
    function unionSprite(def) {
      const rects = (def.parts || [])
        .map((part) => (part && part.sprite && Array.isArray(part.sprite.rect) ? part.sprite.rect.map(Number) : null))
        .filter(Boolean)
      if (rects.length === 0) return null
      const x0 = Math.min(...rects.map((r) => r[0]))
      const y0 = Math.min(...rects.map((r) => r[1]))
      const x1 = Math.max(...rects.map((r) => r[0] + r[2]))
      const y1 = Math.max(...rects.map((r) => r[1] + r[3]))
      const first = def.parts.find((part) => part && part.sprite && !part.preset)
      const sprite = { rect: [x0, y0, x1 - x0, y1 - y0] }
      if (first && first.sprite) {
        if (first.sprite.attach) sprite.attach = first.sprite.attach
        if (Number.isFinite(Number(first.sprite.skew))) sprite.skew = Number(first.sprite.skew)
      }
      return sprite
    }

    function furnitureItems(defs, home, t, actions, edit) {
      const items = []
      const editing = !!(edit && edit.on)
      for (const def of defs) {
        // surface：整件家具贴在一个面上（墙/地）。所有部件共用一个切变原点，
        // 相对位置先排好，再整体切变——拼接窗户就用这个。
        const surf = def.surface && typeof def.surface === 'object' ? def.surface : null
        let surfacePivot
        if (surf) {
          const xs = def.parts
            .map((item) => (item && item.sprite && Array.isArray(item.sprite.rect) ? Number(item.sprite.rect[0]) : NaN))
            .filter((value) => Number.isFinite(value))
          if (xs.length > 0) surfacePivot = Math.min(...xs)
        }
        // editAsOne：整件家具当成一个编辑对象（拼出来的窗户/窗帘），点哪都选整件
        const editAsOne = def.editAsOne === true
        for (const part of def.parts) {
          if (!part || !partVisible(part, home)) continue
          const partKey = editAsOne ? '*' : (part.id || 'part')
          const partLabel = part.id ? `${def.id}:${part.id}` : def.id
          let content
          if (part.preset) {
            content = PRESETS[part.preset]
              ? h(PRESETS[part.preset], { home, part })
              : h(Placeholder, { rect: [40, 60, 200, 120], label: partLabel, note: `未知 preset: ${part.preset}` })
          } else {
            const spriteForRender = surf && part.sprite && !part.sprite.attach && typeof surf.attach === 'string'
              ? { ...part.sprite, attach: surf.attach }
              : part.sprite
            content = h(SpritePart, { sprite: spriteForRender, label: partLabel, pivotX: surfacePivot })
          }
          if (!content) continue
          const offset = partOffsetTransform(part)
          const inner = offset ? h('g', { transform: offset }, content) : content
          const click = def.click && typeof def.click === 'object' ? def.click : null
          const label = t(`scene.${def.id}`)
          let onActivate
          if (editing) {
            onActivate = () => actions.select(def.id, partKey)
          } else if (click) {
            onActivate = () => {
              if (click.type === 'toggle') actions.toggle(click.key)
              else if (click.type === 'scene') actions.gotoScene && actions.gotoScene(click.id)
              else actions.interact(click.id, def.id)
            }
          }
          const selected = editing && edit.selected &&
            edit.selected.defId === def.id && edit.selected.partId === partKey
          const node = h(
            PropGroup,
            {
              className: `fh-prop-${def.id}${selected ? ' fh-prop-selected' : ''}`,
              label,
              onActivate,
              onPointerDown: editing && typeof actions.dragStart === 'function'
                ? (event) => actions.dragStart(def.id, partKey, event)
                : undefined,
            },
            inner,
          )
          items.push({
            key: `${def.id}:${partKey}`,
            z: Number(part.z) || 0,
            layer: part.layer === 'light' ? 'light' : 'scene',
            node,
          })
          if (selected) {
            items.push({
              key: `${def.id}:${partKey}:sel`,
              z: 9990,
              node: h(SelectedBox, {
                sprite: editAsOne ? unionSprite(def) : part.sprite,
                pivotX: surfacePivot,
                onResizeStart: editing && typeof actions.resizeStart === 'function'
                  ? (event) => actions.resizeStart(def.id, partKey, event)
                  : undefined,
              }),
            })
          }
        }
      }
      return items
    }

    /**
     * 全局环境光：只是一个铺满画布的矩形，
     * 颜色和浓度都由 CSS 变量控制（.fh-stage 上按时间段设置），
     * 这样「氛围」可以在样式里调，不用改渲染代码。
     */
    function Ambient() {
      return h('rect', {
        className: 'fh-ambient',
        x: 0,
        y: 0,
        width: geom.canvasW,
        height: geom.canvasH,
        pointerEvents: 'none',
      })
    }

    /**
     * 房间灯（吸顶灯）：天黑了、人又没睡，就默认开着。
     * 不是家具，是环境的一部分，所以直接算出来，不存进存档。
     */
    /**
     * 房间灯到底开不开：
     *   scene.roomLight = { mode: 'prop', prop: 'someSwitch' } → 由用户开关决定（默认不写 = 天黑自动）
     *   否则沿用「天黑自动开」的老逻辑（卧室吸顶灯）
     */
    /** 窗帘挡光系数：scene.curtainLight 可调，默认蓝帘挡得多、白纱几乎不挡 */
    function curtainLightFactor(props) {
      const conf = sceneRef.value && sceneRef.value.curtainLight ? sceneRef.value.curtainLight : null
      if (!props) return 1
      if (props.curtainBlueClosed) return conf && Number.isFinite(Number(conf.blue)) ? Number(conf.blue) : 0.42
      if (props.curtainWhiteClosed) return conf && Number.isFinite(Number(conf.white)) ? Number(conf.white) : 0.94
      return 1
    }

    function roomLightState(home, clock) {
      const conf = sceneRef.value && sceneRef.value.roomLight ? sceneRef.value.roomLight : null
      if (conf && conf.mode === 'prop' && typeof conf.prop === 'string') {
        return !!(home && home.world && home.world.props && home.world.props[conf.prop])
      }
      return roomLightOn(home, clock)
    }

    function roomLightOn(home, clock) {
      const id = home && home.character ? home.character.behaviorId : ''
      if (id === 'sleep' || id === 'nap') return false
      // 以模拟世界的时间段为准（存档里的 period 每次 tick 都会更新），没有就退回真实时钟
      const period = home && home.world && typeof home.world.period === 'string'
        ? home.world.period
        : (clock ? clock.period : '')
      if (period === 'night' || period === 'deepNight') return true
      // 傍晚开始天就黑了（daylight 掉到 0.25 以下），也开灯
      return clock ? clock.daylight < 0.25 : false
    }

    /** 吸顶灯的光池：铺满整间屋子，画在光源层里 */
    function RoomGlow() {
      return h(
        'g',
        { className: 'fh-room-glow', pointerEvents: 'none' },
        h('ellipse', {
          cx: geom.canvasW / 2,
          cy: geom.canvasH * 0.46,
          rx: geom.canvasW * 0.62,
          ry: geom.canvasH * 0.58,
          fill: 'url(#fh-room-light)',
          opacity: 0.55,
        }),
      )
    }
    /* ======================================================================
     * 场景合成入口 SceneSvg
     * ==================================================================== */
    function SceneSvg(props) {
      const { home, views, t, now, onProp, onToggle, edit, onSelect, onDragStart, onResizeStart, onScene, zoom } = props
      const propsState = home.world.props
      const clock = timeSnapshot(new Date(now || Date.now()), localeRef.value)
      // 当前事件如果指定了互动物锚点（"bed:sleep"），角色就落在锚点上，z 也跟着改
      const currentBehavior = BEHAVIOR_BY_ID[home.character.behaviorId] || BEHAVIOR_BY_ID.idle
      const characterAnchor = currentBehavior && currentBehavior.anchor ? resolveAnchor(currentBehavior.anchor) : null
      const sceneLightConf = sceneRef.value && sceneRef.value.light ? sceneRef.value.light : null
      // 屏幕光：家具自己声明 screenGlow，可以有多台，各自绑自己的开关/行为
      const screenGlows = (furnitureRef.value || [])
        .map((def) => {
          const spec = def && def.screenGlow && typeof def.screenGlow === 'object' ? def.screenGlow : null
          if (!spec) return null
          const part = (def.parts || []).find((item) => item && item.sprite && Array.isArray(item.sprite.rect))
          if (!part) return null
          const propKey = typeof spec.prop === 'string' && spec.prop !== '' ? spec.prop : 'tvOn'
          const behaviorId = typeof spec.behavior === 'string' && spec.behavior !== '' ? spec.behavior : 'watch_tv'
          const on = !!(propsState[propKey] === true || (home.character && home.character.behaviorId === behaviorId))
          if (!on) return null
          return { id: def.id, spec, rect: part.sprite.rect }
        })
        .filter(Boolean)
      const roomLitNow = roomLightState(home, clock)
      // 窗帘对光的影响：蓝帘挡得多、白纱几乎不挡
      const curtainFactor = curtainLightFactor(propsState)
      const lightDay = clampNumber(clock.daylight * curtainFactor, 0, 1, 0)
      const sceneLights = sceneLightConf
        ? (Array.isArray(sceneLightConf.sources) ? sceneLightConf.sources : (sceneLightConf.window ? [sceneLightConf.window] : []))
        : []
      // 她有自己的所在地：你切到别的房间时，只换视角，她不在画面里
      const sceneId = sceneRef.value && typeof sceneRef.value.id === 'string' ? sceneRef.value.id : ''
      const homeMap = home.world && typeof home.world.map === 'string' ? home.world.map : ''
      const petHere = !homeMap || !sceneId || homeMap === sceneId
      const characterZ = characterAnchor ? characterAnchor.z : CHARACTER_Z

      // scene.effects === false 时关掉氛围特效（光源、光斑、环境光），排查渲染开销用
      const effectsOnFlag = !(sceneRef.value && sceneRef.value.effects === false)
      // 只画属于当前场景的家具：loadScene 会给 def.__scene 打标记，
      // 万一有哪条路径把旧房间的家具写回来（竞态/编辑快照），也不会画到当前房间里。
      const currentSceneId = sceneId
      const liveFurniture = (furnitureRef.value || []).filter((def) => {
        if (!def || !def.__scene) return true
        return !currentSceneId || def.__scene === currentSceneId
      })
      const parts = furnitureItems(liveFurniture, home, t, { interact: onProp, toggle: onToggle, select: onSelect, dragStart: onDragStart, resizeStart: onResizeStart, gotoScene: onScene }, edit)
      const sceneParts = parts.filter((item) => item.layer !== 'light')
      const lightParts = parts.filter((item) => item.layer === 'light')
      // 房间灯的光池也走场景配置：客厅由「客厅灯」开关决定，卧室仍是天黑自动
      if (roomLitNow) {
        lightParts.push({ key: 'room-light', z: -1000, node: h(RoomGlow) })
      }
      // 电视屏幕光：放光源层，否则会被电视精灵本身盖住
      for (const glow of screenGlows) {
        lightParts.push({
          key: `screen-glow:${glow.id}`,
          z: 200,
          node: h(TVGlow, { spec: glow.spec, rect: glow.rect, on: true, day: clock.daylight, roomLit: roomLitNow }),
        })
      }

      // 镜头偏移：fixed 恒为 0；follow / soft 由角色位置推出来，夹在场景范围内
      const cam = geom.camera || { mode: 'fixed', windowW: geom.canvasW, windowH: geom.canvasH, follow: 1 }
      // zoom < 1 = 拉远（看到更多）；zoom === 'fit' = 整间屋子塞进窗口
      const zoomValue = clampNumber(Number(zoom), 0.3, 1, 1)
      const baseWinW = Math.min(cam.windowW, geom.canvasW)
      const baseWinH = Math.min(cam.windowH, geom.canvasH)
      const camWindowW = zoom === 'fit' ? geom.canvasW : Math.min(geom.canvasW, Math.max(200, baseWinW / zoomValue))
      const camWindowH = zoom === 'fit' ? geom.canvasH : Math.min(geom.canvasH, Math.max(150, baseWinH / zoomValue))
      let camX = 0
      let camY = 0
      if (cam.mode !== 'fixed') {
        const spot = spotOf(currentBehavior)
        const charX = characterAnchor ? characterAnchor.x : project(spot.fx, spot.fy)[0]
        const charY = characterAnchor ? characterAnchor.y : project(spot.fx, spot.fy)[1]
        const follow = cam.follow || 1
        if (geom.canvasW > camWindowW) {
          const raw = (charX - camWindowW / 2) * follow
          camX = Math.max(0, Math.min(geom.canvasW - camWindowW, raw))
        }
        if (geom.canvasH > camWindowH) {
          const raw = (charY - camWindowH * 0.62) * follow
          camY = Math.max(0, Math.min(geom.canvasH - camWindowH, raw))
        }
        camX = Math.round(camX * 100) / 100
        camY = Math.round(camY * 100) / 100
      }

      // 场景层：会互相遮挡的件，按 z 升序画；环境光在最上面压一层
      const effectsOn = effectsOnFlag
      const items = [
        effectsOn ? { key: 'windowLight', z: DECOR_Z.windowLight, node: h(WindowLight, { specs: sceneLights, day: lightDay, period: clock.period }) } : null,
        ...sceneParts,
        ...(petHere
          ? [{ key: 'character', z: characterZ, node: h(CharacterNode, { home, views, now, t, anchor: characterAnchor }) }]
          : []),
        effectsOn ? { key: 'ambient', z: OVERLAY_Z, node: h(Ambient) } : null,
      ]
      // 注意：filter/sort 返回新数组，必须赋回去，否则 z 排序等于没做
      const orderedItems = items.filter(Boolean).sort((a, b) => a.z - b.z || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      lightParts.sort((a, b) => a.z - b.z || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

      const cameraStyle = {
        transform: `translate(${-camX}px, ${-camY}px)`,
        transition: cam.mode === 'fixed' ? 'none' : 'transform 430ms cubic-bezier(.33, .8, .3, 1)',
      }

      return h(
        'svg',
        {
          viewBox: `0 0 ${camWindowW} ${camWindowH}`,
          preserveAspectRatio: 'xMidYMid slice',
          className: 'fh-scene',
          role: 'img',
          'aria-label': t('scene.aria'),
        },
        h(RoomDefs),
        h(
          'g',
          { className: 'fh-camera', style: cameraStyle, 'data-camera': cam.mode },
          h(Backdrop),
          orderedItems.filter((item) => item.key !== 'ambient').map((item) => h('g', { key: item.key, 'data-z': item.z }, item.node)),
          // 光源层：画在环境光之上，所以夜里是「亮」的，不会被压暗
          effectsOn && lightParts.length > 0
            ? h('g', { className: 'fh-lights' }, lightParts.map((item) => h('g', { key: item.key, 'data-z': item.z }, item.node)))
            : null,
        ),
        // 环境光不跟着镜头动，始终铺满可视窗口
        orderedItems.filter((item) => item.key === 'ambient').map((item) => h('g', { key: item.key, 'data-z': item.z }, item.node)),
      )
    }
    /* ======================================================================
     * 7. 视图组件
     * ==================================================================== */

    function useNow(intervalMs) {
      const [now, setNow] = useState(Date.now())
      useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(timer)
      }, [intervalMs])
      return now
    }

    /**
     * 角色帧：用「嵌套 <svg viewBox=帧矩形>」从精灵图里裁一格。
     * 嵌套 svg 的坐标系就是整张精灵图，viewBox 把视口缩到那一格。
     */
    function CharacterSprite(props) {
      const { view } = props
      const frames = view.frames
      const groupSize = Number(view.groupSize) > 1 ? Math.round(Number(view.groupSize)) : 1
      const groups = Math.max(1, Math.floor(frames.length / groupSize))
      const [index, setIndex] = useState(() => {
        if (!view.randomStart) return 0
        // 随机挑一组（每种食物），再只在这组里循环
        const g = Math.floor(Math.random() * groups)
        return g * groupSize
      })
      useEffect(() => {
        setIndex(0)
      }, [view.key])
      useEffect(() => {
        const frame = frames[index % frames.length]
        // hold：停在随机挑中的那一帧（点心只出一种）
        if (view.hold || frames.length <= 1) return undefined
        const timer = setTimeout(() => {
          setIndex((current) => {
            const base = groupSize > 1 ? Math.floor(current / groupSize) * groupSize : 0
            const span = groupSize > 1 ? groupSize : frames.length
            return base + (current - base + 1) % span
          })
        }, frame.ms)
        return () => clearTimeout(timer)
      }, [index, view.key, frames])
      const frame = frames[index % frames.length]
      const cell = view.cell || frame.rect
      // 她大概 1.6m，墙按 2.6m 算 → 站高约墙高的 0.62
      // 用墙高而不是画布宽度，换房间（画布 1000 / 1800）时大小才一致；
      // 没有墙的户外场景可以在 scene.json 里直接写 characterHeight
      const sceneOverride = sceneRef.value && Number.isFinite(sceneRef.value.characterHeight)
        ? Number(sceneRef.value.characterHeight)
        : 0
      const charHeight = sceneOverride > 0 ? sceneOverride : (geom.wall || 280) * 0.62
      // 有些动作的图纸格子更大（带思考泡泡等），用 view.scale 把显示尺寸拉回一致
      // squash：当前帧把高度压低几个像素（吃饭的小起伏）
      const baseHeight = charHeight * (Number(view.scale) > 0 ? Number(view.scale) : 1)
      const height = baseHeight - (Number(frame.squash) > 0 ? Number(frame.squash) : 0)
      const width = height * (cell.w / cell.h)
      // 思考气泡：单独素材，画在她头顶上方
      const bubble = view.bubble
      const bubbleSize = bubble ? Math.max(24, Number(bubble.size) || 120) : 0
      const bubbleW = bubbleSize
      const bubbleH = bubble ? bubbleSize * (Number(bubble.aspect) || 0.8) : 0
      return h(
        'g',
        { className: 'fh-sprite-breathe' },
        h(
          'svg',
          {
            x: -width / 2,
            y: -height,
            width,
            height,
            viewBox: `${frame.rect.x} ${frame.rect.y} ${frame.rect.w} ${frame.rect.h}`,
            preserveAspectRatio: 'none',
            overflow: 'hidden',
          },
          h('image', {
            href: frame.url,
            x: 0,
            y: 0,
            width: frame.sheet.w,
            height: frame.sheet.h,
            preserveAspectRatio: 'none',
          }),
        ),
        bubble
          ? h('image', {
            className: 'fh-thought-bubble',
            href: bubble.url,
            x: (Number(bubble.dx) || 0) - bubbleW / 2,
            y: -height - (Number(bubble.dy) || 0) - bubbleH * 0.35,
            width: bubbleW,
            height: bubbleH,
            preserveAspectRatio: 'none',
          })
          : null,
      )
    }

    /** 角色：固定 z，和家具一起参与排序（见 SCENE_Z） */
    function CharacterNode(props) {
      const { home, views, now, t, anchor } = props
      const character = home.character
      const behavior = BEHAVIOR_BY_ID[character.behaviorId] || BEHAVIOR_BY_ID.idle
      const spot = SPOTS[behavior.spot] || SPOTS.center
      const emote = character.emote && character.emote.until > now ? character.emote : null
      const sleeping = !emote && (character.behaviorId === 'sleep' || character.behaviorId === 'nap')

      // 没有走路素材：位置变化时淡出 → 换到新位置 → 淡入。
      // 顺带解决了「穿墙」问题——反正是一次呼吸之间到位的。
      const targetX = anchor ? anchor.x : project(spot.fx, spot.fy)[0]
      const targetY = anchor ? anchor.y : project(spot.fx, spot.fy)[1]
      const [place, setPlace] = useState({ x: targetX, y: targetY })
      const [visible, setVisible] = useState(true)
      const placeRef = useRef({ x: targetX, y: targetY })
      useEffect(() => {
        const last = placeRef.current
        if (Math.abs(last.x - targetX) < 0.5 && Math.abs(last.y - targetY) < 0.5) return undefined
        setVisible(false)
        const timer = setTimeout(() => {
          placeRef.current = { x: targetX, y: targetY }
          setPlace({ x: targetX, y: targetY })
          setVisible(true)
        }, 460)
        return () => clearTimeout(timer)
      }, [targetX, targetY])

      // 气泡台词：可以直接带 text，也可以只带 code 交给本地化
      const sayRaw = character.say && character.say.until > now ? character.say : null
      const sayText = sayRaw
        ? (typeof sayRaw.text === 'string' && sayRaw.text !== ''
          ? sayRaw.text
          : (sayRaw.code && typeof t === 'function' ? t(`say.${sayRaw.code}`) : ''))
        : ''
      const say = sayText ? { text: sayText } : null
      // 点互动物时往那边偏一下头
      const lean = character.lean && character.lean.until > now ? character.lean : null
      // 锚点可以覆盖播放的动画（比如躺床上播 sleep）
      const anchorTag = anchor && anchor.animation ? anchor.animation : null
      const tag = emote ? emote.tag : (anchorTag || behavior.anim)
      const view = views[tag] || views.idle
      // view 是 { key, frames, cell } 这种「视图数据」，要包成组件才能当子节点用
      const characterNode = view
        ? h(CharacterSprite, { view })
        : h(Placeholder, {
          rect: [-45, -135, 90, 135],
          label: home.characterName || 'character',
          note: '缺角色图',
        })
      // 有锚点时（比如躺床上）角色要留在画面里，让被子盖住下半身；没锚点就按老逻辑隐藏
      if (sleeping && !anchor) return null
      const x = place.x
      const y = place.y
      return h(
        'g',
        {
          className: 'fh-character',
          'data-period': home.world.period,
          'data-fade': visible ? 'in' : 'out',
          style: { transform: `translate(${x}px, ${y}px)`, opacity: visible ? 1 : 0 },
        },
        h(
          'g',
          { className: 'fh-character-body' },
          h('ellipse', {
            className: 'fh-character-shadow',
            cx: 0,
            cy: 0,
            rx: (geom.wall || 280) * 0.09,
            ry: (geom.wall || 280) * 0.024,
            fill: 'url(#fh-shadow)',
          }),
          // 偏头：每次点互动物重挂一次，动画才会重新播
          h(
            'g',
            {
              key: lean ? `lean-${lean.until}` : 'rest',
              className: lean ? 'fh-character-peek' : undefined,
              'data-dir': lean ? String(lean.dir) : undefined,
            },
            // 朝向：左向的锚点把立绘水平镜像（正面立绘看不出，换侧身素材后生效）
            h('g', { className: 'fh-facing-flip', transform: anchor && /left/i.test(String(anchor.facing)) ? 'scale(-1, 1)' : undefined }, characterNode),
          ),
        ),
        // 气泡：贴着角色头顶，宽度按字数估
        say
          ? (() => {
            const text = fillText(String(say.text), home)
            const fontSize = 18
            const lineHeight = 26
            const padX = 16
            const padY = 10
            // 多行 + 高度自适应：SVG 不会自动换行，得自己排
            const wrapped = wrapBubbleText(text, { fontSize, maxWidth: 250, maxLines: 3 })
            const boxW = Math.max(90, Math.min(282, wrapped.width + padX * 2))
            const boxH = wrapped.lines.length * lineHeight + padY * 2
            const top = -Math.round(sceneRef.value && Number.isFinite(sceneRef.value.characterHeight) ? sceneRef.value.characterHeight : (geom.wall || 280) * 0.62) - 18 - boxH
            return h(
              'g',
              { className: 'fh-say', pointerEvents: 'none' },
              h('rect', {
                x: -boxW / 2,
                y: top,
                width: boxW,
                height: boxH,
                rx: 14,
                fill: '#fffdf7',
                stroke: '#c9a882',
                strokeWidth: 2,
              }),
              h('polygon', {
                points: `-7,${top + boxH} 7,${top + boxH} 0,${top + boxH + 10}`,
                fill: '#fffdf7',
                stroke: '#c9a882',
                strokeWidth: 2,
              }),
              h('text', {
                x: 0,
                y: top + padY + fontSize,
                textAnchor: 'middle',
                fontSize,
                fill: '#5b4636',
              }, wrapped.lines.map((line, index) => h('tspan', {
                key: index,
                x: 0,
                dy: index === 0 ? 0 : lineHeight,
              }, line))),
            )
          })()
          : null,
      )
    }

    /**
     * 气泡文本排版：按字符估宽 + 贪心换行。
     * SVG 的 <text> 不会自动换行，只能自己算——中日韩字符按 1 个字宽，ASCII 窄一些。
     */
    function wrapBubbleText(text, options) {
      const config = options || {}
      const fontSize = Number(config.fontSize) > 0 ? Number(config.fontSize) : 18
      const maxWidth = Number(config.maxWidth) > 0 ? Number(config.maxWidth) : 250
      const maxLines = Number(config.maxLines) > 0 ? Number(config.maxLines) : 3
      const charWidth = (ch) => {
        const code = ch.codePointAt(0)
        if (code >= 0x2e80) return fontSize // 中日韩 / 全角
        if (ch === ' ') return fontSize * 0.3
        if (/[iIl1.,'!|:;]/.test(ch)) return fontSize * 0.32
        if (/[A-Z0-9]/.test(ch)) return fontSize * 0.64
        return fontSize * 0.54
      }
      const widthOf = (line) => {
        let width = 0
        for (const ch of line) width += charWidth(ch)
        return width
      }
      const source = typeof text === 'string' ? text : ''
      const lines = []
      let line = ''
      let width = 0
      // 行首行尾的空格去掉（英文换行时常见）
      const push = (value) => lines.push(value.replace(/^\s+/, '').replace(/\s+$/, ''))
      for (const ch of source) {
        if (ch === '\n') {
          push(line)
          line = ''
          width = 0
          continue
        }
        const w = charWidth(ch)
        if (width + w > maxWidth && line !== '') {
          push(line)
          line = ''
          width = 0
          // 注意：不要 continue——这个字符要作为新行的第一个字符
        }
        line += ch
        width += w
      }
      if (line !== '') push(line)
      if (lines.length === 0) lines.push('')
      const truncated = lines.length > maxLines
      const kept = truncated ? lines.slice(0, maxLines) : lines
      if (truncated) {
        // 最后一行收尾加省略号
        const last = kept[kept.length - 1]
        kept[kept.length - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : '…'
      }
      const boxWidth = Math.max(...kept.map((item) => widthOf(item)))
      return { lines: kept, width: boxWidth, truncated }
    }

    function RoomStage(props) {
      const { home, views, now, t, actions, edit, onSelect, onDragStart, onResizeStart, zoom, sceneKey } = props
      const clock = timeSnapshot(new Date(now), localeRef.value)
      // 房间灯：天黑了又没在睡觉就开着，房间亮一大截
      const roomLit = roomLightState(home, clock)
      // 窗帘对进光量的影响：蓝帘挡光多、白纱几乎不挡
      const worldProps = home.world.props || {}
      const curtainFactor = curtainLightFactor(worldProps)
      const daylightEff = clock.daylight * curtainFactor
      // 只算一个 0~1 的浓度交给 CSS；颜色和混合方式都在样式里
      const ambientAlpha = (0.06 + (1 - daylightEff) * 0.34) * (roomLit ? 0.4 : 1)

      return h(
        'div',
        {
          className: 'fh-stage',
          'data-period': home.world.period,
          'data-room-light': roomLit ? 'on' : 'off',
          'data-edit': edit && edit.on ? 'on' : 'off',
          style: {
            aspectRatio: (() => {
              if (zoom === 'fit') return `${geom.canvasW} / ${geom.canvasH}`
              const z = Number(zoom)
              const k = Number.isFinite(z) && z > 0 ? z : 1
              const w = Math.min(geom.canvasW, (geom.camera && geom.camera.windowW ? geom.camera.windowW : geom.canvasW) / k)
              const h = Math.min(geom.canvasH, (geom.camera && geom.camera.windowH ? geom.camera.windowH : geom.canvasH) / k)
              return `${w} / ${h}`
            })(),
            '--fh-ambient-alpha': ambientAlpha.toFixed(3),
          },
        },
        h(SceneSvg, {
          // 切房间时强制重挂载：万一家具数据换了而某类节点没被 diff 掉（残留旧房间的窗），
          // 重建整棵场景树最稳；代价只是切场景那一下动画从头开始。
          key: sceneKey || 'scene',
          home,
          views,
          t,
          now,
          onProp: (target) => actions.interact(target),
          onScene: (id) => actions.gotoScene && actions.gotoScene(id),
          zoom,
          onToggle: (key) => actions.toggle(key),
          edit,
          onSelect,
          onDragStart,
          onResizeStart,
        }),
        h(
          'div',
          { className: 'fh-room-badge' },
          h('span', { className: 'fh-room-name' }, home.roomName || t('room.title', { name: home.characterName })),
          h('span', { className: 'fh-room-meta' }, `${clock.clock} · ${t(`season.${home.world.season}`)} ${home.world.temperature}°`),
        ),
        h(
          'div',
          { className: 'fh-room-actions' },
          h('button', { type: 'button', className: 'fh-room-action', onClick: () => actions.interact('pat') }, t('action.pat')),
          h('button', { type: 'button', className: 'fh-room-action', onClick: () => actions.openCharacter() }, t('action.character')),
        ),
      )
    }

    function Chip(props) {
      const { children, tone } = props
      return h('span', { className: `fh-chip${tone ? ` fh-chip-${tone}` : ''}` }, children)
    }

    function Meter(props) {
      const { label, value, hint } = props
      const rounded = Math.round(value)
      return h(
        'div',
        { className: 'fh-meter' },
        h('div', { className: 'fh-meter-head' },
          h('span', { className: 'fh-meter-label' }, label),
          h('span', { className: 'fh-meter-value' }, `${rounded}`),
        ),
        h('div', {
          className: 'fh-meter-track',
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': rounded,
          'aria-label': label,
        }, h('div', { className: 'fh-meter-fill', style: { width: `${Math.max(2, rounded)}%` } })),
        hint ? h('p', { className: 'fh-meter-hint' }, hint) : null,
      )
    }

    function StatusCard(props) {
      const { home, now, t } = props
      const character = home.character
      const behavior = BEHAVIOR_BY_ID[character.behaviorId] || BEHAVIOR_BY_ID.idle
      const total = Math.max(1, character.until - character.since)
      const elapsed = clamp01((now - character.since) / total)
      const sleeping = character.behaviorId === 'sleep' || character.behaviorId === 'nap'
      const remain = Math.max(0, Math.ceil((character.until - now) / 1000))
      return h(
        'section',
        { className: 'fh-card' },
        h('header', { className: 'fh-card-head' },
          h('span', null, t('status.title')),
          h('span', { className: 'fh-muted' }, t('status.remain', { seconds: remain })),
        ),
        h('div', { className: 'fh-nowline' },
          h('span', { className: `fh-dot${sleeping ? ' fh-dot-sleep' : ''}` }),
          h('span', { className: 'fh-now' }, t(`behavior.${behavior.id}`)),
        ),
        h('p', { className: 'fh-flavor' }, t(`flavor.${behavior.id}`)),
        h('div', { className: 'fh-progress' },
          h('div', { className: 'fh-progress-fill', style: { width: `${Math.round(elapsed * 100)}%` } }),
        ),
      )
    }

    function NeedsCard(props) {
      const { home, t } = props
      const character = home.character
      return h(
        'section',
        { className: 'fh-card' },
        h('header', { className: 'fh-card-head' },
          h('span', null, fillText(t('needs.title'), home)),
          h('span', { className: 'fh-muted' }, t('needs.day', { days: home.stats.daysLived })),
        ),
        h(Meter, { label: t('needs.energy'), value: character.energy, hint: t(`needs.energyHint.${energyTier(character.energy)}`) }),
        h(Meter, { label: t('needs.satiety'), value: character.satiety, hint: t(`needs.satietyHint.${satietyTier(character.satiety)}`) }),
        h(Meter, { label: t('needs.mood'), value: character.mood, hint: t(`needs.moodHint.${moodTier(character.mood)}`) }),
      )
    }

    /** DSH 会话卡：把「真实会话」的活动显示出来，也解释她为什么在书桌前忙 */
    function ActivityCard(props) {
      const { t, activity, home, now } = props
      const [note, setNote] = useState('')
      const [tip, setTip] = useState('')
      if (!activity) return null
      const running = Number(activity.running) || 0
      const counters = activity.counters || {}
      // 最近事件：同类合并成一行带次数，别让「调用工具 pwsh」连刷三行
      const rawRecent = Array.isArray(activity.recent) ? activity.recent.slice(-8).reverse() : []
      const recent = []
      for (const item of rawRecent) {
        const key = `${item.kind}|${item.detail || ''}`
        const found = recent.find((row) => row.key === key)
        if (found) {
          found.count += 1
          continue
        }
        if (recent.length >= 3) continue
        recent.push({ key, kind: item.kind, detail: item.detail, at: item.at, count: 1 })
      }
      const time = (at) => {
        const date = new Date(Number(at) || now)
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      }
      return h(
        'section',
        { className: 'fh-card fh-activity' },
        h('header', { className: 'fh-card-head' },
          h('span', null, t('activity.title')),
          h('span', { className: `fh-activity-dot${running > 0 ? ' is-on' : ''}` }),
          h('span', { className: 'fh-muted' }, running > 0 ? t('activity.busy', { count: running }) : t('activity.idle')),
        ),
        h('p', { className: 'fh-flavor' }, fillText(t(running > 0 ? 'activity.hintBusy' : 'activity.hintIdle'), home)),
        h('div', { className: 'fh-activity-stats' },
          h('span', null, t('activity.tools'), h('b', null, String(Number(counters.tools) || 0))),
          h('span', null, t('activity.messages'), h('b', null, String(Number(counters.messages) || 0))),
          h('span', null, t('activity.errors'), h('b', null, String(Number(counters.errors) || 0))),
        ),
        // 跟她说一句：预览模式只在屋子里说，inject 模式会送进当前会话
        props.onNote
          ? h('div', { className: 'fh-note' },
            h('input', {
              type: 'text',
              className: 'fh-input fh-input-text fh-note-input',
              value: note,
              maxLength: 200,
              placeholder: t('activity.notePlaceholder'),
              onChange: (event) => setNote(event.target.value),
              onKeyDown: (event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                const text = note.trim()
                if (text === '') return
                setNote('')
                void props.onNote(text).then((result) => {
                  if (!result) return setTip('')
                  if (result.delivered) return setTip(t('activity.noteSent'))
                  setTip(result.ok ? '' : (result.error || ''))
                })
              },
            }),
            h('button', {
              type: 'button',
              className: 'fh-toggle fh-note-send',
              disabled: note.trim() === '',
              onClick: () => {
                const text = note.trim()
                if (text === '') return
                setNote('')
                void props.onNote(text).then((result) => setTip(result && result.ok ? '' : (result && result.error) || ''))
              },
            }, t('activity.noteSend')),
          )
          : null,
        props.onNote
          ? h('p', { className: 'fh-note-hint' },
            t((props.canDeliver !== undefined
              ? props.canDeliver
              : !!(activity.notes && activity.notes.mode === 'inject')) ? 'activity.noteInject' : 'activity.notePreview'),
            activity.notes && activity.notes.mode === 'inject'
              ? ` · ${activity.notes.targetFresh
                ? t('activity.noteTarget', { target: activity.notes.target })
                : t('activity.noteNoTarget')}`
              : null,
            activity.notes && activity.notes.pending > 0 ? ` · ${t('activity.notePending', { count: activity.notes.pending })}` : null,
            tip ? ` · ${tip}` : null)
          : null,
        recent.length > 0
          ? h('ul', { className: 'fh-activity-list' },
            recent.map((item) => h('li', { key: item.key },
              h('span', { className: 'fh-activity-time' }, time(item.at)),
              h('span', null, t(`activity.kind.${item.kind}`)),
              item.detail ? h('span', { className: 'fh-muted' }, item.detail) : null,
              item.count > 1 ? h('span', { className: 'fh-activity-count' }, `×${item.count}`) : null,
            )))
          : null,
      )
    }

    function energyTier(v) { return v < 30 ? 'low' : v < 65 ? 'mid' : 'high' }
    function satietyTier(v) { return v < 30 ? 'low' : v < 65 ? 'mid' : 'high' }
    function moodTier(v) { return v < 35 ? 'low' : v < 70 ? 'mid' : 'high' }

    function LogCard(props) {
      const { home, t } = props
      const entries = home.log.slice(0, 9)
      return h(
        'section',
        { className: 'fh-card fh-card-log' },
        h('header', { className: 'fh-card-head' },
          h('span', null, t('log.title')),
          h('span', { className: 'fh-muted' }, t('log.count', { count: home.log.length })),
        ),
        entries.length === 0
          ? h('p', { className: 'fh-empty' }, t('log.empty'))
          : h('ul', { className: 'fh-log' },
            entries.map((entry) => h('li', { key: `${entry.at}-${entry.code}-${entry.at % 997}`, className: 'fh-log-row' },
              h('span', { className: 'fh-log-time' }, formatLogTime(entry.at)),
              h('span', { className: 'fh-log-text' }, fillText(logText(t, entry), home)),
            )),
          ),
      )
    }

    function formatLogTime(at) {
      const date = new Date(at)
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
    }

    function logText(t, entry) {
      switch (entry.code) {
        case 'offline': {
          const minutes = entry.arg && Number.isFinite(entry.arg.minutes) ? entry.arg.minutes : 0
          return t('log.offline', { span: formatSpan(t, minutes) })
        }
        case 'read':
          return t('log.read')
        case 'work':
          return t('log.work')
        case 'window':
          return t('log.window')
        case 'play':
          return t('log.play')
        case 'snack':
          return t('log.snack')
        case 'nap':
          return t('log.nap')
        case 'sleep':
          return t('log.sleep')
        case 'wake':
          return t('log.wake')
        case 'goBedroom':
          return t('log.goBedroom')
        case 'backHere':
          return t('log.backHere')
        case 'roomOut': {
          const mapId = entry.arg && typeof entry.arg.map === 'string' ? entry.arg.map : ''
          const roomName = mapId ? t(`map.${mapId}`) : ''
          return t('log.roomOut', { room: roomName })
        }
        case 'pat':
          return t('log.pat')
        case 'boot':
          return t('log.boot')
        case 'deskLampOn':
          return t('log.deskLampOn')
        case 'deskLampOff':
          return t('log.deskLampOff')
        case 'bedLampOn':
          return t('log.bedLampOn')
        case 'bedLampOff':
          return t('log.bedLampOff')
        case 'move':
          return t('log.move')
        case 'bench_rest':
          return t('log.bench_rest')
        case 'sit':
          return t('log.sit')
        case 'watch_tv':
          return t('log.watch_tv')
        case 'cook':
          return t('log.cook')
        case 'eat':
          return t('log.eat')
        case 'doze':
          return t('log.doze')
        case 'sofa_play':
          return t('log.sofa_play')
        case 'stretch':
          return t('log.stretch')
        case 'idle':
          return t('log.idle')
        case 'agentReply': {
          const text = entry.arg && typeof entry.arg.text === 'string' ? entry.arg.text : ''
          return t('log.agentReply', { text })
        }
        case 'noteDelivered':
          return t('log.noteDelivered')
        case 'noteReply': {
          const text = entry.arg && typeof entry.arg.text === 'string' ? entry.arg.text : ''
          return t('log.noteReply', { text })
        }
        case 'noteQueued':
          return t('log.noteQueued')
        case 'sessionStart':
          return t('log.sessionStart')
        case 'sessionEnd':
          return t('log.sessionEnd')
        case 'sessionError':
          return t('log.sessionError')
        case 'curtainOpen':
          return t('log.curtainOpen')
        case 'curtainClose':
          return t('log.curtainClose')
        default: {
          // 开关类日志：代码形如 livingLampOn / curtainBlueClosedOff，按 prop 标签统一渲染
          const toggle = /^(.+?)(On|Off)$/.exec(String(entry.code || ''))
          if (toggle) {
            const key = toggle[1]
            // 名词优先用 prop.toggle.<key>（更短），没有就退回 prop.<key>
            const shortKey = `prop.toggle.${key}`
            const shortName = t(shortKey)
            const what = shortName !== shortKey ? shortName : t(`prop.${key}`)
            if (what !== `prop.${key}`) {
              const isCurtain = /curtain/i.test(key)
              const turnedOn = toggle[2] === 'On'
              // 开关名可能是「打开」语义也可能反过来（curtainBlueClosed：开 = 拉上）
              const opens = /Closed$/i.test(key) ? !turnedOn : turnedOn
              const stateText = isCurtain
                ? (opens ? t('state.openIt') : t('state.closeIt'))
                : (turnedOn ? t('state.on') : t('state.off'))
              return t('log.toggle', { what, state: stateText })
            }
          }
          const label = entry.arg && typeof entry.arg.label === 'string' ? entry.arg.label : ''
          return t('log.fallback', { label })
        }
      }
    }

    function formatSpan(t, minutes) {
      if (minutes < 60) return t('span.minutes', { minutes })
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      return rest === 0 ? t('span.hours', { hours }) : t('span.hoursMinutes', { hours, minutes: rest })
    }

    function HeaderActions(props) {
      const { t, clock, onRefresh, saveState, editOn, onToggleEdit, settingsOn, onToggleSettings, maps, currentMap, onSwitchMap, elsewhere, elsewhereName, onCallPet, zoom, onZoom } = props
      const saveLabel = saveState === 'saved'
        ? t('head.saved')
        : saveState === 'saving'
          ? t('head.saving')
          : saveState === 'offline'
            ? t('head.offline')
            : t('head.pending')
      return h(
        'div',
        { className: 'fh-head-side' },
        h('div', { className: 'fh-head-chips' },
          elsewhere
            ? h('button', {
              type: 'button',
              className: 'fh-chip fh-chip-action',
              title: t('head.callHint'),
              onClick: () => onCallPet && onCallPet(),
            }, fillText(t('head.elsewhere', { room: elsewhere }), { characterName: elsewhereName }))
            : null,
          h(Chip, null, clock.dateText),
          h(Chip, null, `${clock.clock}`),
          h(Chip, null, t(`season.${clock.season}`)),
          h(Chip, null, t(`period.${clock.period}`)),
        ),
        h('select', {
          className: 'fh-map-select',
          value: String(zoom),
          title: t('head.zoom'),
          onChange: (event) => onZoom(event.target.value),
        },
        h('option', { value: '1' }, t('zoom.near')),
        h('option', { value: '0.75' }, t('zoom.mid')),
        h('option', { value: '0.5' }, t('zoom.far')),
        h('option', { value: 'fit' }, t('zoom.fit'))),
        Array.isArray(maps) && maps.length > 1
          ? h('select', {
            className: 'fh-map-select',
            value: currentMap || maps[0],
            title: t('head.map'),
            onChange: (event) => onSwitchMap(event.target.value),
          }, maps.map((id) => h('option', { key: id, value: id }, id)))
          : null,
        h('button', {
          type: 'button',
          className: `fh-ghost-button${editOn ? ' is-on' : ''}`,
          'aria-pressed': !!editOn,
          onClick: onToggleEdit,
        }, t('head.edit')),
        h('button', {
          type: 'button',
          className: `fh-ghost-button${settingsOn ? ' is-on' : ''}`,
          'aria-pressed': !!settingsOn,
          onClick: onToggleSettings,
        }, t('head.settings')),
        h('button', {
          type: 'button',
          className: 'fh-ghost-button',
          onClick: onRefresh,
          title: saveLabel,
        }, t('head.refresh')),
      )
    }

    /** 设置：称呼 / 自称 / 房间名，改完立刻存档 */
    function SettingsBar(props) {
      const { t, profile, onChange, onSave, onClose, paths, configs, onOpen, onCopy, openTip, sessionTargets, noteTarget, onNoteTarget, hostRev } = props
      const field = (label, key, placeholder) => h('label', { className: 'fh-field' },
        h('span', { className: 'fh-field-label' }, label),
        h('input', {
          type: 'text',
          className: 'fh-input fh-input-text',
          value: profile[key] || '',
          placeholder,
          onChange: (event) => onChange(key, event.target.value),
        }))
      return h(
        'div',
        { className: 'fh-editor' },
        h('div', { className: 'fh-editor-main' },
          h('span', { className: 'fh-editor-title' }, t('settings.title')),
          h('span', { className: 'fh-muted' }, t('settings.hint')),
        ),
        h('div', { className: 'fh-form' },
          field(t('settings.characterName'), 'characterName', '大肥鱼'),
          field(t('settings.selfName'), 'selfName', '我'),
          field(t('settings.userName'), 'userName', '用户'),
          field(t('settings.roomName'), 'roomName', '大肥鱼的小屋'),
        ),
        // 文件位置：点一下复制路径，省得去翻目录
        paths && paths.length > 0
          ? h('div', { className: 'fh-form' },
            h('span', { className: 'fh-field-label' }, t('settings.files')),
            h('div', { className: 'fh-paths' },
              paths.map((item) => h('button', {
                key: item.label,
                type: 'button',
                className: 'fh-path',
                title: item.value,
                onClick: () => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(item.value)
                  }
                },
              }, h('span', { className: 'fh-path-label' }, item.label), h('code', null, item.value)))))
          : null,
        // 配置文件：一键用系统默认程序打开，不用自己去翻目录
        configs && configs.length > 0
          ? h('div', { className: 'fh-form' },
            h('span', { className: 'fh-field-label' }, t('settings.configs')),
            h('div', { className: 'fh-open-list' },
              configs.map((item) => h('div', { key: item.path, className: 'fh-open-row' },
                h('span', { className: 'fh-open-name' }, item.label),
                h('code', { className: 'fh-open-path', title: item.path }, item.path),
                h('button', {
                  type: 'button',
                  className: 'fh-toggle',
                  onClick: () => onOpen(item.kind || 'file', item.path),
                }, item.kind === 'folder' ? t('settings.openFolder') : t('settings.open')),
                h('button', {
                  type: 'button',
                  className: 'fh-toggle',
                  onClick: () => onOpen('reveal', item.path),
                }, t('settings.reveal')),
                h('button', {
                  type: 'button',
                  className: 'fh-toggle',
                  // 复制绝对路径：不依赖系统调用，环境再受限也能用
                  onClick: () => onCopy(item.path),
                }, t('settings.copy'))))),
            openTip ? h('span', { className: 'fh-muted' }, openTip) : null)
          : null,
        // 便条送进哪个会话（有活会话时才列出来）
        sessionTargets && sessionTargets.length > 0
          ? h('div', { className: 'fh-form' },
            h('label', { className: 'fh-field' },
              h('span', { className: 'fh-field-label' }, t('settings.noteTarget')),
              h('select', {
                className: 'fh-editor-select',
                value: noteTarget || '',
                onChange: (event) => onNoteTarget(event.target.value),
              },
              h('option', { value: '' }, t('settings.noteTargetAuto')),
              sessionTargets.map((item) => h('option', { key: item.id, value: item.id },
                `${item.label}${item.running ? ' · 运行中' : ''}`)))),
            h('span', { className: 'fh-muted' }, t('settings.noteTargetHint')))
          : null,
        h('p', { className: 'fh-build-info' }, t('settings.buildInfo', { host: props.hostRev || '?', client: BUILD_REV })),
        h('div', { className: 'fh-editor-actions' },
          h('button', { type: 'button', className: 'fh-toggle', onClick: onSave }, t('settings.save')),
          h('button', { type: 'button', className: 'fh-toggle', onClick: onClose }, t('settings.close')),
        ),
      )
    }

    /** 编辑器浮条：显示当前选中，提供移动 / 层级 / 旋转 / 镜像 / 换图 / 保存 */
    function EditorBar(props) {
      const {
        t, edit, info, canTransform, images, currentSrc, size, objects, selectedId, onPickObject,
        onBumpZ, onRotate, onFlip, onImage, onResize, onAdd, onRemove, onDuplicate, eventsOpen, onToggleEvents,
        onOpenSource, mapId,
        skew, onSkew, canUndo, onUndo, proj,
        onSave, onDiscard, onExit,
      } = props
      const options = []
      for (const name of [currentSrc].concat(images || [])) {
        if (typeof name === 'string' && name !== '' && !options.includes(name)) options.push(name)
      }
      return h(
        'div',
        { className: 'fh-editor' },
        h('div', { className: 'fh-editor-main' },
          h('span', { className: 'fh-editor-title' }, t('edit.title')),
          Array.isArray(objects) && objects.length > 0
            ? h('select', {
              className: 'fh-map-select',
              value: selectedId || '',
              title: t('edit.pickObjectHint'),
              onChange: (event) => onPickObject(event.target.value),
            },
            h('option', { value: '' }, t('edit.pickObject')),
            objects.map((item) => h('option', { key: item.id, value: item.id }, `${item.label}（${item.id}）`)))
            : null,
          info
            ? h('code', { className: 'fh-editor-code' }, info)
            : h('span', { className: 'fh-muted' }, t('edit.none')),
        ),
        h('div', { className: 'fh-editor-actions' },
          h('button', { type: 'button', className: 'fh-toggle', onClick: () => onBumpZ(1) }, 'z +1'),
          h('button', { type: 'button', className: 'fh-toggle', onClick: () => onBumpZ(-1) }, 'z −1'),
          h('button', { type: 'button', className: 'fh-toggle', disabled: !canTransform, onClick: () => onRotate(-5) }, '⟲ 5°'),
          h('button', { type: 'button', className: 'fh-toggle', disabled: !canTransform, onClick: () => onRotate(5) }, '⟳ 5°'),
          h('button', { type: 'button', className: 'fh-toggle', disabled: !canTransform, onClick: onFlip }, t('edit.flip')),
          canTransform && options.length > 0
            ? h('label', { className: 'fh-editor-pick' },
              t('edit.image'),
              h('select', {
                className: 'fh-editor-select',
                value: currentSrc || '',
                onChange: (event) => onImage(event.target.value),
              }, options.map((name) => h('option', { key: name, value: name }, name))))
            : null,
          canTransform && size
            ? h('label', { className: 'fh-editor-pick' },
              t('edit.size'),
              h('input', {
                type: 'number',
                className: 'fh-input',
                min: 8,
                step: 2,
                value: size.w,
                onChange: (event) => onResize(Number(event.target.value), size.h),
              }),
              h('span', { className: 'fh-field-sep' }, '×'),
              h('input', {
                type: 'number',
                className: 'fh-input',
                min: 8,
                step: 2,
                value: size.h,
                onChange: (event) => onResize(size.w, Number(event.target.value)),
              }))
            : null,
          canTransform && skew !== null
            ? h('label', { className: 'fh-editor-pick', title: t('edit.skewHint') },
              t('edit.skew'),
              // 贴墙预设：斜率 = ±房间 projection（左墙负、右墙正）
              h('button', {
                type: 'button',
                className: 'fh-mini',
                title: t('edit.skewLeftHint'),
                onClick: () => onSkew(-Math.max(0.05, Math.min(0.8, proj || 0.375))),
              }, t('edit.skewLeft')),
              h('button', {
                type: 'button',
                className: 'fh-mini',
                title: t('edit.skewRightHint'),
                onClick: () => onSkew(Math.max(0.05, Math.min(0.8, proj || 0.375))),
              }, t('edit.skewRight')),
              h('input', {
                type: 'number',
                className: 'fh-input',
                min: -0.8,
                max: 0.8,
                step: 0.01,
                value: skew,
                onChange: (event) => onSkew(Number(event.target.value)),
              }))
            : null,
          h('button', {
            type: 'button',
            className: 'fh-toggle',
            disabled: !canUndo,
            onClick: onUndo,
            title: t('edit.undoHint'),
          }, t('edit.undo')),
          h('button', { type: 'button', className: 'fh-toggle', onClick: onAdd }, t('edit.addFurniture')),
          h('button', {
            type: 'button',
            className: 'fh-toggle',
            disabled: !edit.selected,
            onClick: onRemove,
          }, t('edit.removeFurniture')),
          h('button', {
            type: 'button',
            className: 'fh-toggle',
            disabled: !edit.selected,
            onClick: onDuplicate,
          }, t('edit.duplicate')),
          h('button', {
            type: 'button',
            className: 'fh-toggle',
            disabled: !edit.selected,
            title: t('edit.openSourceHint'),
            onClick: () => {
              if (!edit.selected) return
              onOpenSource({ kind: 'file', path: `data/maps/${mapId}/furniture/${edit.selected.defId}.json` })
            },
          }, t('edit.openSource')),
          h('button', {
            type: 'button',
            className: `fh-toggle${eventsOpen ? ' is-on' : ''}`,
            'aria-expanded': !!eventsOpen,
            onClick: onToggleEvents,
          }, t('edit.events')),
          h('button', { type: 'button', className: 'fh-toggle', onClick: onSave }, t('edit.save')),
          h('button', { type: 'button', className: 'fh-toggle', onClick: onDiscard }, t('edit.discard')),
          h('button', { type: 'button', className: 'fh-toggle', onClick: onExit }, t('edit.exit')),
        ),
        h('p', { className: 'fh-editor-hint' }, t('edit.hint')),
        edit.status ? h('p', { className: 'fh-editor-status' }, edit.status) : null,
      )
    }

    /** 事件对象是纯 JSON，深拷贝一份再改，避免直接改到运行时事件表 */
    function cloneEvent(event) {
      return event ? JSON.parse(JSON.stringify(event)) : null
    }

    /**
     * 事件编辑（可视化）：选事件 → 表单改字段 → 应用（立刻生效）→ 保存（写盘）。
     * 字段和 data/maps/<map>/events/*.json 一一对应，不认识的字段也会原样保留。
     */
    function EventForm(props) {
      const { t, draft, events, spots, anims, vocabs, onPick, onChange, onApply, onOpenSource, mapId } = props
      if (!draft) return null
      const label = draft.label && typeof draft.label === 'object' ? draft.label : {}
      const duration = Array.isArray(draft.duration) ? draft.duration : [60, 140]
      const tick = draft.onTick && typeof draft.onTick === 'object' ? draft.onTick : {}
      const weight = draft.weight && typeof draft.weight === 'object' ? draft.weight : null
      const mods = weight && Array.isArray(weight.mods) ? weight.mods : []

      const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
      const numberInput = (value, handler, step) => h('input', {
        type: 'number',
        className: 'fh-input',
        step: step || 1,
        value: toNumber(value),
        onChange: (event) => handler(toNumber(event.target.value)),
      })
      const textInput = (value, handler) => h('input', {
        type: 'text',
        className: 'fh-input fh-input-text',
        value: typeof value === 'string' ? value : '',
        onChange: (event) => handler(event.target.value),
      })
      const selectInput = (options, value, handler) => h('select', {
        className: 'fh-editor-select',
        value: value || '',
        onChange: (event) => handler(event.target.value),
      }, options.map((option) => h('option', { key: option, value: option }, option)))
      const field = (title, children) => h('div', { className: 'fh-field' },
        h('span', { className: 'fh-field-label' }, title),
        h('div', { className: 'fh-field-body' }, children))

      const setWeightMods = (next) => onChange({ weight: { ...weight, mods: next } })

      return h(
        'div',
        { className: 'fh-editor' },
        h('div', { className: 'fh-editor-main' },
          h('span', { className: 'fh-editor-title' }, t('edit.events')),
          h('select', {
            className: 'fh-editor-select',
            value: draft.id,
            onChange: (event) => onPick(event.target.value),
          }, events.map((event) => h('option', { key: event.id, value: event.id }, event.id))),
          h('button', { type: 'button', className: 'fh-toggle', onClick: onApply }, t('edit.apply')),
          onOpenSource
            ? h('button', {
              type: 'button',
              className: 'fh-toggle',
              title: t('edit.openSourceHint'),
              onClick: () => onOpenSource({ kind: 'file', path: `data/maps/${mapId}/events/${draft.id}.json` }),
            }, t('edit.openSource'))
            : null,
        ),
        h('div', { className: 'fh-form' },
          field(t('edit.field.label'), textInput(label.zh, (value) => onChange({ label: { ...label, zh: value } }))),
          field(t('edit.field.spot'), selectInput(spots, draft.spot, (value) => onChange({ spot: value }))),
          field(t('edit.field.anim'), selectInput(anims, draft.anim, (value) => onChange({ anim: value }))),
          field(t('edit.field.duration'), [
            numberInput(duration[0], (value) => onChange({ duration: [value, toNumber(duration[1])] })),
            h('span', { className: 'fh-field-sep' }, '~'),
            numberInput(duration[1], (value) => onChange({ duration: [toNumber(duration[0]), value] })),
            h('span', { className: 'fh-field-unit' }, t('edit.unit.second')),
          ]),
          field(t('edit.field.cooldown'), [
            numberInput(draft.cooldown, (value) => onChange({ cooldown: value })),
            h('span', { className: 'fh-field-unit' }, t('edit.unit.second')),
          ]),
          field(t('edit.field.log'), textInput(draft.log, (value) => onChange({ log: value }))),
          field(t('edit.field.ontick'), [
            h('span', { className: 'fh-field-unit' }, t('needs.energy')),
            numberInput(tick.energy, (value) => onChange({ onTick: { ...tick, energy: value } }), 0.001),
            h('span', { className: 'fh-field-unit' }, t('needs.satiety')),
            numberInput(tick.satiety, (value) => onChange({ onTick: { ...tick, satiety: value } }), 0.001),
            h('span', { className: 'fh-field-unit' }, t('needs.mood')),
            numberInput(tick.mood, (value) => onChange({ onTick: { ...tick, mood: value } }), 0.001),
          ]),
          field(t('edit.field.weight'), [
            h('label', { className: 'fh-check' },
              h('input', {
                type: 'checkbox',
                checked: !!weight,
                onChange: (event) => onChange({
                  weight: event.target.checked ? { base: 1, mods: [] } : null,
                }),
              }),
              t('edit.weightEnable')),
            weight
              ? numberInput(weight.base, (value) => onChange({ weight: { ...weight, base: value } }), 0.05)
              : null,
          ]),
        ),
        weight
          ? h('div', { className: 'fh-mods' },
            mods.map((mod, index) => h('div', { className: 'fh-mod-row', key: `mod-${index}` },
              selectInput(vocabs, mod.when, (value) => {
                const next = mods.slice()
                next[index] = { ...mod, when: value }
                setWeightMods(next)
              }),
              h('span', { className: 'fh-field-sep' }, '×'),
              numberInput(mod.mul, (value) => {
                const next = mods.slice()
                next[index] = { ...mod, mul: value }
                setWeightMods(next)
              }, 0.05),
              h('button', {
                type: 'button',
                className: 'fh-toggle',
                onClick: () => setWeightMods(mods.filter((_, at) => at !== index)),
              }, t('edit.remove')))),
            h('button', {
              type: 'button',
              className: 'fh-toggle',
              onClick: () => setWeightMods(mods.concat([{ when: vocabs[0], mul: 1 }])),
            }, t('edit.addMod')),
          )
          : null,
        h('p', { className: 'fh-editor-hint' }, t('edit.eventsHint')),
      )
    }

    function LoadingView(props) {
      const { t } = props
      return h(
        'div',
        { className: 'fh-centered' },
        h('div', { className: 'fh-loading-card' },
          h('div', { className: 'fh-loading-dot' }),
          h('p', { className: 'fh-loading-title' }, t('loading.title')),
          h('p', { className: 'fh-loading-hint' }, t('loading.hint')),
        ),
      )
    }

    function ErrorView(props) {
      const { t, error, onRetry } = props
      return h(
        'div',
        { className: 'fh-centered' },
        h('div', { className: 'fh-error-card' },
          h('p', { className: 'fh-loading-title' }, t('error.title')),
          h('p', { className: 'fh-loading-hint' }, error),
          h('button', { type: 'button', className: 'fh-primary-button', onClick: onRetry }, t('error.retry')),
        ),
      )
    }

    /** 注册给 slots 的就是这个壳：出错时显示错误卡片，而不是整页刷白 */
    function FishHomePanel(props) {
      return h(PanelBoundary, null, h(FishHomePanelView, props))
    }

    function SidebarIcon(props) {
      const size = props.size || 20
      return h(
        'svg',
        {
          width: size, height: size, viewBox: '0 0 32 32', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.7,
          strokeLinecap: 'round', strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M4.6 14.2 16 5.4l11.4 8.8' }),
        h('path', { d: 'M7 12.7v13.5a1.2 1.2 0 0 0 1.2 1.2h15.6a1.2 1.2 0 0 0 1.2-1.2V12.7' }),
        h('ellipse', { cx: 14.6, cy: 21.4, rx: 4.4, ry: 2.9 }),
        h('path', { d: 'M18.9 21.4 22 19.2v4.4z' }),
      )
    }

    /**
     * 渲染兜底：面板里任何一处抛错都不会把整个视图刷白，
     * 而是显示错误卡片 + 重试按钮（真正的异常也会打到 console 里）。
     */
    const BoundaryBase = React && typeof React.Component === 'function' ? React.Component : null
    const PanelBoundary = BoundaryBase
      ? class PanelBoundary extends BoundaryBase {
        constructor(props) {
          super(props)
          this.state = { error: null }
          this.retry = this.retry.bind(this)
        }

        static getDerivedStateFromError(error) {
          return { error }
        }

        componentDidCatch(error, info) {
          if (typeof console !== 'undefined' && console.error) {
            console.error('[fishhome] panel render error', error, info)
          }
        }

        retry() {
          this.setState({ error: null })
        }

        render() {
          const { error } = this.state
          if (!error) return this.props.children
          return h(
            'div',
            { className: 'fh-panel' },
            h('div', { className: 'fh-error-box' },
              h('strong', null, '家园面板出了点问题'),
              h('p', null, String((error && error.message) || error)),
              h('button', { type: 'button', className: 'fh-toggle', onClick: this.retry }, '重试')),
          )
        }
      }
      : function PanelBoundary(props) {
        return props.children
      }

    function FishHomePanelView(props) {
      const { store, translate, localeSubscribe } = props
      const [snapshot, setSnapshot] = useState(store.getSnapshot())
      const [, setLocaleTick] = useState(0)
      const [edit, setEdit] = useState({ on: false, selected: null, status: '' })
      const [packImages, setPackImages] = useState([])
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [openTip, setOpenTip] = useState('')
      const [eventsOpen, setEventsOpen] = useState(false)
      const [zoom, setZoom] = useState(() => {
        try {
          const saved = window.localStorage.getItem(`${LS_KEY}:zoom`)
          if (saved === 'fit') return 'fit'
          const n = Number(saved)
          if (Number.isFinite(n) && n >= 0.3 && n <= 1) return n
        } catch {
          /* 忽略 */
        }
        return 1
      })
      const [dragging, setDragging] = useState(false)
      const [resizing, setResizing] = useState(false)
      const resizeRef = useRef(null)
      const dragRef = useRef(null)
      const [maps, setMaps] = useState([])
      const [profile, setProfile] = useState({ characterName: '', selfName: '', roomName: '', userName: '' })
      const [draft, setDraft] = useState(null)
      useEffect(() => store.subscribe(setSnapshot), [store])
      useEffect(() => {
        if (typeof store.loadMaps !== 'function') return undefined
        let alive = true
        void store.loadMaps().then((list) => {
          if (alive) setMaps(list)
        })
        return () => {
          alive = false
        }
      }, [store])
      useEffect(() => localeSubscribe(() => setLocaleTick((n) => n + 1)), [localeSubscribe])
      useEffect(() => {
        if (!edit.on) return undefined
        let alive = true
        void store.loadPackFiles().then((files) => {
          if (alive) setPackImages(files)
        })
        return () => {
          alive = false
        }
      }, [edit.on, store])
      const now = useNow(1000)
      const t = translate
      const clock = timeSnapshot(new Date(snapshot.now || now), localeRef.value)

      const actions = useMemo(() => ({
        interact: (target, furnitureId) => store.interact(target, furnitureId),
        gotoScene: (id) => {
          if (typeof store.gotoScene === 'function') void store.gotoScene(id)
        },
        toggle: (key) => store.toggleProp(key),
        refresh: () => void store.reload(),
        retry: () => void store.boot(),
        openCharacter: () => store.interact('pat'),
      }), [store])

      /** 编辑模式：点家具选中，方向键移动，保存写回 data/ */
      const selectPart = (defId, partId) => {
        const def = furnitureRef.value.find((item) => item.id === defId)
        const part = def && (partId === '*'
          ? def.parts.find((item) => item && item.sprite && !item.preset)
          : def.parts.find((item) => (item.id || 'part') === partId))
        const isSprite = !!(part && part.sprite && !part.preset)
        setEdit((prev) => ({ ...prev, selected: { defId, partId, isSprite }, status: '' }))
      }

      /** 撤销一步 */
      const undo = () => {
        const done = store.undo()
        setEdit((prev) => ({ ...prev, status: done ? '已撤销上一步' : '没有可撤销的改动' }))
      }

      /** 用系统程序打开某个配置文件（编辑器里选中物件 / 事件时用） */
      const openSource = (spec) => {
        if (!spec || typeof spec.path !== 'string' || spec.path === '') return
        void store.openPath(spec.kind || 'file', spec.path).then((result) => {
          const via = result.openedWith ? `（${result.openedWith}）` : ''
          const text = result.ok ? `已打开 ${spec.path}${via}` : `打不开：${result.error || '未知错误'}`
          setOpenTip(text)
          setEdit((prev) => ({ ...prev, status: text }))
        })
      }

      useEffect(() => {
        if (!edit.on) return undefined
        const onKey = (event) => {
          const target = event.target
          if (target && typeof target.tagName === 'string' && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
          if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
            event.preventDefault()
            const done = store.undo()
            setEdit((prev) => ({ ...prev, status: done ? '已撤销上一步' : '没有可撤销的改动' }))
            return
          }
          if (!edit.selected) return
          const { defId, partId, isSprite } = edit.selected
          const px = event.shiftKey ? 10 : 1
          const grid = event.shiftKey ? 0.5 : 0.1
          let handled = true
          if (event.key === 'ArrowLeft') {
            if (isSprite) store.movePart(defId, partId, -px, 0)
            else store.movePartByGrid(defId, partId, -grid, 0)
          } else if (event.key === 'ArrowRight') {
            if (isSprite) store.movePart(defId, partId, px, 0)
            else store.movePartByGrid(defId, partId, grid, 0)
          } else if (event.key === 'ArrowUp') {
            if (isSprite) store.movePart(defId, partId, 0, -px)
            else store.movePartByGrid(defId, partId, 0, -grid)
          } else if (event.key === 'ArrowDown') {
            if (isSprite) store.movePart(defId, partId, 0, px)
            else store.movePartByGrid(defId, partId, 0, grid)
          } else if (event.key === 'PageUp') {
            store.bumpPartZ(defId, partId, 1)
          } else if (event.key === 'PageDown') {
            store.bumpPartZ(defId, partId, -1)
          } else if (event.key === '[' && isSprite) {
            store.rotatePart(defId, partId, event.shiftKey ? -15 : -5)
          } else if (event.key === ']' && isSprite) {
            store.rotatePart(defId, partId, event.shiftKey ? 15 : 5)
          } else if ((event.key === 'f' || event.key === 'F') && isSprite) {
            store.flipPart(defId, partId)
          } else if (event.key === 'Escape') {
            setEdit((prev) => ({ ...prev, selected: null }))
          } else {
            handled = false
          }
          if (handled) event.preventDefault()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [edit, store])

      /** 拖拽缩放：抓住选中框右下角的把手，改宽高（底边不动） */
      const resizeStart = (defId, partId, event) => {
        if (!edit.on || !event) return
        const target = event.currentTarget
        const svg = target && target.ownerSVGElement
        if (!svg || typeof svg.getScreenCTM !== 'function' || typeof DOMPoint !== 'function') return
        const def = furnitureRef.value.find((item) => item.id === defId)
        const part = def && def.parts.find((item) => (item.id || 'part') === partId)
        const rect = part && part.sprite && Array.isArray(part.sprite.rect) ? part.sprite.rect.map(Number) : null
        if (!rect) return
        const ctm = svg.getScreenCTM()
        if (!ctm) return
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
        resizeRef.current = { defId, partId, svg, rect, start: { x: point.x, y: point.y } }
        setResizing(true)
        if (typeof event.preventDefault === 'function') event.preventDefault()
        if (typeof event.stopPropagation === 'function') event.stopPropagation()
      }

      useEffect(() => {
        if (!resizing) return undefined
        const onMove = (event) => {
          const drag = resizeRef.current
          if (!drag) return
          const ctm = drag.svg.getScreenCTM()
          if (!ctm) return
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
          const width = Math.max(16, Math.round(point.x - drag.rect[0]))
          const height = Math.max(16, Math.round(drag.rect[1] + drag.rect[3] - point.y))
          if (width === drag.lastW && height === drag.lastH) return
          drag.lastW = width
          drag.lastH = height
          store.resizePart(drag.defId, drag.partId, width, height)
        }
        const onUp = () => {
          resizeRef.current = null
          setResizing(false)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
        }
      }, [resizing, store])

      /** 拖拽：把屏幕位移换算成画布坐标，再交给 store.movePart */
      const dragStart = (defId, partId, event) => {
        if (!edit.on || !event) return
        const target = event.currentTarget
        const svg = target && target.ownerSVGElement
        if (!svg || typeof svg.getScreenCTM !== 'function' || typeof DOMPoint !== 'function') return
        const ctm = svg.getScreenCTM()
        if (!ctm) return
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
        dragRef.current = { defId, partId, svg, start: { x: point.x, y: point.y }, applied: { x: 0, y: 0 } }
        selectPart(defId, partId)
        setDragging(true)
        if (typeof event.preventDefault === 'function') event.preventDefault()
      }

      useEffect(() => {
        if (!dragging) return undefined
        const onMove = (event) => {
          const drag = dragRef.current
          if (!drag) return
          const ctm = drag.svg.getScreenCTM()
          if (!ctm) return
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
          const stepX = point.x - drag.start.x - drag.applied.x
          const stepY = point.y - drag.start.y - drag.applied.y
          if (Math.abs(stepX) < 0.01 && Math.abs(stepY) < 0.01) return
          drag.applied.x += stepX
          drag.applied.y += stepY
          store.movePart(drag.defId, drag.partId, stepX, stepY)
        }
        const onUp = () => {
          dragRef.current = null
          setDragging(false)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
        }
      }, [dragging, store])

      /** 编辑器里的对象列表：点不到的（墙上的、被压住的）也能从这里选中 */
      const objects = (furnitureRef.value || []).map((def) => ({
        id: def.id,
        label: (def.name && (def.name.zh || def.name.en)) || def.id,
        parts: def.parts ? def.parts.length : 0,
      }))

      const selectedInfo = (() => {
        if (!edit.selected) return ''
        const def = furnitureRef.value.find((item) => item.id === edit.selected.defId)
        if (def && edit.selected.partId === '*') {
          return `${def.id} · 整件（${def.parts.length} 个部件）`
        }
        const part = def && def.parts.find((item) => (item.id || 'part') === edit.selected.partId)
        if (!part) return ''
        const where = part.sprite && Array.isArray(part.sprite.rect)
          ? `rect ${part.sprite.rect.map((n) => Math.round(Number(n))).join(', ')}`
          : `offset ${(part.offset && part.offset.fx) || 0}, ${(part.offset && part.offset.fy) || 0}`
        const sprite = part.sprite
          ? ` · 旋转 ${Math.round((Number(part.sprite.rotate) || 0) * 10) / 10}°${part.sprite.flipX ? ' · 镜像' : ''}`
          : ''
        return `${edit.selected.defId}:${edit.selected.partId} · z ${part.z || 0} · ${where}${sprite}`
      })()

      const selectedSprite = (() => {
        if (!edit.selected) return null
        const def = furnitureRef.value.find((item) => item.id === edit.selected.defId)
        if (!def) return null
        if (edit.selected.partId === '*') {
          const first = def.parts.find((item) => item && item.sprite && !item.preset)
          return first && first.sprite ? first.sprite : null
        }
        const part = def.parts.find((item) => (item.id || 'part') === edit.selected.partId)
        return part && part.sprite ? part.sprite : null
      })()

      const body = snapshot.phase === 'loading'
        ? h(LoadingView, { t })
        : snapshot.phase === 'error'
          ? h(ErrorView, { t, error: snapshot.error, onRetry: actions.retry })
          : h(
            'div',
            { className: 'fh-inner' },
            h('header', { className: 'fh-head' },
              h('div', null,
                h('h1', { className: 'fh-title' }, t('panel.title')),
                h('p', { className: 'fh-sub' }, t('panel.subtitle')),
              ),
              h(HeaderActions, {
                t,
                clock,
                onRefresh: actions.refresh,
                maps,
                zoom,
                onZoom: (value) => {
                  try {
                    window.localStorage.setItem(`${LS_KEY}:zoom`, String(value))
                  } catch {
                    /* 忽略 */
                  }
                  setZoom(value === 'fit' ? 'fit' : Number(value))
                },
                currentMap: (snapshot.meta && snapshot.meta.map) || '',
                elsewhere: (() => {
                  const homeMap = snapshot.home && snapshot.home.world ? snapshot.home.world.map : ''
                  const viewMap = (snapshot.meta && snapshot.meta.map) || ''
                  if (!homeMap || !viewMap || homeMap === viewMap) return ''
                  const name = snapshot.home.world.mapName || homeMap
                  return name
                })(),
                elsewhereName: snapshot.home.characterName || '',
                onCallPet: () => {
                  if (typeof store.bringPetHere === 'function') {
                    store.bringPetHere()
                    store.publish()
                  }
                },
                onSwitchMap: (id) => {
                  if (typeof store.setMap === 'function') void store.setMap(id)
                },
                saveState: snapshot.saveState,
                editOn: edit.on,
                onToggleEdit: () => {
                  const next = !edit.on
                  if (next) setDraft(cloneEvent(BEHAVIORS[0]))
                  setEdit((prev) => ({ ...prev, on: next, selected: null, status: '' }))
                },
                settingsOn: settingsOpen,
                onToggleSettings: () => {
                  const next = !settingsOpen
                  if (next && snapshot.home) {
                    setProfile({
                      characterName: snapshot.home.characterName || '',
                      selfName: snapshot.home.selfName || '我',
        userName: snapshot.home.userName || '用户',
                      roomName: snapshot.home.roomName || '',
                    })
                  }
                  setSettingsOpen(next)
                },
              }),
            ),
            settingsOpen
              ? h(SettingsBar, {
                t,
                profile,
                paths: [
                  { label: '场景数据', value: (snapshot.meta && snapshot.meta.dataDir ? snapshot.meta.dataDir : '') + '\\maps' },
                  { label: '存档文件', value: (snapshot.meta && snapshot.meta.saveFile) || '' },
                  { label: '角色包', value: (snapshot.meta && snapshot.meta.packDir) || '' },
                ].filter((item) => item.value !== ''),
                // 当前房间的配置文件：一键用系统程序打开 / 在资源管理器里定位
                configs: (() => {
                  const map = (snapshot.meta && snapshot.meta.map) || 'bedroom'
                  return [
                    { label: t('settings.file.scene'), path: `data/maps/${map}/scene.json` },
                    { label: t('settings.file.background'), path: `data/maps/${map}/background.json` },
                    { label: t('settings.file.events'), path: `data/maps/${map}/events`, kind: 'folder' },
                    { label: t('settings.file.furniture'), path: `data/maps/${map}/furniture`, kind: 'folder' },
                    { label: t('settings.file.pet'), path: 'pack/pet.json' },
                    { label: t('settings.file.actions'), path: 'pack/actions', kind: 'folder' },
                    { label: t('settings.file.save'), path: 'save/state.json' },
                  ]
                })(),
                openTip,
                hostRev: (snapshot.meta && snapshot.meta.hostRev) || '',
                sessionTargets: (snapshot.activity && snapshot.activity.notes && snapshot.activity.notes.sessions) || [],
                noteTarget: (snapshot.activity && snapshot.activity.notes && snapshot.activity.notes.pinned) || '',
                onNoteTarget: (id) => {
                  void store.setNoteTarget(id).then(() => {
                    setOpenTip(id === '' ? t('settings.noteTargetAuto') : id.slice(0, 8))
                  })
                },
                onOpen: (kind, target) => {
                  void store.openPath(kind, target).then(async (result) => {
                    if (result.ok) {
                      setOpenTip(t('settings.opened', { path: target, via: result.openedWith ? `（${result.openedWith}）` : '' }))
                      return
                    }
                    // 打不开就把绝对路径塞进剪贴板，至少能手动粘到资源管理器地址栏
                    const absolute = result.absolute || (typeof store.absolutePathFor === 'function' ? store.absolutePathFor(target) : '')
                    let copied = false
                    try {
                      if (absolute && typeof navigator !== 'undefined' && navigator.clipboard) {
                        await navigator.clipboard.writeText(absolute.replace(/\//g, '\\'))
                        copied = true
                      }
                    } catch {
                      /* 剪贴板不可用就算了 */
                    }
                    setOpenTip(t('settings.openFailed', { error: result.error || '未知错误' })
                      + (copied ? t('settings.openFailedCopied', { path: absolute }) : ''))
                  })
                },
                onCopy: (target) => {
                  const absolute = typeof store.absolutePathFor === 'function' ? store.absolutePathFor(target) : ''
                  const text = absolute || target
                  void (async () => {
                    try {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text)
                      setOpenTip(t('settings.copied', { path: text }))
                    } catch {
                      setOpenTip(t('settings.copyFailed', { path: text }))
                    }
                  })()
                },
                onChange: (key, value) => setProfile((prev) => ({ ...prev, [key]: value })),
                onSave: () => {
                  store.updateProfile(profile)
                  setSettingsOpen(false)
                },
                onClose: () => setSettingsOpen(false),
              })
              : null,
            edit.on
              ? h(EditorBar, {
                t,
                edit,
                info: selectedInfo,
                objects,
                mapId: (snapshot.meta && snapshot.meta.map) || 'bedroom',
                onOpenSource: openSource,
                selectedId: edit.selected ? edit.selected.defId : '',
                onPickObject: (id) => {
                  const def = furnitureRef.value.find((item) => item.id === id)
                  if (!def) return
                  const partId = def.editAsOne === true ? '*' : ((def.parts[0] && (def.parts[0].id || 'part')) || 'part')
                  selectPart(id, partId)
                },
                canTransform: !!(edit.selected && edit.selected.isSprite),
                images: packImages,
                currentSrc: selectedSprite ? selectedSprite.src : '',
                size: selectedSprite && Array.isArray(selectedSprite.rect)
                  ? { w: Math.round(Number(selectedSprite.rect[2])), h: Math.round(Number(selectedSprite.rect[3])) }
                  : null,
                canUndo: typeof store.canUndo === 'function' ? store.canUndo() : false,
                onUndo: undo,
                skew: selectedSprite ? (Number(selectedSprite.skew) || 0) : null,
                proj: geom.ky && geom.kx ? geom.ky / geom.kx : 0.375,
                onSkew: (value) => {
                  if (edit.selected) store.setPartSkew(edit.selected.defId, edit.selected.partId, value)
                },
                onBumpZ: (delta) => {
                  if (!edit.selected) return
                  const done = store.bumpPartZ(edit.selected.defId, edit.selected.partId, delta)
                  setEdit((prev) => ({ ...prev, status: done ? `z ${delta > 0 ? '+' : ''}${delta}（${prev.selected && prev.selected.partId === '*' ? '整件' : '该部件'}）` : '调整 z 失败' }))
                },
                onRotate: (deg) => {
                  if (edit.selected) store.rotatePart(edit.selected.defId, edit.selected.partId, deg)
                },
                onFlip: () => {
                  if (edit.selected) store.flipPart(edit.selected.defId, edit.selected.partId)
                },
                onAdd: () => {
                  const id = store.addFurniture()
                  setEdit((prev) => ({ ...prev, selected: { defId: id, partId: 'body', isSprite: true }, status: '已新建家具，记得换个图' }))
                },
                onRemove: () => {
                  if (!edit.selected) return
                  const gone = edit.selected.defId
                  const whole = edit.selected.partId === '*'
                  const ok = store.removeFurniture(gone)
                  setEdit((prev) => ({ ...prev, selected: null, status: ok ? `已删除 ${gone}${whole ? '（整件）' : ''}（保存后才会删文件）` : '删除失败' }))
                },
                onDuplicate: () => {
                  if (!edit.selected) return
                  const id = store.duplicateFurniture(edit.selected.defId)
                  if (!id) return
                  const def = furnitureRef.value.find((item) => item.id === id)
                  const first = def && def.parts[0]
                  setEdit((prev) => ({
                    ...prev,
                    selected: first
                      ? { defId: id, partId: def.editAsOne === true ? '*' : (first.id || 'part'), isSprite: !!(first.sprite && !first.preset) }
                      : null,
                    status: `已复制成 ${id}（保存后才会写文件）` ,
                  }))
                },
                eventsOpen,
                onToggleEvents: () => setEventsOpen((open) => !open),
                onResize: (w, h) => {
                  if (edit.selected) store.resizePart(edit.selected.defId, edit.selected.partId, w, h)
                },
                onImage: (name) => {
                  if (edit.selected) store.setPartImage(edit.selected.defId, edit.selected.partId, name)
                },
                onSave: () => {
                  void (async () => {
                    try {
                      const furnitureCount = await store.saveFurniture()
                      const eventCount = await store.saveEvents()
                      setEdit((prev) => ({ ...prev, status: `已保存 ${furnitureCount} 件家具、${eventCount} 个事件` }))
                    } catch (error) {
                      setEdit((prev) => ({ ...prev, status: `保存失败：${error.message}` }))
                    }
                  })()
                },
                onDiscard: () => {
                  store.discardFurniture()
                  setEdit((prev) => ({ ...prev, status: '已放弃未保存的改动' }))
                },
                onExit: () => setEdit({ on: false, selected: null, status: '' }),
              })
              : null,
            edit.on && eventsOpen
              ? h(EventForm, {
                t,
                events: BEHAVIORS,
                mapId: (snapshot.meta && snapshot.meta.map) || 'bedroom',
                onOpenSource: openSource,
                draft,
                spots: Object.keys(SPOTS),
                anims: Object.keys(ANIM_TAGS),
                vocabs: Object.keys(WEIGHT_VOCAB),
                onPick: (id) => setDraft(cloneEvent(BEHAVIOR_BY_ID[id])),
                onChange: (patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev)),
                onApply: () => {
                  if (!draft) return
                  const ok = store.updateEvent(draft.id, draft)
                  // 应用后读回归一化过的定义，表单显示的才是真正生效的值
                  setDraft(cloneEvent(BEHAVIOR_BY_ID[draft.id]))
                  setEdit((prev) => ({
                    ...prev,
                    status: ok ? `${draft.id} 已应用（还没写盘）` : '应用失败：事件 id 不匹配',
                  }))
                },
              })
              : null,
            h('div', { className: 'fh-grid' },
              h('div', { className: 'fh-room-wrap' },
                h(RoomStage, {
                  // 切房间就换 key：强制整棵场景树重挂载，避免残留上一个房间的家具节点
                  sceneKey: 'scene:' + ((snapshot.meta && snapshot.meta.map) || '') + ':' + (store.sceneToken || 0),
                  home: snapshot.home,
                  views: snapshot.views || {},
                  now,
                  t,
                  actions,
                  edit,
                  onSelect: selectPart,
                  onDragStart: dragStart,
                  onResizeStart: resizeStart,
                  zoom,
                }),
                h('div', { className: 'fh-controls' }, (() => {
                  // 每个场景一套按钮：scene.json 的 controls；没写就用默认那套
                  const lang = localeRef.value
                  const props = snapshot.home.world.props || {}
                  const declared = normalizeControls(sceneRef.value && sceneRef.value.controls)
                  if (declared.length === 0) {
                    return [
                      h('button', { key: 'legacy-desk', type: 'button', className: `fh-toggle${props.deskLamp ? ' is-on' : ''}`, onClick: () => actions.toggle('deskLamp') },
                        `${t('prop.deskLamp')} ${props.deskLamp ? t('state.on') : t('state.off')}`),
                      h('button', { key: 'legacy-bed', type: 'button', className: `fh-toggle${props.bedLamp ? ' is-on' : ''}`, onClick: () => actions.toggle('bedLamp') },
                        `${t('prop.bedLamp')} ${props.bedLamp ? t('state.on') : t('state.off')}`),
                      h('button', { key: 'legacy-curtain', type: 'button', className: 'fh-toggle', onClick: () => actions.toggle('curtainOpen') },
                        props.curtainOpen ? t('prop.curtainClose') : t('prop.curtainOpen')),
                      h('button', { key: 'legacy-whale', type: 'button', className: 'fh-toggle', onClick: () => actions.interact('whale') }, t('prop.whale')),
                      h('button', { key: 'legacy-read', type: 'button', className: 'fh-toggle', onClick: () => actions.interact('read') }, t('prop.book')),
                      h('button', { key: 'legacy-sleep', type: 'button', className: 'fh-toggle', onClick: () => actions.interact('bed') }, t('prop.bed')),
                      h('button', { key: 'legacy-reset', type: 'button', className: 'fh-toggle', onClick: () => actions.interact('reset') }, t('prop.reset')),
                    ]
                  }
                  return declared.map((item) => {
                    if (item.kind === 'toggle') {
                      const on = !!props[item.prop]
                      let text = localizeText(item.label, lang)
                      if (item.variants) {
                        const variant = on ? item.variants.on : item.variants.off
                        if (variant) text = localizeText(variant, lang)
                      } else if (item.suffix) {
                        text = `${text} ${on ? t('state.on') : t('state.off')}`
                      }
                      return h('button', { key: item.key, type: 'button', className: `fh-toggle${on ? ' is-on' : ''}`, 'aria-pressed': on, onClick: () => actions.toggle(item.prop) }, text)
                    }
                    if (item.kind === 'event') {
                      return h('button', { key: item.key, type: 'button', className: 'fh-toggle', onClick: () => actions.interact(item.id) }, localizeText(item.label, lang))
                    }
                    return h('button', { key: item.key, type: 'button', className: 'fh-toggle', onClick: () => actions.interact('reset') }, localizeText(item.label, lang))
                  })
                })()),
                h('p', { className: 'fh-hint' }, t('room.hint')),
              ),
              h('div', { className: 'fh-side' },
                h(StatusCard, { home: snapshot.home, now, t }),
                h(NeedsCard, { home: snapshot.home, t }),
            h(ActivityCard, {
              t,
              activity: snapshot.activity,
              home: snapshot.home,
              now,
              onNote: (text) => store.sendNote(text),
              canDeliver: !!(store.clientSessions || (snapshot.activity && snapshot.activity.notes && snapshot.activity.notes.mode === 'inject')),
            }),
                h(LogCard, { home: snapshot.home, t }),
                h('p', { className: 'fh-foot' }, t('saved.at', { time: snapshot.lastSavedAt ? formatLogTime(snapshot.lastSavedAt) : t('saved.never') })),
              ),
            ),
          )

      return h(
        'div',
        { className: 'fh-panel' },
        h('style', null, CSS),
        h('div', { className: 'fh-scroll' }, body),
      )
    }


    /* ======================================================================
     * 9. 样式
     * ==================================================================== */

    const CSS = `
.fh-panel {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.fh-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 22px 26px 34px;
  box-sizing: border-box;
}
.fh-inner {
  max-width: 1180px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.fh-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
.fh-title {
  margin: 0;
  font-size: 21px;
  line-height: 30px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.fh-sub {
  margin: 4px 0 0;
  font-size: 12.5px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}
.fh-head-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.fh-head-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.fh-chip {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  white-space: nowrap;
}
.fh-ghost-button {
  height: 30px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.fh-ghost-button:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.fh-ghost-button:active {
  transform: scale(0.96);
}
.fh-ghost-button:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}
.fh-primary-button {
  height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  border: none;
  background: var(--dsw-alias-brand-primary);
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: transform 140ms ease, opacity 140ms ease;
}
.fh-primary-button:active {
  transform: scale(0.96);
}
.fh-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.95fr);
  gap: 18px;
  align-items: start;
}
@container (max-width: 900px) {
  .fh-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 900px) {
  .fh-grid {
    grid-template-columns: 1fr;
  }
}
.fh-room-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.fh-stage {
  contain: paint;
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  background: #191325;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 18px 42px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.14);
  isolation: isolate;
}
.fh-scene {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  isolation: isolate;
}

/* ---- 全局氛围光线 ----
 * 颜色按时间段写在 CSS 里，浓度由时钟算出来的 --fh-ambient-alpha 控制；
 * 想换色调只改这几行，不用碰渲染代码。
 * 夜里用暖棕压暗（不是发蓝），墙面才会像被灯光照着。
 */
.fh-stage[data-period="morning"],
.fh-stage[data-period="noon"],
.fh-stage[data-period="afternoon"] { --fh-ambient-tint: #3a3050; }
.fh-stage[data-period="dawn"],
.fh-stage[data-period="evening"] { --fh-ambient-tint: #4d3040; }
.fh-stage[data-period="night"] { --fh-ambient-tint: #2c1f2b; }
.fh-stage[data-period="deepNight"] { --fh-ambient-tint: #1d1522; }
/* 开着房间灯时整体更暖（浓度已经在 JS 里调低了） */
.fh-stage[data-room-light="on"][data-period="night"],
.fh-stage[data-room-light="on"][data-period="deepNight"] {
  --fh-ambient-tint: #6a4a3e;
}
.fh-ambient {
  fill: var(--fh-ambient-tint, #2c1f2b);
  opacity: var(--fh-ambient-alpha, 0);
  mix-blend-mode: multiply;
  pointer-events: none;
  transition: opacity 2s linear;
}
/* 暗角：中间透、四周压暗，跟环境光同浓，白天几乎看不见 */
.fh-stage::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: radial-gradient(
    ellipse at 50% 44%,
    rgba(20, 12, 22, 0) 52%,
    rgba(20, 12, 22, calc(var(--fh-ambient-alpha, 0) * 0.9)) 100%
  );
}
/* 光源层：叠加发光，夜里不会被环境光压暗 */
.fh-lights {
  mix-blend-mode: screen;
  pointer-events: none;
}
.fh-character {
  /* 锚点之间是「淡出 → 换位置 → 淡入」：只过渡透明度，位置是瞬切 */
  transition: opacity 420ms ease-in;
  pointer-events: none;
}
.fh-character[data-fade="in"] {
  transition: opacity 520ms ease-out;
}
/* 淡出时只「缩」，不下压——原点在脚底，所以是原地变矮，没有位移 */
.fh-character-body {
  transition: transform 460ms cubic-bezier(0.4, 0, 0.6, 1);
  transform-origin: 50% 100%;
}
.fh-character[data-fade="out"] .fh-character-body {
  transform: scale(0.9);
}
.fh-stage[data-room-light="off"] .fh-character[data-period="night"],
.fh-stage[data-room-light="off"] .fh-character[data-period="deepNight"] {
  filter: brightness(0.86) saturate(0.95);
}
/* 点互动物时朝那边偏一下头 */
.fh-character-peek[data-dir="1"] {
  animation: fh-peek-right 1.15s ease;
  transform-origin: 50% 100%;
}
.fh-character-peek[data-dir="-1"] {
  animation: fh-peek-left 1.15s ease;
  transform-origin: 50% 100%;
}
@keyframes fh-peek-right {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(7px) rotate(3deg); }
  55% { transform: translateX(3px) rotate(1.2deg); }
}
@keyframes fh-peek-left {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-7px) rotate(-3deg); }
  55% { transform: translateX(-3px) rotate(-1.2deg); }
}

/* 选中框右下角的缩放手柄。
   注意：SVG 元素的 transform-origin 默认是整个画布的 (0,0)，不是元素中心，
   所以 hover 时做 scale 会把方块「甩」到别处 → 指针离开元素 → hover 失效 → 回来，
   造成手型和箭头疯狂闪烁。这里只改颜色，不改几何。 */
.fh-resize-handle {
  pointer-events: all;
}
.fh-resize-handle:hover {
  fill: #ffa254;
  stroke: #fff7ef;
}

/* 编辑模式下所有家具都能抓取拖动 */
.fh-stage[data-edit="on"] .fh-prop {
  cursor: grab;
}
.fh-stage[data-edit="on"] .fh-prop:active {
  cursor: grabbing;
}
.fh-sprite-breathe {
  animation: fh-breathe 5.6s ease-in-out infinite;
}
@keyframes fh-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1.5px); }
}
@media (prefers-reduced-motion: reduce) {
  .fh-sprite-breathe { animation: none; }
  .fh-character { transition: none; }
}
.fh-character-moving .fh-sprite-breathe {
  animation: none;
}
.fh-lamp-img {
  transition: opacity 200ms ease;
}
.fh-prop {
  cursor: pointer;
}
.fh-prop .fh-prop-hit {
  display: none;
}
.fh-prop:focus-visible {
  outline: none;
}
.fh-prop:focus-visible > *:last-child,
.fh-prop:focus-visible polygon,
.fh-prop:focus-visible rect {
  stroke: #ffd9a3 !important;
  stroke-width: 2.5 !important;
}
.fh-prop:hover polygon,
.fh-prop:hover ellipse {
  filter: brightness(1.08);
}
.fh-zzz {
  opacity: 0.85;
  animation: fh-float 3.2s ease-in-out infinite;
}
@keyframes fh-float {
  0%, 100% { transform: translateY(0); opacity: 0.5; }
  50% { transform: translateY(-6px); opacity: 0.95; }
}
.fh-room-badge {
  position: absolute;
  z-index: 2;
  top: 14px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 252, 245, 0.94);
  border: 1px solid rgba(120, 92, 62, 0.16);
  pointer-events: none;
  max-width: 55%;
}
.fh-room-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #3f3428;
  letter-spacing: 0.01em;
}
.fh-room-meta {
  font-size: 11.5px;
  color: rgba(63, 52, 40, 0.66);
  font-variant-numeric: tabular-nums;
}
.fh-room-actions {
  position: absolute;
  z-index: 2;
  top: 14px;
  right: 14px;
  display: flex;
  gap: 6px;
}
.fh-room-action {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(120, 92, 62, 0.18);
  background: rgba(255, 252, 245, 0.94);
  color: #4a3b2c;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 140ms ease, transform 140ms ease;
}
.fh-room-action:hover {
  background: rgba(255, 255, 252, 0.95);
}
.fh-room-action:active {
  transform: scale(0.96);
}
.fh-room-action:focus-visible {
  outline: 2px solid #ffd9a3;
  outline-offset: 2px;
}
.fh-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.fh-toggle {
  height: 30px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms ease;
  font-variant-numeric: tabular-nums;
}
.fh-toggle:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-toggle.is-on {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
}
.fh-toggle:active {
  transform: scale(0.96);
}
.fh-toggle:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: 2px;
}
.fh-hint {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-toggle:disabled {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}
.fh-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px dashed var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
}
.fh-editor-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.fh-editor-title {
  font-size: 12.5px;
  font-weight: 600;
}
.fh-editor-pick {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-editor-select {
  font: inherit;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-editor-text {
  width: 100%;
  min-height: 150px;
  resize: vertical;
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-editor-code {
  font-family: var(--dsh-font-family-code, ui-monospace, monospace);
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.fh-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px 12px;
}
.fh-field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.fh-field-label {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}
.fh-field-body {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.fh-field-sep {
  opacity: 0.6;
  font-size: 12px;
}
.fh-field-unit {
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
}
.fh-input {
  width: 74px;
  font: inherit;
  font-size: 12px;
  padding: 4px 7px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.fh-input-text {
  width: 110px;
}
.fh-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-mods {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
}
.fh-mod-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.fh-editor-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.85;
}
.fh-editor-status {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-brand-primary);
}
.fh-ghost-button.is-on {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
}
.fh-prop-selected {
  filter: brightness(1.06);
}
.fh-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.fh-card {
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  padding: 14px 16px 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fh-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.fh-muted {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.fh-nowline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.fh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  flex: none;
}
.fh-dot-sleep {
  background: var(--dsw-alias-state-idle-primary);
  box-shadow: none;
}
.fh-flavor {
  margin: 0;
  font-size: 12.5px;
  line-height: 19px;
  color: var(--dsw-alias-label-secondary);
}
.fh-progress {
  height: 3px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.fh-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
  opacity: 0.55;
  transition: width 900ms ease;
}
.fh-meter {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.fh-meter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.fh-meter-value {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
.fh-meter-track {
  height: 5px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  overflow: hidden;
}
.fh-meter-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
  transition: width 700ms ease;
}
.fh-meter-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.85;
}
.fh-log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 216px;
  overflow: auto;
}
.fh-log-row {
  display: flex;
  gap: 10px;
  font-size: 12.5px;
  line-height: 19px;
  align-items: baseline;
}
.fh-log-time {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  opacity: 0.8;
}
.fh-log-text {
  color: var(--dsw-alias-label-primary);
}
.fh-empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--dsw-alias-label-secondary);
}
.fh-foot {
  margin: 0;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0.8;
}
.fh-centered {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fh-loading-card,
.fh-error-card {
  width: min(360px, 100%);
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.fh-loading-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--dsw-alias-brand-primary);
  animation: fh-pulse 1.6s ease-in-out infinite;
}
@keyframes fh-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
.fh-loading-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.fh-loading-hint {
  margin: 0;
  font-size: 12.5px;
  line-height: 19px;
  color: var(--dsw-alias-label-secondary);
  word-break: break-word;
}
.fh-error-box {
  margin: 24px;
  padding: 18px 20px;
  border-radius: 14px;
  background: #fff6ec;
  border: 1px solid #e8c9a8;
  color: #6b4b32;
}
.fh-error-box p {
  margin: 8px 0 14px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.fh-paths {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.fh-path {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid #e2cdb4;
  background: #fffaf3;
  color: #6b4b32;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.fh-path:hover {
  background: #fff;
  border-color: #d9b98f;
}
.fh-path-label {
  flex: 0 0 auto;
  font-size: 12px;
  opacity: 0.75;
}
.fh-path code {
  flex: 1 1 auto;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

.fh-chip-action {
  cursor: pointer;
  border: 1px dashed #d9b98f;
  background: #fff6ec;
  color: #7a5636;
  font: inherit;
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 999px;
}
.fh-chip-action:hover {
  background: #fff;
  border-style: solid;
}

.fh-mini {
  padding: 2px 7px;
  border-radius: 8px;
  border: 1px solid #e2cdb4;
  background: #fffaf3;
  color: #6b4b32;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.fh-mini:hover {
  background: #fff;
  border-color: #d9b98f;
}

/* 配置文件列表：名字 + 路径 + 打开/定位 */
.fh-open-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.fh-open-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 4px 6px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03));
}
.fh-open-name {
  font-size: 12px;
  color: var(--dsw-alias-text-secondary);
  white-space: nowrap;
}
.fh-open-path {
  font-size: 11px;
  color: var(--dsw-alias-text-tertiary, #8a8a8a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fh-open-row .fh-toggle {
  padding: 2px 10px;
  font-size: 11.5px;
}

/* 会话卡：DSH 真实会话的活动 */
.fh-activity-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-border-l1, #d8d2c6);
  margin-left: auto;
}
.fh-activity-dot.is-on {
  background: #57c07a;
  box-shadow: 0 0 0 3px rgba(87, 192, 122, 0.18);
  animation: fh-pulse 1.8s ease-in-out infinite;
}
.fh-activity-stats {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--dsw-alias-text-secondary);
}
.fh-activity-stats b {
  margin-left: 5px;
  font-weight: 600;
  color: var(--dsw-alias-text-primary, #2b2b2b);
}
.fh-activity-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: var(--dsw-alias-text-secondary);
}
.fh-activity-list li {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.fh-activity-time {
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-text-tertiary, #8a8a8a);
}

/* 便条输入：跟她说一句话 */
.fh-note {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.fh-note-input {
  flex: 1;
  min-width: 0;
}
.fh-note-send {
  flex: none;
}
.fh-note-hint {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-text-tertiary, #8a8a8a);
}

/* 设置底部的版本信息：判断 Host 重启了没、界面刷新了没 */
.fh-build-info {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-text-tertiary, #9a9a9a);
  font-variant-numeric: tabular-nums;
}

/* 会话卡里合并后的次数（调用工具 ×3） */
.fh-activity-count {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(150, 150, 150, 0.16);
  font-size: 11px;
  color: var(--dsw-alias-text-secondary, #7a7a7a);
  font-variant-numeric: tabular-nums;
}

/* 门：可点击的出门入口（素材是精灵，悬停时整体亮一点） */
.fh-prop-door { cursor: pointer; }
.fh-prop-door image { transition: filter 160ms ease; }
.fh-prop-door:hover image { filter: brightness(1.07) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.18)); }
`


    /* ======================================================================
     * 10. 插件入口
     * ==================================================================== */

    const store = new HomeStore()

    function readLocale(ctx) {
      try {
        const snapshot = ctx.locale.getLocale()
        return readLocaleId(snapshot)
      } catch {
        return 'zh'
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        localeRef.value = readLocale(ctx)
        const translate = makeTranslate(localeRef.value)
        const localeSubscribe = (listener) => {
          try {
            return ctx.locale.subscribe(() => {
              localeRef.value = readLocale(ctx)
              listener()
            })
          } catch {
            return () => {}
          }
        }
        const t = (key, params) => makeTranslate(localeRef.value)(key, params)
        // remote 接通诊断：记下每条路的结果，__fhDebug().remoteProbe 能看到
        const remoteProbe = { direct: 'not-tried', sessionService: 'not-fired', inject: 'not-fired' }
        try {
          window.__fhRemoteProbe = remoteProbe
        } catch {
          /* 非浏览器环境 */
        }
        // 可选：客户端 sessions 服务。有它就能像聊天框一样把便条发进会话（会出现在对话里、LLM 也会回）。
        // apply 时服务可能还没挂载，所以统一用 ctx.inject 等它挂载后再取。
        const injectService = (name, use) => {
          try {
            if (typeof ctx.inject === 'function') ctx.inject([name], (inner) => use(inner))
            else use(ctx)
          } catch {
            /* 没有这个服务就跳过 */
          }
        }
        injectService('sessions', (inner) => {
          try {
            store.clientSessions = inner.sessions || (typeof inner.get === 'function' ? inner.get('sessions') : null) || store.clientSessions
          } catch {
            /* 服务不可用就当没有 */
          }
        })
        // DSH 自己的「用系统程序打开 / 在文件夹中显示」：走 remote 调 Host 的 sessionController，
        // 由它用原生方式打开（本环境里自己 spawn explorer.exe 起不来）。
        // remote 能不能用取决于 package.json 里 dsh.client.inject 有没有
        // @deepseek-ai/dsh-api-session-controller。
        const wireRemote = (remote) => {
          const api = remote && remote.session
          if (!api || typeof api.openWorkspacePath !== 'function') return
          store.openRemote = async (absolutePath, reveal) => {
            try {
              const result = await api.openWorkspacePath(reveal
                ? { path: absolutePath, action: 'reveal' }
                : { path: absolutePath })
              if (result && result.ok) return 'ok'
              return (result && (result.error || result.message)) || 'failed'
            } catch (error) {
              return error instanceof Error ? error.message : String(error)
            }
          }
        }
        // ① 清单注入之后可以直接取（取不到会抛，忽略）
        try {
          const direct = ctx.remote
          remoteProbe.direct = direct ? 'ok' : 'undefined'
          wireRemote(direct)
        } catch (error) {
          remoteProbe.direct = error instanceof Error ? error.message : String(error)
        }
        // ② 客户端里 remote.session 也可能就是名为 session 的服务，先试这个
        injectService('session', (inner) => {
          remoteProbe.sessionService = 'fired'
          try {
            const api = inner.session
            remoteProbe.sessionService = api && typeof api.openWorkspacePath === 'function'
              ? 'fired-with-openWorkspacePath'
              : 'fired-without-openWorkspacePath'
            if (api && typeof api.openWorkspacePath === 'function') wireRemote({ session: api })
          } catch (error) {
            remoteProbe.sessionService = error instanceof Error ? error.message : String(error)
          }
        })
        // ③ 等 remote 服务挂载
        injectService('remote', (inner) => {
          remoteProbe.inject = 'fired'
          try {
            const value = inner.remote || inner
            remoteProbe.inject = value && value.session ? 'fired-with-session' : 'fired-without-session'
            wireRemote(value)
          } catch (error) {
            remoteProbe.inject = error instanceof Error ? error.message : String(error)
          }
        })
        try {
          ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'dsh-fishhome: zh dictionary')
          ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'dsh-fishhome: en dictionary')
        } catch {
          /* locale 服务不可用时用内联字典 */
        }

        ctx.effect(() => {
          store.start()
          return () => store.stop()
        }, 'dsh-fishhome: life loop')

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          const onHide = () => {
            if (document.visibilityState === 'hidden') void store.flushSave()
          }
          window.addEventListener('pagehide', onHide)
          ctx.effect(() => () => window.removeEventListener('pagehide', onHide), 'dsh-fishhome: pagehide')
        }

        // 诊断用：控制台里跑 __fhDebug() 能看到「当前场景 / 家具列表 / 她所在房间」
        // 排查「切房间后旧房间的家具还在」这类问题时，先看这三个数字对不对得上。
        if (typeof window !== 'undefined') {
          try {
            window.__fhDebug = () => ({
              scene: sceneRef.value && sceneRef.value.id ? sceneRef.value.id : null,
              furniture: (furnitureRef.value || []).map((def) => (def && def.id) || '?'),
              herMap: store.home && store.home.world ? store.home.world.map : null,
              viewedMap: store.meta ? store.meta.map : null,
              mapPath: store.mapPath || null,
              token: store.sceneToken || 0,
              build: typeof BUILD_REV === 'string' ? BUILD_REV : null,
              // 原生打开通道有没有接上（false = 只能复制路径）
              remoteWired: typeof store.openRemote === 'function',
              remoteProbe: (() => { try { return window.__fhRemoteProbe || null } catch { return null } })(),
              // 画面上真实出现的精灵：href + 它挂在哪个 fh-prop-* 下面
              drawn: (() => {
                try {
                  if (typeof document === 'undefined') return null
                  return [...document.querySelectorAll('svg.fh-scene image')].map((img) => {
                    const host = img.closest('[class*="fh-prop"]')
                    return {
                      href: String(img.getAttribute('href') || '').split('/').pop(),
                      prop: host ? host.getAttribute('class') : null,
                    }
                  })
                } catch {
                  return null
                }
              })(),
            })
          } catch {
            /* 只读调试钩子，失败无所谓 */
          }
        }

        ctx.slots.inject('main', () => ctx.slots.inject('sidebar.panellist', () => {
          const stopMain = ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            inject: () => ({ store, translate: t, localeSubscribe }),
          }, FishHomePanel)
          let stopIcon
          try {
            stopIcon = ctx.slots.register({
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 40,
              label: () => makeTranslate(localeRef.value)('panel.title'),
              locale: NS,
            }, SidebarIcon)
          } catch (error) {
            stopMain()
            throw error
          }
          return () => {
            stopIcon()
            stopMain()
          }
        }))
      },
      __internals: {
        createHome,
        normalizeHome,
        logText,
        normalizeActivity,
        normalizeReplies,
        matchReply,
        loadReplies,
        setActivity,
        activityWeightMul,
        furnitureItems,
        normalizeControls,
        localizeText,
        fillText,
        stepHome,
        settleOffline,
        BEHAVIORS,
        BEHAVIOR_BY_ID,
        applyEvents,
        normalizeEvent,
        behaviorWeight,
        pushLog,
        pickBehavior,
        enterBehavior,
        timeSnapshot,
        buildAnimationView,
        formatSpan: (minutes) => formatSpan(makeTranslate('zh'), minutes),
        makeTranslate,
        HomeStore,
        loadCharacterActions,
        FishHomePanelView,
        EventForm,
        SettingsBar,
        ActivityCard,
        wrapBubbleText,
        EditorBar,
        WEIGHT_VOCAB,
        requestAccepted,
        pickSay,
        refusalText,
        applyScene,
        applyBackground,
        applyFurniture,
        furnitureRef,
        DEFAULT_FURNITURE,
        partVisible,
        partOffsetTransform,
        spriteTransform,
        SelectedBox,
        SceneSvg,
        resolveAnchor,
        normalizeAnchor,
        roomLightOn,
        resolveDataPath,
        project,
        geom,
        bgRef,
        sceneRef,
      },
    }
  },
})
