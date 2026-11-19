/* A batch of sixteen updates spends most of its wall clock on two things the
   panel used to do one at a time: re-reading versions that never landed, and
   saying nothing while an install runs for minutes.

   This harness pins the three fixes:

   1. the pre-run version re-read runs concurrently (four lanes), instead of one
      round trip after another;
   2. the running row and the footer show elapsed time, and finished rows keep
      how long they took;
   3. a request that lost the writer-lock race is retried once the queue has
      drained, instead of being reported as a failed update.

   It also checks the estimate the footer shows once a run has produced at
   least one real sample. */
import { JSDOM } from 'jsdom'
import { Context, Service } from '@deepseek-ai/cordis'

const P = process.env.PUE_PREFIX || 'w6M7KW_'
const dom = new JSDOM(`<!doctype html><html><body>
<div class="${P}toolbar" data-plugin-toolbar="true">
  <span class="${P}updatesNote" data-tone="info">5 个插件可更新</span>
  <button aria-label="刷新">刷新</button>
</div>
<div class="${P}pageBody" data-plugin-body><ul class="${P}cards"></ul></div></body></html>`,
{ url: 'http://127.0.0.1:62889/' })
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

const calls = []
globalThis.fetch = async (url) => {
  calls.push(String(url))
  if (String(url).includes('registry')) {
    return { ok: true, json: async () => ({ version: '9.9.9', repository: { url: 'git+https://github.com/example-org/x.git' } }) }
  }
  if (String(url).includes('api.github.com')) {
    return { ok: true, json: async () => ([{ tag_name: 'v3.0.0', published_at: '2026-11-02T00:00:00Z', html_url: 'https://github.com/example-org/x/releases/tag/v3.0.0', body: '说明' }]) }
  }
  return { ok: false, status: 404, json: async () => ({}) }
}

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

const NAMES = ['dsh-a', 'dsh-b', 'dsh-c', 'dsh-d', 'dsh-locky']
const reads = {}
let firstRound = true
let inflight = 0
let peak = 0
const locks = { 'dsh-locky': 0 }

class Ns extends Service {
  async listBundles() {
    calls.push(['listBundles'])
    return { ok: true, value: NAMES.map((name) => ({ name, installed: true, updatable: true, version: '1.0.0' })) }
  }
  async listVersions(name) {
    calls.push(['listVersions', name])
    inflight += 1;
    peak = Math.max(peak, inflight)
    await new Promise((r) => setTimeout(r, 120))
    inflight -= 1
    reads[name] = (reads[name] || 0) + 1
    /* The first sweep of the panel fails for every row — that is the shape that
       used to make a run re-read them one by one. */
    if (firstRound) throw new Error('plugin-manager: HTTP 500')
    return { ok: true, value: {
      status: 'listed', installed: '1.0.0', registry: 'registry.npmjs.org',
      versions: [{ version: '1.1.0', publishedAt: '2026-11-12T00:00:00Z', tags: ['latest'], prerelease: false, bundle: true }],
    } }
  }
  async updateBundle(name, version) {
    calls.push(['updateBundle', name, version])
    if (name === 'dsh-locky' && locks[name] === 0) {
      locks[name] += 1
      throw new Error('atomic-write: timed out waiting for the writer lock at /tmp/package.json.lock')
    }
    await new Promise((r) => setTimeout(r, 1200))
    return { ok: true, value: { from: '1.0.0', to: version, step: 'install', result: { changed: true, application: 'applied' } } }
  }
}
new Ns(root, 'remote.pluginManager')

await root.plugin({ name: reg.id, inject: reg.inject, apply: reg.factory({}).apply })
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
await tick(600)

const all = document.querySelector('.pue-all')
all.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(500)

/* The first sweep has failed everywhere, so the run itself has to re-read. */
firstRound = false
peak = 0
for (const key of Object.keys(reads)) reads[key] = 0

const run = () => [...document.querySelectorAll('.pue-panel button')].find((b) => /^更新 \d+ 个$/.test(b.textContent.trim()))
run().dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(160)

console.log('1 peakReads', peak)
console.log('1b hint', /宿主逐个安装|实际耗时|约 \d+ ×/.test(document.querySelector('.pue-bulk-foot')?.textContent || '')
  || [...document.querySelectorAll('.pue-bulk-note')].length > 0)

/* The clock has to tick while an install is in flight. */
await tick(1200)
const live = document.querySelector('.pue-bulk-item[data-state="running"] .pue-bulk-elapsed')
console.log('2 elapsed', !!live, /^\d+s/.test(live?.textContent.trim() || ''))
console.log('2b foot', /第 \d+\/\d+ 个/.test(document.querySelector('.pue-bulk-foot')?.textContent || ''),
  /已用时|\ds/.test(document.querySelector('.pue-bulk-foot')?.textContent || ''))

/* Let the whole batch finish: five installs at 1.2 s, serial. */
for (let i = 0; i < 40; i += 1) {
  if (document.querySelector('.pue-bulk-done')) break
  await tick(400)
}
const lines = [...document.querySelectorAll('.pue-bulk-line')]
  .map((n) => `${n.querySelector('.pue-bulk-name').textContent}|${n.textContent.trim()}`)
console.log('3 lines', JSON.stringify(lines))
console.log('3b took', [...document.querySelectorAll('.pue-bulk-took')].length)
console.log('4 locks', JSON.stringify(locks), 'updates', JSON.stringify(calls.filter((c) => c[0] === 'updateBundle').map((c) => c[1])))

/* Re-reading from the finished panel keeps the samples, so the next plan can
   quote a number instead of saying "we will see". */
const reread = [...document.querySelectorAll('.pue-panel button')].find((b) => b.textContent.trim() === '重新读取')
reread?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await tick(900)
const foot = document.querySelector('.pue-bulk-foot')?.textContent || ''
console.log('5 eta', /约 \d+ × \d+s/.test(foot), JSON.stringify(foot.slice(-40)))
