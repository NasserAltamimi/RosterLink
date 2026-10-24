import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Success feedback for SF-01, SF-02 and SF-04–07 actions. Errors and field validation stay
// inline next to the form that produced them; toasts only confirm completed operations.
const ToastContext = createContext(() => {});
const DISMISS_AFTER = 5000;
const MAX_VISIBLE = 3;

export const useToast = () => useContext(ToastContext);

function Toast({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), DISMISS_AFTER);
    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.version, onDismiss]);
  // Hovering or focusing the toast pauses automatic dismissal so it can be read or closed.
  return <div className="toast" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <span className="toast-icon" aria-hidden="true">✓</span>
    <p dir="auto">{toast.message}</p>
    <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>×</button>
  </div>;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const dismiss = useCallback(id => setToasts(previous => previous.filter(toast => toast.id !== id)), []);
  const notify = useCallback(message => setToasts(previous => {
    // Repeating an action refreshes the visible message instead of stacking a duplicate.
    const existing = previous.find(toast => toast.message === message);
    if (existing) return previous.map(toast => toast === existing ? { ...toast, version: toast.version + 1 } : toast);
    return [...previous, { id: ++nextId.current, message, version: 0 }].slice(-MAX_VISIBLE);
  }), []);
  useEffect(() => {
    if (!toasts.length) return undefined;
    const closeLatest = event => { if (event.key === 'Escape') dismiss(toasts[toasts.length - 1].id); };
    window.addEventListener('keydown', closeLatest);
    return () => window.removeEventListener('keydown', closeLatest);
  }, [toasts, dismiss]);
  return <ToastContext.Provider value={notify}>
    {children}
    {/* The live region stays mounted so screen readers reliably announce each new message. */}
    <div className="toast-region" role="status" aria-live="polite" aria-relevant="additions text">
      {toasts.map(toast => <Toast key={toast.id} toast={toast} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>;
}
