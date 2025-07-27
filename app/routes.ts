import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
	index('routes/home.tsx'),
	route('/health', 'routes/health.ts'),
	route('/mcp', 'routes/mcp/index.ts'),
	route('/*', 'routes/catch-all.tsx'),
] satisfies RouteConfig
