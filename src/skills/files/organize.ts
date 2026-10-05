import { loadDocs } from './clusterText.js';
import { embed } from '../../core/ai/embeddings.js';
import { applyAlias, matchKnown, type Memory } from './memory.js';
import { createNamer, ollamaChat } from './namer.js';
import type { FileInfo } from './scanner.js';
import { buildTaxonomy, type Folder, type Taxonomy } from './taxonomy.js';

/** A file joins a remembered folder only if at least this similar to its centroid. */
export const KNOWN_THRESHOLD = 0.8;

export interface Proposal {
  taxonomy: Taxonomy;
  /** Embedding of every readable file, by path; kept so approved folders can be learned. */
  vectors: Map<string, number[]>;
  /** Lowercased names of folders that came from memory. */
  remembered: Set<string>;
}

/**
 * Reads and embeds the readable files, files those matching remembered folders straight away,
 * then clusters and names the rest. Slow part of a run (about a minute per few hundred files;
 * much faster when memory already covers most files, since the model is only asked about the rest).
 */
export async function proposeTaxonomy(
  files: FileInfo[],
  memory: Memory,
  log: (msg: string) => void = () => {},
  models: { chat: string; embed: string },
): Promise<Proposal> {
  log('Reading files...');
  const { docs } = await loadDocs(files);
  const vectors = new Map<string, number[]>();
  if (docs.length === 0) return { taxonomy: { folders: [], review: [] }, vectors, remembered: new Set() };

  log(`Embedding ${docs.length} documents...`);
  const embedded = await embed(models.embed, docs.map((d) => d.embedInput));
  docs.forEach((d, i) => vectors.set(d.file.path, embedded[i]!));

  const known = new Map<string, Folder>();
  const restDocs: typeof docs = [];
  for (const d of docs) {
    const name = matchKnown(memory, vectors.get(d.file.path)!, KNOWN_THRESHOLD);
    if (name) known.set(name.toLowerCase(), { name, docs: [...(known.get(name.toLowerCase())?.docs ?? []), d] });
    else restDocs.push(d);
  }
  log(`${docs.length - restDocs.length} matched remembered folders; ${restDocs.length} to cluster and name...`);

  const base = createNamer(ollamaChat(models.chat));
  const namer = async (sample: Parameters<typeof base>[0], existing: string[]) => {
    const name = await base(sample, existing);
    return name ? applyAlias(memory, name) : undefined; // honour renames you made before
  };
  const fresh = await buildTaxonomy(restDocs, restDocs.map((d) => vectors.get(d.file.path)!), namer);

  // a newly named folder with the same name as a remembered one is the same folder
  const folders = new Map(known);
  for (const f of fresh.folders) {
    const k = f.name.toLowerCase();
    folders.set(k, { name: folders.get(k)?.name ?? f.name, docs: [...(folders.get(k)?.docs ?? []), ...f.docs] });
  }
  return {
    taxonomy: { folders: [...folders.values()].sort((a, b) => b.docs.length - a.docs.length), review: fresh.review },
    vectors,
    remembered: new Set(known.keys()),
  };
}

export interface KnownSummary {
  /** Files per remembered folder they would be filed into. */
  byFolder: Record<string, number>;
  matched: number;
  readable: number;
}

/**
 * Cheap, model-free look at how many files already fit remembered folders (embeddings only,
 * no naming). Returns undefined if there is no memory yet or Ollama is unavailable.
 */
export async function summarizeKnown(files: FileInfo[], memory: Memory, embedModel: string): Promise<KnownSummary | undefined> {
  if (memory.folders.length === 0) return undefined;
  try {
    const { docs } = await loadDocs(files);
    if (docs.length === 0) return { byFolder: {}, matched: 0, readable: 0 };
    const vectors = await embed(embedModel, docs.map((d) => d.embedInput));
    const byFolder: Record<string, number> = {};
    let matched = 0;
    vectors.forEach((v) => {
      const name = matchKnown(memory, v, KNOWN_THRESHOLD);
      if (name) {
        byFolder[name] = (byFolder[name] ?? 0) + 1;
        matched++;
      }
    });
    return { byFolder, matched, readable: docs.length };
  } catch {
    return undefined;
  }
}
