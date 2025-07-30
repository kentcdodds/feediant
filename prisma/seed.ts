import 'dotenv/config'

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type * as JsonLogic from 'json-logic-js'
import { prisma } from '#app/utils/db.server.ts'
import { getEnv } from '#app/utils/env.server.ts'

const { MEDIA_PATHS } = getEnv()

async function isDirectory(filepath: string) {
	const stats = await stat(filepath)
	return stats.isDirectory()
}

async function isFile(filepath: string) {
	const stats = await stat(filepath)
	return stats.isFile()
}

async function readAllMediaFiles(dir: string) {
	const mediaFiles: Array<string> = []
	const files = await readdir(dir)
	for (const file of files) {
		const filepath = path.join(dir, file)
		if (await isDirectory(filepath)) {
			mediaFiles.push(...(await readAllMediaFiles(filepath)))
		} else if (await isFile(filepath)) {
			mediaFiles.push(filepath)
		}
	}
	return mediaFiles
}

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)
	const mediaFiles: Array<string> = []
	for (const dir of MEDIA_PATHS) {
		mediaFiles.push(...(await readAllMediaFiles(dir)))
	}

	await prisma.manualFeed.create({
		data: {
			name: 'Test Manual Feed',
			description: 'Test Feed Description',
			medias: {
				create: mediaFiles.map((filepath) => ({
					filePath: filepath,
				})),
			},
		},
	})

	const autoMatchRules: JsonLogic.RulesLogic = {
		'==': [{ var: 'author' }, 'Brandon Sanderson'],
	}
	await prisma.autoFeed.create({
		data: {
			name: 'Test Auto Feed',
			description: 'Test Feed Description',
			autoMatchRules,
		},
	})
	console.log('🌱 Database has been seeded')
}

seed()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
