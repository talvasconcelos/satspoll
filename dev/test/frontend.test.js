import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('create form owns its markup and submits through one handler', async () => {
  const html = await readFile(new URL('../../ui/admin.html', import.meta.url), 'utf8')
  const source = await readFile(new URL('../../static/admin.js', import.meta.url), 'utf8')
  assert.match(html, /<form id="create-form"/)
  assert.match(html, /id="create-poll"[^>]+type="submit"/)
  assert.match(source, /form\.addEventListener\('submit', createPoll\)/)
  assert.doesNotMatch(source, /Vue\.createApp|render\(\)/)
})
