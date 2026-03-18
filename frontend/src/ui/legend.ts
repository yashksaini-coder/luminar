import { STATE_CSS } from '../palette'
import { store } from '../store'

export function initLegend() {
  const legendEl = document.getElementById('node-legend')!
  const fillsEl = document.getElementById('legend-fills')!
  const settingsBtn = document.getElementById('settings-btn')!
  const settingsPanel = document.getElementById('settings-panel')!

  legendEl.style.display = 'block'

  // Fix settings icon size
  settingsBtn.style.cssText = 'background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0;line-height:1;width:auto;height:auto;display:flex;align-items:center'
  settingsBtn.textContent = '\u2699'

  // Fill section header
  const fillHeader = document.createElement('div')
  fillHeader.style.cssText = 'font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px'
  fillHeader.textContent = 'Fill'
  fillsEl.insertBefore(fillHeader, fillsEl.firstChild)

  const states: [string, string][] = [
    ['origin', 'Origin'],
    ['idle', 'Idle'],
    ['receiving', 'Receiving'],
    ['decoded', 'Decoded'],
    ['joining', 'Joining'],
    ['failed', 'Failed'],
    ['error', 'Error'],
  ]

  for (const [state, label] of states) {
    const item = document.createElement('div')
    item.className = 'nl-item'
    const dot = document.createElement('span')
    dot.className = 'nl-dot'
    dot.style.backgroundColor = STATE_CSS[state] ?? '#57534e'
    const text = document.createElement('span')
    text.textContent = label
    item.appendChild(dot)
    item.appendChild(text)
    fillsEl.appendChild(item)
  }

  // Settings button toggle
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = settingsPanel.style.display !== 'none'
    settingsPanel.style.display = isOpen ? 'none' : 'block'
  })

  buildSettingsPanel(settingsPanel)
}

function buildSettingsPanel(panel: HTMLElement) {
  panel.textContent = ''

  // Particles section
  addSection(panel, 'Particles', [
    createToggle('Gossip transfers', store.particlesEnabled, v => { store.particlesEnabled = v }),
  ])

  // Display section
  addSection(panel, 'Display', [
    createToggle('Node labels', store.showLabels, v => { store.showLabels = v }),
    createToggle('Edge lines', store.showEdges, v => { store.showEdges = v }),
  ], true)
}

function addSection(parent: HTMLElement, title: string, items: HTMLElement[], separator = false) {
  const section = document.createElement('div')
  if (separator) section.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid var(--border-subtle)'

  const header = document.createElement('div')
  header.style.cssText = 'font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px'
  header.textContent = title
  section.appendChild(header)

  for (const item of items) section.appendChild(item)
  parent.appendChild(section)
}

function createToggle(label: string, initialValue: boolean, onChange: (val: boolean) => void): HTMLElement {
  const wrap = document.createElement('label')
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:10px;color:var(--text2);padding:3px 0;user-select:none'

  // Track element (the pill-shaped background)
  const track = document.createElement('span')
  track.style.cssText = `
    width:24px;height:12px;border-radius:6px;position:relative;
    flex-shrink:0;transition:background 0.15s;display:block;
    background:${initialValue ? 'oklch(0.72 0.14 210)' : 'var(--border)'};
  `.replace(/\n/g, '')

  // Thumb element (the circle)
  const thumb = document.createElement('span')
  thumb.style.cssText = `
    position:absolute;top:1px;width:10px;height:10px;border-radius:50%;
    background:#fff;transition:left 0.15s;display:block;
    left:${initialValue ? '13px' : '1px'};
  `.replace(/\n/g, '')
  track.appendChild(thumb)

  // Hidden checkbox for accessibility
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = initialValue
  input.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none'

  input.addEventListener('change', () => {
    onChange(input.checked)
    track.style.background = input.checked ? 'oklch(0.72 0.14 210)' : 'var(--border)'
    thumb.style.left = input.checked ? '13px' : '1px'
  })

  // Click on track toggles
  track.addEventListener('click', (e) => {
    e.preventDefault()
    input.checked = !input.checked
    input.dispatchEvent(new Event('change'))
  })

  const text = document.createElement('span')
  text.textContent = label

  wrap.appendChild(input)
  wrap.appendChild(track)
  wrap.appendChild(text)
  return wrap
}
