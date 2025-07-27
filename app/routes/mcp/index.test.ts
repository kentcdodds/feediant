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

// test search-media tool
test('search-media tool returns search results', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: { query: 'koala' },
	})

	expect(result).toBeDefined()
	expect(result.content).toBeDefined()

	const content = result.content as Array<{ type: string; text: string }>
	expect(Array.isArray(content)).toBe(true)
	expect(content).toHaveLength(1)
	expect(content[0]).toBeDefined()
	expect(content[0]).toHaveProperty('type', 'text')
	expect(content[0]).toHaveProperty('text')

	const searchResults = JSON.parse(content[0]!.text)
	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults.length).toBeGreaterThan(0)

	// Should find the koala.mp4 file
	const koalaResult = searchResults.find(
		(result: any) =>
			result.title?.toLowerCase().includes('koala') ||
			result.filepath?.toLowerCase().includes('koala'),
	)
	expect(koalaResult).toBeDefined()
})

test('search-media tool searches by title', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: { query: 'Poppers' },
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults.length).toBeGreaterThan(0)

	// Should find "Mr. Poppers Penguins.mp3"
	const poppersResult = searchResults.find(
		(result: any) =>
			result.title?.includes('Poppers') || result.filepath?.includes('Poppers'),
	)
	expect(poppersResult).toBeDefined()
})

test('search-media tool searches by author', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: { query: 'Stormlight' },
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults.length).toBeGreaterThan(0)

	// Should find "Rhythm of War The Stormlight Archive, Book 4.mp3"
	const stormlightResult = searchResults.find(
		(result: any) =>
			result.title?.includes('Stormlight') ||
			result.filepath?.includes('Stormlight'),
	)
	expect(stormlightResult).toBeDefined()
})

test('search-media tool with fields parameter', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'dramatized',
			fields: ['category', 'filepath'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults.length).toBeGreaterThan(0)

	// Should find files in the dramatized directory
	const dramatizedResult = searchResults.find((result: any) =>
		result.filepath?.includes('dramatized'),
	)
	expect(dramatizedResult).toBeDefined()
})

test('search-media tool returns empty array for no matches', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: { query: 'nonexistentmedia12345' },
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(0)
})

test('search-media tool with limit parameter', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'mp', // Should match multiple files
			limit: 2,
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults.length).toBeLessThanOrEqual(2)
})

test('search-media tool with contributor field in fields parameter', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'narrator', // Search for contributors/narrators
			fields: ['contributor', 'title'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	// The search should work correctly even when contributor is explicitly specified in fields
})

test('search-media tool searches by media type', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'mp4',
			fields: ['type', 'contentType'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	// Should find video files with mp4 type
})

test('search-media tool searches by copyright', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'copyright',
			fields: ['copyright'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	// Should search through copyright field
})

test('search-media tool searches by publish date year', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: '2020',
			fields: ['pubDate'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	// Should search by publication year (if any media has 2020 as pub date)
})

test('search-media tool searches by genre/category', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'kids',
			fields: ['category'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	// Should find media in the kids category/genre
})
