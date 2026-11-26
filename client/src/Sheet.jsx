import { useEffect, useId, useRef } from 'react'

const PHONE_LAYOUT = '(max-width: 640px)'
const START_SLOP = 6 // px of movement before a touch on the header counts as a drag, so taps still reach its buttons
const CLOSE_DISTANCE = 0.25 // share of the sheet's height
const CLOSE_VELOCITY = 0.5 // px per ms, a flick

// Open sheets, the last one on top. While any is open the page is dimmed by its own layer (html.sheet-open,
// see calendar.css) rather than the dialog's ::backdrop, which on iPhone turns the status bar into a solid bar.
const openSheets = []

// Closing a sheet goes back one history entry (its own, or the weekend's #/ address). The browser would then
// jump to the scroll position it stored for that entry, which on iPhone is off by the toolbar's height when the
// toolbar had collapsed, so the page hops after every close. The page never scrolls behind a sheet, so there is
// nothing to restore: leave the scroll where it is. The mode belongs to each history entry, so it is set before
// the sheets' entries exist.
if (typeof history !== 'undefined' && 'scrollRestoration' in history) history.scrollRestoration = 'manual'
const root = () => document.documentElement

function syncPageDim() {
  root().classList.toggle('sheet-open', openSheets.length > 0)
}

// Native <dialog>: focus moves in and stays in, Esc and a tap outside close it, focus returns to the opener.
// On phones the sheet rises from the bottom edge and can be dragged down to close it: by its header, or anywhere
// on its content once that is scrolled to the top.
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
  // "Own content" is any scroll area inside the sheet, nested ones too (the timezone list scrolls on its own).
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return undefined
    const scrollable = (value) => value === 'auto' || value === 'scroll'
    const scrollsInside = (event) => {
      const horizontal = event.type === 'wheel' && Math.abs(event.deltaX) > Math.abs(event.deltaY)
      for (let el = event.target; el && el !== dialog && el.nodeType === 1; el = el.parentElement) {
        const style = getComputedStyle(el)
        if (horizontal ? scrollable(style.overflowX) && el.scrollWidth > el.clientWidth : scrollable(style.overflowY) && el.scrollHeight > el.clientHeight) {
          return true
        }
      }
      return false
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

  // Dim the page, and close on a tap outside: with no ::backdrop such a tap reaches the (inert) page, so it is
  // caught on the document. Only the top sheet answers, and only when the press also began outside it, so
  // selecting text from inside and letting go outside does not close it.
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return undefined
    openSheets.push(dialog)
    syncPageDim()
    const isTop = () => openSheets[openSheets.length - 1] === dialog
    const outside = (event) => !dialog.contains(event.target)
    let pressedOutside = false
    const onPointerDown = (event) => {
      pressedOutside = isTop() && outside(event)
    }
    const onClick = (event) => {
      if (pressedOutside && isTop() && outside(event)) onCloseRef.current()
      pressedOutside = false
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
      const index = openSheets.indexOf(dialog)
      if (index >= 0) openSheets.splice(index, 1)
      syncPageDim()
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

    // ----- one drag, whichever way it started -----
    const begin = (y, t, source) => ({ source, originY: y, dy: 0, active: false, samples: [[t, y]] })

    const follow = (current, y, t) => {
      const raw = y - current.originY
      if (!current.active) {
        if (raw < START_SLOP) return false
        current.active = true
        dialog.classList.add('is-dragging')
        root().classList.add('sheet-dragging')
      }
      // Past the top it resists, like a rubber band; downwards it follows the finger.
      current.dy = raw > 0 ? raw : raw / 4
      current.samples.push([t, y])
      if (current.samples.length > 5) current.samples.shift()
      const height = dialog.offsetHeight || 1
      dialog.style.transform = `translateY(${current.dy}px)`
      root().style.setProperty('--sheet-backdrop', String(Math.max(0, 1 - Math.max(0, current.dy) / height)))
      return true
    }

    const release = (current, cancelled) => {
      if (!current.active) return
      suppressClick = true
      setTimeout(() => {
        suppressClick = false
      }, 0)
      dialog.classList.remove('is-dragging')
      root().classList.remove('sheet-dragging')

      const [[t0, y0]] = current.samples
      const [t1, y1] = current.samples[current.samples.length - 1]
      const velocity = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0
      const height = dialog.offsetHeight || 1
      const close = !cancelled && current.dy > 0 && (current.dy > height * CLOSE_DISTANCE || velocity > CLOSE_VELOCITY)

      dialog.classList.add('is-settling')
      root().classList.add('sheet-settling')
      if (close) {
        dialog.dataset.dragClosed = '1'
        dialog.style.transform = 'translateY(100%)'
        root().style.setProperty('--sheet-backdrop', '0')
        afterTransition(dialog, () => onCloseRef.current())
      } else {
        dialog.style.transform = ''
        root().style.removeProperty('--sheet-backdrop')
        afterTransition(dialog, () => {
          dialog.classList.remove('is-settling')
          root().classList.remove('sheet-settling')
        })
      }
    }

    const onPhone = () => window.matchMedia(PHONE_LAYOUT).matches
    const headOf = (target) => {
      const head = target.closest?.('.sheet-head, [data-sheet-drag]')
      return head && dialog.contains(head) ? head : null
    }

    // ----- the header: pointer events (touch, pen or mouse); it never scrolls -----
    const onPointerDown = (event) => {
      if (!event.isPrimary || event.button > 0 || !onPhone() || !headOf(event.target)) return
      drag = { ...begin(event.clientY, event.timeStamp, 'head'), id: event.pointerId }
    }

    const onPointerMove = (event) => {
      if (drag?.source !== 'head' || event.pointerId !== drag.id) return
      if (!drag.active && event.clientY - drag.originY < -START_SLOP) {
        drag = null // an upward move is not a dismiss
        return
      }
      const wasActive = drag.active
      if (!follow(drag, event.clientY, event.timeStamp)) return
      if (!wasActive) {
        try {
          dialog.setPointerCapture(event.pointerId)
        } catch {
          // The pointer is already gone; the drag still follows the events that arrive.
        }
      }
      event.preventDefault()
    }

    const onPointerEnd = (event) => {
      if (drag?.source !== 'head' || event.pointerId !== drag.id) return
      const current = drag
      drag = null
      release(current, event.type === 'pointercancel')
    }

    // ----- the content: touch events, because it scrolls -----
    // With the content at its top, a pull down moves the whole sheet (as in TikTok's comments); a push up scrolls.
    // The choice is made on the first move: once the browser has started scrolling, the gesture is its own.
    const onTouchStart = (event) => {
      if (event.touches.length !== 1 || !onPhone() || headOf(event.target)) return
      const body = event.target.closest?.('.sheet-body')
      if (!body || !dialog.contains(body)) return
      const touch = event.touches[0]
      drag = { ...begin(touch.clientY, event.timeStamp, 'body'), body, decided: false, lastY: touch.clientY }
    }

    const onTouchMove = (event) => {
      if (drag?.source !== 'body') return
      const y = event.touches[0].clientY
      if (!drag.decided) {
        drag.decided = true
        const pullingDown = y > drag.lastY
        if (!pullingDown || drag.body.scrollTop > 0 || !event.cancelable) {
          drag = null // the content scrolls as usual
          return
        }
        drag.originY = drag.lastY // the sheet moves from where the pull began
      }
      drag.lastY = y
      event.preventDefault()
      follow(drag, y, event.timeStamp)
    }

    const onTouchEnd = (event) => {
      if (drag?.source !== 'body') return
      const current = drag
      drag = null
      release(current, event.type === 'touchcancel')
    }

    // A drag that ends over a button must not also press it.
    const onClickCapture = (event) => {
      if (suppressClick) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const listeners = [
      ['pointerdown', onPointerDown],
      ['pointermove', onPointerMove],
      ['pointerup', onPointerEnd],
      ['pointercancel', onPointerEnd],
      ['touchstart', onTouchStart, { passive: true }],
      ['touchmove', onTouchMove, { passive: false }],
      ['touchend', onTouchEnd],
      ['touchcancel', onTouchEnd],
      ['click', onClickCapture, true]
    ]
    for (const [type, handler, options] of listeners) dialog.addEventListener(type, handler, options)
    return () => {
      for (const [type, handler, options] of listeners) dialog.removeEventListener(type, handler, options)
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
  root().classList.remove('sheet-dragging', 'sheet-settling')
  root().style.removeProperty('--sheet-backdrop')
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
