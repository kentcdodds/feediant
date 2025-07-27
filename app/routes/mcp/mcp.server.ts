import { AsyncLocalStorage } from 'node:async_hooks'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { matchSorter } from 'match-sorter'
import { z } from 'zod'
import { getEnv } from '#app/utils/env.server.ts'
import { getAllFileMetadatas } from '#app/utils/media.server.ts'
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

// Add tool for searching media by various fields
server.registerTool(
	'search-media',
	{
		title: 'Search Media',
		description:
			'Search for media files by various fields (title, author, description, category/genre, filepath, media type, publish date, etc.)',
		inputSchema: {
			query: z
				.string()
				.describe('The search query to match against media fields'),
			fields: z
				.array(z.string())
				.optional()
				.describe(
					'Specific fields to search in. If not provided, searches all fields. Available fields: title, author, description, category, filepath, type, contentType, copyright, contributor, pubDate',
				),
			limit: z
				.number()
				.optional()
				.describe('Maximum number of results to return. Defaults to no limit'),
		},
	},
	async ({ query, fields, limit }) => {
		const allMedia = await getAllFileMetadatas()

		// Filter out null metadata entries
		const validMedia = allMedia.filter(Boolean)

		// Define the search keys - these are the fields that will be searched
		const defaultKeys = [
			'title',
			'author',
			'description',
			'category',
			'filepath',
			'type',
			'contentType',
			'copyright',
			{
				key: 'contributor',
				getValue: (item: any) =>
					item.contributor?.map((c: any) => c.name).join(' ') || '',
			},
			{
				key: 'pubDate',
				getValue: (item: any) => {
					if (!item.pubDate) return ''
					const date = new Date(item.pubDate)
					return isNaN(date.getTime()) ? '' : date.getFullYear().toString()
				},
			},
		]

		// Use provided fields or default to all fields
		// If fields are provided, we need to map them to the correct format for match-sorter
		const searchKeys = fields
			? fields.map((field) => {
					if (field === 'contributor') {
						return {
							key: 'contributor',
							getValue: (item: any) =>
								item.contributor?.map((c: any) => c.name).join(' ') || '',
						}
					}
					if (field === 'pubDate') {
						return {
							key: 'pubDate',
							getValue: (item: any) => {
								if (!item.pubDate) return ''
								const date = new Date(item.pubDate)
								return isNaN(date.getTime()) ? '' : date.getFullYear().toString()
							},
						}
					}
					return field
				})
			: defaultKeys

		// Use match-sorter to search and rank results
		const searchResults = matchSorter(validMedia, query, {
			keys: searchKeys,
			threshold: matchSorter.rankings.CONTAINS,
		})

		// Apply limit if specified
		const limitedResults = limit ? searchResults.slice(0, limit) : searchResults

		// Remove picture data to keep response size manageable
		const cleanResults = limitedResults.map((media) => ({
			...media,
			picture: undefined,
		}))

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(cleanResults, null, 2),
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
