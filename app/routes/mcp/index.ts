import { invariant, invariantResponse } from '@epic-web/invariant'
import { redirect } from 'react-router'
import { type Route } from './+types/index.ts'
import { connect, requestStorage } from './mcp.server.ts'

export async function loader({ request }: Route.LoaderArgs) {
	if (request.headers.get('accept')?.includes('text/html')) {
		throw redirect('/about-mcp')
	}
	const response = await requestStorage.run(request, async () => {
		const sessionId = request.headers.get('mcp-session-id') ?? undefined

		// right now, we have to block all requests that are not authenticated
		// Eventually the spec will allow for public tools, but we're not there yet
		const authInfo = await requireAuth(request)

		const transport = await connect(sessionId)
		return transport.handleRequest(request, authInfo)
	})

	return response
}

export async function action({ request }: Route.ActionArgs) {
	const response = await requestStorage.run(request, async () => {
		const sessionId = request.headers.get('mcp-session-id') ?? undefined

		// right now, we have to block all requests that are not authenticated
		// Eventually the spec will allow for public tools, but we're not there yet
		const authInfo = await requireAuth(request)

		const transport = await connect(sessionId)

		return transport.handleRequest(request, authInfo)
	})

	return response
}

async function requireAuth(request: Request) {
	const envToken = process.env.MCP_TOKEN
	invariant(envToken, 'MCP_TOKEN is not set')

	const requestUrl = new URL(request.url)
	const requestToken = requestUrl.searchParams.get('token')
	invariant(requestToken, 'Token is not set')
	invariant(requestToken === envToken, 'Invalid token')

	invariantResponse(requestToken === envToken, 'Unauthorized', { status: 401 })

	// maybe one day we'll have a real auth system, but for now we'll just use a token
	return {
		token: requestToken,
		clientId: 'mcp-server',
		scopes: [],
		expiresAt: undefined,
		extra: { userId: null },
	}
}
