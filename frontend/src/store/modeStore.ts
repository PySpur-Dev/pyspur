import { create } from 'zustand';

type Mode = 'pointer' | 'hand' | 'select' | 'connect';

interface ModeState {
  mode: Mode;
  setMode: (mode: Mode) => void;
}

export const useModeStore = create<ModeState>((set) => ({
  mode: 'pointer',
  setMode: (mode) => set({ mode }),
}));
