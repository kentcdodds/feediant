import { AsyncLocalStorage } from 'node:async_hooks'
import { invariant } from '@epic-web/invariant'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
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

function requireRequest() {
	const request = requestStorage.getStore()
	invariant(request, 'No request found')
	return request
}
