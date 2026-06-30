# OpenAI Responses API

Use MindSystem as a context adapter around the model call.

```ts
const context = await mind.prepareTurnContext({
  message,
  recentMessages,
  activeProjectId,
  client: "api",
  maxTokens: 4000
});

const response = await openai.responses.create({
  model: "gpt-5.5",
  instructions: [
    baseInstructions,
    context.contextMarkdown
  ].join("\n\n"),
  input: message,
  tools: highSignalTools
});
```

Do not store raw assistant output by default. If the turn produces a durable user-confirmed fact, store that filtered fact explicitly:

```ts
await mind.remember({
  text: "Decision: keep the beta invite-only until onboarding is stable.",
  projectId: activeProjectId,
  sourceType: "api",
  rawPayload: { conversationId }
});
```

For large MCP servers, pass only high-signal tools by default. Add raw CRUD/admin tools only for explicit maintenance workflows.
