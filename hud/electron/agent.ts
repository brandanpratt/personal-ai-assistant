// Runs one user turn through the shared agent session and reports progress as HUD events.
import type { Session } from "../../src/core/session.js";
import { errorMessage } from "../../src/core/util.js";
import type { HudEvent } from "../shared/ipc.js";
import { cleanText } from "../shared/text.js";

export function createHudAgent(deps: {
  /** Lazy, so a missing .env or a failing skill init becomes an error event, not a crash. */
  getSession: () => Promise<Session>;
  emit: (event: HudEvent) => void;
}) {
  const { getSession, emit } = deps;
  let busy = false;

  return {
    async submit(text: string): Promise<void> {
      if (busy) return emit({ type: "error", message: "Still working on the last request." });
      busy = true;
      try {
        emit({ type: "thinking" });
        let session: Session;
        try {
          session = await getSession();
        } catch (err) {
          return emit({ type: "error", message: cleanText(`Couldn't start the assistant: ${errorMessage(err)}`, 400) });
        }
        try {
          const reply = await session.send(text, {
            onThinking: () => emit({ type: "thinking" }),
            onTool: (name) => emit({ type: "tool", name }),
          });
          emit({ type: "reply", text: cleanText(reply) || "(no reply)" });
        } catch (err) {
          emit({ type: "error", message: cleanText(`The model failed (${errorMessage(err)}). Is Ollama running?`, 400) });
        }
      } finally {
        busy = false;
      }
    },
  };
}
