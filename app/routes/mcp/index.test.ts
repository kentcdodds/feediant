import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { test, expect } from 'vitest'
import { getGlobalSetup } from '#tests/utils.ts'

async function setupClient({ capabilities = {} } = {}) {
	const { port, token } = await getGlobalSetup()

	const client = new Client(
		{
			name: 'feediant-tester',
			version: '1.0.0',
		},
		{ capabilities },
	)
	const transport = new StreamableHTTPClientTransport(
		new URL(`http://localhost:${port}/mcp?token=${token}`),
	)
	await client.connect(transport)
	return {
		client,
		async [Symbol.asyncDispose]() {
			await client.transport?.close()
		},
	}
}

// test ping
test('server responds to ping', async () => {
	const { client } = await setupClient()
	const result = await client.ping()
	expect(result).toBeDefined()
})
