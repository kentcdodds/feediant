import { invariantResponse } from '@epic-web/invariant'
import deepmerge from 'deepmerge'
import type * as JsonLogic from 'json-logic-js'
import { href } from 'react-router'
import type * as XMLJS from 'xml-js'
import convert from 'xml-js'
import { type AutoFeed, type ManualFeed } from '#app/prisma/client.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	getFileMetadata,
	getMatchingFileMetadatas,
	type Metadata,
} from '#app/utils/item.server.ts'
import { getDomainUrl, removeEmpty } from '#app/utils/misc.ts'
import { type Route } from './+types/feed.ts'

async function getFeedItems(feed: ManualFeed | AutoFeed) {
	if (feed.type === 'MANUAL') {
		const medias = await prisma.manualMedia.findMany({
			where: { feedId: feed.id },
		})
		const items: Array<Metadata> = []
		for (const media of medias) {
			const metadata = await getFileMetadata(media.filePath)
			if (metadata) items.push(metadata)
		}
		return items
	} else {
		// TODO: validate autoMatchRules
		const autoMatchRules = feed.autoMatchRules as JsonLogic.RulesLogic
		const items = await getMatchingFileMetadatas(autoMatchRules)
		return items
	}
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const { feedId } = params
	invariantResponse(feedId, 'Missing feedId')

	const [manualFeed, autoFeed] = await Promise.all([
		prisma.manualFeed.findUnique({
			where: { id: feedId },
		}),
		prisma.autoFeed.findUnique({
			where: { id: feedId },
		}),
	])
	const feed = manualFeed || autoFeed
	invariantResponse(feed, 'Feed not found', { status: 404 })

	if (!new URL(request.url).pathname.endsWith('.xml')) {
		return new Response('Not Found', {
			status: 404,
			headers: { reason: `Pathname must end in .xml` },
		})
	}
	const domainUrl = getDomainUrl(request)

	const items = await getFeedItems(feed)

	const xmlObj: XMLJS.ElementCompact = {
		_declaration: { _attributes: { version: '1.0', encoding: 'utf-8' } },
		rss: {
			_attributes: {
				version: '2.0',
				'xmlns:atom': 'http://www.w3.org/2005/Atom',
				'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
				'xmlns:googleplay': 'http://www.google.com/schemas/play-podcasts/1.0',
				'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
			},
			channel: {
				'atom:link': [
					{
						_attributes: {
							href: domainUrl + new URL(request.url).pathname,
							rel: 'self',
							title: 'MP3 Audio',
							type: 'application/rss+xml',
						},
					},
					{
						_attributes: {
							rel: 'hub',
							xmlns: 'http://www.w3.org/2005/Atom',
							href: 'https://pubsubhubbub.appspot.com/',
						},
					},
				],
				title: feed.name,
				link: request.url,
				description: { _cdata: feed.description ?? `Feediant ${feed.name}` },
				lastBuildDate: new Date().toUTCString(),
				// TODO: add image support for feeds
				// image,
				item: items.map((item, index) => {
					const {
						id,
						title,
						description,
						pubDate,
						category,
						author,
						duration,
						size,
						type,
					} = item

					return removeEmpty({
						guid: { _attributes: { isPermaLink: false }, _text: id },
						title,
						description: { _cdata: description },
						pubDate: pubDate
							? pubDate
							: // this publication fallback date is only here to make sure the sort
								// order matches the sort order because some times clients ignore
								// the order of the items and sort by pubDate instead.
								// We don't want to mess up things for items with a real pubDate,
								// but for those that don't, we may as well make sure the sort order
								// is correct.
								new Date(
									new Date('1900-01-01').getTime() + index * 1_000 * 60,
								).toUTCString(),
						author,
						category: category.length ? category : null,
						'content:encoded': { _cdata: description },
						enclosure: {
							_attributes: {
								length: size,
								type,
								url: getResourceUrl(
									href('/items/:itemId', {
										itemId: id,
									}),
								),
							},
						},
						'itunes:title': title,
						'itunes:author': author,
						'itunes:duration': duration,
						'itunes:image': {
							_attributes: {
								href: getResourceUrl(
									href('/items/:itemId/picture', {
										itemId: id,
									}),
								),
							},
						},
						'itunes:summary': description,
						'itunes:subtitle': description,
						'itunes:explicit': 'no',
						'itunes:episodeType': 'full',
					})
				}),
			},
		},
	}

	return new Response(
		convert.js2xml(
			deepmerge.all(
				// TODO: parse/validate feed.metadata
				[xmlObj, feed.metadata].filter(Boolean) as Array<XMLJS.ElementCompact>,
			),
			{ compact: true, ignoreComment: true, spaces: 2 },
		),
		{ headers: { 'Content-Type': 'text/xml' } },
	)

	function getResourceUrl(ref: string) {
		const resourceUrl = new URL(domainUrl)
		resourceUrl.pathname = resourceUrl.pathname.replace(/\/$/, '') + ref
		return resourceUrl.toString()
	}
}
