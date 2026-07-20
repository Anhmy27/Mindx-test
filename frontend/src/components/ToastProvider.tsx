import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ToastVariant = 'success' | 'error' | 'info' | 'loading'

type ToastItem = {
  id: string
  message: string
  variant: ToastVariant
}

type ConfirmRequest = {
  id: string
  message: string
  resolve: (value: boolean) => void
}

type ToastContextValue = {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  loading: (message: string) => string
  dismiss: (id: string) => void
  confirm: (message: string) => Promise<boolean>
}

const ToastContext = createContext<ToastContextValue | null>(null)

const variantClass: Record<ToastVariant, string> = {
  success:
    'border-emerald-500/60 bg-emerald-950/95 text-emerald-50 shadow-emerald-900/30',
  error: 'border-rose-500/70 bg-rose-950/95 text-rose-50 shadow-rose-900/30',
  info: 'border-slate-500/70 bg-slate-900/95 text-slate-50 shadow-slate-900/40',
  loading:
    'border-violet-500/50 bg-slate-900/95 text-slate-50 shadow-violet-950/30',
}

const variantTitle: Record<ToastVariant, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Info',
  loading: 'Working',
}

const Spinner = () => (
  <span
    className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-300"
    aria-hidden
  />
)

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(
    null,
  )

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (message: string, variant: ToastVariant, sticky = false) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
      setToasts((current) => [...current, { id, message, variant }])

      if (!sticky) {
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }, 3200)
      }

      return id
    },
    [],
  )

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmRequest({
        id: `${Date.now()}-confirm`,
        message,
        resolve,
      })
    })
  }, [])

  const settleConfirm = useCallback((value: boolean) => {
    setConfirmRequest((current) => {
      current?.resolve(value)
      return null
    })
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message) => {
        pushToast(message, 'success')
      },
      error: (message) => {
        pushToast(message, 'error')
      },
      info: (message) => {
        pushToast(message, 'info')
      },
      loading: (message) => pushToast(message, 'loading', true),
      dismiss,
      confirm,
    }),
    [confirm, dismiss, pushToast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(460px,calc(100vw-1.5rem))] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-5 py-4 text-base shadow-2xl backdrop-blur ${variantClass[toast.variant]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {toast.variant === 'loading' ? <Spinner /> : null}
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-85">
                    {variantTitle[toast.variant]}
                  </p>
                  <p className="leading-relaxed">{toast.message}</p>
                </div>
              </div>
              {toast.variant !== 'loading' ? (
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="rounded border border-current/30 px-2 py-1 text-xs opacity-75 transition hover:opacity-100"
                >
                  Close
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {confirmRequest ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Confirm action
            </p>
            <p className="mt-2 text-base text-slate-100">
              {confirmRequest.message}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settleConfirm(false)}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => settleConfirm(true)}
                className="rounded-md border border-rose-600/70 bg-rose-700/50 px-4 py-2 text-sm text-rose-50 transition hover:bg-rose-700/70"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
