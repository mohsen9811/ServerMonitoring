import { create } from 'zustand';
import type { CreditOperation } from '../types';

interface CreditState {
  operations: CreditOperation[];
  selectedOperationId: string | null;
  result: any;
  history: any[];
  isLoading: boolean;
  setOperations: (ops: CreditOperation[]) => void;
  setSelectedOperation: (id: string | null) => void;
  setResult: (result: any) => void;
  setHistory: (history: any[]) => void;
  setLoading: (loading: boolean) => void;
  addOperation: (op: CreditOperation) => void;
  updateOperation: (id: string, data: Partial<CreditOperation>) => void;
  removeOperation: (id: string) => void;
}

export const useCreditStore = create<CreditState>((set) => ({
  operations: [],
  selectedOperationId: null,
  result: null,
  history: [],
  isLoading: false,

  setOperations: (operations) => set({ operations }),
  setSelectedOperation: (selectedOperationId) => set({ selectedOperationId }),
  setResult: (result) => set({ result }),
  setHistory: (history) => set({ history }),
  setLoading: (isLoading) => set({ isLoading }),
  addOperation: (op) => set((state) => ({ operations: [...state.operations, op] })),
  updateOperation: (id, data) =>
    set((state) => ({
      operations: state.operations.map((o) => (o.id === id ? { ...o, ...data } : o)),
    })),
  removeOperation: (id) =>
    set((state) => ({
      operations: state.operations.filter((o) => o.id !== id),
      selectedOperationId: state.selectedOperationId === id ? null : state.selectedOperationId,
    })),
}));