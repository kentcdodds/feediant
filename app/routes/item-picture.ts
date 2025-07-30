import { invariantResponse } from '@epic-web/invariant'
import { getFilePicture, getMetadataById } from '#app/utils/item.server.ts'
import { type Route } from './+types/item-picture'

export async function loader({ params }: Route.LoaderArgs) {
	const { itemId } = params
	invariantResponse(itemId, 'Missing itemId')

	const item = await getMetadataById(itemId)
	invariantResponse(item, 'Item not found', { status: 404 })

	const picture = await getFilePicture(item.filepath)
	if (!picture) {
		return new Response('Picture not found', { status: 404 })
	}

	const headers = new Headers()
	headers.set('Content-Type', picture.format)
	headers.set('Cache-Control', 'public, max-age=31536000') // Cache for 1 year

	return new Response(picture.data, { headers })
}
