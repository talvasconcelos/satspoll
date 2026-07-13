import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

async function moduleWithHost() {
  const tables = {polls: [], poll_options: [], votes: []}
  const storage = {
    set(table, row) {
      const index = tables[table].findIndex(item => item.id === row.id)
      if (index < 0) tables[table].push({...row})
      else tables[table][index] = {...row}
    },
    get(table, id) { return tables[table].find(row => row.id === id) || null },
    getPublic(table, id) {
      const row = this.get(table, id)
      if (!row) return null
      const fields = table === 'polls'
        ? ['id', 'title', 'description', 'amount_sats', 'status', 'option_ids']
        : ['id', 'poll_id', 'label', 'position', 'count']
      return Object.fromEntries(fields.map(field => [field, row[field]]))
    },
    getPaginated(table, {filters = {}, limit = 1000} = {}) {
      const matches = tables[table].filter(row =>
        Object.entries(filters).every(([key, value]) => row[key] === value)
      )
      return {data: matches.slice(0, limit), total: matches.length}
    },
    delete(table, id) { tables[table] = tables[table].filter(row => row.id !== id) }
  }
  let id = 0
  const system = {id: prefix => `${prefix}_${++id}`, now: () => 123, log: () => {}}
  const wallet = {
    listUserWallets: () => [],
    createInvoicePublic: () => ({paymentHash: 'hash', paymentRequest: 'bolt11', checkingId: 'check'})
  }
  let source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  source = source
    .replace(/^import .*\n\n/, '')
    .replaceAll('export function ', 'function ')
  const names = ['createPoll', 'listPolls', 'getPublicPoll', 'createVoteInvoice', 'recordVote']
  const api = Function('storage', 'system', 'wallet', `${source}; return {${names.join(',')}}`)(storage, system, wallet)
  return {api, tables}
}

function unwrap(value) { return JSON.parse(value) }

test('validates options and counts a paid event once', async () => {
  const {api, tables} = await moduleWithHost()
  const base = {title: 'Lunch?', walletId: 'wallet', amountSats: 21}
  assert.equal(unwrap(api.createPoll(JSON.stringify({...base, options: ['Only']}))).ok, false)
  assert.equal(unwrap(api.createPoll(JSON.stringify({...base, options: ['A', 'a']}))).ok, false)
  const poll = unwrap(api.createPoll(JSON.stringify({...base, options: ['Pizza', 'Soup']}))).data
  const optionId = poll.options[0].id
  const event = {paymentHash: 'paid_hash', sourceId: poll.id, amount: 21000, extra: {extra_satspoll: {optionId}}}
  assert.equal(unwrap(api.recordVote(JSON.stringify(event))).data.recorded, true)
  tables.poll_options.find(row => row.id === optionId).count = 0
  assert.equal(unwrap(api.recordVote(JSON.stringify(event))).data.duplicate, true)
  assert.equal(tables.votes.length, 1)
  const publicPoll = unwrap(api.getPublicPoll(JSON.stringify({pollId: poll.id}))).data
  assert.equal(publicPoll.totalVotes, 1)
  assert.equal(publicPoll.options[0].count, 1)
  assert.equal('wallet_id' in publicPoll, false)
  assert.equal(JSON.stringify(publicPoll).includes('paid_hash'), false)
})

test('invoice rejects closed, unknown, and foreign options without a vote', async () => {
  const {api, tables} = await moduleWithHost()
  const create = options => unwrap(api.createPoll(JSON.stringify({title: 'Poll', walletId: 'wallet', amountSats: 5, options}))).data
  const first = create(['A', 'B'])
  const second = create(['C', 'D'])
  const invoice = payload => unwrap(api.createVoteInvoice(JSON.stringify(payload)))
  assert.equal(invoice({pollId: first.id, optionId: 'missing'}).ok, false)
  assert.equal(invoice({pollId: first.id, optionId: second.options[0].id}).ok, false)
  tables.polls.find(row => row.id === first.id).status = 'closed'
  assert.equal(invoice({pollId: first.id, optionId: first.options[0].id}).ok, false)
  assert.equal(tables.votes.length, 0)
})

test('rejects too many options', async () => {
  const {api} = await moduleWithHost()
  const response = unwrap(api.createPoll(JSON.stringify({
    title: 'Poll',
    walletId: 'wallet',
    amountSats: 1,
    options: Array.from({length: 9}, (_, index) => String(index))
  })))
  assert.equal(response.ok, false)
})
