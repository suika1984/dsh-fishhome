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

    /**
     * 天气：不联网，按「日期 + 季节」稳定地摇一个出来（同一天刷新不变）。
     * 只有花园会画天气效果，卧室/客厅不受影响。
     */
    const WEATHER_TABLE = {
      spring: [['clear', 5], ['overcast', 3], ['drizzle', 2], ['rain', 1]],
      summer: [['clear', 6], ['overcast', 2], ['drizzle', 1], ['rain', 1]],
      autumn: [['clear', 5], ['overcast', 3], ['drizzle', 1], ['rain', 1]],
      winter: [['clear', 4], ['overcast', 3], ['snow', 2], ['rain', 1]],
    }
    const WEATHER_IDS = ['clear', 'overcast', 'drizzle', 'rain', 'snow']

    function weatherOf(nowMs, season) {
      const date = new Date(Number.isFinite(nowMs) ? nowMs : Date.now())
      const table = WEATHER_TABLE[season] || WEATHER_TABLE.spring
      const start = new Date(date.getFullYear(), 0, 0)
      const dayIndex = Math.floor((date.getTime() - start.getTime()) / 86400000)
      const total = table.reduce((sum, entry) => sum + entry[1], 0)
      let pick = Math.abs(dayIndex * 31 + date.getFullYear() * 7) % total
      for (const [id, weight] of table) {
        if (pick < weight) return id
        pick -= weight
      }
      return 'clear'
    }

    /** WMO 天气码 → 家园里的四档（+ 晴）。真实天气接进来时用它翻译 */
    /**
     * 当前天气：开了真实天气且最近拉到过数据就用它，否则退回按日期摇号。
     * 花园的天气滤镜和面板芯片都用这个。
     */
    function currentWeather(home) {
      const props = (home && home.world && home.world.props) || {}
      const code = Number(props.liveWeatherCode)
      const at = Number(props.liveWeatherAt)
      if (props.weatherEnabled === true && Number.isFinite(code) && Number.isFinite(at) && at > 0) {
        return weatherCodeToId(code)
      }
      return (home && home.world && home.world.weather) || 'clear'
    }

    function weatherCodeToId(code) {
      const value = Number(code)
      if (!Number.isFinite(value)) return 'clear'
      if (value === 0 || value === 1) return 'clear'
      if (value === 2 || value === 3 || value === 45 || value === 48) return 'overcast'
      if (value >= 51 && value <= 57) return 'drizzle'
      if ((value >= 61 && value <= 67) || (value >= 80 && value <= 82)) return 'rain'
      if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'snow'
      if (value >= 95) return 'rain'
      return 'overcast'
    }

    /**
     * 室内温度：有真实室外温度时按「房子会保温」混一下，别让面板显示 -3° 却看着暖和。
     * 没数据就退回季节表（indoorTemperature）。
     */
    function blendIndoorTemp(outdoor, season) {
      const base = indoorTemperature(season)
      // 注意 Number(null) === 0，必须先挡掉空值，否则「没数据」会被当成 0°
      if (outdoor === null || outdoor === undefined || outdoor === '') return base
      const value = Number(outdoor)
      if (!Number.isFinite(value)) return base
      const mixed = base * 0.7 + value * 0.3
      return Math.round(Math.min(30, Math.max(16, mixed)))
    }

    /**
     * 秋千相位：'front' | 'center' | 'back'。
     * 用「这次行为开始的时间」当相位起点，角色动画 4 帧 × 1 秒自然对齐；
     * 没在荡秋千（或没人坐）时永远是 'center'。
     */
    /** 秋千相位相对她的格数补偿（椅子先绘制，通常给 1） */
    // 现在两边都用「行为开始时刻 + 时钟」算相位，起点一致 → 不需要补偿
    const SWING_PHASE_OFFSET = 0
    /** 走向吊椅的过渡时长（角色移动动画大约 1.1s），这段时间她还是可见的普通立绘 */
    const SWING_SEAT_DELAY_MS = 1100
    /** 角色当前动作的帧号（由 CharacterSprite 每帧写入），秋千相位用它保证两边同帧 */
    let swingFrameIndex = -1
    // 每个动画帧对应的相位（front/center/back），由 actions/swing.json 的 frames[].phase 提供
    let swingPhaseTable = ['front', 'center', 'back', 'center']
    // 每帧真实时长（来自 actions/swing.json），时钟兜底按累计时间选帧，别假设都是 1000ms
    let swingFrameDurations = [1000, 1000, 1000, 1000]

    /** 按累计帧时长，把「已过毫秒数」换算成帧号（支持每帧时长不同） */
    function frameIndexAt(elapsedMs, durations) {
      const list = Array.isArray(durations) && durations.length > 0 ? durations : [1000, 1000, 1000, 1000]
      const total = list.reduce((sum, ms) => sum + (Number(ms) > 0 ? Number(ms) : 1000), 0)
      let t = total > 0 ? ((elapsedMs % total) + total) % total : 0
      for (let i = 0; i < list.length; i += 1) {
        const ms = Number(list[i]) > 0 ? Number(list[i]) : 1000
        if (t < ms) return i
        t -= ms
      }
      return list.length - 1
    }

    function swingPhaseOf(home, nowMs) {
      const character = home && home.character
      if (!character || character.behaviorId !== 'swing') return 'center'
      const since = Number(character.since)
      const now = Number.isFinite(nowMs) ? nowMs : Date.now()
      if (!Number.isFinite(since) || now < since) return 'empty'
      // 还没走到椅子上：显示空椅子，她在走路（本体可见）
      if (now - since < SWING_SEAT_DELAY_MS) return 'empty'
      const table = swingPhaseTable.length > 0 ? swingPhaseTable : ['center', 'front', 'center', 'back', 'center']
      // 先按真实帧时长定位（尊重 1200ms 的落座帧），再加整帧补偿
      const index = frameIndexAt(now - since, swingFrameDurations) + SWING_PHASE_OFFSET
      const at = ((index % table.length) + table.length) % table.length
      return table[at] || 'center'
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
        // 月相：满月 > 0.9，用来压住「睡不着」这类权重
        moon: moonPhase(Date.now()).illumination,
        weather: weatherOf(date.getTime(), seasonOf(date)),
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
      fullMoon: (c, clock) => (clock.moon || 0) > 0.9 && (clock.period === 'night' || clock.period === 'deepNight'),
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
      // 花园：冬天是否积雪（切换 garden-winter / garden-winter-nosnow 两张图）
      gardenSnow: true,
      // 花园茶座的小夜灯
      teaLamp: false,
      // 花园茶座的遮阳伞（true=打开）
      teaUmbrella: true,
      // 真实天气（Open-Meteo）：开关 + 位置 + 最近一次结果
      weatherEnabled: false,
      weatherPlace: '成都',
      weatherLat: 30.5728,
      weatherLon: 104.0668,
      liveWeatherTemp: null,
      liveWeatherCode: null,
      liveWeatherAt: 0,
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
    // 手动预览用：weatherOverride 非空就固定天气（__fhWeather('rain')），否则按日期自动
    home.world.weather = home.world.weatherOverride || clock.weather
      const liveTemp = home.world.props && home.world.props.weatherEnabled === true
      ? home.world.props.liveWeatherTemp
      : null
    home.world.temperature = blendIndoorTemp(liveTemp, clock.season)

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

