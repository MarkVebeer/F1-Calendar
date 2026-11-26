import { useEffect, useId, useRef } from 'react'

const PHONE_LAYOUT = '(max-width: 640px)'
const START_SLOP = 6 // px of movement before a touch on the header counts as a drag, so taps still reach its buttons
const CLOSE_DISTANCE = 0.25 // share of the sheet's height
const CLOSE_VELOCITY = 0.5 // px per ms, a flick

// Native <dialog>: focus moves in and stays in, Esc and the backdrop close it, focus returns to the opener.
// On phones the sheet rises from the bottom edge and its header can be dragged down to close it.
// The browser's back (button, edge swipe, mouse button) closes the sheet rather than leaving the page:
// an open sheet adds a history entry of its own. A sheet whose opening already changes the address
// (the weekend sheet) passes ownHistory={false} and handles back itself.
export default function Sheet({ open, onClose, labelledBy, className = '', ownHistory = true, children }) {
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const historyKey = useId()

  // While a sheet is open the page behind it stays put. Not with overflow: hidden on the page: on iPhone that
  // resets the page's scrolled state, and Safari drops the blur behind the status bar until the sheet is gone.
  // Instead, a swipe or wheel that is not scrolling the sheet's own content goes nowhere.
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return undefined
    const scrollsInside = (event) => {
      const area = event.target.closest?.('.sheet-body')
      return Boolean(area && dialog.contains(area) && area.scrollHeight > area.clientHeight)
    }
    const stop = (event) => {
      if (!scrollsInside(event)) event.preventDefault()
    }
    dialog.addEventListener('touchmove', stop, { passive: false })
    dialog.addEventListener('wheel', stop, { passive: false })
    return () => {
      dialog.removeEventListener('touchmove', stop)
      dialog.removeEventListener('wheel', stop)
    }
  }, [open])

  useEffect(() => {
    if (!open || !ownHistory) return undefined
    const { history } = window
    history.pushState({ ...(history.state || {}), f1Sheet: historyKey }, '', window.location.href)
    let leftByBack = false
    const onPopState = () => {
      // Back moved off this sheet's entry: close it. (A sheet opened on top of this one leaves the entry in place.)
      if (history.state?.f1Sheet !== historyKey) {
        leftByBack = true
        onCloseRef.current()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      // Closed some other way (✕, drag, Esc, backdrop): take the entry back off so the next back leaves normally.
      if (!leftByBack && history.state?.f1Sheet === historyKey) history.back()
    }
  }, [open, ownHistory, historyKey])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return undefined
    if (open && !dialog.open) {
      dialog.classList.remove('is-closing')
      resetDrag(dialog)
      dialog.showModal()
      dialog.querySelector('[data-autofocus]')?.focus()
      return undefined
    }
    if (!open && dialog.open) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      // Dragged off screen already: close where it is, without playing the closing animation again.
      if (reduce || dialog.dataset.dragClosed) {
        dialog.close()
        resetDrag(dialog)
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

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return undefined
    let drag = null
    let suppressClick = false

    const onPointerDown = (event) => {
      if (!event.isPrimary || event.button > 0) return
      if (!window.matchMedia(PHONE_LAYOUT).matches) return
      const head = event.target.closest('.sheet-head, [data-sheet-drag]')
      if (!head || !dialog.contains(head)) return
      drag = { id: event.pointerId, startY: event.clientY, dy: 0, active: false, samples: [[event.timeStamp, event.clientY]] }
    }

    const onPointerMove = (event) => {
      if (!drag || event.pointerId !== drag.id) return
      const raw = event.clientY - drag.startY
      if (!drag.active) {
        if (raw < START_SLOP) {
          if (raw < -START_SLOP) drag = null // an upward move is not a dismiss
          return
        }
        drag.active = true
        try {
          dialog.setPointerCapture(event.pointerId)
        } catch {
          // The pointer is already gone; the drag still follows the events that arrive.
        }
        dialog.classList.add('is-dragging')
      }
      event.preventDefault()
      // Past the top it resists, like a rubber band; downwards it follows the finger.
      drag.dy = raw > 0 ? raw : raw / 4
      drag.samples.push([event.timeStamp, event.clientY])
      if (drag.samples.length > 5) drag.samples.shift()
      const height = dialog.offsetHeight || 1
      dialog.style.transform = `translateY(${drag.dy}px)`
      dialog.style.setProperty('--sheet-backdrop', String(Math.max(0, 1 - Math.max(0, drag.dy) / height)))
    }

    const finish = (event) => {
      if (!drag || event.pointerId !== drag.id) return
      const current = drag
      drag = null
      if (!current.active) return
      suppressClick = true
      setTimeout(() => {
        suppressClick = false
      }, 0)
      dialog.classList.remove('is-dragging')

      const [[t0, y0]] = current.samples
      const [t1, y1] = current.samples[current.samples.length - 1]
      const velocity = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0
      const height = dialog.offsetHeight || 1
      const close = event.type !== 'pointercancel' && current.dy > 0 && (current.dy > height * CLOSE_DISTANCE || velocity > CLOSE_VELOCITY)

      if (close) {
        dialog.dataset.dragClosed = '1'
        dialog.classList.add('is-settling')
        dialog.style.transform = 'translateY(100%)'
        dialog.style.setProperty('--sheet-backdrop', '0')
        afterTransition(dialog, () => onCloseRef.current())
      } else {
        dialog.classList.add('is-settling')
        dialog.style.transform = ''
        dialog.style.removeProperty('--sheet-backdrop')
        afterTransition(dialog, () => dialog.classList.remove('is-settling'))
      }
    }

    // A drag that ends over a button must not also press it.
    const onClickCapture = (event) => {
      if (suppressClick) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    dialog.addEventListener('pointerdown', onPointerDown)
    dialog.addEventListener('pointermove', onPointerMove)
    dialog.addEventListener('pointerup', finish)
    dialog.addEventListener('pointercancel', finish)
    dialog.addEventListener('click', onClickCapture, true)
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown)
      dialog.removeEventListener('pointermove', onPointerMove)
      dialog.removeEventListener('pointerup', finish)
      dialog.removeEventListener('pointercancel', finish)
      dialog.removeEventListener('click', onClickCapture, true)
    }
  }, [])

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

function resetDrag(dialog) {
  delete dialog.dataset.dragClosed
  dialog.classList.remove('is-dragging', 'is-settling')
  dialog.style.transform = ''
  dialog.style.removeProperty('--sheet-backdrop')
}

// Runs once the settle transition ends; the timer covers reduced motion, where no transition runs.
function afterTransition(dialog, done) {
  let finished = false
  const run = () => {
    if (finished) return
    finished = true
    dialog.removeEventListener('transitionend', onEnd)
    done()
  }
  const onEnd = (event) => {
    if (event.target === dialog && event.propertyName === 'transform') run()
  }
  dialog.addEventListener('transitionend', onEnd)
  setTimeout(run, 320)
}
