import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ToastDispatchContext = createContext(null)
const ToastListContext = createContext(null)

function id() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

/**
 * Dispatch (push/remove) lives in a separate context so its value identity stays stable
 * when the toast list updates. Effects that depend only on `toast.push` must not re-fire
 * every time a toast appears or expires.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((toastId) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId))
  }, [])

  const push = useCallback((toast) => {
    const toastId = id()
    const item = {
      id: toastId,
      type: toast.type || 'info', // 'success' | 'error' | 'info'
      title: toast.title || '',
      message: toast.message || '',
      timeoutMs: typeof toast.timeoutMs === 'number' ? toast.timeoutMs : 3500,
    }

    setToasts((prev) => [item, ...prev].slice(0, 3))

    if (item.timeoutMs > 0) window.setTimeout(() => remove(toastId), item.timeoutMs)
    return toastId
  }, [remove])

  const dispatch = useMemo(() => ({ push, remove }), [push, remove])

  return (
    <ToastDispatchContext.Provider value={dispatch}>
      <ToastListContext.Provider value={toasts}>{children}</ToastListContext.Provider>
    </ToastDispatchContext.Provider>
  )
}

/** Stable { push, remove } — does not re-render when the toast list changes. Use in data hooks / lists. */
export function useToastDispatch() {
  const dispatch = useContext(ToastDispatchContext)
  if (!dispatch) throw new Error('useToastDispatch must be used within ToastProvider')
  return dispatch
}

export function useToast() {
  const dispatch = useContext(ToastDispatchContext)
  const toasts = useContext(ToastListContext)
  if (!dispatch) throw new Error('useToast must be used within ToastProvider')
  return useMemo(
    () => ({
      toasts,
      push: dispatch.push,
      remove: dispatch.remove,
    }),
    [toasts, dispatch],
  )
}
