import fs from 'node:fs'
import path from 'node:path'
import { openFile } from '@remix-run/lazy-file/fs'
import JsonLogic from 'json-logic-js'
import md5 from 'md5-hex'
import * as mimeTypes from 'mime-types'
import * as mm from 'music-metadata'
import pLimit from 'p-limit'
import { href } from 'react-router'
import { z } from 'zod'
import { cache, cachified } from './cache.server.ts'
import { getEnv } from './env.server.ts'

console.log({ JsonLogic })

const { MEDIA_PATHS } = getEnv()

const atob = (data: string) => Buffer.from(data, 'base64').toString()

const contributorSchema = z.object({
	name: z.string(),
})

export const AudibleJson64Schema = z.object({
	title: z.string().optional(),
	summary: z.string().optional(),
	author: z.string().optional(),
	copyright: z.string().optional(),
	duration: z.number().optional(),
	narrated_by: z.string().optional(),
	genre: z.string().optional(),
	release_date: z.string().optional(),
})

export const MetadataSchema = z.object({
	id: z.string(),
	title: z.string(),
	author: z.string(),
	pubDate: z.string().optional(),

	description: z.string(),
	content: z.string(),
	category: z.array(z.string()),
	size: z.number(),
	duration: z.number().optional(),
	type: z.string(),
	contentType: z.string(),
	contributor: z.array(contributorSchema),

	trackNumber: z.number().optional(),

	copyright: z.string(),
	filepath: z.string(),
})

export type Metadata = z.infer<typeof MetadataSchema>
export type AudibleJson64 = z.infer<typeof AudibleJson64Schema>

function getNativeValue(
	metadata: mm.IAudioMetadata,
	nativeId: string,
): string | undefined {
	for (const nativeMetadata of Object.values(metadata.native)) {
		const foundItem = nativeMetadata.find(
			(item) => item.id.toLowerCase() === nativeId.toLowerCase(),
		)
		if (foundItem) {
			if ((foundItem.value as { text: string }).text) {
				return (foundItem.value as { text: string }).text
			} else {
				return foundItem.value as string
			}
		}
	}
}

export async function getAllFileMetadatas() {
	const files = await getMediaFiles()
	const limit = pLimit(10)
	const items = await Promise.all(
		files.map((file) => limit(() => getFileMetadata(file))),
	)
	// TODO: figure out why Boolean isn't filtering out nulls in the type system
	return items.filter(Boolean) as Array<Metadata>
}

export async function getMatchingFileMetadatas(
	autoMatchRules: JsonLogic.RulesLogic,
) {
	const key = ['matching-files', md5(JSON.stringify(autoMatchRules))].join(':')

	return cachified({
		ttl: 60 * 60 * 24,
		swr: 60 * 60 * 36,
		key,
		async getFreshValue() {
			const allFiles = await getAllFileMetadatas()
			const matchingFiles = allFiles.filter((file) =>
				JsonLogic.apply(autoMatchRules, file),
			)
			return matchingFiles
		},
		cache,
	})
}

export async function getFileMetadata(
	filepath: string,
): Promise<Metadata | null> {
	const key = ['file-metadata', filepath].join(':')
	const cached = await cache.get(key)
	const forceFresh = cached
		? (await fs.promises.stat(filepath)).mtimeMs > cached.metadata.createdTime
		: false

	return cachified({
		ttl: 60 * 60 * 24 * 30, // 30 days
		swr: 60 * 60 * 12, // 12 hours
		forceFresh,
		key,
		async getFreshValue() {
			const result = await getFileMetadataImpl(filepath)
			return result
		},
		cache,
	})
}

export async function getFilePicture(
	filepath: string,
): Promise<mm.IPicture | null> {
	const key = ['file-picture', filepath].join(':')
	const cached = await cache.get(key)
	const forceFresh = cached
		? (await fs.promises.stat(filepath)).mtimeMs > cached.metadata.createdTime
		: false

	return cachified({
		ttl: 60 * 60 * 24 * 30, // 30 days
		swr: 60 * 60 * 12, // 12 hours
		forceFresh,
		key,
		async getFreshValue() {
			return getFilePictureImpl(filepath)
		},
		cache,
	})
}

async function getFilePictureImpl(
	filepath: string,
): Promise<mm.IPicture | null> {
	try {
		const file = openFile(filepath)
		const rawMetadata = await mm.parseWebStream(file.stream())
		const { picture: [picture] = [] } = rawMetadata.common
		return picture || null
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error(`Trouble getting picture for "${filepath}"`)
			console.error(error.stack)
		} else {
			console.error(error)
		}
		return null
	}
}

async function getFileMetadataImpl(filepath: string): Promise<Metadata | null> {
	try {
		const stat = await fs.promises.stat(filepath)
		let rawMetadata: mm.IAudioMetadata
		try {
			const file = openFile(filepath)
			rawMetadata = await mm.parseWebStream(file.stream())
		} catch (error: unknown) {
			if (error instanceof Error) {
				error.stack = `This error means that we couldn't parse the metadata for ${filepath}:\n${error.stack}`
			}
			throw error
		}

		const json64 = getNativeValue(rawMetadata, 'TXXX:json64')
		let audibleMetadata: AudibleJson64 = {}
		if (json64) {
			try {
				audibleMetadata = JSON.parse(atob(json64)) as AudibleJson64
			} catch {
				// sometimes the json64 data is incomplete for some reason
			}
		}
		const {
			title = rawMetadata.common.title ?? path.basename(filepath),
			summary: description = rawMetadata.common.description?.join('\n') ??
				rawMetadata.common.comment?.join('\n') ??
				getNativeValue(rawMetadata, 'TXXX:comment') ??
				getNativeValue(rawMetadata, 'COMM:comment') ??
				getNativeValue(rawMetadata, 'COMM') ??
				'No description',
			author = rawMetadata.common.artist ?? 'Unknown author',
			copyright = rawMetadata.common.copyright ?? 'Unknown',
			duration = rawMetadata.format.duration,
			narrated_by: narrators = getNativeValue(
				rawMetadata,
				'----:com.apple.iTunes:PERFORMER_NAME',
			) ??
				getNativeValue(rawMetadata, 'TXXX:narrated_by') ??
				'',
			genre: category = rawMetadata.common.genre?.join(':') ??
				getNativeValue(rawMetadata, 'TXXX:book_genre') ??
				getNativeValue(rawMetadata, 'TXXX:genre') ??
				'',
			release_date: date = getNativeValue(rawMetadata, 'TXXX:year') ??
				getNativeValue(rawMetadata, 'TXXX:date') ??
				rawMetadata.common.date,
		} = audibleMetadata

		const fallbackType =
			path.extname(filepath) === '.m4b'
				? 'audio/mpeg' // officially this should be "audio/mp4a-latm", but it doesn't work 🤷‍♂️
				: 'application/octet-stream'

		let pubDate = date ? new Date(date).toUTCString() : undefined

		const id = md5(filepath)

		const metadata = {
			id,
			title,
			author,
			pubDate,

			description,
			content: description,
			category: category
				.split(':')
				.map((c) => c.trim())
				.filter(Boolean),

			size: stat.size,
			duration,
			type: mimeTypes.lookup(filepath) || fallbackType,
			contentType:
				mimeTypes.contentType(path.extname(filepath)) || fallbackType,
			contributor: narrators.split(',').map((name) => ({ name: name.trim() })),

			trackNumber: rawMetadata.common.track.no ?? undefined,

			copyright,
			filepath,
		}
		return metadata
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error(`Trouble getting metadata for "${filepath}"`)
			console.error(error.stack)
		} else {
			console.error(error)
		}
		return null
	}
}

const supportedMediaTypes = ['mp3', 'm4b', 'mp4', 'm4v']

async function getMediaFiles() {
	const ignore = ['@eaDir', '#recycle']
	const mediaGlobPattern = `**/*.{${supportedMediaTypes.join(',')}}`

	const roots = MEDIA_PATHS
	const result = await Promise.all(
		roots.map(async (dir) => {
			const iterator = fs.promises.glob(path.join(dir, mediaGlobPattern), {
				exclude(fileName) {
					return ignore.some((ignoredDir) => fileName.includes(ignoredDir))
				},
			})
			const files: Array<string> = []
			for await (const file of iterator) {
				if (typeof file === 'string') {
					files.push(path.resolve(file))
				}
			}
			return files
		}),
	)
	return result.flat()
}

export type MediaNode = {
	name: string
	id: string
	path: string
} & (
	| {
			type: 'directory'
			metadata?: never
			children: Array<MediaNode>
	  }
	| {
			type: 'file'
			metadata: Metadata | null
			children?: never
	  }
)

async function buildTree(currentPath: string) {
	const ignore = ['@eaDir', '#recycle']
	const entries = await fs.promises.readdir(currentPath, {
		withFileTypes: true,
	})
	const node: MediaNode = {
		name: path.basename(currentPath),
		id: md5(currentPath),
		path: currentPath,
		type: 'directory',
		children: [],
	}

	for (const entry of entries) {
		if (ignore.some((ignoredDir) => entry.name.includes(ignoredDir))) {
			continue
		}

		if (entry.isDirectory()) {
			node.children.push(await buildTree(path.join(currentPath, entry.name)))
		} else if (
			supportedMediaTypes.includes(entry.name.split('.').pop() ?? '')
		) {
			node.children.push({
				id: md5(path.join(currentPath, entry.name)),
				name: entry.name,
				path: path.join(currentPath, entry.name),
				type: 'file',
				metadata: await getFileMetadata(path.join(currentPath, entry.name)),
			})
		}
	}

	// Sort directories alphabetically
	node.children.sort((a, b) => a.name.localeCompare(b.name))
	return node
}

export async function getAllMediaWithDirectories(): Promise<Array<MediaNode>> {
	const roots = MEDIA_PATHS
	const result: Array<MediaNode> = []

	for (const root of roots) {
		const rootNode: MediaNode = {
			id: md5(root),
			name: path.basename(root),
			path: root,
			type: 'directory',
			children: (await buildTree(root)).children,
		}

		result.push(rootNode)
	}

	return result
}

// This function is now deprecated since pictures are no longer included in metadata by default
// Use getAllMediaWithDirectories() instead
export async function getAllMediaWithDirectoriesNoPictures() {
	return getAllMediaWithDirectories()
}

export async function getFileIdsByDirectory(
	directoryPath: string,
): Promise<Array<string>> {
	const files = await getMediaFiles()
	const directoryFiles = files.filter((file) => file.startsWith(directoryPath))
	return directoryFiles.map((file) => md5(file))
}

export async function getMetadataById(
	fileId: string,
): Promise<Metadata | null> {
	const files = await getMediaFiles()
	const targetFile = files.find((file) => md5(file) === fileId)
	if (!targetFile) return null
	return getFileMetadata(targetFile)
}

export function getPictureUrl(itemId: string): string {
	return href('/items/:itemId/picture', {
		itemId,
	})
}
