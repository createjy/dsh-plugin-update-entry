/* Two promises the panel has to keep:

   1. Unticking a row means "do not touch this package". The run has to skip it
      and say so, instead of updating everything and reporting the unticked row
      as if it had nothing to install.
   2. Stopping a run cannot recall the install already sent — the Host holds an
      exclusive lock on the profile until it finishes. So the panel must say it
      is stopping, and once the run ends one click on the toolbar entry has to
      start a fresh check. Before this, that entry only closed the finished
      panel, which read as "one-click update no longer works".

   `updateBundle` is held open so the stopping state is observable, and the
   held package is released to let the run finish. */
import { JSDOM } from 'jsdom'
import { Context, Service } from '@deepseek-ai/cordis'

const P = process.env.PUE_PREFIX || 'w6M7KW_'
const dom = new JSDOM(`<!doctype html><html><body>
<div class="${P}toolbar" data-plugin-toolbar="true" data-plugin-header-part="toolbar">
  <span class="${P}updatesNote" data-tone="info">3 个插件可更新</span>
  <button aria-label="刷新">刷新</button>
</div>
<div class="${P}pageBody" data-plugin-body><ul class="${P}cards"></ul></div></body></html>`,
{ url: 'http://127.0.0.1:62887/' })
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
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) })

const root = new Context()
class Locale extends Service {
  register() { return () => {} }
  bind() { return (k) => k }
}
new Locale(root, 'locale')
class Remote extends Service { $on() { return () => {} } }
new Remote(root, 'remote')

const NAMES = ['dsh-alpha', 'dsh-beta', 'dsh-gamma']
const calls = []
let hold = null
class Ns extends Service {
  async listBundles() {
    calls.push(['listBundles'])
    return { ok: true, value: NAMES.map((name) => ({ name, installed: true, update: 'registry', version: '0.1.0' })) }
  }
  async listVersions(name) {
    calls.push(['listVersions', name])
    return { ok: true, value: {
      status: 'listed', installed: '0.1.0', registry: 'registry.npmjs.org',
      versions: [{ version: '0.1.1', publishedAt: '2026-11-19T00:00:00Z', tags: ['latest'], prerelease: false, bundle: true }],
    } }
  }
  async updateBundle(name, version) {
    calls.push(['updateBundle', name, version])
    if (hold && name === hold.name) await hold.promise
    return { ok: true, value: { from: '0.1.0', to: version, step: 'install', result: { changed: true, application: 'applied' } } }
  }
}
new Ns(root, 'remote.pluginManager')

const CLIENT = new URL('../../client.js', import.meta.url).pathname
await import(CLIENT)
const reg = globalThis.__reg
await root.plugin({ name: reg.id, inject: reg.inject, apply: reg.factory({}).apply })
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
await tick(250)

const all = () => document.querySelector('.pue-all')
const rows = () => [...document.querySelectorAll('.pue-bulk-item')]
const footer = () => (document.querySelector('.pue-bulk-foot')?.textContent || '').trim()
const runButton = () => [...document.querySelectorAll('.pue-panel button')].find((b) => /^更新 \d+ 个$/.test(b.textContent.trim()))
const check = (name) => document.querySelector(`.pue-bulk-item[data-name="${name}"] .pue-bulk-check`)
const footButton = (text) => [...document.querySelectorAll('.pue-bulk-foot button')].find((b) => b.textContent.trim() === text)
const untick = (name) => {
  const box = check(name)
  box.checked = false
  box.dispatchEvent(new window.Event('change', { bubbles: true }))
}

all().dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(600)
console.log('1 picks', [...document.querySelectorAll('.pue-bulk-pick')].map((b) => b.textContent.trim()).join(','))
console.log('1b boxes', rows().map((n) => `${n.getAttribute('data-name')}:${check(n.getAttribute('data-name')).checked}`).join(' '))

/* A real click on the box must not also toggle the row open: the box sits
 * inside the row's clickable head. */
check('dsh-beta').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
check('dsh-beta').checked = false
check('dsh-beta').dispatchEvent(new window.Event('change', { bubbles: true }))
await tick(200)
console.log('2 untick', runButton()?.textContent.trim(), 'skip', document.querySelector('.pue-bulk-item[data-name="dsh-beta"]')?.getAttribute('data-skip'),
  'excluded', /1 个未勾选/.test(footer()), 'notExpanded', !document.querySelector('.pue-bulk-item[data-name="dsh-beta"][data-open="true"]'))

const none = footButton('全不选')
none?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(200)
console.log('2b deselectAll', runButton()?.textContent.trim(), 'disabled', runButton()?.disabled)
const allBtn = footButton('全选')
allBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(200)
console.log('3 selectAll', runButton()?.textContent.trim())

/* Leave dsh-beta out and let the run start on dsh-alpha. */
untick('dsh-beta')
await tick(200)
hold = {}
hold.name = 'dsh-alpha'
hold.promise = new Promise((resolve) => { hold.resume = resolve })
runButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(500)
console.log('4 running', /第 1\/2 个/.test(footer()), 'stop', footButton('停止')?.textContent.trim())

footButton('停止')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(300)
const stopping = footButton('正在停止')
console.log('5 stop', /正在停止/.test(footer()), 'disabled', stopping?.disabled, 'label', stopping?.textContent.trim())

hold.resume()
hold = null
await tick(900)
const lines = [...document.querySelectorAll('.pue-bulk-line')].map((n) => n.textContent.trim())
console.log('6 done', lines.join(' | '))
console.log('6b updates', JSON.stringify(calls.filter(([name]) => name === 'updateBundle')))
console.log('6c finish', footButton('完成')?.textContent.trim(), 'retry', footButton('重新读取')?.textContent.trim())

/* One click on the toolbar entry has to start a fresh read, not just close. */
const bundlesBefore = calls.filter(([name]) => name === 'listBundles').length
all().dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(700)
const bundlesAfter = calls.filter(([name]) => name === 'listBundles').length
console.log('7 restart', 'panel', !!document.querySelector('.pue-panel'), 'reads', `${bundlesBefore}->${bundlesAfter}`,
  'rows', rows().length, 'picks', [...document.querySelectorAll('.pue-bulk-pick')].map((b) => b.textContent.trim()).join(','))
process.exit(0)
