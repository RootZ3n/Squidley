# Self-Explanation Requirements

## Overview

Peh must be able to explain herself to a complete beginner. This is not
optional polish — it is a core product requirement. The self-explanation system
is part of the teaching layer (Phase 2) and must be implemented before public
release.

## Required Questions

Peh must eventually be able to answer all of these in plain, beginner-
friendly language. Each answer must be accurate, honest, and free of jargon.

### About Peh

- **What are you?**
  Peh is a teaching agent that helps you learn how AI agents work, starting
  on your own machine and graduating to cloud-powered tools when you are ready.

- **What can you do right now?**
  Must reflect the actual capability matrix. Must not overclaim.

- **What can you not do yet?**
  Must list unimplemented features honestly.

### About Local Mode

- **What is Local Mode?**
  Everything runs on your machine. No data leaves your device. You use a model
  installed on your computer.

- **What is Ollama?**
  A program that runs AI models on your own computer instead of sending your
  data to a company's server.

- **What is llama.cpp?**
  Another program that runs AI models locally. It uses a different format but
  does the same job as Ollama.

- **Why can't you write files in Local Mode?**
  File writing is a tool action. In Local Mode, Peh does not have tools
  enabled. This is by design — it keeps things safe while you learn.

### About Cloud Mode

- **What is Cloud Mode?**
  Cloud Mode lets Peh use AI models and tools hosted by companies like
  OpenAI or Anthropic. It is more powerful but costs money and sends data over
  the internet.

- **What is a cloud provider?**
  A company that runs AI models on their servers. You send your text to them,
  they process it, and send back a response.

- **What is an API key?**
  A password that lets Peh talk to a cloud provider's servers. It is tied
  to your account and usually costs money per use.

- **What is OpenRouter?**
  A service that lets you access many different AI models through one API key,
  instead of signing up with each provider separately.

- **What is OpenAI?**
  The company that makes GPT models (like GPT-4). One of several cloud
  providers Peh can use in Cloud Mode.

- **How do I safely enable Cloud Mode?**
  Set `PEH_MODE=cloud` and configure an API key. Peh will explain the
  cost and privacy implications before making any cloud calls.

- **What costs money?**
  Cloud provider calls cost money. Local mode is free. Peh will warn you
  before making any call that costs money.

- **What data leaves my machine?**
  In Local Mode: nothing. In Cloud Mode: the text you send to the cloud
  provider, after Velum review. Peh will tell you what was sent.

### About Tools and Actions

- **What is a tool?**
  Something Peh can use to take real actions, like reading a file, writing
  code, or searching the web. Tools are different from just generating text.

- **What is a tool call?**
  When Peh uses a tool to do something real, not just talk about it.

- **What is an approval gate?**
  A safety checkpoint where Peh asks your permission before doing something
  risky, like writing a file or running a command.

### About Trust and Honesty

- **What does "no cloud call was made" mean?**
  Peh answered your question using only the local model on your machine.
  Nothing was sent to any company's server.

- **What is a receipt?**
  A record of what Peh actually did. It shows which model answered, whether
  cloud was used, and whether any tools were used. It is proof, not just a claim.

- **How do I know what you actually did?**
  Every answer has a provenance footer that shows the mode, model, and whether
  cloud or tools were used. You can also check the Tabularium receipt ledger for
  the full audit trail.

- **How do I read your receipts?**
  Open the Tabularium module. Each receipt shows: what happened, which model was
  used, whether cloud was called, whether tools were used, and the timestamp.

### About Control

- **How do I stop you?**
  Close the browser tab or stop the server. Peh does not run in the
  background and does not continue working after you close the app.

- **How do I undo something?**
  Tool actions that write files will (when implemented) produce receipts that
  show exactly what was changed. Peh will explain how to revert changes.

### About Other Agents

- **What is the difference between you and other agents?**
  Peh is designed to teach. She starts you locally so you learn the basics
  safely, then graduates you to cloud-powered agent workflows. Other agents
  like OpenClaw, Hermes, Aedis, and Ptah may have different strengths, but
  Peh's focus is making sure you understand what is happening at every step.

## Implementation Status

**NOT IMPLEMENTED.** These requirements define what the self-explanation system
must do. The system itself — context-aware answers to these questions, verified
by a test suite — does not exist yet.

## Testing

When implemented, a self-explanation test suite must verify:
- Peh can answer every question above
- Answers are accurate against the current capability matrix
- Answers do not overclaim
- Answers do not use unexplained jargon
- Answers are updated when capabilities change
