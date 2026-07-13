import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('create form uses the Vue and Quasar architecture', async () => {
  const html = await readFile(new URL('../../ui/admin.html', import.meta.url), 'utf8')
  const source = await readFile(new URL('../../static/admin.js', import.meta.url), 'utf8')
  assert.match(html, /<q-dialog v-model="createDialog" persistent>/)
  assert.match(html, /<form[^>]+@submit\.prevent="createPoll"/)
  assert.match(html, /<q-btn[^>]+type="submit"/)
  assert.match(source, /Vue\.createApp/)
  assert.match(source, /options: \[\.\.\.this\.form\.options\]/)
  assert.doesNotMatch(source, /showModal\(|\.close\(\)/)
})

test('public payment modal works without native dialog APIs', async () => {
  const html = await readFile(new URL('../../ui/public.html', import.meta.url), 'utf8')
  const source = await readFile(new URL('../../static/public.js', import.meta.url), 'utf8')
  assert.match(html, /id="invoice-dialog"[^>]+hidden/)
  assert.match(source, /Invalid invoice response\./)
  assert.match(source, /setTimeout\(\(\) => loadPoll\(\)/)
  assert.doesNotMatch(source, /showModal\(|\.close\(\)/)
})
