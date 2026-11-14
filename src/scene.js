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
     *   scene.roomLight = { mode: 'prop', prop: 'livingLamp' } → 由用户开关决定
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
      const parts = furnitureItems(furnitureRef.value, home, t, { interact: onProp, toggle: onToggle, select: onSelect, dragStart: onDragStart, resizeStart: onResizeStart, gotoScene: onScene }, edit)
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

