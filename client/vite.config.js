import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function git(args) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

// https://github.com/owner/repo for a GitHub remote in any of its URL forms, otherwise empty.
function githubUrl(remote) {
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  return match ? `https://github.com/${match[1]}/${match[2]}` : ''
}

// deploy/supervisor.js passes these in, because a release folder has no git history of its own.
function buildInfo(command) {
  const sha = process.env.F1_BUILD_SHA || git('rev-parse HEAD')
  const number = Number(process.env.F1_BUILD_NUMBER || git('rev-list --count HEAD')) || null
  return {
    sha: sha || null,
    number,
    repo: githubUrl(process.env.F1_BUILD_REPO || git('remote get-url origin')),
    builtAt: new Date().toISOString(),
    dev: command === 'serve'
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo(command))
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
