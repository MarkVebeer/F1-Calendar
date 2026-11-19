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

module.exports = { verifySignature, pushedCommit, releasesToPrune, upstreamHeaders, SHA_PATTERN };
