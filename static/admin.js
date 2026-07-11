const client = window.createLNbitsExtensionClient({extensionId: 'satspoll'})
const form = document.querySelector('#create-form')
const dialog = document.querySelector('#create-dialog')
const list = document.querySelector('#poll-list')
const empty = document.querySelector('#empty-state')
const optionFields = document.querySelector('#option-fields')

document.querySelector('#open-create').addEventListener('click', openDialog)
document.querySelector('#add-option').addEventListener('click', () => addOption())
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeDialog))
form.addEventListener('submit', createPoll)
init().catch(showError)

async function init() {
  const [walletResponse] = await Promise.all([client.listWallets(), loadPolls()])
  const select = form.elements.walletId
  for (const wallet of walletResponse.wallets || []) {
    const option = document.createElement('option')
    option.value = wallet.id
    option.textContent = wallet.name
    select.append(option)
  }
  resetOptions()
}

async function loadPolls() {
  const response = await client.listPolls()
  const polls = response.polls || []
  list.replaceChildren()
  empty.hidden = polls.length > 0
  polls.forEach(poll => list.append(renderPoll(poll)))
}

function renderPoll(poll) {
  const row = document.querySelector('#poll-template').content.firstElementChild.cloneNode(true)
  row.querySelector('.poll-title').textContent = poll.title
  row.querySelector('.poll-description').textContent = poll.description || 'No description.'
  const status = row.querySelector('.poll-status')
  status.textContent = poll.status
  status.classList.add(poll.status === 'open' ? 'bg-positive' : 'bg-grey-7')
  row.querySelector('.poll-amount').textContent = `${poll.amountSats} sats / vote`
  row.querySelector('.poll-votes').textContent = `${poll.totalVotes} votes`
  const actions = row.querySelector('.poll-actions')
  actions.append(
    actionButton('link', 'Open public poll', () => window.open(publicUrl(poll.id), '_blank', 'noopener')),
    actionButton('content_copy', 'Copy public link', () => navigator.clipboard.writeText(publicUrl(poll.id))),
    actionButton(poll.status === 'open' ? 'lock' : 'lock_open', poll.status === 'open' ? 'Close poll' : 'Reopen poll', async () => {
      await client.updatePoll(poll.id, {status: poll.status === 'open' ? 'closed' : 'open'})
      await loadPolls()
    }),
    actionButton('delete', 'Delete poll', async () => {
      if (!window.confirm(`Delete "${poll.title}"?`)) return
      await client.deletePoll(poll.id)
      await loadPolls()
    }, poll.totalVotes > 0)
  )
  return row
}

function actionButton(icon, label, action, disabled = false) {
  const button = document.createElement('button')
  button.className = 'icon-button material-icons'
  button.type = 'button'
  button.title = label
  button.setAttribute('aria-label', label)
  button.textContent = icon
  button.disabled = disabled
  button.addEventListener('click', () => Promise.resolve(action()).catch(showError))
  return button
}

async function createPoll(event) {
  event.preventDefault()
  const button = document.querySelector('#create-poll')
  button.disabled = true
  try {
    const data = new FormData(form)
    await client.createPoll({
      title: data.get('title'),
      description: data.get('description'),
      walletId: data.get('walletId'),
      amountSats: Number(data.get('amountSats')),
      options: [...optionFields.querySelectorAll('input')].map(input => input.value)
    })
    closeDialog()
    await loadPolls()
  } catch (error) {
    showError(error)
  } finally {
    button.disabled = false
  }
}

function addOption(value = '') {
  if (optionFields.children.length >= 8) return
  const field = document.querySelector('#option-template').content.firstElementChild.cloneNode(true)
  const input = field.querySelector('input')
  input.name = `option${optionFields.children.length}`
  input.value = value
  field.querySelector('span').textContent = `Option ${optionFields.children.length + 1} *`
  field.querySelector('.remove-option').hidden = optionFields.children.length < 2
  field.querySelector('.remove-option').addEventListener('click', () => {
    field.remove()
    updateOptionFields()
  })
  optionFields.append(field)
  updateOptionFields()
}

function updateOptionFields() {
  ;[...optionFields.children].forEach((field, index) => {
    field.querySelector('span').textContent = `Option ${index + 1} *`
    field.querySelector('.remove-option').hidden = optionFields.children.length <= 2
  })
  document.querySelector('#add-option').hidden = optionFields.children.length >= 8
}

function resetOptions() {
  optionFields.replaceChildren()
  addOption()
  addOption()
}

function openDialog() {
  dialog.showModal()
  form.elements.title.focus()
}

function closeDialog() {
  dialog.close()
  form.reset()
  resetOptions()
}

function publicUrl(id) {
  return new URL(`/ext/satspoll/${encodeURIComponent(id)}`, window.location.href).href
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error)
  client.notifyError(message).catch(() => {})
}
