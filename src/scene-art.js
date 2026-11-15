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
        // 门外的暖光：门洞里透出来的光，暗示「那边还有一间屋」
        h('linearGradient', { id: 'fh-door-glow', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#fff6dd', stopOpacity: 0.9 }),
          h('stop', { offset: '100%', stopColor: '#ffd9a6', stopOpacity: 0.35 }),
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


    /**
     * 出门用的门：前景里一扇半开的木门（等距场景的「切面」画法，
     * 不追求透视正确，只求一眼看出「从这里出去」）。
     * 位置用 part.rect 给（画布绝对坐标），和精灵件一致。
     */
    function DoorView(props) {
      const part = props.part || {}
      const r = Array.isArray(part.rect) ? part.rect.map(Number) : [0, 0, 120, 280]
      const x = Number.isFinite(r[0]) ? r[0] : 0
      const y = Number.isFinite(r[1]) ? r[1] : 0
      const w = Number.isFinite(r[2]) && r[2] > 20 ? r[2] : 120
      const hh = Number.isFinite(r[3]) && r[3] > 40 ? r[3] : 280
      const post = Math.max(10, w * 0.11)
      const frameTop = y + hh * 0.07
      // 门框：两根立柱 + 上梁（深一点的原木色，和房间墙裙同色系）
      const frameColor = PALETTE.wallTrimDark
      const leafColor = PALETTE.woodLeft
      const leafLight = PALETTE.woodRight
      const open = w * 0.34
      return h('g', { className: 'fh-door' },
        // 地面阴影
        h('ellipse', { className: 'fh-door-shadow', cx: x + w / 2, cy: y + hh, rx: w * 0.62, ry: hh * 0.045, fill: '#000', opacity: 0.14 }),
        // 门洞（房间外面的暖光）
        h('rect', { x: x + post, y: frameTop + post, width: w - post * 2, height: hh - post * 1.4, rx: 3, fill: '#f6e6c8' }),
        h('rect', { x: x + post, y: frameTop + post, width: w - post * 2, height: hh - post * 1.4, rx: 3, fill: 'url(#fh-door-glow)' }),
        // 门扇（向里推开一点，用平行四边形暗示角度）
        h('polygon', {
          className: 'fh-door-leaf',
          points: points([
            [x + post, frameTop + post],
            [x + post + open, frameTop + post + hh * 0.06],
            [x + post + open, y + hh - post * 0.5],
            [x + post, y + hh - post * 0.4],
          ]),
          fill: leafColor,
          stroke: '#5d4530',
          strokeWidth: 1,
        }),
        // 门扇上的一块亮面 + 门把手
        h('polygon', {
          points: points([
            [x + post + w * 0.06, frameTop + post + hh * 0.1],
            [x + post + open - w * 0.04, frameTop + post + hh * 0.14],
            [x + post + open - w * 0.04, frameTop + post + hh * 0.52],
            [x + post + w * 0.06, frameTop + post + hh * 0.5],
          ]),
          fill: leafLight,
          opacity: 0.55,
        }),
        h('circle', { cx: x + post + open - w * 0.055, cy: frameTop + post + hh * 0.55, r: Math.max(3, w * 0.028), fill: '#e8c477', stroke: '#8a6748', strokeWidth: 1 }),
        // 门框
        h('rect', { x: x, y: frameTop, width: post, height: hh * 0.95, rx: 2, fill: frameColor }),
        h('rect', { x: x + w - post, y: frameTop, width: post, height: hh * 0.95, rx: 2, fill: frameColor }),
        h('rect', { x: x, y: frameTop, width: w, height: post, rx: 2, fill: frameColor }),
        h('rect', { x: x, y: frameTop, width: w, height: post * 0.45, rx: 2, fill: '#8a6748', opacity: 0.8 }),
      )
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
