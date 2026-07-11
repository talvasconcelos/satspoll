const client = window.createLNbitsExtensionClient({extensionId: 'satspoll'})
const state = {pollId: null, selected: null, invoice: null, unsubscribe: null, qrApp: null}
const pollNode = document.querySelector('#poll')
const optionsNode = document.querySelector('#poll-options')
const voteButton = document.querySelector('#vote-button')
const invoiceDialog = document.querySelector('#invoice-dialog')
const invoiceStatus = document.querySelector('#invoice-status')
const copyInvoice = document.querySelector('#copy-invoice')

voteButton.addEventListener('click', createInvoice)
copyInvoice.addEventListener('click', () => navigator.clipboard.writeText(state.invoice?.paymentRequest || ''))
document.querySelectorAll('[data-close-invoice]').forEach(button => button.addEventListener('click', closeInvoiceDialog))
init().catch(showError)

async function init() {
  state.pollId = (await client.context()).routeParams?.pollId
  await loadPoll()
}

async function loadPoll() {
  const poll = await client.getPublicPoll(state.pollId)
  document.querySelector('#loading').hidden = true
  document.querySelector('#error').hidden = true
  pollNode.hidden = false
  document.querySelector('#poll-title').textContent = poll.title
  document.querySelector('#poll-description').textContent = poll.description || ''
  document.querySelector('#poll-price').textContent = `Each vote costs ${poll.amountSats} sats`
  document.querySelector('#closed-state').hidden = poll.status === 'open'
  voteButton.hidden = poll.status !== 'open'
  optionsNode.replaceChildren()
  for (const option of poll.options) optionsNode.append(renderOption(option, poll.status))
}

function renderOption(option, status) {
  const row = document.querySelector('#public-option-template').content.firstElementChild.cloneNode(true)
  const radio = row.querySelector('input')
  radio.value = option.id
  radio.disabled = status !== 'open'
  radio.checked = state.selected === option.id
  radio.addEventListener('change', () => {
    state.selected = option.id
    voteButton.disabled = false
  })
  row.querySelector('.option-label').textContent = option.label
  row.querySelector('.option-result').textContent = `${option.count} vote${option.count === 1 ? '' : 's'} · ${Math.round(option.percentage)}%`
  row.querySelector('.result-fill').style.width = `${option.percentage}%`
  return row
}

async function createInvoice() {
  if (!state.selected) return
  voteButton.disabled = true
  voteButton.setAttribute('aria-busy', 'true')
  try {
    state.invoice = await client.createInvoice(state.pollId, {optionId: state.selected})
    invoiceStatus.textContent = 'Waiting for payment'
    invoiceStatus.classList.remove('text-positive')
    renderQrCode(state.invoice.paymentRequest)
    invoiceDialog.showModal()
    state.unsubscribe = await client.subscribePayment(state.invoice.paymentHash, event => {
      const payment = event.data || {}
      if (event.event === 'payment.settled' || payment.pending === false || ['paid', 'settled', 'success'].includes(String(payment.status || ''))) paymentReceived()
    })
  } catch (error) {
    showError(error)
  } finally {
    voteButton.disabled = false
    voteButton.setAttribute('aria-busy', 'false')
  }
}

function renderQrCode(invoice) {
  state.qrApp?.unmount()
  const node = document.querySelector('#invoice-qrcode')
  node.replaceChildren()
  state.qrApp = Vue.createApp({
    render: () => Vue.h(QrcodeVue.default, {value: `lightning:${invoice.toUpperCase()}`, size: 280, margin: 3, level: 'Q', renderAs: 'svg'})
  })
  state.qrApp.mount(node)
}

async function paymentReceived() {
  state.unsubscribe?.()
  state.unsubscribe = null
  invoiceStatus.textContent = 'Payment received. Vote counted.'
  invoiceStatus.classList.add('text-positive')
  await loadPoll()
}

function closeInvoiceDialog() {
  state.unsubscribe?.()
  state.unsubscribe = null
  state.qrApp?.unmount()
  state.qrApp = null
  invoiceDialog.close()
}

function showError(error) {
  document.querySelector('#loading').hidden = true
  const node = document.querySelector('#error')
  node.hidden = false
  node.textContent = error instanceof Error ? error.message : String(error)
  client.notifyError(node.textContent).catch(() => {})
}
