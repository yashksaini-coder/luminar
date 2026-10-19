import { store } from '../store'

const FILLS: [string, string][] = [
  ['idle', 'idle'], ['origin', 'origin'], ['receiving', 'receiving'], ['decoded', 'decoded'],
  ['joining', 'joining'], ['failed', 'failed'], ['attacker', 'attacker'], ['pruned', 'pruned attacker'],
]
const LINES: [string, string][] = [['lm-line lm-line-topo', 'topology'], ['lm-line lm-line-mesh', 'gossip mesh']]

function item(swatch: HTMLElement, label: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'nl-item'
  const text = document.createElement('span')
  text.textContent = label
  row.append(swatch, text)
  return row
}

function span(className: string): HTMLElement {
  const s = document.createElement('span')
  s.className = className
  return s
}

export function initLegend() {
  const legendEl = document.getElementById('node-legend')!
  const fillsEl = document.getElementById('legend-fills')!
  const ringsEl = document.getElementById('legend-rings')!
  const titleEl = legendEl.querySelector<HTMLElement>('.lm-legend-title')
  const settingsBtn = document.getElementById('settings-btn')!
  const settingsPanel = document.getElementById('settings-panel')!

  legendEl.style.display = 'block'

  for (const [state, label] of FILLS) {
    const dot = span(state === 'failed' || state === 'pruned' ? `nl-dot nl-dot-${state}` : 'nl-dot')
    if (!dot.className.includes('nl-dot-')) dot.style.background = `var(--lm-node-${state})`
    fillsEl.appendChild(item(dot, label))
  }
  for (const [cls, label] of LINES) ringsEl.appendChild(item(span(cls), label))
  const msgLine = span('lm-line')
  msgLine.appendChild(span('lm-dot-msg'))
  ringsEl.appendChild(item(msgLine, 'message'))

  // Settings replace the legend body: title + button swap, body hidden via #node-legend.open
  const gear = [...settingsBtn.childNodes]  // the lucide gear from index.html
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = legendEl.classList.toggle('open')
    settingsPanel.style.display = open ? '' : 'none'
    if (titleEl) titleEl.textContent = open ? 'Settings' : 'Legend'
    if (open) settingsBtn.textContent = '✕'
    else settingsBtn.replaceChildren(...gear)
    settingsBtn.title = open ? 'Close settings' : 'Settings'
  })

  buildSettingsPanel(settingsPanel)
}

function buildSettingsPanel(panel: HTMLElement) {
  panel.textContent = ''
  const rerender = () => document.dispatchEvent(new CustomEvent('luminar:render'))
  const pref = (key: 'stageTheme' | 'hero') => () =>
    document.dispatchEvent(new CustomEvent('luminar:pref', { detail: key }))

  panel.appendChild(createToggle('Gossip transfers', store.particlesEnabled, v => { store.particlesEnabled = v }))
  panel.appendChild(createToggle('Node labels', store.showLabels, v => { store.showLabels = v; rerender() }))
  panel.appendChild(createToggle('Edge lines', store.showEdges, v => { store.showEdges = v; rerender() }))
  const stageT = createToggle('Stage theme', store.stageTheme, pref('stageTheme'), 'T')
  const heroT = createToggle('Hero layout', store.hero, pref('hero'), 'H')
  panel.append(stageT, heroT)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const hint = document.createElement('div')
    hint.className = 'lm-settings-hint'
    hint.textContent = 'Transfers off under reduced motion'
    panel.appendChild(hint)
  }
  // Keys t/h flip the store without touching the checkbox; follow the store after each apply.
  document.addEventListener('luminar:prefs-applied', () => { stageT.set(store.stageTheme); heroT.set(store.hero) })
}

type Toggle = HTMLLabelElement & { set: (v: boolean) => void }

function createToggle(label: string, initialValue: boolean, onChange: (val: boolean) => void, key?: string): Toggle {
  const wrap = document.createElement('label') as Toggle
  wrap.className = 'lm-toggle'
  const text = document.createElement('span')
  text.textContent = label
  wrap.appendChild(text)
  if (key) {
    const kbd = span('lm-key')
    kbd.textContent = key
    wrap.appendChild(kbd)
  }
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = initialValue
  input.addEventListener('change', () => onChange(input.checked))
  wrap.append(input, span('lm-switch'))  // input:checked + .lm-switch drives the visuals
  wrap.set = (v: boolean) => { input.checked = v }
  return wrap
}
