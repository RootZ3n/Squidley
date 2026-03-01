# Skill: proc-exec-best-practices
## Purpose
This document outlines best practices for securely and effectively using `proc.exec` functions in JavaScript environments.

## Usage Guidelines
- Always validate input parameters to prevent injection attacks.
- Use environment isolation when executing external commands to limit potential damage.
- Capture output and error streams separately to ensure proper logging and handling.
- Implement a timeout mechanism to avoid command execution lasting indefinitely.

## Examples
```javascript
const { exec } = require('child_process');
exec(`ls -la`, (error, stdout, stderr) => {
    if (error) {
        console.error(`Execution error: ${error}`);
        return;
    }
    console.log(stdout);
});
```

## Metadata
- created: 2026-03-01
- author: Squidley + Jeff