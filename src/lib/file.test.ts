import { describe, expect, it } from 'vitest'
import { readFileAsDataURL } from './file'

describe('readFileAsDataURL', () => {
  it('resolves a data URL for the given file', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })

    const result = await readFileAsDataURL(file)

    expect(result).toMatch(/^data:text\/plain;base64,/)
  })
})
