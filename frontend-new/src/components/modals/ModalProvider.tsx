import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalConfig {
  id: string;
  title: string;
  content: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onClose?: () => void;
}

interface ModalContextType {
  openModal: (config: Omit<ModalConfig, 'id'>) => string;
  closeModal: (id: string) => void;
  closeAll: () => void;
}

const ModalContext = createContext<ModalContextType>({
  openModal: () => '',
  closeModal: () => {},
  closeAll: () => {},
});

export const useModal = () => useContext(ModalContext);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modals, setModals] = useState<ModalConfig[]>([]);

  const openModal = useCallback((config: Omit<ModalConfig, 'id'>) => {
    const id = `modal-${Date.now()}`;
    setModals((prev) => [...prev, { ...config, id }]);
    return id;
  }, []);

  const closeModal = useCallback((id: string) => {
    setModals((prev) => {
      const modal = prev.find((m) => m.id === id);
      if (modal?.onClose) modal.onClose();
      return prev.filter((m) => m.id !== id);
    });
  }, []);

  const closeAll = useCallback(() => {
    setModals([]);
  }, []);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  };

  return (
    <ModalContext.Provider value={{ openModal, closeModal, closeAll }}>
      {children}
      <AnimatePresence>
        {modals.map((modal) => (
          <motion.div
            key={modal.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal(modal.id);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={cn(
                'w-full max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-slate-900 to-slate-950 shadow-strong',
                sizeClasses[modal.size || 'lg']
              )}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-slate-900/50">
                <h2 className="font-black text-text">{modal.title}</h2>
                <button
                  onClick={() => closeModal(modal.id)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:bg-danger/10 hover:text-danger transition-colors"
                  aria-label="بستن"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-auto">{modal.content}</div>
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>
    </ModalContext.Provider>
  );
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}