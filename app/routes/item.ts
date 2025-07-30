import fs from 'node:fs'
import { invariantResponse } from '@epic-web/invariant'
import { getMetadataById } from '#app/utils/item.server.ts'
import { type Route } from './+types/item'

export async function loader({ request, params }: Route.LoaderArgs) {
	const { itemId } = params
	invariantResponse(itemId, 'Missing itemId')

	const item = await getMetadataById(itemId)
	invariantResponse(item, 'Item not found', { status: 404 })

	const { filepath, size, contentType } = item
	const range = request.headers.get('range')

	let options: { start: number; end: number } | undefined = undefined
	let status = 200
	let headers = new Headers()
	headers.set('Content-Type', contentType)
	if (range) {
		const positions = range.replace(/bytes=/, '').split('-')
		invariantResponse(positions[0], 'Invalid range')
		const start = parseInt(positions[0], 10)
		const end = positions[1] ? parseInt(positions[1], 10) : size - 1
		const chunksize = end - start + 1

		status = 206
		headers.set('Accept-Ranges', 'bytes')
		headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
		headers.set('Content-Length', chunksize.toString())
		options = { start, end }
	} else {
		headers.set('Content-Length', size.toString())
	}

	const stream = fs.createReadStream(filepath, options)
	const readableStream = new ReadableStream({
		start(controller) {
			stream.on('data', (chunk) => {
				controller.enqueue(chunk)
			})
			stream.on('end', () => {
				controller.close()
			})
			stream.on('error', (err) => {
				controller.error(err)
			})
		},
	})
	return new Response(readableStream, { status, headers })
}
