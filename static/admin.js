const client = window.createLNbitsExtensionClient({extensionId: 'satspoll'})

const app = Vue.createApp({
  data() {
    return {
      columns: [
        {name: 'title', label: 'Poll', field: 'title', align: 'left'},
        {name: 'status', label: 'Status', field: 'status', align: 'left'},
        {name: 'amount', label: 'Sats / vote', field: 'amountSats', align: 'right'},
        {name: 'votes', label: 'Votes', field: 'totalVotes', align: 'right'},
        {name: 'actions', label: '', field: 'id', align: 'right'}
      ],
      dialog: false,
      loading: false,
      saving: false,
      polls: [],
      wallets: [],
      form: this.emptyForm()
    }
  },
  computed: {
    walletOptions() {
      return this.wallets.map(wallet => ({label: wallet.name, value: wallet.id}))
    },
    canCreate() {
      return Boolean(
        this.form.title.trim() &&
        this.form.walletId &&
        Number.isInteger(Number(this.form.amountSats)) &&
        Number(this.form.amountSats) > 0 &&
        this.form.options.every(option => option.trim())
      )
    }
  },
  async mounted() {
    await Promise.all([this.loadPolls(), this.loadWallets()])
  },
  methods: {
    emptyForm() {
      return {title: '', description: '', walletId: null, amountSats: 100, options: ['', '']}
    },
    async loadPolls() {
      this.loading = true
      try {
        this.polls = (await client.listPolls()).polls || []
      } catch (error) {
        this.showError(error)
      } finally {
        this.loading = false
      }
    },
    async loadWallets() {
      try {
        this.wallets = (await client.listWallets()).wallets || []
        this.form.walletId ||= this.wallets[0]?.id || null
      } catch (error) {
        this.showError(error)
      }
    },
    async create() {
      this.saving = true
      try {
        await client.createPoll(this.form)
        this.dialog = false
        await this.loadPolls()
        Quasar.Notify.create({type: 'positive', message: 'Poll created.'})
      } catch (error) {
        this.showError(error)
      } finally {
        this.saving = false
      }
    },
    async toggle(poll) {
      try {
        await client.updatePoll(poll.id, {status: poll.status === 'open' ? 'closed' : 'open'})
        await this.loadPolls()
      } catch (error) {
        this.showError(error)
      }
    },
    async remove(poll) {
      if (!window.confirm(`Delete "${poll.title}"?`)) return
      try {
        await client.deletePoll(poll.id)
        await this.loadPolls()
      } catch (error) {
        this.showError(error)
      }
    },
    publicUrl(id) {
      return new URL(`/ext/satspoll/${encodeURIComponent(id)}`, window.location.href).href
    },
    openPublic(id) {
      window.open(this.publicUrl(id), '_blank', 'noopener')
    },
    async copyPublic(id) {
      await navigator.clipboard.writeText(this.publicUrl(id))
      Quasar.Notify.create({type: 'positive', message: 'Public link copied.'})
    },
    resetForm() {
      const walletId = this.form.walletId
      this.form = this.emptyForm()
      this.form.walletId = walletId
    },
    showError(value) {
      const message = value instanceof Error ? value.message : String(value)
      Quasar.Notify.create({type: 'negative', message})
      client.notifyError(message).catch(() => {})
    }
  },
  render() {
    const h = Vue.h
    const component = name => Vue.resolveComponent(name)
    const QBadge = component('q-badge')
    const QBtn = component('q-btn')
    const QCard = component('q-card')
    const QDialog = component('q-dialog')
    const QForm = component('q-form')
    const QInput = component('q-input')
    const QSelect = component('q-select')
    const QTable = component('q-table')
    const QTd = component('q-td')
    const QTooltip = component('q-tooltip')
    const tooltip = text => ({default: () => h(QTooltip, {}, () => text)})
    const button = (props, tip) => h(QBtn, props, tooltip(tip))
    const field = (name, props) => h(QInput, {
      modelValue: this.form[name],
      'onUpdate:modelValue': value => { this.form[name] = value },
      filled: true,
      dense: true,
      ...props
    })

    const optionFields = this.form.options.map((option, index) =>
      h('div', {class: 'row items-center no-wrap q-gutter-sm', key: index}, [
        h(QInput, {
          class: 'col',
          modelValue: option,
          'onUpdate:modelValue': value => { this.form.options[index] = value },
          filled: true,
          dense: true,
          label: `Option ${index + 1} *`,
          maxlength: 80
        }),
        this.form.options.length > 2
          ? button({flat: true, round: true, icon: 'remove_circle', color: 'negative', onClick: () => this.form.options.splice(index, 1)}, 'Remove option')
          : null
      ])
    )

    return h('main', {class: 'shell q-pa-md'}, [
      h('header', {class: 'row items-center justify-between q-mb-lg q-gutter-md'}, [
        h('div', {class: 'row items-center q-gutter-sm'}, [
          h('img', {class: 'app-icon', src: '/ext-assets/satspoll/assets/icon.png', alt: ''}),
          h('div', [h('h1', {class: 'text-h5 text-weight-bold q-my-none'}, 'Sats Poll'), h('div', {class: 'text-caption text-grey-5'}, 'Lightning-powered voting')])
        ]),
        h(QBtn, {unelevated: true, color: 'primary', icon: 'add', label: 'Create poll', onClick: () => { this.dialog = true }})
      ]),
      h(QCard, {flat: true, bordered: true}, () => h(QTable, {
        flat: true,
        rows: this.polls,
        columns: this.columns,
        rowKey: 'id',
        loading: this.loading,
        noDataLabel: 'No polls yet'
      }, {
        'body-cell-title': props => h(QTd, {props}, () => [h('div', {class: 'text-weight-medium'}, props.row.title), h('div', {class: 'text-caption text-grey-5'}, props.row.description)]),
        'body-cell-status': props => h(QTd, {props}, () => h(QBadge, {color: props.row.status === 'open' ? 'positive' : 'grey', label: props.row.status})),
        'body-cell-actions': props => h(QTd, {props, class: 'q-gutter-xs'}, () => [
          button({flat: true, round: true, dense: true, icon: 'link', color: 'primary', onClick: () => this.openPublic(props.row.id)}, 'Open public poll'),
          button({flat: true, round: true, dense: true, icon: 'content_copy', onClick: () => this.copyPublic(props.row.id)}, 'Copy public link'),
          button({flat: true, round: true, dense: true, icon: props.row.status === 'open' ? 'lock' : 'lock_open', onClick: () => this.toggle(props.row)}, props.row.status === 'open' ? 'Close poll' : 'Reopen poll'),
          button({flat: true, round: true, dense: true, icon: 'delete', color: 'negative', disable: props.row.totalVotes > 0, onClick: () => this.remove(props.row)}, 'Delete poll')
        ])
      })),
      h(QDialog, {modelValue: this.dialog, 'onUpdate:modelValue': value => { this.dialog = value }, onHide: this.resetForm}, () =>
        h(QCard, {class: 'dialog-card q-pa-lg'}, () => h(QForm, {class: 'q-gutter-md'}, () => [
          h('h2', {class: 'text-h6 q-my-none'}, 'Create poll'),
          field('title', {label: 'Title *', maxlength: 100, counter: true}),
          field('description', {type: 'textarea', label: 'Description', maxlength: 500, counter: true}),
          h(QSelect, {modelValue: this.form.walletId, 'onUpdate:modelValue': value => { this.form.walletId = value }, filled: true, dense: true, emitValue: true, mapOptions: true, options: this.walletOptions, label: 'Receiving wallet *'}),
          field('amountSats', {type: 'number', min: 1, step: 1, label: 'Sats per vote *'}),
          ...optionFields,
          this.form.options.length < 8 ? h(QBtn, {flat: true, icon: 'add', label: 'Add option', onClick: () => this.form.options.push('')}) : null,
          h('div', {class: 'row justify-end q-gutter-sm'}, [h(QBtn, {flat: true, label: 'Cancel', onClick: () => { this.dialog = false }}), h(QBtn, {unelevated: true, color: 'primary', label: 'Create', disable: !this.canCreate, loading: this.saving, onClick: this.create})])
        ]))
      )
    ])
  }
})

app.use(Quasar)
app.mount('#satspoll-admin')
