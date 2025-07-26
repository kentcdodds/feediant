import path from 'node:path'
import { z } from 'zod'

const schema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	MCP_TOKEN: z.string(),
	MEDIA_PATHS: z.string().transform((value) =>
		value
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.map((pathStr) =>
				pathStr.startsWith('./') ? path.resolve(pathStr) : pathStr,
			),
	),
	DATA_PATH: z
		.string()
		.transform((value) =>
			value.startsWith('./') ? path.resolve(value) : value,
		),
})

export function getEnv() {
	const parsed = schema.safeParse(process.env)

	if (parsed.success === false) {
		console.error(
			'❌ Invalid environment variables:',
			parsed.error.flatten().fieldErrors,
		)

		throw new Error('Invalid environment variables')
	}

	return parsed.data
}
