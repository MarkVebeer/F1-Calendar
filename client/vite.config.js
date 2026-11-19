import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function git(args) {
  try {
    return execSync(`git -c safe.directory=* ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

// https://github.com/owner/repo for a GitHub remote in any of its URL forms, otherwise empty.
function githubUrl(remote) {
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  return match ? `https://github.com/${match[1]}/${match[2]}` : ''
}

// Commit count from GitHub: with one commit per page, the "last" page number is the count.
async function githubCommitCount(repoUrl, sha) {
  const [, owner, repo] = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)$/) || []
  if (!owner || !sha) return null
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${sha}&per_page=1`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'f1-calendar-build' },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return null
    const last = (response.headers.get('link') || '').match(/[?&]page=(\d+)>;\s*rel="last"/)
    return last ? Number(last[1]) : 1
  } catch {
    return null
  }
}

// The build number is the commit count. deploy/supervisor.js passes it in; otherwise it comes from git,
// and when the clone is shallow (Pelican installs) git would count 1, so GitHub is asked instead.
async function buildInfo(command) {
  const sha = process.env.F1_BUILD_SHA || git('rev-parse HEAD') || null
  const repo = githubUrl(process.env.F1_BUILD_REPO || git('remote get-url origin'))
  let number = Number(process.env.F1_BUILD_NUMBER) || null
  let source = number ? 'supervisor' : null

  if (!number) {
    const shallow = git('rev-parse --is-shallow-repository') === 'true'
    const counted = Number(git('rev-list --count HEAD')) || null
    if (counted && !shallow) {
      number = counted
      source = 'git'
    } else {
      number = await githubCommitCount(repo, sha)
      source = number ? 'github' : null
    }
  }

  console.log(`[build-info] ${number ? `#${number}` : 'no build number'} ${sha ? sha.slice(0, 7) : ''} (${source || 'unknown'})`)
  return { sha, number, repo, builtAt: new Date().toISOString(), dev: command === 'serve' }
}

export default defineConfig(async ({ command }) => ({
  plugins: [react()],
  define: {
    __BUILD_INFO__: JSON.stringify(await buildInfo(command))
  },
  server: {
    host: '0.0.0.0',
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true
      }
    }
  }
}))
