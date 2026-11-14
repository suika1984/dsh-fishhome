    /* ======================================================================
     * 等距几何：投影、多边形、等距立方体、渐变向量
     * ==================================================================== */
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
