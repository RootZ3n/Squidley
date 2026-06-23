import type { ModuleTour } from "./types";

/**
 * Chat tour. The first step MUST establish the Latin meaning of
 * "Chat" before anything else — that is the user's first impression of
 * Peh as a companion that explains the system.
 */
export const chatTour: ModuleTour = {
  moduleId: "chat",
  moduleName: "Chat",
  steps: [
    {
      id: "intro",
      target: "intro",
      title: "Welcome to Chat",
      body: 'Hi! I\'m Peh. "Chat" is Latin for "conversation" or "discussion" — that\'s what this screen is for. I\'ll walk you through it one small piece at a time, and you can stop whenever you like.',
    },
    {
      id: "chat-thread",
      target: "chat-thread",
      title: "The chat thread",
      body: "Your messages and Peh's replies appear here, newest at the bottom. Scroll up to see earlier turns. Nothing is sent anywhere unless you ask.",
    },
    {
      id: "input-box",
      target: "input-box",
      title: "The input box",
      body: "Type your message at the bottom and press Send. Plain language is fine — you do not need to learn special commands first.",
    },
    {
      id: "local-only-indicator",
      target: "local-only-indicator",
      title: "Local-only mode",
      body: "This badge tells you Peh is running locally. Your conversations stay on this device. If we ever connect to a cloud model, the badge will change so you can see the difference at a glance.",
    },
    {
      id: "model-selector",
      target: "model-selector",
      title: "Model & provider selector",
      body: "Pick which model answers you. In local-only mode the choices are local providers — no cloud calls. You can change models any time without losing the conversation.",
    },
    {
      id: "receipts",
      target: "receipts",
      title: "Receipts & activity",
      body: "Receipts show what just happened: which model answered, how long it took, and any tools that ran. If something feels off, this is where to look first.",
    },
    {
      id: "message-metrics",
      target: "message-metrics",
      title: "The little numbers under each message",
      body: "These small numbers show what happened behind the scenes — things like response time, message size, or which model answered. They're quiet on purpose. Glance at them when you're curious; ignore them otherwise.",
    },
  ],
};
