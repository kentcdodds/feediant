import { spawn } from 'node:child_process'
import { invariant } from '@epic-web/invariant'
import getPort from 'get-port'
import { saveGlobalSetup, waitFor } from './utils.js'

export default async function globalSetup() {
	const token = process.env.MCP_TOKEN ?? 'test-token'

	const port = await getPort()
	const child = spawn('npm', ['run', 'dev'], {
		stdio: 'pipe',
		env: { ...process.env, PORT: port.toString(), MCP_TOKEN: token },
	})

	// Buffer output to display only on error
	let output = ''

	child.stdout?.on('data', (data) => {
		output += data.toString()
	})

	child.stderr?.on('data', (data) => {
		output += data.toString()
	})

	// Wait for server to start
	await new Promise((resolve) => setTimeout(resolve, 100))

	// Wait for health endpoint to be ready
	try {
		await waitFor(
			async () => {
				const response = await fetch(`http://localhost:${port}/health`, {
					method: 'HEAD',
					signal: AbortSignal.timeout(1000),
				})
				invariant(
					response.ok,
					`Health check failed with status ${response.status}`,
				)
			},
			{ timeout: 5000, interval: 100 },
		)
	} catch (error) {
		// Display buffered output on error
		console.error('Server failed to start or health check failed:')
		if (output) {
			console.error('Server output:')
			console.error(output)
		}
		throw error
	}

	await saveGlobalSetup({ port, token })

	return async function globalTeardown() {
		child.kill()
	}
}
