import { describe, expect, it } from 'vitest';
import { centroid, clusterVectors, cosineSimilarity } from '../../../src/core/ai/cluster.js';

describe('cosineSimilarity', () => {
  it('is 1 for identical direction, 0 for orthogonal, safe for zero vectors', () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('clusterVectors', () => {
  const vecs = [[1, 0.05], [1, 0], [0.98, 0.1], [0, 1], [0.05, 1], [-1, -1]];

  it('groups nearby vectors and leaves outliers as singletons, largest first', () => {
    const clusters = clusterVectors(vecs, 0.9);
    expect(clusters).toEqual([[0, 1, 2], [3, 4], [5]]);
  });

  it('merges everything at a very low threshold and nothing at 1.01', () => {
    expect(clusterVectors(vecs, -1)).toHaveLength(1);
    expect(clusterVectors(vecs, 1.01)).toHaveLength(vecs.length);
  });

  it('handles empty and single inputs', () => {
    expect(clusterVectors([], 0.5)).toEqual([]);
    expect(clusterVectors([[1, 2]], 0.5)).toEqual([[0]]);
  });
});

describe('centroid', () => {
  it('averages vectors', () => expect(centroid([[1, 3], [3, 5]])).toEqual([2, 4]));
});

import { clusterRecursive } from '../../../src/core/ai/cluster.js';

describe('clusterRecursive', () => {
  it('splits an oversized cluster at a stricter threshold but keeps small ones intact', () => {
    // one loose blob of 6 made of two tight sub-groups, plus a separate tight pair
    const a = [1, 0.0], b = [0.9, 0.3];
    const vecs = [a, a, a, b, b, b, [0, 1], [0, 1]];
    expect(clusterVectors(vecs, 0.9).map((c) => c.length)).toEqual([6, 2]);
    const split = clusterRecursive(vecs, 0.9, { maxSize: 4, step: 0.08 });
    expect(split.map((c) => c.length).sort()).toEqual([2, 3, 3]);
  });

  it('terminates when a big cluster cannot be split', () => {
    const same = Array.from({ length: 20 }, () => [1, 1]);
    expect(clusterRecursive(same, 0.8, { maxSize: 5 })).toEqual([Array.from({ length: 20 }, (_, i) => i)]);
  });
});

/** The original, obviously-correct O(n^3) algorithm. The fast one must always agree with it. */
function naiveClusterVectors(vectors: number[][], threshold: number): number[][] {
  const sim = vectors.map((a) => vectors.map((b) => cosineSimilarity(a, b)));
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

describe('clusterVectors matches the straightforward algorithm', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  function randomSet(): number[][] {
    const n = 1 + Math.floor(rnd() * 40);
    const dim = 2 + Math.floor(rnd() * 8);
    const centres = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => Array.from({ length: dim }, () => rnd() - 0.5));
    const noise = rnd() * 0.5;
    const set = Array.from({ length: n }, () => centres[Math.floor(rnd() * centres.length)]!.map((x) => x + (rnd() - 0.5) * noise));
    // nasty cases: exact duplicates and all-zero vectors
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.15) set[i] = [...set[Math.floor(rnd() * n)]!];
      if (rnd() < 0.05) set[i] = new Array<number>(dim).fill(0);
    }
    return set;
  }

  it('gives identical groupings on 400 random inputs across thresholds', () => {
    for (let t = 0; t < 400; t++) {
      const set = randomSet();
      for (const threshold of [-1, 0, 0.3, 0.7, 0.9, 0.99, 1.01]) {
        expect(clusterVectors(set, threshold), `case ${t}, threshold ${threshold}`).toEqual(naiveClusterVectors(set, threshold));
      }
    }
  });

  it('is much faster on a larger input than the straightforward version could manage', () => {
    const big = Array.from({ length: 600 }, (_, i) => [Math.cos(i % 12), Math.sin(i % 12), rnd() * 0.05, rnd() * 0.05]);
    const t0 = performance.now();
    const clusters = clusterVectors(big, 0.9);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(clusters.reduce((n, c) => n + c.length, 0)).toBe(600);
  });
});
