import { prisma } from '#app/utils/db.server'

export async function loader() {
	const feeds = await prisma.feed.findMany()
	return new Response(JSON.stringify(feeds))
}
