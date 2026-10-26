/** Honesty-card numbers: the toy engine (backend/gossip/engine.py, scoring.py) beside Lighthouse defaults (docs/research-live-network.md). */
export const TOY = { d: 6, pruneThreshold: -10, heartbeatS: 1.0, terms: 'P1–P4' } as const
export const LIGHTHOUSE = { d: 8, thresholds: '−4000 / −8000 / −16000', heartbeatS: 0.7, terms: 'P1–P7' } as const
export const SERIES = [
  'gossipsub_mesh_peer_churn_events', 'gossipsub_mesh_peer_counts', 'gossipsub_mesh_peer_inclusion_events', 'gossipsub_score_per_mesh',
  'gossipsub_topic_iwant_msgs', 'gossipsub_topic_msg_published', 'gossipsub_topic_msg_recv_counts',
] as const
