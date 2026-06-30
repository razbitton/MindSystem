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

await mind.storeTurnDelta({
  conversationId,
  userMessage: message,
  assistantMessage: response.output_text,
  projectId: activeProjectId
});
```

For large MCP servers, pass only high-signal tools by default. Add raw CRUD/admin tools only for explicit maintenance workflows.
