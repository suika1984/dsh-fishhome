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
