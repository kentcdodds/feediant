import { AsyncLocalStorage } from 'node:async_hooks'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getEnv } from '#app/utils/env.server.ts'
import { FetchAPIHTTPServerTransport } from './fetch-stream-transport.server.ts'

export const requestStorage = new AsyncLocalStorage<Request>()

const transports = new Map<string, FetchAPIHTTPServerTransport>()

function createServer() {
	const server = new McpServer(
		{
			name: 'feediant',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	)

	return server
}

const server = createServer()

// Add tool for retrieving configured data and media paths
server.registerTool(
	'get-config-paths',
	{
		title: 'Get Configuration Paths',
		description: 'Retrieve the configured data and media paths',
		inputSchema: {},
	},
	async () => {
		const { MEDIA_PATHS, DATA_PATH } = getEnv()

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(
						{ mediaPaths: MEDIA_PATHS, dataPath: DATA_PATH },
						null,
						2,
					),
				},
			],
		}
	},
)

export async function connect(sessionId?: string | null) {
	const existingTransport = sessionId ? transports.get(sessionId) : undefined
	if (existingTransport) {
		return existingTransport
	}
	const transport = new FetchAPIHTTPServerTransport({
		sessionIdGenerator: () => sessionId ?? crypto.randomUUID(),
		async onsessioninitialized(sessionId) {
			transports.set(sessionId, transport)
		},
	})
	transport.onclose = () => {
		if (transport.sessionId) transports.delete(transport.sessionId)
	}
	await server.connect(transport)

	return transport
}
