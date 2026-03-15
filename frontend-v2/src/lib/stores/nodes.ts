import { writable, derived } from 'svelte/store';

export type NodeStatus = 'idle' | 'origin' | 'receiving' | 'decoded' | 'failed' | 'error';

export interface PeerNode {
  id: string;
  status: NodeStatus;
  x: number;
  y: number;
  [key: string]: any;
}

export interface Edge {
  source: string;
  target: string;
  category?: string;
}

export const nodes = writable<Map<string, PeerNode>>(new Map());
export const edges = writable<Edge[]>([]);
export const selectedNodeId = writable<string | null>(null);

export const nodeCount = derived(nodes, $n => $n.size);

export const updateNode = (id: string, patch: Partial<PeerNode>) => {
  nodes.update(n => {
    const node = n.get(id);
    if (node) {
      n.set(id, { ...node, ...patch });
    }
    return n;
  });
};

export const setNodes = (newNodes: PeerNode[]) => {
  nodes.update(() => {
    const m = new Map();
    newNodes.forEach(n => m.set(n.id, n));
    return m;
  });
};

export const clearGraph = () => {
  nodes.set(new Map());
  edges.set([]);
  selectedNodeId.set(null);
};
