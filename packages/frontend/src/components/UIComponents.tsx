import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info, Loader2, AlertTriangle } from 'lucide-react';
import { ToastMessage, ToastType, ConfirmOptions, UIContextType } from '../types';

const UIContext = createContext<UIContextType | null>(null);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within a UIProvider');
  return context;
};

// --- Global Modal Component (Deep Glassmorphism) ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children, className = '' }) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isRendered) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300 ease-out-expo ${isVisible ? 'bg-slate-950/70 backdrop-blur-sm' : 'bg-slate-950/0 backdrop-blur-none'}`}
      onClick={onClose}
    >
      <div 
        className={`relative bg-slate-900/80 border border-white/10 w-full shadow-2xl transform transition-all duration-300 ease-out-back backdrop-blur-xl ${className} ${isVisible ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-8'}`}
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 0 50px -12px rgba(0, 0, 0, 0.7)' }}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

// --- Tooltip Component ---
interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: 'right' | 'top' | 'bottom' | 'left';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'right', className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0;
      let left = 0;
      const gap = 10;

      switch (side) {
        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + gap;
          break;
        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - gap;
          break;
        case 'top':
          top = rect.top - gap;
          left = rect.left + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + gap;
          left = rect.left + rect.width / 2;
          break;
      }
      setCoords({ top, left });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsVisible(true);
  };

  const getTransformClass = () => {
    switch (side) {
      case 'right': return '-translate-y-1/2 origin-left';
      case 'left': return '-translate-x-full -translate-y-1/2 origin-right';
      case 'top': return '-translate-x-1/2 -translate-y-full origin-bottom';
      case 'bottom': return '-translate-x-1/2 origin-top';
      default: return '';
    }
  };

  return (
    <>
      <div 
        ref={triggerRef}
        className={`relative flex items-center justify-center ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div 
          className={`fixed z-[9999] px-3 py-1.5 text-[11px] font-semibold text-white bg-slate-800/90 border border-white/10 rounded-lg shadow-xl backdrop-blur-md whitespace-nowrap animate-in fade-in zoom-in-95 duration-200 ease-out-expo pointer-events-none ${getTransformClass()}`}
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
};

// --- Toast Component ---
const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => onDismiss(toast.id), toast.duration || 4000);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  const styles = {
    success: { icon: <CheckCircle className="text-emerald-400" size={20} />, border: 'border-l-emerald-500', bg: 'shadow-emerald-900/20' },
    error: { icon: <AlertCircle className="text-rose-400" size={20} />, border: 'border-l-rose-500', bg: 'shadow-rose-900/20' },
    info: { icon: <Info className="text-blue-400" size={20} />, border: 'border-l-blue-500', bg: 'shadow-blue-900/20' },
    loading: { icon: <Loader2 className="text-indigo-400 animate-spin" size={20} />, border: 'border-l-indigo-500', bg: 'shadow-indigo-900/20' }
  };
  const style = styles[toast.type];

  return (
    <div className={`flex gap-3 p-4 rounded-xl border border-white/10 border-l-4 shadow-2xl backdrop-blur-xl w-80 pointer-events-auto animate-in slide-in-from-right-full duration-500 ease-out-back bg-slate-900/90 ${style.border} ${style.bg}`}>
      <div className="flex-shrink-0 pt-0.5">{style.icon}</div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-slate-100 tracking-tight">{toast.title}</h4>
        {toast.message && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{toast.message}</p>}
      </div>
      <button onClick={() => onDismiss(toast.id)} className="flex-shrink-0 text-slate-500 hover:text-white p-1 transition-colors"><X size={16} /></button>
    </div>
  );
};

// --- Confirm Dialog Component ---
const ConfirmModal: React.FC<{ options: ConfirmOptions; onClose: () => void }> = ({ options, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300 ease-out-expo">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-300 ease-out-back ring-1 ring-white/5">
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-3 rounded-xl ${options.variant === 'danger' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'}`}>
             {options.variant === 'danger' ? <AlertTriangle size={24} /> : <Info size={24} />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">{options.title}</h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">{options.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            {options.cancelText || '取消'}
          </button>
          <button 
            onClick={() => { options.onConfirm(); onClose(); }}
            className={`px-4 py-2 text-sm font-bold text-white rounded-lg shadow-lg transition-all active:scale-95 ${
              options.variant === 'danger' 
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30' 
                : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/30'
            }`}
          >
            {options.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Provider ---
export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);

  const toast = useCallback((type: ToastType, title: string, message?: string, duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, title, message, duration }]);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmOptions(options);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[90] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>

      {/* Confirm Dialog */}
      {confirmOptions && (
        <ConfirmModal options={confirmOptions} onClose={() => setConfirmOptions(null)} />
      )}
    </UIContext.Provider>
  );
};