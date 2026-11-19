const crypto = require('crypto');

const SHA_PATTERN = /^[0-9a-f]{40}$/;

// GitHub signs the raw request body with HMAC-SHA256 and sends `sha256=<hex>`.
function verifySignature(secret, rawBody, header) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) {
    return false;
  }
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const received = Buffer.from(header);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// Returns the pushed commit when the webhook is a push to the deploy branch, otherwise null.
function pushedCommit(event, payload, branch) {
  if (event !== 'push' || !payload || payload.ref !== `refs/heads/${branch}` || payload.deleted) {
    return null;
  }
  return SHA_PATTERN.test(payload.after || '') ? payload.after : null;
}

// Release folders to delete: everything but the newest `keep` by mtime, and never the live or the new one.
function releasesToPrune(releases, protectedShas, keep = 3) {
  const candidates = releases
    .filter((release) => SHA_PATTERN.test(release.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const kept = new Set(protectedShas.filter(Boolean));
  for (const release of candidates) {
    if (kept.size >= keep) break;
    kept.add(release.name);
  }
  return candidates.filter((release) => !kept.has(release.name)).map((release) => release.name);
}

// Headers for the request to the app. X-Forwarded-For is kept as the reverse proxy sent it,
// so the app (trust proxy 1) still sees the visitor's address and not this proxy's peer.
function upstreamHeaders(headers, clientIp) {
  const result = new Headers(headers);
  if (!result.has('x-forwarded-for') && clientIp) {
    result.set('x-forwarded-for', clientIp);
  }
  if (!result.has('x-forwarded-proto')) {
    result.set('x-forwarded-proto', 'http');
  }
  return result;
}

// { owner, name } for a GitHub remote in https or ssh form, otherwise null.
function parseGithubRepo(remote) {
  const match = String(remote || '').trim().match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return match ? { owner: match[1], name: match[2] } : null;
}

// GitHub rejects commit status descriptions longer than 140 characters.
function statusText(text) {
  const value = String(text || '').trim();
  return value.length > 140 ? `${value.slice(0, 139)}…` : value;
}

const STEP_FAILURES = { install: 'Install failed', build: 'Build failed', test: 'Tests failed', health: 'Health check failed' };

// A short reason for GitHub from the supervisor's error messages, such as "test failed (exit 1)".
function failureSummary(error) {
  const message = String(error?.message || error || '');
  if (message.startsWith('health check failed')) return STEP_FAILURES.health;
  const step = message.match(/^(\w+) failed/)?.[1];
  return STEP_FAILURES[step] || 'Deploy failed';
}

module.exports = {
  verifySignature,
  pushedCommit,
  releasesToPrune,
  upstreamHeaders,
  parseGithubRepo,
  statusText,
  failureSummary,
  SHA_PATTERN
};
