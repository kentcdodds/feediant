import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
	index('routes/home.tsx'),
	route('/health', 'routes/health.ts'),
	route('/mcp', 'routes/mcp/index.ts'),
	route('/feeds/:feedId.xml', 'routes/feed.ts'),
	route('/items/:itemId', 'routes/item.ts'),
	route('/items/:itemId/picture', 'routes/item-picture.ts'),
	route('/*', 'routes/catch-all.tsx'),
] satisfies RouteConfig
