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
      const { home, views, now, t, actions, edit, onSelect, onDragStart, onResizeStart, zoom } = props
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
      const { t, profile, onChange, onSave, onClose, paths, configs, onOpen, openTip, sessionTargets, noteTarget, onNoteTarget, hostRev } = props
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
                }, t('settings.reveal'))))),
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
          const text = result.ok ? `已打开 ${spec.path}` : `打不开：${result.error || '未知错误'}`
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
                  void store.openPath(kind, target).then((result) => {
                    setOpenTip(result.ok
                      ? t('settings.opened', { path: target })
                      : t('settings.openFailed', { error: result.error || '未知错误' }))
                  })
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


