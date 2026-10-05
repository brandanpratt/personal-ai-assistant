import { centroid, clusterRecursive, cosineSimilarity } from '../../core/ai/cluster.js';
import { CLUSTER_THRESHOLD, MAX_CLUSTER_SIZE, type Doc } from './clusterText.js';

export interface Folder {
  name: string;
  docs: Doc[];
}

export interface Taxonomy {
  folders: Folder[];
  /** Files we're not confident about; never forced into a folder. */
  review: Doc[];
}

export type NameFn = (sample: Doc[], existingFolders: string[]) => Promise<string | undefined>;

export interface TaxonomyOptions {
  /** A file whose similarity to its folder's centroid is below this goes to review. */
  minFit?: number;
  /** A lone file joins the nearest folder only if at least this similar. */
  attachThreshold?: number;
  sampleSize?: number;
  /** Reusing an existing folder name only merges clusters at least this similar; otherwise a separate folder is made. */
  mergeMinSim?: number;
}

const key = (name: string) => name.trim().toLowerCase();

/**
 * Turns documents + their embeddings into named topic folders:
 * cluster -> name each cluster (reusing earlier names, so same-topic clusters merge) ->
 * attach singletons to a close folder -> push weak fits to review.
 */
export async function buildTaxonomy(
  docs: Doc[],
  vectors: number[][],
  nameFn: NameFn,
  opts: TaxonomyOptions = {},
): Promise<Taxonomy> {
  const { minFit = 0.65, attachThreshold = 0.75, sampleSize = 5, mergeMinSim = 0.8 } = opts;
  const clusters = clusterRecursive(vectors, CLUSTER_THRESHOLD, { maxSize: MAX_CLUSTER_SIZE });
  const groups = new Map<string, { name: string; members: number[] }>();
  const review: number[] = [];
  const singletons: number[] = [];

  for (const members of clusters) {
    if (members.length === 1) {
      singletons.push(members[0]!);
      continue;
    }
    // sample the files closest to the cluster's centre: the most representative ones
    const c = centroid(members.map((i) => vectors[i]!));
    const sample = [...members]
      .sort((a, b) => cosineSimilarity(vectors[b]!, c) - cosineSimilarity(vectors[a]!, c))
      .slice(0, sampleSize)
      .map((i) => docs[i]!);
    const existing = [...groups.values()].map((g) => g.name);
    const name = await nameFn(sample, existing);
    if (!name) {
      review.push(...members);
      continue;
    }
    // the model tends to reuse a name too eagerly; only merge if the clusters really are alike
    let k = key(name);
    let n = name;
    for (let i = 2; groups.has(k) && cosineSimilarity(c, centroid(groups.get(k)!.members.map((m) => vectors[m]!))) < mergeMinSim; i++) {
      n = `${name} ${i}`;
      k = key(n);
    }
    const g = groups.get(k) ?? { name: n, members: [] };
    g.members.push(...members);
    groups.set(k, g);
  }

  const centroidOf = (g: { members: number[] }) => centroid(g.members.map((i) => vectors[i]!));

  // lone files: join the nearest folder if close enough
  const centroids = new Map([...groups].map(([k, g]) => [k, centroidOf(g)]));
  for (const i of singletons) {
    let best = { k: '', sim: -1 };
    for (const [k, c] of centroids) {
      const sim = cosineSimilarity(vectors[i]!, c);
      if (sim > best.sim) best = { k, sim };
    }
    if (best.sim >= attachThreshold) groups.get(best.k)!.members.push(i);
    else review.push(i);
  }

  // confidence gate: members far from their folder's centre go to review
  const folders: Folder[] = [];
  for (const g of groups.values()) {
    const c = centroidOf(g);
    const kept: number[] = [];
    for (const i of g.members) (cosineSimilarity(vectors[i]!, c) >= minFit ? kept : review).push(i);
    if (kept.length > 0) folders.push({ name: g.name, docs: kept.sort((a, b) => a - b).map((i) => docs[i]!) });
  }

  return {
    folders: folders.sort((a, b) => b.docs.length - a.docs.length),
    review: review.sort((a, b) => a - b).map((i) => docs[i]!),
  };
}
