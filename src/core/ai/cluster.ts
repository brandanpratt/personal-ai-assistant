export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export function centroid(vectors: number[][]): number[] {
  const out = new Array<number>(vectors[0]?.length ?? 0).fill(0);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i]! += v[i]!;
  return out.map((x) => x / vectors.length);
}

/**
 * Average-linkage agglomerative clustering. Repeatedly merges the two most similar clusters
 * until none are at least `threshold` similar. Returns clusters as arrays of input indices,
 * largest first.
 *
 * Fast version: cluster-to-cluster similarity is kept in a matrix and updated incrementally on each
 * merge (the average-linkage Lance-Williams update), and every cluster remembers its nearest
 * neighbour, so a round costs O(n) instead of recomputing every pair. About O(n^2) overall.
 * Ties go to the lower index, as in the straightforward version, which the tests compare against.
 */
export function clusterVectors(vectors: number[][], threshold: number): number[][] {
  const n = vectors.length;
  if (n === 0) return [];

  // unit-length copies, so cosine similarity is a plain dot product (zero vectors stay zero -> similarity 0)
  const unit = vectors.map((v) => {
    const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
    return norm === 0 ? v.map(() => 0) : v.map((x) => x / norm);
  });
  const sim = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dot = 0;
      const a = unit[i]!, b = unit[j]!;
      for (let k = 0; k < a.length; k++) dot += a[k]! * b[k]!;
      sim[i]![j] = sim[j]![i] = dot;
    }
  }

  const members: number[][] = vectors.map((_, i) => [i]);
  const size = new Array<number>(n).fill(1);
  const active = new Array<boolean>(n).fill(true);
  const nn = new Int32Array(n).fill(-1);
  const nnSim = new Float64Array(n).fill(-Infinity);

  const refreshNeighbour = (i: number) => {
    nn[i] = -1;
    nnSim[i] = -Infinity;
    for (let j = 0; j < n; j++) {
      if (j !== i && active[j] && sim[i]![j]! > nnSim[i]!) [nn[i], nnSim[i]] = [j, sim[i]![j]!];
    }
  };
  for (let i = 0; i < n; i++) refreshNeighbour(i);

  for (;;) {
    let a = -1, best = -Infinity;
    for (let i = 0; i < n; i++) if (active[i] && nnSim[i]! > best) [a, best] = [i, nnSim[i]!];
    if (a < 0 || best < threshold) break;
    const b = nn[a]!; // always above a: a lower index with an equal-or-better partner would have been picked first

    const [sa, sb] = [size[a]!, size[b]!];
    for (let k = 0; k < n; k++) {
      if (!active[k] || k === a || k === b) continue;
      sim[a]![k] = sim[k]![a] = (sa * sim[a]![k]! + sb * sim[b]![k]!) / (sa + sb);
    }
    size[a] = sa + sb;
    members[a] = members[a]!.concat(members[b]!);
    active[b] = false;

    refreshNeighbour(a);
    for (let k = 0; k < n; k++) {
      if (!active[k] || k === a) continue;
      if (nn[k] === b || nn[k] === a) refreshNeighbour(k);
      else if (sim[k]![a]! === nnSim[k]! && a < nn[k]!) nn[k] = a; // exact tie: lower index wins
    }
  }

  return members
    .filter((_, i) => active[i])
    .map((c) => c.sort((x, y) => x - y))
    .sort((x, y) => y.length - x.length);
}

/**
 * Clusters at `threshold`, then re-clusters any group larger than `maxSize` at a stricter
 * threshold (raised by `step` each level, up to `maxDepth` levels). Breaks up catch-all
 * groups without fragmenting small, already-tight ones.
 */
export function clusterRecursive(
  vectors: number[][],
  threshold: number,
  opts: { maxSize?: number; step?: number; maxDepth?: number } = {},
): number[][] {
  const { maxSize = 15, step = 0.04, maxDepth = 4 } = opts;
  const split = (indices: number[], t: number, depth: number): number[][] => {
    const groups = clusterVectors(indices.map((i) => vectors[i]!), t).map((g) => g.map((k) => indices[k]!));
    return groups.flatMap((g) =>
      g.length > maxSize && depth < maxDepth && t + step <= 1
        ? split(g, t + step, depth + 1)
        : [g],
    );
  };
  const all = vectors.map((_, i) => i);
  return split(all, threshold, 0).map((c) => c.sort((a, b) => a - b)).sort((a, b) => b.length - a.length);
}
