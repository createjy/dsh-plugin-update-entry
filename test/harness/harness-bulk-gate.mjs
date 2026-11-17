/* The Host exposes `pluginInventory/list` with `managementAvailable`, and the
   official plugin page asks it before it manages anything: when the answer is
   false the page says this deployment has no manageable profile. Reading
   `listBundles` alone skips that gate, so the one-click panel would happily
   list updates the page can never apply.

   Here the inventory first answers `managementAvailable: false`, then — after
   the user presses the panel's retry — true, so the same run also proves the
   retry path is not short-circuited by the gate. */
import { JSDOM } from 'jsdom'
import { Context, Service } from '@deepseek-ai/cordis'

const P = process.env.PUE_PREFIX || 'w6M7KW_'
const dom = new JSDOM(`<!doctype html><html><body>
<div class="${P}toolbar" data-plugin-toolbar="true" data-plugin-header-part="toolbar">
  <span class="${P}updatesNote" data-tone="info">1 个插件可更新</span>
  <button aria-label="刷新">刷新</button>
</div>
<div class="${P}pageBody" data-plugin-body><ul class="${P}cards"></ul></div></body></html>`,
{ url: 'http://127.0.0.1:62885/' })
const { window } = dom
Object.assign(globalThis, {
  window, document: window.document, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle,
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: clearTimeout,
  localStorage: window.localStorage, sessionStorage: window.sessionStorage,
})
Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => `req-${Math.random().toString(16).slice(2)}` }, configurable: true })
window.__ModuleLoader__ = { load(def) { globalThis.__reg = def } }

/* The fetch tier must not answer here: the stub service is the only source. */
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) })

const root = new Context()
class Locale extends Service {
  register() { return () => {} }
  bind() { return (k) => k }
}
new Locale(root, 'locale')
class Remote extends Service { $on() { return () => {} } }
new Remote(root, 'remote')

const calls = []
let manageable = false
class Inventory extends Service {
  async list() {
    calls.push(['inventory', manageable])
    return { ok: true, value: { managementAvailable: manageable, entries: [], agentPresets: [] } }
  }
}
new Inventory(root, 'remote.pluginInventory')

class Ns extends Service {
  async listBundles() {
    calls.push(['listBundles'])
    return { ok: true, value: [
      { name: 'dsh-free-search', installed: true, update: 'registry', version: '0.9.48' },
    ] }
  }
  async listVersions() {
    calls.push(['listVersions'])
    return { ok: true, value: {
      status: 'listed', installed: '0.9.48', registry: 'registry.npmjs.org',
      versions: [{ version: '0.9.55', publishedAt: '2026-11-17T00:00:00Z', tags: ['latest'], prerelease: false, bundle: true }],
    } }
  }
}
new Ns(root, 'remote.pluginManager')

const CLIENT = new URL('../../client.js', import.meta.url).pathname
await import(CLIENT)
const reg = globalThis.__reg
await root.plugin({ name: reg.id, inject: reg.inject, apply: reg.factory({}).apply })
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
await tick(250)

const all = document.querySelector('.pue-all')
all.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(500)

const panelText = () => document.querySelector('.pue-panel-body')?.textContent || ''
console.log('1 gate', panelText().includes('没有可管理的 profile'),
  'rows', document.querySelectorAll('.pue-bulk-item').length)
console.log('1b noBundlesRead', !calls.some(([name]) => name === 'listBundles'))
console.log('1c retry', document.querySelector('.pue-panel-body .pue-ghost')?.textContent.trim())

/* The same button must work once the deployment can manage plugins. */
manageable = true
const retry = document.querySelector('.pue-panel-body .pue-ghost')
if (!retry) console.log('MISSING retry button: the panel did not stop at the gate')
retry?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(600)
console.log('2 listed', JSON.stringify([...document.querySelectorAll('.pue-bulk-name')].map((n) => n.textContent)),
  'gateGone', !panelText().includes('没有可管理的 profile'))
console.log('2b count', document.querySelector('.pue-all-count')?.textContent)
process.exit(0)
