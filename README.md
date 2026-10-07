# DrawUp Arch Coach — Personal Coach Routing Patch

Purpose:
Fix Arch Coach so personal/opinion/design-reasoning questions do NOT automatically launch source verification.

Core rule:
- "What would YOU do?" => COACH MODE => answer personally and immediately.
- "What should I do?" => ADVISOR MODE => use player/project context and verify sources when needed.
- "What does code/standard/authority require?" => VERIFY MODE => authoritative source verification required.

Important:
The UI must not show "Checking sources..." or the 2-minute verification state for a Coach Mode question unless the user explicitly asks Arch Coach to verify its answer.

This patch specification is implementation-framework neutral and is intended to be merged into the existing DrawUp Arch Coach request/router logic.
