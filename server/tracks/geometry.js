const crypto = require('crypto');
const { Resvg } = require('@resvg/resvg-js');

const VIEW_SIZE = 500;
const PADDING = 30;
const MIN_POINTS = 30;
const MAX_CLOSURE_GAP_KM = 0.1;
const MIN_LENGTH_KM = 2.5;
const MAX_LENGTH_KM = 9;
const MAX_CENTER_DISTANCE_KM = 2;
const MAX_CYCLE_SEARCH_STEPS = 200000;
const MAX_OSM_LAP_LENGTH_SPREAD = 1.02;
const PNG_WIDTH = 420;

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function lineLengthKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return total;
}

function distanceToLineKm(coords, lat, lon) {
  let best = Number.POSITIVE_INFINITY;
  for (const [pointLon, pointLat] of coords) {
    best = Math.min(best, haversineKm(lat, lon, pointLat, pointLon));
  }
  return best;
}

function validateLine(coords, center) {
  if (!Array.isArray(coords) || coords.length < MIN_POINTS) {
    return { ok: false, reason: `too few points (${coords?.length ?? 0})` };
  }
  if (!coords.every((point) => Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]))) {
    return { ok: false, reason: 'non-numeric coordinates' };
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  const gap = haversineKm(first[1], first[0], last[1], last[0]);
  if (gap > MAX_CLOSURE_GAP_KM) {
    return { ok: false, reason: `not closed (gap ${(gap * 1000).toFixed(0)} m)` };
  }

  const length = lineLengthKm(coords);
  if (length < MIN_LENGTH_KM || length > MAX_LENGTH_KM) {
    return { ok: false, reason: `length out of range (${length.toFixed(2)} km)` };
  }

  const distance = distanceToLineKm(coords, center.lat, center.lon);
  if (distance > MAX_CENTER_DISTANCE_KM) {
    return { ok: false, reason: `too far from circuit (${distance.toFixed(2)} km)` };
  }

  return { ok: true, lengthKm: length };
}

function geometryHash(coords) {
  const rounded = coords.map(([lon, lat]) => [Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
  return crypto.createHash('sha256').update(JSON.stringify(rounded)).digest('hex').slice(0, 16);
}

function projectToView(coords) {
  const meanLat = coords.reduce((sum, point) => sum + point[1], 0) / coords.length;
  const lonScale = Math.cos((meanLat * Math.PI) / 180);
  const flat = coords.map(([lon, lat]) => [lon * lonScale, -lat]);

  const xs = flat.map((point) => point[0]);
  const ys = flat.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = (VIEW_SIZE - PADDING * 2) / Math.max(width, height);
  const offsetX = (VIEW_SIZE - width * scale) / 2;
  const offsetY = (VIEW_SIZE - height * scale) / 2;

  return flat.map(([x, y]) => [(x - minX) * scale + offsetX, (y - minY) * scale + offsetY]);
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) {
    return points;
  }

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop();
    let maxDistance = 0;
    let splitIndex = -1;
    for (let i = startIndex + 1; i < endIndex; i += 1) {
      const distance = perpendicularDistance(points[i], points[startIndex], points[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = i;
      }
    }
    if (splitIndex !== -1 && maxDistance > tolerance) {
      keep[splitIndex] = true;
      stack.push([startIndex, splitIndex], [splitIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

// A closed ring starts and ends on the same point, which Douglas-Peucker cannot
// split on, so the ring is cut at its far side first.
function simplifyRing(points, tolerance) {
  const open = points.slice(0, -1);
  let farIndex = 0;
  let farDistance = -1;
  open.forEach((point, index) => {
    const distance = Math.hypot(point[0] - open[0][0], point[1] - open[0][1]);
    if (distance > farDistance) {
      farDistance = distance;
      farIndex = index;
    }
  });

  const firstHalf = simplify(open.slice(0, farIndex + 1), tolerance);
  const secondHalf = simplify([...open.slice(farIndex), open[0]], tolerance);
  return [...firstHalf, ...secondHalf.slice(1, -1)];
}

function buildSvg(coords) {
  const ring = simplifyRing(projectToView(coords), 0.4);
  const path = ring
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}"><path d="${path}Z" fill="none" stroke="#ffffff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/></svg>\n`;
}

function renderPng(svg) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: PNG_WIDTH } }).render().asPng();
}

function isPitOrKartWay(tags = {}) {
  const text = [tags.name, tags.description, tags.service, tags.raceway].filter(Boolean).join(' ');
  return /pit|paddock|kart|service/i.test(text);
}

function nodeKey(point) {
  return `${point.lon.toFixed(7)},${point.lat.toFixed(7)}`;
}

function buildGraph(ways) {
  const adjacency = new Map();
  const link = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  };

  for (const way of ways) {
    if (way.type !== 'way' || !Array.isArray(way.geometry) || isPitOrKartWay(way.tags)) {
      continue;
    }
    for (let i = 1; i < way.geometry.length; i += 1) {
      const a = nodeKey(way.geometry[i - 1]);
      const b = nodeKey(way.geometry[i]);
      if (a !== b) {
        link(a, b);
        link(b, a);
      }
    }
  }

  // Dead ends can never be part of a lap.
  let removed = true;
  while (removed) {
    removed = false;
    for (const [node, neighbors] of adjacency) {
      if (neighbors.size < 2) {
        neighbors.forEach((neighbor) => adjacency.get(neighbor)?.delete(node));
        adjacency.delete(node);
        removed = true;
      }
    }
  }

  return adjacency;
}

function buildChains(adjacency) {
  const isJunction = (node) => adjacency.get(node).size !== 2;
  const seen = new Set();
  const chains = [];

  const walk = (start, first) => {
    const nodes = [start, first];
    seen.add(`${start}|${first}`);
    let previous = start;
    let current = first;
    while (!isJunction(current) && current !== start) {
      const next = [...adjacency.get(current)].find((node) => node !== previous);
      seen.add(`${current}|${next}`);
      nodes.push(next);
      previous = current;
      current = next;
    }
    seen.add(`${current}|${previous}`);
    return nodes;
  };

  for (const node of adjacency.keys()) {
    if (!isJunction(node)) continue;
    for (const neighbor of adjacency.get(node)) {
      if (!seen.has(`${node}|${neighbor}`)) {
        chains.push(walk(node, neighbor));
      }
    }
  }

  // Rings with no junction at all, such as a single closed way.
  for (const node of adjacency.keys()) {
    if (isJunction(node)) continue;
    const [neighbor] = adjacency.get(node);
    if (!seen.has(`${node}|${neighbor}`) && !seen.has(`${neighbor}|${node}`)) {
      chains.push(walk(node, neighbor));
    }
  }

  return chains.map((nodes) => ({
    nodes,
    start: nodes[0],
    end: nodes[nodes.length - 1],
    coords: nodes.map((key) => key.split(',').map(Number))
  }));
}

function findCycles(chains) {
  const cycles = chains.filter((chain) => chain.start === chain.end).map((chain) => chain.coords);
  const outgoing = new Map();
  chains
    .filter((chain) => chain.start !== chain.end)
    .forEach((chain, index) => {
      const add = (from, to, coords) => {
        if (!outgoing.has(from)) outgoing.set(from, []);
        outgoing.get(from).push({ to, coords, index });
      };
      add(chain.start, chain.end, chain.coords);
      add(chain.end, chain.start, [...chain.coords].reverse());
    });

  const order = [...outgoing.keys()].sort();
  const rank = new Map(order.map((node, index) => [node, index]));
  let steps = 0;

  const search = (start, current, visited, usedChains, path) => {
    for (const edge of outgoing.get(current) || []) {
      steps += 1;
      if (steps > MAX_CYCLE_SEARCH_STEPS || usedChains.has(edge.index)) {
        continue;
      }
      if (edge.to === start && usedChains.size > 0) {
        cycles.push([...path, ...edge.coords.slice(1)]);
        continue;
      }
      if (rank.get(edge.to) > rank.get(start) && !visited.has(edge.to)) {
        visited.add(edge.to);
        usedChains.add(edge.index);
        search(start, edge.to, visited, usedChains, [...path, ...edge.coords.slice(1)]);
        usedChains.delete(edge.index);
        visited.delete(edge.to);
      }
    }
  };

  for (const start of order) {
    const startPoint = start.split(',').map(Number);
    search(start, start, new Set([start]), new Set(), [startPoint]);
  }

  return cycles;
}

// Returns the lap only when the raceway ways describe one unambiguous layout.
// Several differing valid laps mean pit lanes or alternative layouts that cannot
// be told apart, and a wrong drawing is worse than a placeholder.
function extractOsmLap(ways, center) {
  const laps = [];
  for (const coords of findCycles(buildChains(buildGraph(ways)))) {
    const result = validateLine(coords, center);
    if (result.ok) {
      laps.push({ coords, lengthKm: result.lengthKm });
    }
  }
  if (laps.length === 0) {
    return null;
  }

  laps.sort((a, b) => b.lengthKm - a.lengthKm);
  const isAmbiguous = laps[0].lengthKm / laps[laps.length - 1].lengthKm > MAX_OSM_LAP_LENGTH_SPREAD;
  return isAmbiguous ? null : laps[0].coords;
}

module.exports = {
  buildSvg,
  distanceToLineKm,
  extractOsmLap,
  geometryHash,
  lineLengthKm,
  renderPng,
  validateLine
};
