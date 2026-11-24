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
      const { className, label, onActivate, onPointerDown, focusable, children } = props
      if (typeof onActivate !== 'function') return h('g', { className }, children)
      // 只有编辑模式才让家具可聚焦：平时点家具只是互动，不该拿到焦点（否则会画出描边/焦点框）
      const canFocus = focusable === true
      return h(
        'g',
        {
          className: `fh-prop ${className}`,
          role: canFocus ? 'button' : undefined,
          tabIndex: canFocus ? 0 : undefined,
          'aria-label': label,
          onPointerDown: typeof onPointerDown === 'function' ? onPointerDown : undefined,
          onClick: (event) => {
            event.stopPropagation()
            onActivate()
          },
          onKeyDown: canFocus
            ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onActivate()
              }
            }
            : undefined,
        },
        children,
      )
    }

    /**
     * preset 注册表：数据里写 preset 名字，代码里负责怎么画（位置用 offset 调）。
     * 带 _glow 的是「光源」：数据里配 layer: "light"，会画在环境光之上。
     */
    /** 朔望月：29.530588853 天。取 2000-01-06 18:14 UTC 的新月作为基准 */
    const SYNODIC_DAYS = 29.530588853
    const NEW_MOON_AT = Date.UTC(2000, 0, 6, 18, 14)

    /**
     * 月相：返回 { phase 0~1（0/1 新月、0.5 满月）, illumination 亮面比例, waxing 是否在涨 }。
     * 只依赖日期，不需要联网。
     */
    function moonPhase(nowMs) {
      const ms = Number.isFinite(nowMs) ? nowMs : Date.now()
      const days = (ms - NEW_MOON_AT) / 86400000
      let phase = (days % SYNODIC_DAYS) / SYNODIC_DAYS
      if (phase < 0) phase += 1
      const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2
      return { phase, illumination, waxing: phase < 0.5 }
    }

    /** 相位 → 8 个名字的键（面板显示用） */
    function moonPhaseKey(info) {
      const p = info && typeof info.phase === 'number' ? info.phase : 0
      const names = ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent']
      return names[Math.round(p * 8) % 8]
    }

    /**
     * 亮面的多边形路径：外弧 = 亮面半圆；终止线 = 椭圆（半轴 a = r·|cos(2π·phase)|）的投影。
     * 用采样点而不是 SVG 圆弧，避免 sweep 方向搞反（月牙/凸月很容易画反）。
     */
    function moonLitPath(cx, cy, r, info) {
      const N = 48
      const a = r * Math.abs(Math.cos(2 * Math.PI * info.phase))
      const side = info.waxing ? 1 : -1
      const bulge = info.illumination < 0.5 ? 1 : -1
      const points = []
      for (let i = 0; i <= N; i += 1) {
        const t = -Math.PI / 2 + (Math.PI * i) / N
        points.push([cx + side * r * Math.cos(t), cy + r * Math.sin(t)])
      }
      for (let i = N; i >= 0; i -= 1) {
        const t = -Math.PI / 2 + (Math.PI * i) / N
        const dy = Math.sin(t)
        points.push([cx + side * bulge * a * Math.sqrt(Math.max(0, 1 - dy * dy)), cy + r * dy])
      }
      return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`
    }

    /**
     * 花园天空里的太阳 / 月亮：按真实时间算弧线位置。
     * 太阳 5:30 升起、19:30 落下；月亮 18:30 升起、次日 6:30 落下。
     * 返回 { x, y, r, alpha }，不在这个时段返回 null（测试直接调这个函数）。
     */
    function gardenBody(kind, nowMs, band) {
      const ms = Number.isFinite(nowMs) ? nowMs : Date.now()
      const date = new Date(ms)
      const hour = date.getHours() + date.getMinutes() / 60
      const W = geom.canvasW || 1200
      const H = geom.canvasH || 677
      const isSun = kind === 'sun'
      let t
      if (isSun) {
        if (hour <= 5.5 || hour >= 19.5) return null
        t = (hour - 5.5) / 14
      } else {
        // 月亮：按当天月相把「上中天」往后推，新月贴着太阳、满月整夜挂着
        const monthPhase = moonPhase(ms)
        const moonHour = ((hour - monthPhase.phase * 24) % 24 + 24) % 24
        if (moonHour <= 5.5 || moonHour >= 19.5) return null
        t = (moonHour - 5.5) / 14
      }
      // band：顶部留给天空的高度（像素）。日月都在这条带子里走，不会钻到房子后面
      const strip = Number.isFinite(Number(band)) && Number(band) > 0 ? Number(band) : H * 0.35
      const r = Math.min(Math.max(10, strip * 0.26), Math.max(10, W * 0.026))
      const x = W * (0.1 + 0.8 * t)
      // 收在天空带里，别被画布顶边裁掉
      const rawY = strip * (0.52 - Math.sin(Math.PI * t) * 0.3)
      const y = Math.min(Math.max(rawY, r + 2), Math.max(r + 2, strip - r - 2))
      // 太阳贴着地平线时淡出；月亮整夜稳定
      const alpha = isSun ? Math.min(1, 0.2 + daylight(hour) * 1.2) : 0.85
      return { x, y, r, alpha: Math.max(0, Math.min(1, alpha)), t }
    }

    /**
     * 季节星座：挑的是「当季天黑后好认」的几个——黄道星座 + 北半球常见星座。
     * 坐标是归一化的 0~1（左上角原点），画的时候乘天空带尺寸。
     */
    const SEASON_CONSTELLATIONS = {
      spring: [
        { id: 'leo', name: '狮子座', box: [0.08, 0.18, 0.24, 0.5], stars: [[0.1, 0.82], [0.05, 0.55], [0.3, 0.62], [0.48, 0.85], [0.7, 0.6], [0.86, 0.42], [0.66, 0.2]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
        { id: 'virgo', name: '室女座', box: [0.42, 0.3, 0.22, 0.42], stars: [[0.1, 0.7], [0.35, 0.45], [0.55, 0.6], [0.8, 0.35], [0.6, 0.15]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
        { id: 'ursa-major', name: '大熊座', box: [0.7, 0.5, 0.26, 0.3], stars: [[0.05, 0.55], [0.2, 0.65], [0.35, 0.75], [0.5, 0.7], [0.6, 0.5], [0.72, 0.62], [0.85, 0.55]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
      ],
      summer: [
        { id: 'scorpius', name: '天蝎座', box: [0.06, 0.25, 0.26, 0.55], stars: [[0.12, 0.2], [0.2, 0.35], [0.28, 0.5], [0.42, 0.62], [0.58, 0.7], [0.72, 0.62], [0.8, 0.45], [0.7, 0.3]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]] },
        { id: 'cygnus', name: '天鹅座', box: [0.42, 0.18, 0.22, 0.5], stars: [[0.5, 0.05], [0.5, 0.4], [0.5, 0.95], [0.15, 0.55], [0.85, 0.55]], lines: [[0, 1], [1, 2], [3, 1], [1, 4]] },
        { id: 'sagittarius', name: '人马座', box: [0.7, 0.42, 0.24, 0.42], stars: [[0.2, 0.8], [0.35, 0.5], [0.45, 0.2], [0.65, 0.35], [0.72, 0.7], [0.5, 0.75]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]] },
      ],
      autumn: [
        { id: 'cassiopeia', name: '仙后座', box: [0.1, 0.2, 0.26, 0.4], stars: [[0.05, 0.7], [0.28, 0.3], [0.5, 0.62], [0.72, 0.25], [0.92, 0.6]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
        { id: 'pegasus', name: '飞马座', box: [0.42, 0.25, 0.26, 0.5], stars: [[0.1, 0.15], [0.8, 0.2], [0.85, 0.75], [0.15, 0.8], [0.95, 0.45]], lines: [[0, 1], [1, 4], [4, 2], [2, 3], [3, 0]] },
        { id: 'andromeda', name: '仙女座', box: [0.72, 0.4, 0.24, 0.35], stars: [[0.05, 0.75], [0.3, 0.55], [0.55, 0.42], [0.82, 0.25]], lines: [[0, 1], [1, 2], [2, 3]] },
      ],
      winter: [
        { id: 'orion', name: '猎户座', box: [0.08, 0.25, 0.24, 0.6], stars: [[0.15, 0.12], [0.85, 0.2], [0.45, 0.5], [0.55, 0.52], [0.65, 0.54], [0.1, 0.85], [0.9, 0.9]], lines: [[0, 2], [1, 4], [2, 3], [3, 4], [0, 5], [1, 6]] },
        { id: 'taurus', name: '金牛座', box: [0.4, 0.35, 0.22, 0.45], stars: [[0.2, 0.85], [0.35, 0.5], [0.6, 0.35], [0.85, 0.45], [0.75, 0.15]], lines: [[0, 1], [1, 2], [2, 3], [2, 4]] },
        { id: 'canis-major', name: '大犬座', box: [0.7, 0.5, 0.24, 0.4], stars: [[0.15, 0.3], [0.45, 0.5], [0.7, 0.65], [0.9, 0.8], [0.6, 0.85]], lines: [[0, 1], [1, 2], [2, 3], [2, 4]] },
      ],
    }

    /** 固定随机种子：同一季节的星场不会每天乱跳 */
    function seededRandom(seed) {
      let value = seed % 2147483647
      if (value <= 0) value += 2147483646
      return () => {
        value = (value * 16807) % 2147483647
        return (value - 1) / 2147483646
      }
    }

    const SEASON_SEED = { spring: 11, summer: 37, autumn: 59, winter: 83 }

    /** 某个季节的星座列表（测试直接调） */
    function constellationsForSeason(season) {
      return SEASON_CONSTELLATIONS[season] || SEASON_CONSTELLATIONS.spring
    }

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
      // 花园：夜间光照衰减。白天不画，夜里以「墙面灯笼」为中心向外压暗，
      // 用 multiply 混合，所以离灯越远越黑，比平铺一层灰更像真的光。
      garden_night: (props) => {
        const W = geom.canvasW || 1200
        const H = geom.canvasH || 677
        const now = new Date()
        const hour = now.getHours() + now.getMinutes() / 60
        const dark = Math.pow(1 - daylight(hour), 1.15)
        if (dark <= 0.04) return null
        const part = (props && props.part) || {}
        const lamps = Array.isArray(part.lights) && part.lights.length > 0
          ? part.lights
          : [[0.42, 0.42], [0.62, 0.42]]
        const radius = Number(part.radius) > 0 ? Number(part.radius) : 0.62
        return h('g', { className: 'fh-garden-night', 'data-dark': dark.toFixed(2), pointerEvents: 'none' },
          h('defs', null,
            h('radialGradient', { id: 'fh-garden-night-grad', cx: '50%', cy: '42%', r: `${Math.round(radius * 100)}%` },
              h('stop', { offset: '0%', stopColor: '#fff0d2', stopOpacity: 0 }),
              h('stop', { offset: '40%', stopColor: '#3a3350', stopOpacity: 0.18 }),
              h('stop', { offset: '72%', stopColor: '#241f38', stopOpacity: 0.46 }),
              h('stop', { offset: '100%', stopColor: '#151228', stopOpacity: 0.72 }),
            ),
          ),
          h('rect', {
            x: 0,
            y: 0,
            width: W,
            height: H,
            fill: 'url(#fh-garden-night-grad)',
            opacity: dark,
            style: { mixBlendMode: 'multiply' },
          }),
          // 门口/墙灯的暖光池（screen 叠加，越靠近灯越亮）
          h('g', { opacity: dark * 0.85, style: { mixBlendMode: 'screen' } },
            lamps.map((lamp, index) => h('circle', {
              key: `lamp-${index}`,
              cx: lamp[0] * W,
              cy: lamp[1] * H,
              r: Math.max(90, W * 0.085),
              fill: 'url(#fh-room-light)',
            })),
          ),
        )
      },
      // 花园：星空 + 当季星座（只在天空带里画，天亮了自动淡出）
      garden_stars: (props) => {
        const home = props && props.home
        const world = home && home.world ? home.world : {}
        const season = world.season || 'spring'
        const period = world.period || 'noon'
        const W = geom.canvasW || 1200
        const H = geom.canvasH || 677
        const band = Number(props && props.part && props.part.band) > 0 ? Number(props.part.band) : H * 0.22
        // 天亮/傍晚星星淡掉；夜里最亮
        const nightness = period === 'deepNight' ? 1 : period === 'night' ? 0.9 : period === 'evening' || period === 'dawn' ? 0.35 : 0
        if (nightness <= 0.02) return null
        const random = seededRandom(SEASON_SEED[season] || 7)
        const dots = []
        for (let i = 0; i < 90; i += 1) {
          const x = random() * W
          const y = random() * band * 0.92 + band * 0.04
          const r = 0.6 + random() * 1.4
          dots.push(h('circle', {
            key: `star-${i}`,
            cx: x.toFixed(1),
            cy: y.toFixed(1),
            r: r.toFixed(2),
            fill: '#eef4ff',
            opacity: (0.25 + random() * 0.6) * nightness,
          }))
        }
        const shapes = []
        const list = constellationsForSeason(season)
        list.forEach((item, index) => {
          const [bx, by] = item.box
          // 等比缩放：星图的 x/y 用同一个比例，否则星座会被压扁
          const side = band * 0.95
          const ox = bx * W
          const oy = Math.min(by * band, Math.max(0, band - side * 0.95))
          const point = (p) => [ox + p[0] * side, oy + p[1] * side]
          const pts = item.stars.map(point)
          shapes.push(h('g', { key: `line-${item.id}`, className: 'fh-constellation', opacity: 0.16 * nightness },
            item.lines.map((pair, k) => h('line', {
              key: `l${k}`,
              x1: pts[pair[0]][0].toFixed(1),
              y1: pts[pair[0]][1].toFixed(1),
              x2: pts[pair[1]][0].toFixed(1),
              y2: pts[pair[1]][1].toFixed(1),
              stroke: '#cfe0ff',
              strokeWidth: 0.9,
            })),
          ))
          pts.forEach((p, k) => {
            shapes.push(h('circle', {
              key: `star-${item.id}-${k}`,
              cx: p[0].toFixed(1),
              cy: p[1].toFixed(1),
              r: k < 2 ? 2 : 1.5,
              fill: '#f4f8ff',
              opacity: 0.85 * nightness,
            }))
          })
        })
        return h('g', { className: 'fh-garden-stars', 'data-season': season }, dots, shapes)
      },
      // 花园：整块天空（按时段取渐变）
      garden_sky: (props) => {
        const period = props && props.home && props.home.world ? props.home.world.period : 'noon'
        return h('rect', {
          x: 0,
          y: 0,
          width: geom.canvasW || 1200,
          height: geom.canvasH || 677,
          fill: `url(#fh-sky-${period || 'noon'})`,
        })
      },
      garden_sun: (props) => {
        const body = gardenBody('sun', undefined, props && props.part ? props.part.band : 0)
        if (!body) return null
        return h('g', { className: 'fh-garden-sun', opacity: body.alpha },
          h('circle', { cx: body.x, cy: body.y, r: body.r * 4.2, fill: 'url(#fh-sun-light)' }),
          h('circle', { cx: body.x, cy: body.y, r: body.r, fill: '#fff4c9' }),
        )
      },
      garden_moon: (props) => {
        const body = gardenBody('moon', undefined, props && props.part ? props.part.band : 0)
        if (!body) return null
        const r = body.r * 0.92
        const info = moonPhase()
        // 新月几乎全暗，光晕也淡一点，避免"没有月亮却有一团光"
        const glowAlpha = body.alpha * (0.35 + info.illumination * 0.65)
        // 新月（几乎全暗）不画多边形，否则外弧采样会留一道 1px 亮边；满月直接画圆
        const lit = info.illumination < 0.02
          ? null
          : info.illumination > 0.98
            ? h('circle', { cx: body.x, cy: body.y, r, fill: '#f2f7ff', opacity: body.alpha })
            : h('path', { d: moonLitPath(body.x, body.y, r, info), fill: '#f2f7ff', opacity: body.alpha })
        return h('g', { className: 'fh-garden-moon', 'data-phase': info.phase.toFixed(2) },
          h('circle', { cx: body.x, cy: body.y, r: body.r * 3.6, fill: 'url(#fh-moon-light)', opacity: glowAlpha }),
          // 暗面：很淡的冷灰，让"被遮住的那半"也能看出轮廓
          h('circle', { cx: body.x, cy: body.y, r, fill: '#7d8bab', opacity: body.alpha * 0.45 }),
          lit,
        )
      },
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
        // 指定立在家具的哪个部件上（默认取第一个有 sprite 的部件）
        part: typeof source.part === 'string' && source.part !== '' ? source.part : null,
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
    /**
     * 部件内的比例坐标 → 画布坐标，和实际绘制用同一套变换
     * （skew / flipX / rotate / part.offset 都会影响落点，忽略它们角色就会站偏）
     */
    function anchorPointOnPart(part, pivotX, fx, fy) {
      const sprite = part && part.sprite ? part.sprite : {}
      const rect = Array.isArray(sprite.rect) ? sprite.rect.map(Number) : [0, 0, 100, 100]
      const [x, y, w, h] = rect
      const projNow = geom && geom.kx ? geom.ky / geom.kx : 0.375
      const attach = typeof sprite.attach === 'string' ? sprite.attach.toLowerCase() : ''
      const manualSkew = sprite.skew !== undefined && sprite.skew !== null ? Number(sprite.skew) : NaN
      const tan = Number.isFinite(manualSkew)
        ? manualSkew
        : (attach ? (/left|y$/.test(attach) ? -projNow : projNow) : 0)
      const flip = sprite.flipX === true
      const rotate = Number(sprite.rotate) || 0
      const lx = w * clampNumber(fx, 0, 1, 0.5)
      const ly = h * clampNumber(fy, 0, 1, 0.92)
      const anchorX = flip ? x + w : x
      const compensate = Number.isFinite(pivotX) ? tan * (anchorX - pivotX) : 0
      // 和 spriteTransform() 的 transform 串一一对应：flip → skewY → translate
      let sx = flip ? x + w - lx : x + lx
      let sy = y + compensate + ly + tan * lx
      if (rotate !== 0) {
        const px = x + w / 2
        const py = y + (sprite.pivot === 'center' ? h / 2 : h)
        const rad = (rotate * Math.PI) / 180
        const dx = sx - px
        const dy = sy - py
        sx = px + dx * Math.cos(rad) - dy * Math.sin(rad)
        sy = py + dx * Math.sin(rad) + dy * Math.cos(rad)
      }
      // part.offset：整件家具的地板格偏移，画的时候是最外层的 translate
      const offset = part && part.offset && typeof part.offset === 'object' ? part.offset : null
      if (offset) {
        const fxOff = Number(offset.fx) || 0
        const fyOff = Number(offset.fy) || 0
        sx += (fxOff - fyOff) * geom.kx
        sy += (fxOff + fyOff) * geom.ky
      }
      return [sx, sy]
    }

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
      const rectParts = (def.parts || []).filter((item) => item && item.sprite && Array.isArray(item.sprite.rect))
      const part = (anchor.part ? rectParts.find((item) => item.id === anchor.part) : null) || rectParts[0]
      if (!part) return null
      // surface：同组部件共用切变原点，锚点也要用同一个，否则和画面差一截
      const surf = def.surface && typeof def.surface === 'object' ? def.surface : null
      let surfacePivot
      if (surf) {
        const xs = rectParts.map((item) => Number(item.sprite.rect[0])).filter((value) => Number.isFinite(value))
        if (xs.length > 0) surfacePivot = Math.min(...xs)
      }
      const spriteForAnchor = surf && !part.sprite.attach && typeof surf.attach === 'string'
        ? { ...part.sprite, attach: surf.attach }
        : part.sprite
      const [ax, ay] = anchorPointOnPart({ ...part, sprite: spriteForAnchor }, surfacePivot, anchor.position.x, anchor.position.y)
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
        x: ax + anchor.pivot[0],
        y: ay + anchor.pivot[1],
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
      // 季节条件：字符串或数组，和 world.season 比对（花园四季整图就靠它切换）
      if (when.season !== undefined && when.season !== null) {
        const seasons = Array.isArray(when.season) ? when.season : [when.season]
        if (seasons.length > 0 && !seasons.includes(home.world.season)) {
          return false
        }
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
              focusable: editing,
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
