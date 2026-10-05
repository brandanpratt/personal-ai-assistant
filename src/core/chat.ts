import type { Message } from 'ollama';
import { BASE_PROMPT, ollamaModel, runTurn } from './agent.js';
import type { IO } from './io.js';
import { collectTools, composeSystemPrompt, type Skill, type SkillContext } from './skill.js';
import { errorMessage } from './util.js';

/** Interactive chat across every registered skill. The model only ever sees tools; humans approve changes. */
export async function runChat(opts: {
  skills: Skill[];
  ctxFor: (skill: Skill) => SkillContext;
  chatModel: string;
  io: IO;
}): Promise<void> {
  const { skills, ctxFor, chatModel, io } = opts;
  const tools = collectTools(skills, ctxFor);
  const model = ollamaModel(chatModel);
  const messages: Message[] = [{ role: 'system', content: composeSystemPrompt(BASE_PROMPT, skills) }];
  console.log(`Assistant ready with skills: ${skills.map((s) => s.name).join(', ')}. Try "what's in my folder?" or "clean it up". Type "exit" to leave.`);
  for (;;) {
    const line = (await io.ask('\nyou> '))?.trim();
    if (line === undefined || line === 'exit' || line === 'quit') break;
    if (!line) continue;
    try {
      const reply = await runTurn(model, tools, messages, line, { onTool: (name) => console.log(`  [tool: ${name}]`) });
      console.log(`\nagent> ${reply}`);
    } catch (err) {
      console.log(`\nagent> Sorry, the model failed (${errorMessage(err)}). Is Ollama running?`);
    }
  }
}
