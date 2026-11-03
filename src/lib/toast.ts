// Minimal toast store, usable from any component or plain function without a
// React context (CameraModal and the page both raise toasts). Replaces the
// blocking alert()/confirm() dialogs the app used before.

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  duration: number;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

export function dismissToast(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(
  message: string,
  options: { tone?: ToastTone; action?: Toast['action']; duration?: number } = {}
): number {
  const id = nextId++;
  const item: Toast = {
    id,
    message,
    tone: options.tone ?? 'info',
    action: options.action,
    duration: options.duration ?? (options.action ? 6000 : 3500),
  };
  // Keep the stack short on phones: the newest three are plenty.
  toasts = [...toasts, item].slice(-3);
  timers.set(id, setTimeout(() => dismissToast(id), item.duration));
  emit();
  return id;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): Toast[] {
  return toasts;
}
