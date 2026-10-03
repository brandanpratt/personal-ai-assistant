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
 * Average-linkage agglomerative clustering. Repeatedly merges the two most similar
 * clusters until none are at least `threshold` similar. Returns clusters as arrays of
 * input indices, largest first. O(n^3), which is fine for the hundreds of files we handle.
 */
export function clusterVectors(vectors: number[][], threshold: number): number[][] {
  const sim: number[][] = vectors.map((a) => vectors.map((b) => cosineSimilarity(a, b)));
  let clusters: number[][] = vectors.map((_, i) => [i]);

  const linkage = (a: number[], b: number[]) => {
    let total = 0;
    for (const i of a) for (const j of b) total += sim[i]![j]!;
    return total / (a.length * b.length);
  };

  while (clusters.length > 1) {
    let best = -Infinity, bi = -1, bj = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const s = linkage(clusters[i]!, clusters[j]!);
        if (s > best) [best, bi, bj] = [s, i, j];
      }
    }
    if (best < threshold) break;
    clusters[bi] = [...clusters[bi]!, ...clusters[bj]!];
    clusters = clusters.filter((_, k) => k !== bj);
  }
  return clusters.map((c) => c.sort((a, b) => a - b)).sort((a, b) => b.length - a.length);
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
