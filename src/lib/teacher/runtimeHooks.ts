/**
 * Runtime teaching hooks for Peh.
 *
 * For every major runtime event, a teaching hook provides contextual
 * explanation: what happened, why it matters, and what the user can do next.
 */

import type { RuntimeTeachingEvent, RuntimeTeachingHook } from "./types";

export const RUNTIME_TEACHING_HOOKS: readonly RuntimeTeachingHook[] = [
  {
    event: "mode_selected",
    conceptIds: ["local_mode", "cloud_mode"],
    whatHappened: "Peh started in a specific operating mode.",
    whyItMatters: "The mode determines what Peh can do. Local Mode is private and free. Cloud Mode adds powerful capabilities but costs money and sends data over the internet.",
    whatYouCanDoNext: "Chat with Peh in the current mode. Check the mode badge to see which mode is active.",
    docsLink: "docs/teacher-kb/09-local-mode.md",
  },
  {
    event: "local_model_selected",
    conceptIds: ["local_model", "ollama"],
    whatHappened: "A local model was selected for chat.",
    whyItMatters: "This model runs on your machine. Your text stays private and there is no cost. Quality depends on the model's size and capabilities.",
    whatYouCanDoNext: "Start chatting. If the answers are too short or shallow, try a larger model.",
    docsLink: "docs/teacher-kb/03-local-models.md",
  },
  {
    event: "cloud_mode_requested",
    conceptIds: ["cloud_mode", "provider", "api_key"],
    whatHappened: "Cloud Mode was requested.",
    whyItMatters: "Cloud Mode enables more powerful models and tools, but requires a cloud provider, costs money, and sends your text over the internet.",
    whatYouCanDoNext: "Configure a cloud provider with an API key, or stay in Local Mode for now.",
    docsLink: "docs/teacher-kb/10-cloud-mode.md",
  },
  {
    event: "cloud_provider_configured",
    conceptIds: ["provider", "api_key", "cost"],
    whatHappened: "A cloud provider was configured with an API key.",
    whyItMatters: "Peh can now use this provider's models. Calls will cost money based on token usage. Your text will be sent to the provider's servers.",
    whatYouCanDoNext: "Start using Cloud Mode features. Check cost estimates before long conversations.",
    docsLink: "docs/teacher-kb/04-cloud-models.md",
  },
  {
    event: "api_key_needed",
    conceptIds: ["api_key", "provider", "cost"],
    whatHappened: "A cloud feature was requested but no API key is configured.",
    whyItMatters: "Cloud models require an API key — a password that lets Peh talk to a provider's servers. API keys are tied to your account and cost money per use.",
    whatYouCanDoNext: "Get an API key from a cloud provider (like OpenAI or Anthropic), or use Local Mode which does not need one.",
    docsLink: "docs/teacher-kb/04-cloud-models.md",
  },
  {
    event: "cloud_consent_requested",
    conceptIds: ["privacy", "cloud_mode", "cost"],
    whatHappened: "Peh is asking your consent before making a cloud call.",
    whyItMatters: "Your text will be sent to a cloud provider's server. This costs money and means your data leaves your machine. Peh always asks before doing this.",
    whatYouCanDoNext: "Review what will be sent, then approve or deny. Denying keeps your data local.",
    docsLink: "docs/teacher-kb/10-cloud-mode.md",
  },
  {
    event: "tool_call_requested",
    conceptIds: ["tool_call", "approval", "risk_tiers"],
    whatHappened: "Peh wants to use a tool to take a real action.",
    whyItMatters: "A tool call is a real action — not just text generation. Depending on the risk level, Peh may need your approval first.",
    whatYouCanDoNext: "Review the tool action. If it is high-risk, you will be asked to approve or deny it.",
    docsLink: "docs/teacher-kb/06-tool-calls.md",
  },
  {
    event: "tool_call_blocked",
    conceptIds: ["tool_call", "local_mode", "capability_matrix"],
    whatHappened: "A tool call was requested but is not available in the current mode.",
    whyItMatters: "Some tools are only available in Cloud Mode, and some are not implemented yet. Peh tells you honestly what she cannot do.",
    whatYouCanDoNext: "Check the capability matrix to see what is available. Consider enabling Cloud Mode for more capabilities.",
    docsLink: "docs/teacher-kb/09-local-mode.md",
  },
  {
    event: "approval_requested",
    conceptIds: ["approval", "risk_tiers"],
    whatHappened: "Peh is asking your permission before taking a risky action.",
    whyItMatters: "High-risk actions (file write, shell command, etc.) always require your explicit approval. This keeps you in control.",
    whatYouCanDoNext: "Read what Peh wants to do, then approve or deny. Your choice is recorded in the receipt.",
    docsLink: "docs/teacher-kb/07-approvals-and-risk.md",
  },
  {
    event: "approval_denied",
    conceptIds: ["approval"],
    whatHappened: "You denied an approval request. The action was not taken.",
    whyItMatters: "Nothing happened. The action was blocked because you said no. This is recorded in the receipt.",
    whatYouCanDoNext: "Continue chatting. Peh will not retry the denied action unless you ask.",
  },
  {
    event: "approval_granted",
    conceptIds: ["approval", "receipt"],
    whatHappened: "You approved an action. Peh will now execute it.",
    whyItMatters: "The approved action will be executed and a receipt will be created showing exactly what happened.",
    whatYouCanDoNext: "Watch for the result and check the receipt to verify what was done.",
    docsLink: "docs/teacher-kb/07-approvals-and-risk.md",
  },
  {
    event: "receipt_created",
    conceptIds: ["receipt", "tabularium"],
    whatHappened: "A receipt was created for an action Peh took.",
    whyItMatters: "Receipts are proof of what happened. You can review them any time in the Tabularium to verify what Peh did.",
    whatYouCanDoNext: "Open Tabularium to see the receipt. It shows the mode, model, cloud status, and tools used.",
    docsLink: "docs/teacher-kb/08-receipts-and-provenance.md",
  },
  {
    event: "tool_failed",
    conceptIds: ["tool_call", "receipt"],
    whatHappened: "A tool action was attempted but failed.",
    whyItMatters: "The failure is recorded honestly in the receipt. Peh does not pretend a failed action succeeded.",
    whatYouCanDoNext: "Check the error message. You may need to fix a configuration issue or try a different approach.",
    docsLink: "docs/teacher-kb/06-tool-calls.md",
  },
  {
    event: "local_model_failed",
    conceptIds: ["local_model", "ollama"],
    whatHappened: "The local model server could not be reached or returned an error.",
    whyItMatters: "Peh needs a running local model server to work in Local Mode. The most common issue is that Ollama is not running.",
    whatYouCanDoNext: "Make sure Ollama is running (ollama serve) and the model is installed (ollama pull llama3.2).",
    docsLink: "docs/teacher-kb/03-local-models.md",
  },
  {
    event: "cloud_provider_failed",
    conceptIds: ["provider", "cloud_mode"],
    whatHappened: "A cloud provider call failed.",
    whyItMatters: "The cloud provider could not process the request. This might be a temporary issue, an API key problem, or a rate limit.",
    whatYouCanDoNext: "Check your API key and internet connection. Try again, or switch to Local Mode.",
    docsLink: "docs/teacher-kb/04-cloud-models.md",
  },
  {
    event: "capability_not_implemented",
    conceptIds: ["capability_matrix", "local_mode", "cloud_mode"],
    whatHappened: "You asked for something that is not implemented yet.",
    whyItMatters: "Peh tells you honestly when she cannot do something. The capability matrix shows what is available now and what is planned.",
    whatYouCanDoNext: "Check the capability matrix for what is available. Some features are planned for future Cloud Mode.",
    docsLink: "docs/MODE_CAPABILITY_MATRIX.md",
  },
  {
    event: "no_cloud_call_made",
    conceptIds: ["local_mode", "privacy", "provenance"],
    whatHappened: "This response was generated without any cloud call. Everything stayed on your machine.",
    whyItMatters: "Your data is private. Nothing was sent to any company's server. The provenance footer confirms this.",
    whatYouCanDoNext: "Continue chatting locally, or enable Cloud Mode if you need more capabilities.",
    docsLink: "docs/teacher-kb/09-local-mode.md",
  },
  {
    event: "response_model_only",
    conceptIds: ["model_only_answer", "provenance"],
    whatHappened: "This response was generated by the model's text generation only. No tools were used.",
    whyItMatters: "A model-only answer means no files were read, no web was searched, and no actions were taken. The answer is based on the model's training, not on real-time data.",
    whatYouCanDoNext: "Verify important information independently. The model may have made mistakes.",
    docsLink: "docs/teacher-kb/06-tool-calls.md",
  },
  {
    event: "response_tool_backed",
    conceptIds: ["tool_backed_action", "receipt", "provenance"],
    whatHappened: "This response includes results from a real tool action. A receipt was created.",
    whyItMatters: "Unlike a model-only answer, this response is backed by a real action (like reading a file or searching the web). The receipt proves what happened.",
    whatYouCanDoNext: "Check the receipt in Tabularium to verify the tool action.",
    docsLink: "docs/teacher-kb/06-tool-calls.md",
  },
  {
    event: "diagnostic_failed",
    conceptIds: ["safety", "capability_matrix"],
    whatHappened: "A diagnostic check found a problem.",
    whyItMatters: "Diagnostics ensure Peh is working correctly and honestly. A failure means something needs to be fixed before the system is reliable.",
    whatYouCanDoNext: "Check the diagnostic output for details. Common issues: Ollama not running, model not installed.",
    docsLink: "docs/teacher-kb/12-using-peh-safely.md",
  },
  {
    event: "gauntlet_try_verify",
    conceptIds: ["safety", "local_model"],
    whatHappened: "A gauntlet test produced a TRY_VERIFY result — the model's response may need manual review.",
    whyItMatters: "Small local models sometimes produce results that need human verification. This is expected and does not mean the system is broken.",
    whatYouCanDoNext: "Review the flagged response manually. Consider using a larger model for better results.",
  },
] as const;

export function getHookByEvent(event: RuntimeTeachingEvent): RuntimeTeachingHook | undefined {
  return RUNTIME_TEACHING_HOOKS.find((h) => h.event === event);
}

export function getHooksForConcept(conceptId: string): RuntimeTeachingHook[] {
  return RUNTIME_TEACHING_HOOKS.filter((h) => h.conceptIds.includes(conceptId));
}
