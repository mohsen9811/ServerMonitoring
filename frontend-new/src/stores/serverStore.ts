import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Server, ServerSummary } from '../types';

interface ServerState {
  servers: Server[];
  currentServerId: string | null;
  sidebarCollapsed: boolean;
  sortMode: boolean;
  searchQuery: string;

  setServers: (servers: Server[]) => void;
  addServer: (server: Server) => void;
  updateServer: (id: string, data: Partial<Server>) => void;
  removeServer: (id: string) => void;
  reorderServers: (order: string[]) => void;
  setCurrentServer: (id: string | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSortMode: () => void;
  setSearchQuery: (query: string) => void;
  getCurrentServer: () => Server | undefined;
  getFilteredServers: () => ServerSummary[];
}

export const useServerStore = create<ServerState>()(
  persist(
    (set, get) => ({
      servers: [],
      currentServerId: null,
      sidebarCollapsed: false,
      sortMode: false,
      searchQuery: '',

      setServers: (servers) => set({ servers }),
      addServer: (server) => set((state) => ({ servers: [...state.servers, server] })),
      updateServer: (id, data) =>
        set((state) => ({
          servers: state.servers.map((s) => (s.id === id ? { ...s, ...data } : s)),
        })),
      removeServer: (id) =>
        set((state) => ({
          servers: state.servers.filter((s) => s.id !== id),
          currentServerId: state.currentServerId === id ? null : state.currentServerId,
        })),
      reorderServers: (order) =>
        set((state) => {
          const byId = new Map(state.servers.map((s) => [s.id, s]));
          const ordered = order.map((id) => byId.get(id)!).filter(Boolean);
          const remaining = state.servers.filter((s) => !order.includes(s.id));
          return { servers: [...ordered, ...remaining] };
        }),
      setCurrentServer: (id) => set({ currentServerId: id }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSortMode: () => set((state) => ({ sortMode: !state.sortMode })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      getCurrentServer: () => get().servers.find((s) => s.id === get().currentServerId),
      getFilteredServers: () => {
        const { servers, searchQuery } = get();
        let filtered = servers.map((s) => ({
          id: s.id,
          name: s.name,
          host: s.host,
          hasSql: !!(s.features?.sql ?? s.sql?.enabled),
          hasIis: !!(s.features?.iis ?? s.iis?.enabled),
          hasCredit: !!(s.features?.credit ?? s.credit?.enabled),
        }));
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter((s) => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q));
        }
        return filtered;
      },
    }),
    {
      name: 'serverpulse-servers',
      partialize: (state) => ({
        servers: state.servers,
        currentServerId: state.currentServerId,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);