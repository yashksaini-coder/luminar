import { writable } from 'svelte/store';

export type SimulationState = 'stopped' | 'running' | 'paused';

export interface SimulationStore {
  state: SimulationState;
  time: number;
  speed: number;
  nodeCount: number;
  eventCount: number;
  connected: boolean;
}

const initialState: SimulationStore = {
  state: 'stopped',
  time: 0,
  speed: 1,
  nodeCount: 0,
  eventCount: 0,
  connected: false
};

export const simulation = writable<SimulationStore>(initialState);

export const updateSim = (patch: Partial<SimulationStore>) => {
  simulation.update(s => ({ ...s, ...patch }));
};
