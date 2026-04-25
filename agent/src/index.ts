import { runGenerateVideo } from "./tasks/generate-video.js";
import { SYSTEM_PROMPT } from "./system-prompt.generated.js";

type AgentCommand =
  | { type: "generate-video"; product: string; formats: string[]; compositionId?: string }
  | { type: "list-products" }
  | { type: "prompt-response"; id: string; response: string };

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    emit({ type: "error", scope: "startup", message: "no command provided", recoverable: false });
    process.exit(1);
  }

  const command = parseCommand(args);
  if (!command) {
    emit({ type: "error", scope: "startup", message: `unknown command: ${args[0]}`, recoverable: false });
    process.exit(1);
  }

  const systemPrompt = SYSTEM_PROMPT;

  try {
    switch (command.type) {
      case "generate-video":
        await runGenerateVideo({
          product: command.product,
          formats: command.formats,
          compositionId: command.compositionId,
          systemPrompt,
        });
        break;
      case "list-products":
        emit({ type: "error", scope: "startup", message: "list-products not yet implemented", recoverable: false });
        process.exit(2);
      case "prompt-response":
        emit({ type: "error", scope: "startup", message: "prompt-response is handled inline, not as a root command", recoverable: false });
        process.exit(2);
    }
  } catch (err) {
    emit({
      type: "error",
      scope: "runtime",
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
    });
    process.exit(1);
  }
}

function parseCommand(args: string[]): AgentCommand | null {
  const [cmd, payload] = args;
  if (cmd === "generate-video" && payload) {
    try {
      const parsed = JSON.parse(payload);
      return {
        type: "generate-video",
        product: String(parsed.product),
        formats: Array.isArray(parsed.formats) ? parsed.formats : ["linkedin"],
        compositionId: parsed.compositionId ? String(parsed.compositionId) : undefined,
      };
    } catch {
      return null;
    }
  }
  if (cmd === "list-products") {
    return { type: "list-products" };
  }
  return null;
}

export function emit(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

main();
