import { useEffect, useState } from 'react'

// 'system' follows the device; 'light' and 'dark' are the visitor's explicit choice.
// index.html applies a stored choice before the first paint, so there is no flash.
const STORAGE_KEY = 'f1-theme'

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function systemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useTheme() {
  const [preference, setPreference] = useState(readStoredTheme)
  const [system, setSystem] = useState(systemTheme)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystem(query.matches ? 'light' : 'dark')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (preference === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', preference)
    }
    try {
      if (preference === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // storage can be unavailable (private mode); the choice then lasts for this visit
    }
  }, [preference])

  const resolved = preference === 'system' ? system : preference
  return { preference, resolved, setPreference }
}
