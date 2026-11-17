/* The official "N plugins can be updated" note is React state: it exists only
   after every background version check finished, so pressing Refresh makes it
   vanish for minutes. The one-click entry is the fast path that skips that
   serial check, so it must be usable while the note is absent — otherwise the
   only way to reach it is to wait for the slow official refresh.

   Here the toolbar is rendered with no note at all, which is what a page looks
   like mid-refresh. */
import { JSDOM } from 'jsdom'
import { Context, Service } from '@deepseek-ai/cordis'

const P = process.env.PUE_PREFIX || 'w6M7KW_'
const dom = new JSDOM(`<!doctype html><html><body>
<div class="${P}toolbar" data-plugin-toolbar="true" data-plugin-header-part="toolbar">
  <button aria-label="刷新" aria-busy="true" disabled>刷新</button>
</div>
<div class="${P}pageBody" data-plugin-body><ul class="${P}cards"></ul></div></body></html>`,
{ url: 'http://127.0.0.1:62884/' })
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

/* No network: every version answer comes from the stub service below. */
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) })

const root = new Context()
class Locale extends Service {
  register() { return () => {} }
  bind() { return (k) => k }
}
new Locale(root, 'locale')
class Remote extends Service { $on() { return () => {} } }
new Remote(root, 'remote')

const CLIENT = new URL('../../client.js', import.meta.url).pathname
await import(CLIENT)
const reg = globalThis.__reg

const calls = []
/* One registry-updatable package, one whose registry answer is empty (hidden
   row), one Git install (never listed), one that is not updatable at all. */
class Ns extends Service {
  async listBundles() {
    calls.push(['listBundles'])
    return { ok: true, value: [
      { name: 'dsh-free-search', installed: true, update: 'registry', version: '0.9.48' },
      { name: 'dsh-ops', installed: true, update: 'registry', version: '0.5.4' },
      { name: 'git-only', installed: true, update: 'git', version: '1.0.0' },
      { name: 'not-updatable', installed: true, version: '2.0.0' },
    ] }
  }
  async listVersions(name) {
    calls.push(['listVersions', name])
    if (name === 'dsh-ops') {
      return { ok: true, value: { status: 'listed', installed: '0.5.4', registry: 'registry.npmjs.org', versions: [] } }
    }
    return { ok: true, value: {
      status: 'listed', installed: '0.9.48', registry: 'registry.npmjs.org',
      versions: [{ version: '0.9.54', publishedAt: '2026-11-13T00:00:00Z', tags: ['latest'], prerelease: false, bundle: true }],
    } }
  }
  async updateBundle(name, version) {
    calls.push(['updateBundle', name, version])
    return { ok: true, value: { from: 'old', to: version, step: 'install', result: { changed: true, application: 'applied' } } }
  }
}
new Ns(root, 'remote.pluginManager')

await root.plugin({ name: reg.id, inject: reg.inject, apply: reg.factory({}).apply })
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
await tick(250)

const toolbar = document.querySelector('[data-plugin-toolbar]')
const all = document.querySelector('.pue-all')
console.log('1 mounted', !!all, 'inToolbar', toolbar.contains(all), 'noteAbsent', !toolbar.querySelector('[class*="updatesNote"]'))
console.log('1b text', all?.textContent.trim(), 'count', JSON.stringify(all?.querySelector('.pue-all-count')?.textContent))

all.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(400)
console.log('2 rows', JSON.stringify([...document.querySelectorAll('.pue-bulk-item')].map((n) => n.querySelector('.pue-bulk-name').textContent)))
console.log('2b gitHidden', ![...document.querySelectorAll('.pue-bulk-name')].some((n) => n.textContent === 'git-only'))
console.log('2c count', all.querySelector('.pue-all-count')?.textContent, 'hidden', all.querySelector('.pue-all-count')?.hidden)

/* The note coming back mid-session must reorder the button after it, not
   duplicate it. */
const note = document.createElement('span')
note.className = `${P}updatesNote`
note.setAttribute('data-tone', 'info')
note.textContent = '1 个插件可更新'
toolbar.prepend(note)
await tick(300)
console.log('3 afterNote', note.nextElementSibling === document.querySelector('.pue-all'),
  'oneButton', document.querySelectorAll('.pue-all').length)

/* Leaving the plugin page takes the toolbar away; the button must go with it. */
toolbar.remove()
await tick(300)
console.log('4 noToolbar', !document.querySelector('.pue-all'), 'panelClosed', !document.querySelector('.pue-panel'))
process.exit(0)
