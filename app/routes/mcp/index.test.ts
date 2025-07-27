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
	expect(searchResults).toHaveLength(1)

	// Should find the koala.mp4 file specifically
	const koalaResult = searchResults[0]
	expect(koalaResult.title).toBe('koala.mp4')
	expect(koalaResult.type).toBe('application/mp4')
	expect(koalaResult.filepath).toContain('family-videos/koala.mp4')
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
	expect(searchResults).toHaveLength(1)

	// Should find "Mr. Popper's Penguins" specifically
	const poppersResult = searchResults[0]
	expect(poppersResult.title).toBe("Mr. Popper's Penguins")
	expect(poppersResult.author).toBe('Richard Atwater, Florence Atwater')
	expect(poppersResult.filepath).toContain('kids/Mr. Poppers Penguins.mp3')
	expect(poppersResult.category).toContain('Children\'s Audiobooks')
})

test('search-media tool searches by author', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: { query: 'Brandon Sanderson' },
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(1)

	// Should find the Brandon Sanderson book specifically
	const sandersonResult = searchResults[0]
	expect(sandersonResult.title).toBe('Rhythm of War: The Stormlight Archive, Book 4')
	expect(sandersonResult.author).toBe('Brandon Sanderson')
	expect(sandersonResult.category).toContain('Science Fiction & Fantasy')
	expect(sandersonResult.contributor.map((c: any) => c.name)).toEqual(['Kate Reading', 'Michael Kramer'])
})

test('search-media tool with fields parameter', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'dramatized',
			fields: ['filepath'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(2)

	// Should find both files in the dramatized directory
	expect(searchResults.every((result: any) => result.filepath.includes('dramatized'))).toBe(true)
	
	const titles = searchResults.map((result: any) => result.title).sort()
	expect(titles).toEqual(['Scripture Scouts: The Book of Mormon', 'The Last Battle (Dramatized)'])
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
			query: 'audio/mpeg', // Should match all audio files (6 total)
			limit: 3,
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(3) // Exactly limited to 3
	
	// All results should be audio/mpeg files
	searchResults.forEach((result: any) => {
		expect(result.type).toBe('audio/mpeg')
	})
})

test('search-media tool with fields parameter works correctly', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'Sanderson', // Search for author in specific field
			fields: ['author'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(1)
	
	// Should find Brandon Sanderson book when searching author field specifically
	const sandersonResult = searchResults[0]
	expect(sandersonResult.title).toBe('Rhythm of War: The Stormlight Archive, Book 4')
	expect(sandersonResult.author).toBe('Brandon Sanderson')
})

test('search-media tool searches by media type', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'application/mp4',
			fields: ['type'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(1)
	
	// Should find the video file with mp4 type
	const mp4Result = searchResults[0]
	expect(mp4Result.title).toBe('koala.mp4')
	expect(mp4Result.type).toBe('application/mp4')
})

test('search-media tool searches by copyright', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'Audible',
			fields: ['copyright'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(1)
	
	// Should find media with Audible in copyright
	const audibleResult = searchResults[0]
	expect(audibleResult.title).toBe('Free: The Secret Life of Walter Mitty')
	expect(audibleResult.copyright).toContain('Audible')
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
	expect(searchResults).toHaveLength(1)
	
	// Should find media published in 2020
	const result2020 = searchResults[0]
	expect(result2020.title).toBe('Rhythm of War: The Stormlight Archive, Book 4')
	expect(result2020.pubDate).toBe('2020-11-17T00:00:00.000Z')
})

test('search-media tool searches by genre/category', async () => {
	const { client } = await setupClient()

	const result = await client.callTool({
		name: 'search-media',
		arguments: {
			query: 'Children\'s Audiobooks',
			fields: ['category'],
		},
	})

	expect(result).toBeDefined()
	const content = result.content as Array<{ type: string; text: string }>
	const searchResults = JSON.parse(content[0]!.text)

	expect(Array.isArray(searchResults)).toBe(true)
	expect(searchResults).toHaveLength(2)
	
	// Should find media in the children's audiobooks category
	const titles = searchResults.map((result: any) => result.title).sort()
	expect(titles).toEqual(["Mr. Popper's Penguins", "The Odious Ogre"])
	
	// Both should have Children's Audiobooks in their categories
	searchResults.forEach((result: any) => {
		expect(result.category).toContain("Children's Audiobooks")
	})
})
