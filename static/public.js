const client = window.createLNbitsExtensionClient({extensionId: 'satspoll'})

const app = Vue.createApp({
  data: () => ({
    pollId: null,
    poll: null,
    selected: null,
    loading: true,
    creating: false,
    error: '',
    invoice: null,
    invoiceDialog: false,
    paymentStatus: '',
    paid: false,
    unsubscribe: null
  }),
  computed: {
    qrValue() {
      return `lightning:${this.invoice?.paymentRequest?.toUpperCase() || ''}`
    }
  },
  async mounted() {
    try {
      this.pollId = (await client.context()).routeParams?.pollId
      await this.load()
    } catch (error) {
      this.showError(error)
    }
  },
  methods: {
    async load() {
      this.poll = await client.getPublicPoll(this.pollId)
      this.loading = false
    },
    async createInvoice() {
      this.creating = true
      try {
        this.invoice = await client.createInvoice(this.pollId, {optionId: this.selected})
        this.paymentStatus = 'Waiting for payment'
        this.paid = false
        this.invoiceDialog = true
        this.unsubscribe = await client.subscribePayment(this.invoice.paymentHash, event => {
          const payment = event.data || {}
          if (
            event.event === 'payment.settled' ||
            payment.pending === false ||
            ['paid', 'settled', 'success'].includes(String(payment.status || ''))
          ) {
            this.paymentReceived()
          }
        })
      } catch (error) {
        this.showError(error)
      } finally {
        this.creating = false
      }
    },
    async paymentReceived() {
      this.unsubscribe?.()
      this.unsubscribe = null
      this.paid = true
      this.paymentStatus = 'Payment received. Vote counted.'
      await this.load()
    },
    copyInvoice() {
      navigator.clipboard.writeText(this.invoice?.paymentRequest || '')
    },
    cleanup() {
      this.unsubscribe?.()
      this.unsubscribe = null
    },
    showError(value) {
      this.loading = false
      this.error = value instanceof Error ? value.message : String(value)
      client.notifyError(this.error).catch(() => {})
    }
  },
  render() {
    const h = Vue.h
    const component = name => Vue.resolveComponent(name)
    const QBtn = component('q-btn')
    const QCard = component('q-card')
    const QCardActions = component('q-card-actions')
    const QCardSection = component('q-card-section')
    const QDialog = component('q-dialog')
    const QItem = component('q-item')
    const QItemLabel = component('q-item-label')
    const QItemSection = component('q-item-section')
    const QLinearProgress = component('q-linear-progress')
    const QList = component('q-list')
    const QRadio = component('q-radio')
    const QSeparator = component('q-separator')
    const QSkeleton = component('q-skeleton')
    const QTooltip = component('q-tooltip')
    const Qrcode = QrcodeVue.default

    const content = this.loading
      ? h(QCardSection, {}, () => [h(QSkeleton, {type: 'text', width: '60%'}), h(QSkeleton, {type: 'text'})])
      : this.error
        ? h(QCardSection, {class: 'text-negative', role: 'alert'}, () => this.error)
        : [
            h(QCardSection, {}, () => [
              h('h2', {class: 'text-h4 text-weight-bold q-my-none'}, this.poll.title),
              h('p', {class: 'text-body1 text-grey-5 q-mb-none'}, this.poll.description),
              h('p', {class: 'text-weight-medium q-mt-lg q-mb-none'}, `Each vote costs ${this.poll.amountSats} sats`)
            ]),
            h(QSeparator),
            h(QList, {separator: true}, () => this.poll.options.map(option =>
              h(QItem, {key: option.id, tag: 'label', clickable: this.poll.status === 'open'}, () => [
                this.poll.status === 'open'
                  ? h(QItemSection, {avatar: true}, () => h(QRadio, {modelValue: this.selected, 'onUpdate:modelValue': value => { this.selected = value }, val: option.id, 'aria-label': option.label}))
                  : null,
                h(QItemSection, {}, () => [
                  h(QItemLabel, {class: 'text-weight-medium'}, () => option.label),
                  h(QLinearProgress, {rounded: true, size: '8px', value: option.percentage / 100, color: 'primary', trackColor: 'grey-8', class: 'q-mt-sm'})
                ]),
                h(QItemSection, {side: true}, () => h(QItemLabel, {caption: true}, () => `${option.count} vote${option.count === 1 ? '' : 's'} · ${Math.round(option.percentage)}%`))
              ])
            )),
            this.poll.status === 'open'
              ? h(QCardActions, {align: 'right', class: 'q-pa-md'}, () => h(QBtn, {unelevated: true, color: 'primary', icon: 'bolt', label: 'Vote with Lightning', disable: !this.selected, loading: this.creating, onClick: this.createInvoice}))
              : h(QCardSection, {class: 'text-weight-medium'}, () => 'This poll is closed. Final results are shown above.')
          ]

    return h('main', {class: 'shell q-pa-md'}, [
      h('header', {class: 'row items-center q-gutter-sm q-mb-lg'}, [
        h('img', {class: 'app-icon', src: '/ext-assets/satspoll/assets/icon.png', alt: ''}),
        h('h1', {class: 'text-h5 text-weight-bold q-my-none'}, 'Sats Poll')
      ]),
      h(QCard, {flat: true, bordered: true}, () => content),
      h('p', {class: 'text-caption text-grey-5 q-mt-lg'}, 'Anonymous pay-to-vote poll. Payments do not enforce one person, one vote.'),
      h(QDialog, {modelValue: this.invoiceDialog, 'onUpdate:modelValue': value => { this.invoiceDialog = value }, onHide: this.cleanup}, () =>
        h(QCard, {class: 'invoice-card q-pa-lg'}, () => [
          h('div', {class: 'row items-center justify-between q-mb-md'}, [
            h('h3', {class: 'text-h6 q-my-none'}, 'Pay to vote'),
            h(QBtn, {flat: true, round: true, dense: true, icon: 'close', onClick: () => { this.invoiceDialog = false }}, () => h(QTooltip, {}, () => 'Close invoice'))
          ]),
          h('button', {class: 'invoice-qr', type: 'button', onClick: this.copyInvoice, 'aria-label': 'Copy invoice'}, [
            this.invoice ? h(Qrcode, {value: this.qrValue, size: 280, margin: 3, level: 'Q', renderAs: 'svg'}) : null,
            h('img', {src: '/ext-assets/satspoll/assets/icon.png', alt: ''}),
            h(QTooltip, {}, () => 'Copy invoice')
          ]),
          h('p', {class: ['text-center', this.paid ? 'text-positive text-weight-medium' : ''], 'aria-live': 'assertive'}, this.paymentStatus),
          h(QBtn, {outline: true, color: 'primary', icon: 'content_copy', label: 'Copy invoice', class: 'full-width', onClick: this.copyInvoice})
        ])
      )
    ])
  }
})

app.use(Quasar)
app.mount('#satspoll-public')
