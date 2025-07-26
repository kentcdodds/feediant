Here's an example of tool definitions from another MCP server:

```ts
function createServer() {
	const server = new McpServer(
		{
			name: 'kentcdodds.com',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	)

	server.registerTool(
		'whoami',
		{
			description: 'Get the user ID of the current user',
			inputSchema: {},
		},
		async (_, extra) => {
			const user = await requireUser(extra.authInfo)
			return { content: [{ type: 'text', text: JSON.stringify(user) }] }
		},
	)

	server.registerTool(
		'update_user_info',
		{
			description: 'Update the user info for the current user',
			inputSchema: {
				firstName: z.string().optional().describe('The first name of the user'),
			},
		},
		async ({ firstName }) => {
			const user = await requireUser()
			await prisma.user.update({
				where: { id: user.id },
				data: { firstName },
			})
			return { content: [{ type: 'text', text: 'User info updated' }] }
		},
	)

	server.registerTool(
		'get_post_reads',
		{
			description: 'Get the post reads for the current user',
			inputSchema: {},
		},
		async (_, extra) => {
			const request = requireRequest()
			const user = await requireUser(extra.authInfo)
			const postReads = await prisma.postRead.findMany({
				where: { userId: user.id },
				select: {
					postSlug: true,
					createdAt: true,
				},
				orderBy: {
					createdAt: 'desc',
				},
			})
			const domainUrl = getDomainUrl(request)
			const groupedBySlug = groupBy(postReads, 'postSlug')
			const posts = Object.entries(groupedBySlug).map(([postSlug, reads]) => ({
				url: `${domainUrl}/blog/${postSlug}`,
				readCount: reads.length,
				reads: reads.map(({ createdAt }) => createdAt.toISOString()),
			}))

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(posts),
					},
				],
			}
		},
	)

	server.registerTool(
		'get_recommended_posts',
		{
			description: 'Get recommended posts for the current user',
			inputSchema: {},
		},
		async () => {
			const request = requireRequest()
			const domainUrl = getDomainUrl(request)
			const recommendations = await getBlogRecommendations({ request })
			const posts = recommendations.map(
				({
					frontmatter: {
						// remove this because it's not needed and it's kinda big
						bannerBlurDataUrl: _bannerBlurDataUrl,
						...frontmatter
					},
					...recommendation
				}) => ({
					...recommendation,
					url: `${domainUrl}/blog/${recommendation.slug}`,
					frontmatter,
				}),
			)
			return {
				content: [{ type: 'text', text: JSON.stringify(posts) }],
			}
		},
	)

	server.registerTool(
		'get_most_popular_posts',
		{
			description: 'Get the most popular posts on kentcdodds.com',
			inputSchema: {},
		},
		async () => {
			const request = requireRequest()
			const domainUrl = getDomainUrl(request)
			const mostPopularPosts = await prisma.postRead.groupBy({
				by: ['postSlug'],
				_count: true,
				orderBy: {
					_count: {
						postSlug: 'desc',
					},
				},
				take: 10,
			})

			const posts = mostPopularPosts.map(({ postSlug, _count }) => ({
				url: `${domainUrl}/blog/${postSlug}`,
				readCount: _count,
			}))

			return {
				content: [{ type: 'text', text: JSON.stringify(posts) }],
			}
		},
	)

	server.registerTool(
		'find_content',
		{
			description: 'Search for content on kentcdodds.com',
			inputSchema: {
				query: z
					.string()
					.describe(
						`The query to search for. It's not very intelligent, it uses match-sorter to find text matches in titles, descriptions, categories, tags, etc. Simpler and shorter queries are better.`,
					),
				category: z
					.union([
						z.literal('Blog'),
						z.literal('Chats with Kent Podcast'),
						z.literal('Call Kent Podcast'),
						z.literal('Workshops'),
						z.literal('Talks'),
					])
					.optional()
					.describe(
						'The category to search in, if omitted, it will search all categories',
					),
			},
		},
		async ({ query, category }) => {
			const request = requestStorage.getStore()
			if (!request) {
				throw new Error('No request found')
			}
			const domainUrl = getDomainUrl(request)

			const categoryMap: Record<NonNullable<typeof category>, string> = {
				Blog: 'b',
				'Chats with Kent Podcast': 'cwk',
				'Call Kent Podcast': 'ckp',
				Workshops: 'w',
				Talks: 't',
			}

			const searchResults = await searchKCD({
				request,
				query: category ? `${categoryMap[category]}:${query}` : query,
			})

			if (searchResults.length) {
				return {
					content: [
						{
							type: 'text',
							text: searchResults
								.map(({ title, route, segment, metadata }) =>
									JSON.stringify({
										title,
										url: `${domainUrl}${route}`,
										category: segment,
										...metadata,
									}),
								)
								.join('\n'),
						},
					],
				}
			} else {
				return {
					content: [{ type: 'text', text: `No content found for ${query}` }],
				}
			}
		},
	)

	server.registerTool(
		'get_blog_post',
		{
			description: 'Get the content of a specific blog post by its slug',
			inputSchema: {
				slug: z.string().describe('The slug of the blog post to retrieve'),
			},
		},
		async ({ slug }) => {
			const { files } = await downloadMdxFilesCached('blog', slug, {})

			if (!files.length) {
				return {
					content: [
						{ type: 'text', text: `No blog post found with slug: ${slug}` },
					],
				}
			}

			return {
				content: files.map(
					(file) =>
						({
							type: 'text',
							text: `${file.path}:\n\n${file.content}`,
						}) as const,
				),
			}
		},
	)

	server.registerTool(
		'get_chats_with_kent_episode_details',
		{
			description:
				'Get the details (title, description, transcript, etc.) for a specific episode of the Chats with Kent podcast by its season number and episode number',
			inputSchema: {
				seasonNumber: z
					.number()
					.describe('The number of the season to retrieve'),
				episodeNumber: z
					.number()
					.describe('The number of the episode to retrieve'),
			},
		},
		async ({ episodeNumber, seasonNumber }) => {
			const request = requestStorage.getStore()
			if (!request) {
				throw new Error('No request found')
			}
			const seasons = await getChatsWithKentSeasons({ request })
			const season = seasons.find((s) => s.seasonNumber === seasonNumber)
			if (!season) {
				throw new Response(`Season ${seasonNumber} not found`, { status: 404 })
			}
			const episode = season.episodes.find(
				(e) => e.episodeNumber === episodeNumber,
			)
			if (!episode) {
				throw new Response(`Episode ${episodeNumber} not found`, {
					status: 404,
				})
			}

			return {
				content: [
					{
						type: 'text',
						text: `Title: ${episode.title}\n`,
					},
					{
						type: 'text',
						text: `Description:\n${episode.description}\n`,
					},
					{
						type: 'text',
						text:
							`Transcript:\n\n${episode.transcriptHTML}` ||
							`Transcript: No transcript found for ${episode.title} (Chats with Kent S${seasonNumber}E${episodeNumber})`,
					},
				],
			}
		},
	)

	server.registerTool(
		'subscribe_to_newsletter',
		{
			description:
				'Subscribe to Kent C. Dodds newsletter and get regular updates about new articles, courses, and workshops',
			inputSchema: {
				email: z
					.string()
					.email()
					.optional()
					.describe(
						'The email address to subscribe (make sure to ask the user for their email address before calling this tool. They will receive a confirmation email if not already subscribed)',
					),
				firstName: z.string().optional().describe('Your first name (optional)'),
			},
		},
		async ({ email, firstName }) => {
			if (!email) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: `No email address provided. Please provide the user's email address before calling this tool.`,
						},
					],
				}
			}

			const isVerified = await isEmailVerified(email)
			if (!isVerified.verified) {
				return {
					isError: true,
					content: [{ type: 'text', text: isVerified.message }],
				}
			}

			try {
				await addSubscriberToForm({
					email,
					firstName: firstName ?? '',
					kitFormId: '827139',
				})

				return {
					content: [
						{
							type: 'text',
							text: `Successfully subscribed ${email} to Kent's newsletter! If you're not already on Kent's mailing list, you'll receive a confirmation email.`,
						},
					],
				}
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: `Failed to subscribe to the newsletter: ${getErrorMessage(error)}`,
						},
					],
				}
			}
		},
	)
	return server
}
```
