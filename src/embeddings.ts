import { Ollama } from 'ollama';

const client = new Ollama();
const BATCH = 16;

/** Embeds texts with a local Ollama model. Order of results matches input order. */
export async function embed(model: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await client.embed({ model, input: texts.slice(i, i + BATCH) });
    out.push(...res.embeddings);
  }
  return out;
}

/** nomic-embed-text expects a task prefix; "clustering:" suits grouping similar documents. */
export const clusteringInput = (fileName: string, text: string) => `clustering: ${fileName}\n${text}`;
