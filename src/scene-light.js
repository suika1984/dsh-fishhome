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
