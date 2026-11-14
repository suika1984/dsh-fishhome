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
