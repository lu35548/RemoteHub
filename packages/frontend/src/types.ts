// UI 层类型（v1 types.ts 的 UI 段迁移；域类型一律用 @remotehub/shared，spec 决策 7）
export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info';
  onConfirm: () => void;
}

export interface UIContextType {
  toast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  confirm: (options: ConfirmOptions) => void;
}
