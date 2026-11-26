import { useEffect, useRef } from 'react'

// Native <dialog>: focus moves in and stays in, Esc and the backdrop close it, focus returns to the opener.
export default function Sheet({ open, onClose, labelledBy, className = '', children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return undefined
    if (open && !dialog.open) {
      dialog.classList.remove('is-closing')
      dialog.showModal()
      dialog.querySelector('[data-autofocus]')?.focus()
      return undefined
    }
    if (!open && dialog.open) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) {
        dialog.close()
        return undefined
      }
      dialog.classList.add('is-closing')
      const timer = setTimeout(() => {
        dialog.close()
        dialog.classList.remove('is-closing')
      }, 170)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`sheet ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      {children}
    </dialog>
  )
}
