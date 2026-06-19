# Autonomous Tool Policy

## Overview

Peh's Cloud Mode will eventually support autonomous tool execution. This document defines the safety design for that future capability.

## Risk Tiers

### Low Risk (no approval required)
- Model planning and reasoning
- Summarization and classification
- Capability explanation
- Read-only diagnostics
- Receipt viewing

### Medium Risk (receipt required, approval optional)
- File read (local filesystem)
- Repository inspection
- Document parsing
- Web search
- Memory write

### High Risk (explicit approval required)
- File write / file delete
- Code editing
- Shell command execution
- Package installation
- Git commit / push
- Network actions (sending data externally)
- Destructive operations

## Approval Rules

1. **Cloud Mode does NOT imply approval for high-risk tools.** Enabling Cloud Mode unlocks the capability to use cloud providers and tools, but every high-risk action requires separate, explicit, scoped approval.

2. **Approval is scoped, not blanket.** Approving "write to foo.ts" does not approve "write to bar.ts" or "delete foo.ts".

3. **Destructive operations require explicit scoped approval.** Delete, overwrite, force-push, drop — each requires its own approval.

4. **Receipts are required for every tool action.** Success, failure, or blocked — the receipt records what happened.

5. **Model text cannot self-authorize success.** A model saying "I wrote the file" is not proof of file writing. The tool receipt is the proof.

## Tool Categories

| Category | Risk | Local Mode | Cloud Mode |
|----------|------|------------|------------|
| chat | low | READY | NOT_IMPLEMENTED |
| file_read | medium | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| file_write | high | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| shell | high | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| web_search | medium | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| browser | medium | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| repo_inspect | medium | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| repo_edit | high | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| document_parse | medium | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| image_vision | low | PARTIAL | NOT_IMPLEMENTED |
| memory | medium | NOT_IMPLEMENTED (write), NOT_IMPLEMENTED (read) | NOT_IMPLEMENTED |
| diagnostics | low | READY | PARTIAL |
| receipts | low | READY | READY |
| agent_workflow | high | NOT_IMPLEMENTED | NOT_IMPLEMENTED |

## Implementation Roadmap

Tool execution is Phase 4 of the product release plan. See
[PUBLIC_PEH_RELEASE_PLAN.md](PUBLIC_PEH_RELEASE_PLAN.md) for the
full roadmap including the teaching layer (Phase 2) and Cloud Mode foundation
(Phase 3) that must come first.

### Phase 4a: Read-Only Tools
- File read
- Repository inspection
- Document parsing
- Web search

### Phase 4b: Write Tools (approval-gated)
- File write with approval
- Code editing with approval
- Memory write

### Phase 4c: Shell and High-Risk Tools (approval-gated)
- Shell command proposal (show what would run, get approval)
- Shell execution with strict scoped approval
- Git operations with approval
- Package management with approval

### Phase 5: Autonomous Workflows
- Task planning and multi-step execution
- Approval checkpoints at phase boundaries
- "Teach while doing" mode
- Agent receipts for full workflow audit

## Key Principle

**No tool executes without proof.** Every tool action produces a receipt. The receipt proves what happened. The model's text is not evidence — the receipt is.
