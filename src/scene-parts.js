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
