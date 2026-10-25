import type { PeerNode, SnapshotFrame } from '@/lib/types'

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
