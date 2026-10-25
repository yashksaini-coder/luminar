import type { Edge, PeerNode, SnapshotFrame } from '@/lib/types'

export function peerNode(id: string, index: number, extra?: Partial<PeerNode>): PeerNode {
  return {
    peer_id: id, index, state: 'idle', connected_peers: [], x: 0, y: 0,
    messages_sent: 0, messages_received: 0, gossip_score: 1, ...extra,
  }
}

export function snapWith(ids: string[], extra?: Partial<SnapshotFrame>): SnapshotFrame {
  return {
    type: 'snapshot', state: 'running', time: 0, speed: 1, node_count: ids.length, event_count: 0,
    nodes: ids.map((id, i) => peerNode(id, i)), gossip: { mesh: {} }, ...extra,
  }
}

export function peers(n: number): PeerNode[] {
  return Array.from({ length: n }, (_, i) => peerNode(`peer-${i}`, i))
}

export function ring(n: number): Edge[] {
  return Array.from({ length: n }, (_, i): Edge => [`peer-${i}`, `peer-${(i + 1) % n}`])
}
