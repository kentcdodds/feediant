# MCP Fundamentals Workshop Summary

A comprehensive guide to the Model Context Protocol (MCP) concepts taught in the
Epic Web MCP Fundamentals workshop, with code examples for LLM learning.

## Overview

The Model Context Protocol (MCP) enables AI applications to interact with
external systems through standardized tools, resources, and prompts. This
workshop covers building MCP servers that can be integrated with AI clients like
ChatGPT, Claude Desktop, and Cursor.

## Core Concepts

### 1. Tools

**When to use**: Exposing functions that perform actions or calculations

Tools are **model-controlled** - LLMs can discover and invoke them
automatically.

```typescript
import { z } from 'zod'

server.registerTool(
	'add_numbers',
	{
		title: 'Add Numbers',
		description: 'Add two numbers together',
		inputSchema: {
			a: z.number().describe('First number'),
			b: z.number().describe('Second number'),
		},
		// Optional: Add behavior annotations
		annotations: {
			destructiveHint: false,
			idempotentHint: true,
		},
	},
	async ({ a, b }) => {
		const result = a + b
		return {
			content: [
				{
					type: 'text',
					text: `The sum of ${a} and ${b} is ${result}.`,
				},
			],
			// Optional: Structured output for better parsing
			structuredContent: { result },
		}
	},
)
```

**Tool Annotations**:

- `destructiveHint`: Whether the tool modifies/deletes data
- `idempotentHint`: Whether running multiple times has the same effect
- `openWorldHint`: Whether the tool interacts with external systems

**JSON-RPC Request/Response**:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "add_numbers",
    "arguments": { "a": 5, "b": 3 }
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "The sum of 5 and 3 is 8."
      }
    ],
    "structuredContent": { "result": 8 }
  }
}
```

### 2. Resources

**When to use**: Exposing structured data that can be read/referenced

Resources are **application-driven** - clients decide how to incorporate
context.

```typescript
server.registerResource(
	'user_profile',
	'myapp://users/{userId}',
	{
		title: 'User Profile',
		description: 'User profile information',
	},
	async (uri) => {
		const userId = uri.pathname.split('/')[2]
		const user = await getUserById(userId)

		return {
			contents: [
				{
					uri: uri.toString(),
					mimeType: 'application/json',
					text: JSON.stringify(user),
				},
			],
		}
	},
)
```

**Resource Templates**:

```typescript
// Dynamic resources with parameters
server.registerResourceTemplate(
	'entry',
	'epicme://entries/{entryId}',
	{
		title: 'Journal Entry',
		description: 'A specific journal entry',
	},
	async (uri) => {
		const entryId = uri.pathname.split('/')[2]
		const entry = await getEntryById(entryId)

		return {
			contents: [
				{
					uri: uri.toString(),
					mimeType: 'application/json',
					text: JSON.stringify(entry),
				},
			],
		}
	},
)
```

**JSON-RPC Request/Response**:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "epicme://entries/123"
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "epicme://entries/123",
        "mimeType": "application/json",
        "text": "{\"id\":123,\"title\":\"My Day\",\"content\":\"...\"}"
      }
    ]
  }
}
```

### 3. Resources in Tools

**When to use**: Returning references to resources from tool responses

**Embedded Resources** (full data):

```typescript
;async ({ entryId }) => {
	const entry = await getEntryById(entryId)
	return {
		content: [
			{
				type: 'resource',
				resource: {
					uri: `epicme://entries/${entryId}`,
					mimeType: 'application/json',
					text: JSON.stringify(entry),
				},
			},
		],
	}
}
```

**Resource Links** (references only):

```typescript
;async () => {
	const entries = await getAllEntries()
	return {
		content: [
			...entries.map((entry) => ({
				type: 'resource_link',
				uri: `epicme://entries/${entry.id}`,
				name: entry.title,
				description: `Journal entry: ${entry.title}`,
				mimeType: 'application/json',
			})),
		],
	}
}
```

### 4. Prompts

**When to use**: Exposing reusable, parameterized instructions for LLMs

Prompts are **user-controlled** - users explicitly select and customize them.

```typescript
import { z } from 'zod'

server.registerPrompt(
	'summarize_entry',
	{
		title: 'Summarize Journal Entry',
		description: 'Create a summary of a journal entry',
		argsSchema: {
			entryId: z.string().describe('ID of the entry to summarize'),
			style: z.enum(['brief', 'detailed']).describe('Summary style'),
		},
	},
	async ({ entryId, style }) => {
		return {
			messages: [
				{
					role: 'user',
					content: {
						type: 'text',
						text: `Please summarize the journal entry with ID "${entryId}" in a ${style} style. Focus on the key events and emotions.`,
					},
				},
			],
		}
	},
)
```

**JSON-RPC Request/Response**:

```json
// Request
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "prompts/invoke",
  "params": {
    "name": "summarize_entry",
    "arguments": {
      "entryId": "123",
      "style": "brief"
    }
  }
}

// Response
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "Please summarize the journal entry with ID \"123\" in a brief style. Focus on the key events and emotions."
        }
      }
    ]
  }
}
```
