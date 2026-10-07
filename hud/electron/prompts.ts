// Turns the agent's confirm/ask calls into prompts the human answers in the HUD.
// The model can't reach this: answers only arrive through answer(), from the renderer's input box.
import type { HudEvent } from "../shared/ipc.js";
import { cleanText } from "../shared/text.js";

export function createPromptBroker(emit: (event: HudEvent) => void) {
  let nextId = 1;
  const pending = new Map<number, (answer: string | undefined) => void>();

  function request(kind: "confirm" | "ask", question: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      emit({ type: "prompt", id, kind, question: cleanText(question, 600) });
    });
  }

  return {
    /** Same semantics as the CLI: only a typed "yes" approves. */
    confirm: async (question: string): Promise<boolean> =>
      (await request("confirm", question))?.trim().toLowerCase() === "yes",
    ask: (question: string): Promise<string | undefined> => request("ask", question),
    /** Called with the human's input. `undefined` = cancelled. Unknown ids are ignored. */
    answer(id: number, text: string | undefined): void {
      const resolve = pending.get(id);
      if (!resolve) return;
      pending.delete(id);
      resolve(text);
    },
    /** Resolves everything still waiting as cancelled (e.g. the window closed). */
    cancelAll(): void {
      for (const resolve of pending.values()) resolve(undefined);
      pending.clear();
    },
  };
}
export type PromptBroker = ReturnType<typeof createPromptBroker>;
