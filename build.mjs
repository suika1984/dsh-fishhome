/**
 * 构建：把 src/ 下的片段拼回 client.js。
 *
 * 浏览器端的动态模块加载器（window.__ModuleLoader__）只接受一个文件，
 * 所以源码按职责分片、构建时按固定顺序合并成一个作用域里的函数体。
 * 改完 src/ 里的任何文件，跑一次：
 *
 *     node build.mjs
 *
 * 不要直接编辑 client.js —— 它是生成物。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 合并顺序即加载顺序：常量在被引用之前初始化。 */
const ORDER = [
  'src/env.js',          // 常量
  'src/locale.js',       // 中英文字典 + makeTranslate（纯数据）
  'src/model.js',        // 纯模型：时间 / 需求 / 调度 / 离线结算 / 动画映射
  'src/store-save.js',   // 存档读写 + 角色包载入
  'src/store.js',        // HomeStore 核心（状态 / 订阅 / 启动）
  'src/store-scene.js',  // 场景切换
  'src/store-edit.js',   // 布局编辑与写回
  'src/store-view.js',   // 动画视图 / 时钟 / 行为调度
  'src/scene-data.js',   // 场景 / 背景 / 家具数据加载
  'src/scene-geom.js',   // 等距几何
  'src/scene-art.js',    // 内置画法 preset
  'src/scene-light.js',  // 光影（窗光 / 屏幕光）
  'src/scene-parts.js',  // 家具绘制、锚点、排序
  'src/scene-render.js', // SceneSvg 合成入口
  'src/ui.js',           // 面板组件
  'src/styles.js',       // 样式
  'src/index.js',        // 插件入口
]

const PROLOGUE = "/**\n * 大肥鱼的家园 · Client 半。\n *\n * 分成两层：\n *   1. 纯模型（时间 / 需求 / 行为调度 / 离线结算 / 存档形状）—— 不碰 DOM、不碰 React，\n *      可以直接在 Node 里跑测试（见返回值的 __internals）。\n *   2. 表现层 —— 等距小屋 SVG、精灵动画、状态栏与交互。\n *\n * 模型只认稳定 ID（行为 ID、物件 ID、角色包动画标签），不认具体图片，\n * 所以换一套角色包或换一间屋子时，行为逻辑不用改。\n */\nwindow.__ModuleLoader__.load({\n  id: 'dsh-fishhome',\n  factory(require) {\n    const React = require('react')\n    const h = React.createElement\n    const { useState, useEffect, useRef, useMemo } = React"

const CLOSING = '  },\n})\n'

const body = ORDER.map((file) => readFileSync(path.join(HERE, file), 'utf8').replace(/\n$/, '')).join('\n')

writeFileSync(path.join(HERE, 'client.js'), PROLOGUE + '\n' + body + '\n' + CLOSING)
console.log('built client.js from', ORDER.length, 'fragments')
