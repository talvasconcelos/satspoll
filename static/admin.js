const client = window.createLNbitsExtensionClient({extensionId: 'satspoll'})

Vue.createApp({
  data: () => ({
    polls: [],
    wallets: [],
    createDialog: false,
    creating: false,
    form: {
      title: '',
      description: '',
      walletId: '',
      amountSats: 100,
      options: ['', '']
    }
  }),

  async mounted() {
    await Promise.all([this.fetchWallets(), this.fetchPolls()])
  },

  methods: {
    async fetchWallets() {
      try {
        const response = await client.listWallets()
        this.wallets = response.wallets || []
        if (!this.form.walletId && this.wallets.length) {
          this.form.walletId = this.wallets[0].id
        }
      } catch (error) {
        this.showError(error)
      }
    },

    async fetchPolls() {
      try {
        const response = await client.listPolls()
        this.polls = response.polls || []
      } catch (error) {
        this.showError(error)
      }
    },

    openCreateDialog() {
      this.createDialog = true
    },

    closeCreateDialog() {
      this.createDialog = false
      this.form = {
        title: '',
        description: '',
        walletId: this.wallets[0]?.id || '',
        amountSats: 100,
        options: ['', '']
      }
    },

    addOption() {
      if (this.form.options.length < 8) this.form.options.push('')
    },

    removeOption(index) {
      if (this.form.options.length > 2) this.form.options.splice(index, 1)
    },

    async createPoll() {
      this.creating = true
      try {
        await client.createPoll({
          title: this.form.title,
          description: this.form.description,
          walletId: this.form.walletId,
          amountSats: this.form.amountSats,
          options: [...this.form.options]
        })
        this.closeCreateDialog()
        await this.fetchPolls()
      } catch (error) {
        this.showError(error)
      } finally {
        this.creating = false
      }
    },

    async togglePoll(poll) {
      try {
        await client.updatePoll(poll.id, {
          status: poll.status === 'open' ? 'closed' : 'open'
        })
        await this.fetchPolls()
      } catch (error) {
        this.showError(error)
      }
    },

    deletePoll(poll) {
      this.$q.dialog({
        title: 'Delete poll',
        message: `Delete "${poll.title}"?`,
        cancel: true
      }).onOk(async () => {
        try {
          await client.deletePoll(poll.id)
          await this.fetchPolls()
        } catch (error) {
          this.showError(error)
        }
      })
    },

    openPublicPoll(id) {
      window.open(this.publicUrl(id), '_blank', 'noopener')
    },

    async copyPublicUrl(id) {
      try {
        await Quasar.copyToClipboard(this.publicUrl(id))
        this.$q.notify({type: 'positive', message: 'Public link copied.'})
      } catch (error) {
        this.showError(error)
      }
    },

    publicUrl(id) {
      return new URL(
        `/ext/satspoll/${encodeURIComponent(id)}`,
        window.location.href
      ).href
    },

    showError(error) {
      const message = error instanceof Error ? error.message : String(error)
      this.$q.notify({type: 'negative', message})
      client.notifyError(message).catch(() => {})
    }
  }
}).use(Quasar).mount('#satspoll-admin-app')
