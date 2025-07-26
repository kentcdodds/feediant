import path from 'node:path'
import { z } from 'zod'

const schema = z
	.object({
		NODE_ENV: z.enum(['production', 'development', 'test'] as const),
		MCP_TOKEN: z.string(),
		MEDIA_PATHS: z.string().transform((value) =>
			value
				.trim()
				.split('::')
				.map((line) => line.trim())
				.filter(Boolean)
				.map((pathStr) =>
					pathStr.startsWith('.') ? path.resolve(pathStr) : pathStr,
				),
		),
		DATA_PATH: z
			.string()
			.transform((value) =>
				value.startsWith('.') ? path.resolve(value) : value,
			),
	})
	.transform((env) => {
		const databasePath = path.join(env.DATA_PATH, 'sqlite.db')
		return {
			...env,
			DATABASE_PATH: databasePath,
			DATABASE_URL: `file:${databasePath}`,
			CACHE_DATABASE_PATH: path.join(env.DATA_PATH, 'cache.db'),
		}
	})

export function getEnv() {
	return schema.parse(process.env)
}
