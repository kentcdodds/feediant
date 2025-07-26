import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'

// Utility function to wait for assertions to pass
export async function waitFor<ResultType>(
	assertion: () => ResultType,
	{
		timeout = 200,
		interval = 10,
	}: { timeout?: number; interval?: number } = {},
) {
	const startTime = Date.now()
	let lastError: Error | undefined

	while (Date.now() - startTime < timeout) {
		try {
			return await assertion()
		} catch (error) {
			lastError = error as Error
			await new Promise((resolve) => setTimeout(resolve, interval))
		}
	}

	// Timeout reached, throw the last error
	throw lastError || new Error('Timeout waiting for assertion to pass')
}

export function createDeferred<T>() {
	const deferred: {
		resolve: (value: T) => void
		reject: (error: any) => void
		promise: Promise<T>
		value?: T
		error?: any
	} = {} as any
	const promise = new Promise((resolve, reject) => {
		deferred.resolve = (value: T) => {
			deferred.value = value
			resolve(value)
		}
		deferred.reject = (error: any) => {
			deferred.error = error
			reject(error)
		}
	})
	deferred.promise = promise as Promise<T>

	return deferred
}

const globalSetupSchema = z.object({
	port: z.number(),
	token: z.string(),
})

const globalSetupPath = path.join(tmpdir(), 'global-setup.json')
export async function saveGlobalSetup(
	globalSetup: z.input<typeof globalSetupSchema>,
) {
	await fs.writeFile(globalSetupPath, JSON.stringify(globalSetup, null, 2))
}

let cachedGlobalSetup: z.input<typeof globalSetupSchema> | undefined

export async function getGlobalSetup() {
	if (!cachedGlobalSetup) {
		try {
			const data = await fs.readFile(globalSetupPath, 'utf-8')
			cachedGlobalSetup = globalSetupSchema.parse(JSON.parse(data))
		} catch (error) {
			if (error instanceof z.ZodError) {
				console.error('Global setup schema error:')
				console.error(error.issues)
			} else if (error instanceof Error && error.message.includes('ENOENT')) {
				console.error(
					'Global setup not found. This should not happen because the global setup should be saved before the tests run. Check vitest config in vite.config.ts.',
				)
			}
			throw error
		}
	}
	return cachedGlobalSetup
}
