// apps/api/src/brain/router.ts

export type TaskDifficulty =
  | "easy"
  | "medium"
  | "hard"
  | "critical";

export type RouteDecision = {
  difficulty: TaskDifficulty;
  modelTier: string;
  reason: string;
};

function detectDifficulty(input: string): TaskDifficulty {
  const text = input.toLowerCase();

  // critical
  if (
    text.includes("security") ||
    text.includes("auth") ||
    text.includes("encryption") ||
    text.includes("token") ||
    text.includes("permission")
  ) {
    return "critical";
  }

  // hard
  if (
    text.includes("refactor") ||
    text.includes("architecture") ||
    text.includes("multi file") ||
    text.includes("scheduler") ||
    text.includes("server.ts") ||
    text.includes("infrastructure")
  ) {
    return "hard";
  }

  // medium
  if (
    text.includes("bug") ||
    text.includes("debug") ||
    text.includes("fix") ||
    text.includes("patch") ||
    text.includes("mobile") ||
    text.includes("ui") ||
    text.includes("layout")
  ) {
    return "medium";
  }

  return "easy";
}

export function routeTask(input: string): RouteDecision {
  const difficulty = detectDifficulty(input);

  switch (difficulty) {
    case "easy":
      return {
        difficulty,
        modelTier: "local",
        reason: "Simple question or task"
      };

    case "medium":
      return {
        difficulty,
        modelTier: "chat_fallback", // GPT-5 mini
        reason: "Bug / UI / reasoning task"
      };

    case "hard":
      return {
        difficulty,
        modelTier: "plan", // qwen3.5+
        reason: "Architecture or complex logic"
      };

    case "critical":
      return {
        difficulty,
        modelTier: "claude-sonnet",
        reason: "Security / high-risk change"
      };
  }
}