import { prisma } from '#app/utils/db.server'

export async function loader() {
	const autoFeeds = await prisma.autoFeed.findMany()
	const manualFeeds = await prisma.manualFeed.findMany()
	return new Response(JSON.stringify({ autoFeeds, manualFeeds }))
}
