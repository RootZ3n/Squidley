/**
 * Teacher-intent question detection.
 *
 * Detects whether a user message is a beginner/system question that
 * should be answered by the Teacher Layer instead of the local model.
 *
 * Teacher-intent questions are about Peh herself, AI concepts,
 * modes, tools, receipts, etc. — not general conversation or code tasks.
 */

const TEACHER_INTENT_PATTERNS: readonly RegExp[] = [
  // About Peh
  /\bwhat (?:are you|is (?:peh|squidley))\b/i,
  /\bwho (?:are you|is (?:peh|squidley))\b/i,
  /\bwhat can you do\b/i,
  /\bwhat can(?:'t| not|t) you do\b/i,

  // About modes
  /\bwhat (?:is )?local mode\b/i,
  /\bwhat (?:is )?cloud mode\b/i,
  /\bwhat mode (?:are you|am i|is)\b/i,
  /\bwhich mode\b/i,

  // About tools and actions
  /\bwhat (?:is|are) (?:a )?tool(?:s| call)?\b/i,
  /\bcan you (?:write|read|edit|delete|create) (?:a )?file/i,
  /\bcan you (?:run|execute) (?:a )?(?:command|shell)/i,
  /\bcan you (?:search|browse) the web/i,
  /\bwhy can(?:'t| not|t) you (?:write|read|edit|search)\b/i,

  // About concepts
  /\bwhat (?:is|are) (?:a )?token/i,
  /\bwhat (?:is|are) (?:a )?(?:receipt|provenance)\b/i,
  /\bwhat (?:is|are) (?:a )?(?:approval|approval gate)\b/i,
  /\bwhat (?:is|are) (?:a )?(?:api key|provider)\b/i,
  /\bwhat (?:is|are) (?:a )?(?:hallucination|model)\b/i,
  /\bwhat (?:is|are) (?:a )?(?:prompt|response)\b/i,
  /\bwhat (?:is|are) (?:a )?(?:context window)\b/i,
  /\bwhat (?:is|are) (?:a )?(?:agent)\b/i,
  /\bwhat (?:is )?(?:ollama|llama[.-]?(?:cpp|server))\b/i,
  /\bwhat does (?:model[- ]only|tool[- ]backed|provenance|receipt) mean\b/i,

  // About privacy and safety
  /\b(?:did|does) (?:anything|data|my (?:text|data)) (?:leave|left) (?:my )?(machine|computer|device)\b/i,
  /\bwhat (?:data )?leaves? (?:my )?(machine|computer|device)\b/i,
  /\bis (?:my )?data (?:private|safe|secure)\b/i,
  /\bwhat does .?no cloud call.? mean\b/i,

  // About cost
  /\bdoes (?:this|it) cost (?:money|anything)\b/i,
  /\bhow much does (?:it|this) cost\b/i,
  /\bwhat costs money\b/i,

  // Meta / how to
  /\bhow (?:do i|can i) (?:read|check|see) (?:your |my )?receipts?\b/i,
  /\bhow (?:do i|can i) (?:know|tell|verify) what you (?:actually )?did\b/i,
  /\bhow (?:do i|can i) stop you\b/i,
  /\bhow (?:do i|can i) (?:enable|use|start|switch to) cloud\b/i,
  /\bwhat (?:is )?the (?:difference|diff) between (?:you|peh|squidley)\b/i,

  // Beginner confusion / getting started
  /\bi don(?:'t|t) know what (?:an? )?(?:agent|token|tool|receipt|model|prompt|provider|api key) is\b/i,
  /\bhow (?:do i|can i) (?:start|begin|get started)\b/i,
  /\bwhy can(?:'t|t) you (?:browse|access|use) the web\b/i,
  /\bwhat does (?:no cloud|no tool|local.only|model.only|not.implemented) mean\b/i,
];

/**
 * Detect whether a user message is a teacher-intent question.
 *
 * Returns true if the message matches at least one teacher-intent pattern.
 * This is intentionally conservative — better to route to the model
 * for ambiguous messages than to intercept normal conversation.
 */
export function isTeacherIntent(message: string): boolean {
  const trimmed = message.trim();
  // Very short messages that match patterns are likely teacher questions.
  // Long messages with these patterns embedded may be general conversation.
  // Threshold: if the message is under 200 chars and matches, it's teacher intent.
  if (trimmed.length > 200) return false;
  return TEACHER_INTENT_PATTERNS.some((p) => p.test(trimmed));
}
