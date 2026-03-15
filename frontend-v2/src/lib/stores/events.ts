import { writable } from 'svelte/store';

export interface AppEvent {
  at: number;
  peer_id?: string;
  category: string;
  event_type: string;
  message?: string;
  [key: string]: any;
}

const MAX_EVENTS = 10000;

function createEventsStore() {
  const { subscribe, update } = writable<AppEvent[]>([]);

  return {
    subscribe,
    addBatch: (batch: AppEvent[]) => update(events => {
      const combined = [...events, ...batch];
      if (combined.length > MAX_EVENTS) {
        return combined.slice(combined.length - MAX_EVENTS);
      }
      return combined;
    }),
    clear: () => update(() => [])
  };
}

export const events = createEventsStore();
