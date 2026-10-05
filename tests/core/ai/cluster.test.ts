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
