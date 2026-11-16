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
