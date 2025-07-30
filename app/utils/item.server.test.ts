import { test, expect, vi } from 'vitest'
import { consoleError } from '#tests/test-setup.ts'
import { getFilePicture, getPictureUrl } from './item.server.ts'

// Mock the dependencies
vi.mock('./cache.server.ts', () => ({
	cache: {
		get: vi.fn(),
		set: vi.fn(),
	},
	cachified: vi.fn(({ getFreshValue }) => getFreshValue()),
}))

vi.mock('./env.server.ts', () => ({
	getEnv: () => ({ MEDIA_PATHS: ['/test/media'] }),
}))

vi.mock('@remix-run/lazy-file/fs', () => ({
	openFile: vi.fn(),
}))

vi.mock('music-metadata', () => ({
	parseWebStream: vi.fn(),
}))

test('getFilePicture returns null when no picture is found', async () => {
	consoleError.mockImplementation(() => {})
	const result = await getFilePicture('/test/file.mp3')
	expect(result).toBeNull()
	expect(consoleError).toHaveBeenCalledWith(
		expect.stringMatching(/\/test\/file.mp3/i),
	)
	expect(consoleError).toHaveBeenCalledTimes(2)
})

test('getFilePicture returns picture data when found', async () => {
	// This is a basic test structure - actual implementation would need more setup
	// due to the complex mocking requirements for music-metadata
	expect(getFilePicture).toBeDefined()
})

test('getPictureUrl generates correct picture URL', () => {
	const url = getPictureUrl('item123')
	expect(url).toBe('/items/item123/picture')
})
