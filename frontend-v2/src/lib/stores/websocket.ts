import { browser } from '$app/environment';
import { updateSim, type SimulationState } from './simulation';
import { events, type AppEvent } from './events';
import { updateNode, setNodes, edges, nodes } from './nodes';

let socket: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let eventBatch: AppEvent[] = [];
let batchInterval: ReturnType<typeof setInterval> | null = null;

export function connect() {
  if (!browser || socket) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const url = `${protocol}//${host}/ws/events`;

  socket = new WebSocket(url);

  socket.onopen = () => {
    updateSim({ connected: true });
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    // Start batch interval
    batchInterval = setInterval(() => {
      if (eventBatch.length > 0) {
        events.addBatch(eventBatch);
        eventBatch = [];
      }
    }, 50);
  };

  socket.onmessage = (msg) => {
    try {
      const event: AppEvent = JSON.parse(msg.data);
      processEvent(event);
    } catch (e) {
      console.error('Failed to parse WS event', e);
    }
  };

  socket.onclose = () => {
    updateSim({ connected: false });
    socket = null;
    if (batchInterval) clearInterval(batchInterval);
    reconnectTimeout = setTimeout(connect, 2000);
  };
}

function processEvent(event: AppEvent) {
  // 1. Update Simulation State
  if (event.event_type === 'SimulationStateChanged') {
    updateSim({
      state: event.state as SimulationState,
      speed: event.speed,
      time: event.at
    });
  }

  // 2. Update Clock/Time for all events
  updateSim({ time: event.at });

  // 3. Update Nodes
  if (event.peer_id) {
    if (event.event_type === 'PeerStateChanged') {
      updateNode(event.peer_id, { status: event.status });
    }
  }

  // 4. Batch for UI log
  eventBatch.push(event);
}

export function sendCommand(method: string, endpoint: string, body?: any) {
  return fetch(`/api${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}
