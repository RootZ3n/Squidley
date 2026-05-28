# Beginner Onboarding Design

## Overview

The onboarding flow is how Squidley teaches a brand-new user what she is, what
agents are, and how to use her safely. This is not optional — it is a core
product requirement for public release.

## Design Principle

Squidley teaches you how agents work. She does not assume you know anything.

## Required Onboarding Sections

### 1. Welcome

**What the user sees:**
"Hi, I'm Squidley. I'm going to teach you how AI agents work — starting right
here on your own machine, where everything stays private and free."

**What this section does:**
- Introduces Squidley
- Sets expectations: this is a learning experience
- Makes clear that local mode is the starting point, not the whole product

### 2. Local Mode First

**Steps:**
1. Check if Ollama is installed (guide to install if not)
2. Choose or pull a local model
3. Run first local chat
4. Explain what just happened ("you talked to a model running on your machine")
5. Explain limitations ("I can only generate text right now — I cannot read
   files, write code, or search the web in Local Mode")

**Teaching goals:**
- User understands what a local model is
- User understands that everything stayed on their machine
- User understands that Squidley is limited in Local Mode (and that is OK)

### 3. Trust Basics

**Steps:**
1. Show the provenance footer ("answered by local model only / no cloud / no
   tool")
2. Explain what each part means
3. Show a receipt in Tabularium
4. Explain the difference between "model text" and "real tool action"
5. Show what happens when the model hallucinates a tool action (honesty
   annotation)

**Teaching goals:**
- User can read the provenance footer
- User understands receipts
- User understands that Squidley tells the truth about what she did
- User understands that model text alone is not proof of action

### 4. Cloud Graduation

**Steps:**
1. Explain what cloud adds ("more powerful models, tools, autonomy")
2. Explain what an API key is
3. Explain what things cost (cloud calls cost money, local is free)
4. Explain privacy ("your text is sent to the provider's server")
5. Guide through provider selection
6. Explain the consent model ("Squidley will ask before making any cloud call")

**Teaching goals:**
- User understands cloud vs local
- User understands cost and privacy tradeoffs
- User can safely configure a cloud provider
- User knows they will be asked before cloud is used

### 5. Tool Graduation

**Steps:**
1. Introduce read-only tools first ("I can look at your files if you let me")
2. Explain what happens when Squidley reads a file (receipt shows what was read)
3. Introduce write tools ("I can edit files, but only with your approval")
4. Explain approval gates ("before I write anything, I will show you what I
   plan to write and ask for permission")
5. Explain shell commands ("this is the highest-risk action — I will show you
   the exact command and explain what it does before you approve")
6. Show that receipts prove every tool action

**Teaching goals:**
- User understands tool risk levels
- User understands approval gates
- User understands receipts for tool actions
- User feels safe because they are always in control

### 6. First Autonomous Workflow

**Steps:**
1. Present a safe example task (e.g., "create a simple README file")
2. Show Squidley's plan before execution
3. Show approval checkpoint ("I will read these files, then write this file.
   Approve?")
4. Execute with live progress updates
5. Show the complete receipt trail
6. Explain what happened at each step

**Teaching goals:**
- User has seen a full autonomous workflow from plan to completion
- User understands that they approved every risky step
- User can audit what happened via receipts
- User is ready to use Squidley for real work

## Implementation Status

**NOT IMPLEMENTED.** This document defines the onboarding design. The onboarding
UI, teaching flows, and guided experiences do not exist yet. They are required
for Phase 2 (Teaching Layer) of the release plan.

## Testing

When implemented, onboarding must be tested:
- Complete flow works for a new user (no prior state)
- Each section is reachable and completable
- Explanations match the current capability matrix
- No jargon without explanation
- No overclaims
- Works on desktop and mobile
- Accessible (screen reader friendly)
