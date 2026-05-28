/**
 * Onboarding stages for Peh's teaching flow.
 *
 * Defines the guided progression from zero AI experience to confident
 * agent user. Each stage teaches a concept and has completion criteria.
 */

import type { OnboardingStage } from "./types";

export const ONBOARDING_STAGES: readonly OnboardingStage[] = [
  {
    id: "welcome",
    title: "Welcome to Peh",
    objective: "Understand that Peh is a teacher that helps you learn how AI agents work.",
    requiredConcepts: [],
    userAction: "Read the welcome screen and click Continue.",
    pehExplanation: "Hi, I'm Peh. I'm going to teach you how AI agents work — starting right here on your own machine, where everything stays private and free. I'll explain every step as we go.",
    completionCriteria: "User has read the welcome message.",
    nextStage: "what-is-agent",
  },
  {
    id: "what-is-agent",
    title: "What is an AI agent?",
    objective: "Understand the difference between a chatbot and an agent.",
    requiredConcepts: ["ai", "agent"],
    userAction: "Read the explanation. Answer: what can an agent do that a chatbot cannot?",
    pehExplanation: "A chatbot just generates text. An agent can plan, use tools, and take real actions — like reading files, writing code, or searching the web. I'm designed to be an agent, but I start you in Local Mode where I only generate text. As you learn more, I'll unlock more capabilities.",
    completionCriteria: "User can distinguish chatbot from agent.",
    nextStage: "start-local",
  },
  {
    id: "start-local",
    title: "Start in Local Mode",
    objective: "Understand what a local model is and why Local Mode is private.",
    requiredConcepts: ["local_model", "local_mode", "privacy", "ollama"],
    userAction: "Verify Ollama is installed and a model is available.",
    pehExplanation: "Right now I'm running in Local Mode. That means I'm using a model installed on your computer — nothing leaves your machine. I need Ollama running with a model installed. Let me check if that's ready.",
    completionCriteria: "Ollama is running and at least one model is available.",
    nextStage: "first-chat",
  },
  {
    id: "first-chat",
    title: "Your First Local Chat",
    objective: "Send a message and understand that the response is model-only.",
    requiredConcepts: ["prompt", "response", "model_only_answer"],
    userAction: "Send a message to Peh in Colloquium.",
    pehExplanation: "You just sent me a prompt and I responded. My answer came from the local model running on your machine. I did not read any files, search the web, or contact any server. Look at the footer below my answer — it says 'local model only, no cloud, no tool.' That's my provenance — proof of where the answer came from.",
    completionCriteria: "User has sent at least one message and seen the provenance footer.",
    nextStage: "provenance",
  },
  {
    id: "provenance",
    title: "Reading the Provenance Footer",
    objective: "Understand what the provenance footer tells you about every answer.",
    requiredConcepts: ["provenance", "receipt"],
    userAction: "Read the provenance footer on a chat response. Open Tabularium.",
    pehExplanation: "Every answer I give has a provenance footer. It tells you: which mode I'm in (local or cloud), which model answered, whether I called a cloud server, and whether I used any tools. You can also check the Tabularium for a full receipt of what happened.",
    completionCriteria: "User has read a provenance footer and opened Tabularium.",
    nextStage: "tool-calls",
  },
  {
    id: "tool-calls",
    title: "What Are Tool Calls?",
    objective: "Understand the difference between generating text and using tools.",
    requiredConcepts: ["tool_call", "tool_backed_action", "model_only_answer", "honesty"],
    userAction: "Read the explanation. Ask Peh to write a file and see the honesty annotation.",
    pehExplanation: "Right now, all my answers are model-only — I just generate text. When I eventually get tools (in Cloud Mode), I'll be able to read files, write code, search the web, and more. But here's the key: if the model says 'I wrote the file' but no tool was used, I'll catch that and add a correction. Model text is not proof of action — only a receipt is proof.",
    completionCriteria: "User understands model-only vs tool-backed and has seen an honesty annotation.",
    nextStage: "approvals",
  },
  {
    id: "approvals",
    title: "Approvals: Staying in Control",
    objective: "Understand why risky actions require explicit approval.",
    requiredConcepts: ["approval", "risk_tiers"],
    userAction: "Read the risk tier explanation.",
    pehExplanation: "Not all actions are equally risky. Reading a file is medium risk. Writing a file or running a command is high risk. For high-risk actions, I will always stop and ask your permission first. Even in Cloud Mode, I never skip approval gates. You are always in control.",
    completionCriteria: "User can explain why file writing requires approval.",
    nextStage: "receipts",
  },
  {
    id: "receipts",
    title: "Receipts: Proof of What Happened",
    objective: "Understand how receipts prove what Peh actually did.",
    requiredConcepts: ["receipt", "tabularium", "provenance"],
    userAction: "Open Tabularium and read a receipt.",
    pehExplanation: "Every action I take gets a receipt. The receipt shows: what happened, which model was used, whether cloud was called, whether tools were used, and when. Receipts are stored in your browser. They are my proof — if I say I did something, the receipt confirms it. If there is no receipt, it did not happen.",
    completionCriteria: "User has opened Tabularium and read at least one receipt.",
    nextStage: "cloud-intro",
  },
  {
    id: "cloud-intro",
    title: "Introduction to Cloud Mode",
    objective: "Understand what Cloud Mode adds and what it costs.",
    requiredConcepts: ["cloud_mode", "cloud_model", "provider", "api_key", "cost", "privacy"],
    userAction: "Read the Cloud Mode explanation.",
    pehExplanation: "Cloud Mode is where I become a fully capable agent. I can use powerful models from providers like OpenAI or Anthropic, execute tools, and run autonomous workflows. But it costs money (you pay per token), your text leaves your machine (it goes to the provider's server), and you need an API key. Cloud Mode is not active yet — it is being built. When it is ready, I will guide you through setting it up safely.",
    completionCriteria: "User can explain the trade-offs of Cloud Mode.",
    nextStage: "first-cloud",
  },
  {
    id: "first-cloud",
    title: "Your First Cloud Call",
    objective: "Understand the consent flow and see a cloud receipt.",
    requiredConcepts: ["cloud_mode", "privacy", "receipt"],
    userAction: "Enable Cloud Mode, configure a provider, and send a message.",
    pehExplanation: "Before I make a cloud call, I will show you what will be sent and ask your consent. After the call, a receipt is created showing the provider, model, and that cloud was used. You can see exactly what happened.",
    completionCriteria: "User has made a cloud call and seen the cloud receipt. (Blocked until Cloud Mode is implemented.)",
    nextStage: "first-tool",
  },
  {
    id: "first-tool",
    title: "Your First Tool-Backed Action",
    objective: "Use a read-only tool and see its receipt.",
    requiredConcepts: ["tool_call", "tool_backed_action", "receipt"],
    userAction: "Ask Peh to read a file (read-only tool).",
    pehExplanation: "I just used a tool to read a file from your project. This is different from just talking about it — I actually opened the file and read its contents. The receipt shows what file was read and when. No files were changed.",
    completionCriteria: "User has seen a tool-backed action with a receipt. (Blocked until tool execution is implemented.)",
    nextStage: "first-workflow",
  },
  {
    id: "first-workflow",
    title: "Your First Autonomous Workflow",
    objective: "See a complete plan-approve-execute-receipt workflow.",
    requiredConcepts: ["autonomous_workflow", "agent", "approval", "receipt"],
    userAction: "Ask Peh to complete a simple multi-step task.",
    pehExplanation: "For this task, I will make a plan, show it to you, and then execute each step. At key points I will ask for your approval before doing anything risky. Every step produces a receipt. At the end, you can review the full audit trail.",
    completionCriteria: "User has completed an autonomous workflow with approval checkpoints. (Blocked until Phase 5 is implemented.)",
  },
] as const;

export function getStageById(id: string): OnboardingStage | undefined {
  return ONBOARDING_STAGES.find((s) => s.id === id);
}

export function getStagesInOrder(): OnboardingStage[] {
  const stages: OnboardingStage[] = [];
  let current = ONBOARDING_STAGES.find((s) => s.id === "welcome");
  while (current) {
    stages.push(current);
    current = current.nextStage
      ? ONBOARDING_STAGES.find((s) => s.id === current!.nextStage)
      : undefined;
  }
  return stages;
}
