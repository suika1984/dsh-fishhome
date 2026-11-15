/**
 * 界面测试入口：按原顺序跑拆分后的各部分（脚手架在 ui-harness.js）。
 * 运行：node test/ui.test.js
 */
import { model, registered } from './ui-harness.js'
import './ui/panel.test.js'
import './ui/editor.test.js'
import './ui/interact.test.js'
import './ui/scene.test.js'
import './ui/sessions.test.js'

console.log('ui tests passed:', {
  components: Object.keys(registered),
  behaviors: model.BEHAVIORS.length,
})
