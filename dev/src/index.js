import {storage, system, wallet} from './lnbits-sdk.js'

const POLLS = 'polls'
const OPTIONS = 'poll_options'
const VOTES = 'votes'

export function createPoll(requestJson) {
  return runJson(() => {
    const request = parseObject(requestJson)
    const labels = validateOptions(request.options)
    const pollId = system.id('poll')
    const optionIds = labels.map((_, position) => `${pollId}_option_${position}`)
    const poll = {
      id: pollId,
      title: requiredText(request.title, 'title', 100),
      description: cleanText(request.description, 500),
      wallet_id: requiredText(request.walletId, 'walletId', 128),
      amount_sats: positiveInteger(request.amountSats, 'amountSats'),
      status: 'open',
      option_ids: optionIds,
      created_at: system.now(),
      updated_at: system.now()
    }
    storage.set(POLLS, poll)
    labels.forEach((label, position) =>
      storage.set(OPTIONS, {
        id: optionIds[position],
        poll_id: poll.id,
        label,
        position,
        count: 0
      })
    )
    return pollDetail(poll)
  })
}

export function listPolls(_requestJson) {
  return runJson(() => ({
    polls: storage
      .getPaginated(POLLS, {sortBy: 'created_at', descending: true, limit: 100})
      .data.map(pollSummary)
  }))
}

export function getPoll(requestJson) {
  return runJson(() => pollDetail(getPollRow(requestId(requestJson))))
}

export function updatePoll(requestJson) {
  return runJson(() => {
    const request = parseObject(requestJson)
    const poll = getPollRow(requiredText(request.pollId, 'pollId', 128))
    if ('title' in request) poll.title = requiredText(request.title, 'title', 100)
    if ('description' in request) poll.description = cleanText(request.description, 500)
    if ('status' in request) poll.status = validStatus(request.status)
    poll.updated_at = system.now()
    storage.set(POLLS, poll)
    return pollDetail(poll)
  })
}

export function deletePoll(requestJson) {
  return runJson(() => {
    const pollId = requestId(requestJson)
    getPollRow(pollId)
    if (rows(VOTES, {poll_id: pollId}).length) {
      throw new Error('Polls with paid votes cannot be deleted.')
    }
    for (const option of rows(OPTIONS, {poll_id: pollId})) {
      storage.delete(OPTIONS, option.id)
    }
    storage.delete(POLLS, pollId)
    return {id: pollId, deleted: true}
  })
}

export function listWallets(_requestJson) {
  return runJson(() => ({wallets: wallet.listUserWallets()}))
}

export function getPublicPoll(requestJson) {
  return runJson(() => publicPoll(requestId(requestJson)))
}

export function createVoteInvoice(requestJson) {
  return runJson(() => {
    const request = parseObject(requestJson)
    const pollId = requiredText(request.pollId, 'pollId', 128)
    const optionId = requiredText(request.optionId, 'optionId', 128)
    const poll = storage.getPublic(POLLS, pollId)
    if (!poll) throw new Error('Poll not found.')
    if (poll.status !== 'open') throw new Error('Poll is closed.')
    const option = storage.getPublic(OPTIONS, optionId)
    if (!option || option.poll_id !== pollId) {
      throw new Error('Option does not belong to this poll.')
    }
    const invoice = wallet.createInvoicePublic({
      sourceId: pollId,
      amount: poll.amount_sats,
      currency: 'sat',
      memo: `Vote: ${poll.title}`,
      extra: {optionId}
    })
    return {
      paymentHash: invoice.paymentHash,
      paymentRequest: invoice.paymentRequest,
      checkingId: invoice.checkingId
    }
  })
}

export function recordVote(eventJson) {
  return runJson(() => {
    const event = parseObject(eventJson)
    const paymentHash = eventValue(event, 'paymentHash', 'payment_hash')
    const pollId = eventValue(event, 'sourceId', 'source_id')
    const extra = extensionExtra(event)
    const optionId = cleanText(extra.optionId || extra.option_id, 128)
    if (!paymentHash || !pollId || !optionId) return {recorded: false}
    const existingVote = rows(VOTES, {payment_hash: paymentHash}, 1)[0]
    if (existingVote) {
      syncOptionCount(storage.get(OPTIONS, existingVote.option_id))
      return {recorded: false, duplicate: true}
    }
    const poll = getPollRow(pollId)
    const option = storage.get(OPTIONS, optionId)
    if (!option || option.poll_id !== poll.id) return {recorded: false}
    const vote = {
      id: `vote_${paymentHash}`,
      poll_id: poll.id,
      option_id: option.id,
      payment_hash: paymentHash,
      amount_sats: eventAmountSats(event),
      paid_at: eventTimestamp(event)
    }
    storage.set(VOTES, vote)
    syncOptionCount(option)
    return {recorded: true, voteId: vote.id}
  })
}

function syncOptionCount(option) {
  if (!option) return
  // ponytail: public reads cannot aggregate; remove this projection when public aggregate reads exist.
  const count = storage.getPaginated(VOTES, {
    filters: {option_id: option.id},
    limit: 1
  }).total
  storage.set(OPTIONS, {...option, count})
}

function pollDetail(poll) {
  const options = rows(OPTIONS, {poll_id: poll.id}).sort(
    (a, b) => a.position - b.position
  )
  return result(poll, options, rows(VOTES, {poll_id: poll.id}))
}

function pollSummary(poll) {
  const detail = pollDetail(poll)
  return {...publicFields(poll), totalVotes: detail.totalVotes, options: detail.options}
}

function publicPoll(pollId) {
  const poll = storage.getPublic(POLLS, pollId)
  if (!poll) throw new Error('Poll not found.')
  const options = (poll.option_ids || [])
    .map(optionId => storage.getPublic(OPTIONS, optionId))
    .filter(option => option && option.poll_id === pollId)
  const totalVotes = options.reduce((total, option) => total + Number(option.count || 0), 0)
  return {
    ...publicFields(poll),
    totalVotes,
    options: options.map(option => ({
      id: option.id,
      pollId: option.poll_id,
      label: option.label,
      position: option.position,
      count: Number(option.count || 0),
      percentage: totalVotes ? (Number(option.count || 0) / totalVotes) * 100 : 0
    }))
  }
}

function result(poll, options, votes) {
  const counts = Object.fromEntries(options.map(option => [option.id, 0]))
  votes.forEach(vote => {
    if (vote.option_id in counts) counts[vote.option_id] += 1
  })
  const totalVotes = votes.length
  return {
    ...publicFields(poll),
    totalVotes,
    options: options
      .sort((a, b) => a.position - b.position)
      .map(option => ({
        id: option.id,
        pollId: option.poll_id,
        label: option.label,
        position: option.position,
        count: counts[option.id],
        percentage: totalVotes ? (counts[option.id] / totalVotes) * 100 : 0
      }))
  }
}

function publicFields(poll) {
  return {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    amountSats: poll.amount_sats,
    status: poll.status
  }
}

function rows(table, filters, limit = 1000) {
  return storage.getPaginated(table, {filters, limit}).data
}

function getPollRow(id) {
  const poll = storage.get(POLLS, id)
  if (!poll) throw new Error('Poll not found.')
  return poll
}

function requestId(json) {
  return requiredText(parseObject(json).pollId, 'pollId', 128)
}

function validateOptions(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    throw new Error('A poll needs 2 to 8 options.')
  }
  const labels = value.map(option =>
    requiredText(typeof option === 'string' ? option : option?.label, 'option', 80)
  )
  if (new Set(labels.map(label => label.toLowerCase())).size !== labels.length) {
    throw new Error('Option labels must be unique.')
  }
  return labels
}

function validStatus(value) {
  if (value !== 'open' && value !== 'closed') throw new Error('Invalid status.')
  return value
}

function positiveInteger(value, name) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive whole number.`)
  }
  return number
}

function requiredText(value, name, max) {
  const text = cleanText(value, max)
  if (!text) throw new Error(`${name} is required.`)
  return text
}

function cleanText(value, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length > max) throw new Error(`Text must be at most ${max} characters.`)
  return text
}

function parseObject(value) {
  const parsed = value ? JSON.parse(value) : {}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object.')
  }
  return parsed
}

function eventValue(event, camel, snake) {
  return cleanText(
    event[camel] || event[snake] || event.extra?.[camel] || event.extra?.[snake] ||
      event.payment?.[camel] || event.payment?.[snake] ||
      event.payment?.extra?.[camel] || event.payment?.extra?.[snake],
    128
  )
}

function extensionExtra(event) {
  return event.extra?.extra_satspoll || event.payment?.extra?.extra_satspoll || {}
}

function eventAmountSats(event) {
  const amountMsat = Number(event.amount || event.payment?.amount || 0)
  return Number.isFinite(amountMsat) ? Math.abs(Math.trunc(amountMsat / 1000)) : 0
}

function eventTimestamp(event) {
  const value = Number(event.settledAt || event.settled_at || event.paidAt || event.paid_at)
  return Number.isSafeInteger(value) && value > 0 ? value : system.now()
}

function runJson(fn) {
  try {
    return JSON.stringify({ok: true, data: fn()})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    system.log(`satspoll: ${message}`, 'warning')
    return JSON.stringify({ok: false, error: message})
  }
}
