import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import Tooltip, { tooltipRows } from '@/components/sim/Tooltip'
import { snapWith } from '@/lib/fixtures'
import { useStore } from '@/lib/store'
import type { PeerNode } from '@/lib/types'

// R3: Tooltip reads the store, so it mounts with createRoot + act (static markup would render the initial state)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root, host: HTMLDivElement
beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<Tooltip />))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const honest: PeerNode = { peer_id: 'peer-7', index: 7, state: 'decoded', connected_peers: ['peer-1', 'peer-2', 'sybil-0'], x: 0, y: 0, messages_sent: 1284, messages_received: 61900, gossip_score: 3.5 }
const grafted: PeerNode = { ...honest, peer_id: 'sybil-0', index: 50, state: 'attacker', connected_peers: ['peer-7', 'peer-9'], gossip_score: -0.25 }
const byId = new Map([[honest.peer_id, honest], [grafted.peer_id, grafted], ['peer-9', { ...honest, peer_id: 'peer-9', index: 9 }]])
test('honest rows: peers, score, sent · recv, mesh sybil grafts in alarm tone', () => {
  const r = tooltipRows(honest, { 'peer-7': ['peer-1', 'sybil-0'] }, byId)
  expect(r.head).toEqual({ name: 'n7', badge: 'DECODED', id: 'peer-7', alarm: false })
  expect(r.rows).toEqual([['peers', '3', false], ['score', '+3.50', false], ['sent · recv', '↑1,284 · ↓61.9K', false], ['mesh', '1 sybil graft', true]])
})
test('attacker rows: grafted into N meshes, score alarm, victims by short name; pruned badge', () => {
  const r = tooltipRows(grafted, {}, byId)
  expect(r.head.badge).toBe('ATTACKER'); expect(r.head.alarm).toBe(true); expect(r.rows[0]).toEqual(['grafted into', '2 meshes', false]); expect(r.rows[1]).toEqual(['score', '-0.25', true]); expect(r.peers).toEqual(['n7', 'n9'])
  expect(tooltipRows({ ...grafted, connected_peers: [] }, {}, byId).head.badge).toBe('PRUNED')
})
test('negative honest score is alarm; long ids are shortened in the id line', () => {
  expect(tooltipRows({ ...honest, gossip_score: -1 }, {}, byId).rows[1]).toEqual(['score', '-1.00', true])
  expect(tooltipRows({ ...honest, peer_id: '16Uiu2HAmAbCdEfGhIjKlMnOpQrStUvWxYz' }, {}, byId).head.id).toBe('16Uiu2HAm…WxYz')
})
test('Tooltip renders nothing without a hovered node, and nothing when the hovered id vanished', () => {
  expect(host.innerHTML).toBe('')
  act(() => useStore.setState({ hoveredPeer: 'ghost' })); expect(host.innerHTML).toBe('')
  act(() => { useStore.getState().applySnapshot({ ...snapWith(['peer-7']), nodes: [honest] }); useStore.getState().hoverPeer('peer-7') })
  const html = host.innerHTML; expect(html).toContain('n7'); expect(html).toContain('DECODED'); expect(html).toContain('+3.50'); expect(html).not.toMatch(/style="[^"]*#/)   // tones via class, never inline colour
})
test('DOM tones: a sybil graft row carries the alarm class; a pruned attacker badge is data-state=pruned without alarm (R6)', () => {
  act(() => { useStore.getState().applySnapshot({ ...snapWith(['peer-7']), nodes: [honest, { ...grafted, connected_peers: [] }], gossip: { mesh: { 'peer-7': ['sybil-0'] } } }); useStore.getState().hoverPeer('peer-7') })
  const dd = [...host.querySelectorAll('dd')].find(d => d.textContent === '1 sybil graft')
  expect(dd?.className).toMatch(/alarm/)
  act(() => useStore.getState().hoverPeer('sybil-0'))
  const badge = host.querySelector('[data-state]')
  expect(badge?.getAttribute('data-state')).toBe('pruned'); expect(badge?.textContent).toBe('PRUNED'); expect(badge?.className).not.toMatch(/alarm/)
})
