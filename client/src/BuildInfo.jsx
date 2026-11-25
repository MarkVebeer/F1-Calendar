// Set at build time by vite.config.js: build number (commit count), commit and repository.
const BUILD_INFO = typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null

// Which build this page came from, so you can tell after a deploy whether you see the new one.
export default function BuildInfo({ timeZone }) {
  if (!BUILD_INFO || (!BUILD_INFO.sha && !BUILD_INFO.number)) return null

  const shortSha = BUILD_INFO.sha ? BUILD_INFO.sha.slice(0, 7) : null
  const label = BUILD_INFO.number ? `Build #${BUILD_INFO.number}` : 'Build'
  let builtAt = BUILD_INFO.builtAt
  try {
    builtAt = new Date(BUILD_INFO.builtAt).toLocaleString('en-GB', { timeZone, dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    // an unknown timezone falls back to the raw timestamp
  }

  return (
    <p className="build-info" title={`Built ${builtAt}`}>
      {label}
      {shortSha && (
        <>
          {' · '}
          {BUILD_INFO.repo ? (
            <a href={`${BUILD_INFO.repo}/commit/${BUILD_INFO.sha}`} target="_blank" rel="noreferrer">{shortSha}</a>
          ) : (
            <code>{shortSha}</code>
          )}
        </>
      )}
      {BUILD_INFO.dev && ' · dev'}
    </p>
  )
}
