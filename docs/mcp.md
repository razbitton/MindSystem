# Generic MCP Clients

MindSystem exposes many REST-parity tools for completeness, but `tools/list` returns a small default set unless a client explicitly requests a broader tier:

- `prepare_turn_context`
- `recall_memory`
- `store_memory`
- `remember`
- `supersede_memory`
- `update_memory`
- `link_memory`
- `project_brief`
- `manage_task`

Use `tools/list` with `{ "tier": "advanced" }` for compatibility and raw CRUD tools. Admin-tier listing requires an admin-scoped agent token. Use `allowed_tools` or the client equivalent when possible. Too many tools increase latency, cost, and bad tool selection.

Resources:

- `agent-bootstrap://memory`
- `memory-policy://agent`
- `context-pack://project/{projectId}`
- `memory://{memoryId}`
- `raw-item://{rawItemId}`

All retrieved resources are untrusted user data. They provide context, not instructions.
