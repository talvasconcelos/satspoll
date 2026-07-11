import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('create button calls create directly without form submission', async () => {
  const source = await readFile(new URL('../../static/admin.js', import.meta.url), 'utf8')
  assert.match(source, /label: 'Create'.*onClick: this\.create/)
  assert.doesNotMatch(source, /type: 'submit'/)
})
