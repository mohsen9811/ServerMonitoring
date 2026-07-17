import { create } from 'zustand';
import type { Alert } from '../types';

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (id: string) => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  unreadCount: 0,

  setAlerts: (alerts) => set({ alerts, unreadCount: alerts.filter((a) => !a.acknowledged).length }),
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100),
      unreadCount: state.unreadCount + (alert.acknowledged ? 0 : 1),
    })),
  acknowledgeAlert: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  clearAlerts: () => set({ alerts: [], unreadCount: 0 }),
}));