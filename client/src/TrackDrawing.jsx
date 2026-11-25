import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// The app's own circuit drawings, inlined so the stroke follows the theme colour and can draw itself in.
const cache = new Map()

function loadTrack(circuitId) {
  if (!cache.has(circuitId)) {
    cache.set(circuitId, fetch(`/api/tracks/${encodeURIComponent(circuitId)}.svg`)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((svg) => {
        const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 500 500'
        const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1])
        if (paths.length === 0) throw new Error('no path')
        return { viewBox, paths }
      })
      .catch((error) => {
        cache.delete(circuitId)
        throw error
      }))
  }
  return cache.get(circuitId)
}

// Tight viewBox around the path, so every circuit fills its box the same way.
function fitViewBox(paths, fallback) {
  const numbers = paths.join(' ').match(/-?\d+(\.\d+)?/g)?.map(Number) || []
  if (numbers.length < 4) {
    const size = Number(fallback.split(/\s+/)[2]) || 500
    return { viewBox: fallback, size }
  }
  const xs = numbers.filter((_, i) => i % 2 === 0)
  const ys = numbers.filter((_, i) => i % 2 === 1)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const size = Math.max(maxX - minX, maxY - minY)
  const pad = size * 0.06
  return { viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`, size: size + pad * 2 }
}

// strokeRatio is the line width as a share of the drawing's longer side.
export default function TrackDrawing({ circuitId, name, className = '', drawIn = false, strokeRatio = 0.022 }) {
  const [track, setTrack] = useState(null)
  const [failed, setFailed] = useState(!circuitId)
  const svgRef = useRef(null)

  // The draw-in dashes need the path's real length: browsers do not scale CSS dash values by pathLength.
  useLayoutEffect(() => {
    if (!drawIn || !svgRef.current) return
    for (const path of svgRef.current.querySelectorAll('.track-line')) {
      const length = path.getTotalLength()
      path.style.setProperty('--track-length', String(length))
    }
  }, [drawIn, track])

  useEffect(() => {
    if (!circuitId) return undefined
    let active = true
    loadTrack(circuitId)
      .then((data) => active && setTrack(data))
      .catch(() => active && setFailed(true))
    return () => { active = false }
  }, [circuitId])

  if (failed) {
    return (
      <div className={`track track--missing ${className}`}>
        <span>Track layout unavailable</span>
      </div>
    )
  }

  if (!track) {
    return <div className={`track track--loading ${className}`} aria-hidden="true" />
  }

  const { viewBox, size } = fitViewBox(track.paths, track.viewBox)
  return (
    <svg
      ref={svgRef}
      className={`track ${drawIn ? 'track--draw' : ''} ${className}`}
      viewBox={viewBox}
      role="img"
      aria-label={`${name} track layout`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* With drawIn, a faint copy keeps the circuit visible while the bright line traces it. */}
      {(drawIn ? ['track-base', 'track-line'] : ['track-line']).map((layer) => track.paths.map((d, index) => (
        <path
          key={`${layer}-${index}`}
          className={layer}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={size * strokeRatio}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )))}
    </svg>
  )
}
