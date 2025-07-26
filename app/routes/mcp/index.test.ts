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

// test get-config-paths tool
test('get-config-paths tool returns configuration paths', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'get-config-paths',
		arguments: {},
	})

	expect(result).toBeDefined()
	expect(result.content).toBeDefined()

	const content = result.content as Array<{ type: string; text: string }>
	expect(Array.isArray(content)).toBe(true)
	expect(content).toHaveLength(1)
	expect(content[0]).toBeDefined()
	expect(content[0]).toHaveProperty('type', 'text')
	expect(content[0]).toHaveProperty('text')

	const configData = JSON.parse(content[0]!.text)
	expect(configData).toHaveProperty('mediaPaths')
	expect(configData).toHaveProperty('dataPath')
	expect(Array.isArray(configData.mediaPaths)).toBe(true)
	expect(typeof configData.dataPath).toBe('string')
})
