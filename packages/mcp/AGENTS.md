# MCP server

stdio and Hono HTTP MCP server that reuses Core tools (`packages/core/AGENTS.md`, Tools).

- MCP-only filesystem and server tools live in `packages/mcp/src/tool/registration.ts`; listener and session lifecycle under `packages/mcp/src/server/`, stdio under `packages/mcp/src/stdio/`, transport discovery under `packages/mcp/src/transport/`.
- Registration uses Standard Schema with Valibot JSON Schema conversion from the Core tool input contract; per-tool exposure comes from `isToolExposed()`.
- File access must resolve symlinks inside the effective MCP root. CLI defaults are the current directory on macOS and Linux and the home directory on Windows.
- Code Mode (`OPENPENCIL_MCP_MODE=code`) lives in `packages/mcp/src/code/`: registered handlers become `openpencil.<name>` methods behind `search` and `execute`, so every call keeps its tool's policy and validation; scripts run only through a `CodeExecutor` sandbox (`packages/mcp/tests/code/tools.test.ts`).
- Keep browser lifecycle out of this package and out of Core.
- Transport tests live under `tests/engine/mcp/{server,stdio,transport}` with shared fixtures under `tests/helpers/mcp`; isolate tests from user runtime discovery. Playwright starts the development MCP companion through the Vite automation plugin; see `tests/AGENTS.md`.
