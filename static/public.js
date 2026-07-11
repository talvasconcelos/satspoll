const client = window.createLNbitsExtensionClient({extensionId: 'satspoll'})

const app = Vue.createApp({
  components: {QrcodeVue: QrcodeVue.default},
  template: `
    <main class="shell q-pa-md">
      <header class="row items-center q-gutter-sm q-mb-lg"><img class="app-icon" src="/ext-assets/satspoll/assets/icon.png" alt=""><h1 class="text-h5 text-weight-bold q-my-none">Sats Poll</h1></header>
      <q-card flat bordered>
        <q-card-section v-if="loading"><q-skeleton type="text" width="60%"></q-skeleton><q-skeleton type="text"></q-skeleton></q-card-section>
        <q-card-section v-else-if="error" class="text-negative" role="alert" v-text="error"></q-card-section>
        <template v-else>
          <q-card-section><h2 class="text-h4 text-weight-bold q-my-none" v-text="poll.title"></h2><p class="text-body1 text-grey-5 q-mb-none" v-text="poll.description"></p><p class="text-weight-medium q-mt-lg q-mb-none">Each vote costs {{poll.amountSats}} sats</p></q-card-section>
          <q-separator></q-separator>
          <q-list separator>
            <q-item v-for="option in poll.options" :key="option.id" tag="label" :clickable="poll.status === 'open'">
              <q-item-section avatar v-if="poll.status === 'open'"><q-radio v-model="selected" :val="option.id" :aria-label="option.label"></q-radio></q-item-section>
              <q-item-section><q-item-label class="text-weight-medium" v-text="option.label"></q-item-label><q-linear-progress rounded size="8px" :value="option.percentage / 100" color="primary" track-color="grey-8" class="q-mt-sm"></q-linear-progress></q-item-section>
              <q-item-section side><q-item-label caption>{{option.count}} vote{{option.count === 1 ? '' : 's'}} · {{Math.round(option.percentage)}}%</q-item-label></q-item-section>
            </q-item>
          </q-list>
          <q-card-actions v-if="poll.status === 'open'" align="right" class="q-pa-md"><q-btn unelevated color="primary" icon="bolt" label="Vote with Lightning" :disable="!selected" :loading="creating" @click="createInvoice"></q-btn></q-card-actions>
          <q-card-section v-else class="text-weight-medium">This poll is closed. Final results are shown above.</q-card-section>
        </template>
      </q-card>
      <p class="text-caption text-grey-5 q-mt-lg">Anonymous pay-to-vote poll. Payments do not enforce one person, one vote.</p>
      <q-dialog v-model="invoiceDialog" @hide="cleanup"><q-card class="invoice-card q-pa-lg"><div class="row items-center justify-between q-mb-md"><h3 class="text-h6 q-my-none">Pay to vote</h3><q-btn flat round dense icon="close" v-close-popup><q-tooltip>Close invoice</q-tooltip></q-btn></div><button class="invoice-qr" type="button" @click="copyInvoice" aria-label="Copy invoice"><qrcode-vue v-if="invoice" :value="qrValue" :size="280" :margin="3" level="Q" render-as="svg"></qrcode-vue><img src="/ext-assets/satspoll/assets/icon.png" alt=""><q-tooltip>Copy invoice</q-tooltip></button><p class="text-center" :class="paid ? 'text-positive text-weight-medium' : ''" aria-live="assertive" v-text="paymentStatus"></p><q-btn outline color="primary" icon="content_copy" label="Copy invoice" class="full-width" @click="copyInvoice"></q-btn></q-card></q-dialog>
    </main>`,
  data: () => ({pollId: null, poll: null, selected: null, loading: true, creating: false, error: '', invoice: null, invoiceDialog: false, paymentStatus: '', paid: false, unsubscribe: null}),
  computed: {qrValue() { return `lightning:${this.invoice?.paymentRequest?.toUpperCase() || ''}` }},
  async mounted() { try { this.pollId = (await client.context()).routeParams?.pollId; await this.load() } catch (error) { this.showError(error) } },
  methods: {
    async load() { this.poll = await client.getPublicPoll(this.pollId); this.loading = false },
    async createInvoice() {
      this.creating = true
      try {
        this.invoice = await client.createInvoice(this.pollId, {optionId: this.selected})
        this.paymentStatus = 'Waiting for payment'; this.paid = false; this.invoiceDialog = true
        this.unsubscribe = await client.subscribePayment(this.invoice.paymentHash, event => {
          const payment = event.data || {}
          if (event.event === 'payment.settled' || payment.pending === false || ['paid', 'settled', 'success'].includes(String(payment.status || ''))) this.paymentReceived()
        })
      } catch (error) { this.showError(error) } finally { this.creating = false }
    },
    async paymentReceived() { this.unsubscribe?.(); this.unsubscribe = null; this.paid = true; this.paymentStatus = 'Payment received. Vote counted.'; await this.load() },
    copyInvoice() { navigator.clipboard.writeText(this.invoice?.paymentRequest || '') },
    cleanup() { this.unsubscribe?.(); this.unsubscribe = null },
    showError(value) { this.loading = false; this.error = value instanceof Error ? value.message : String(value); client.notifyError(this.error).catch(() => {}) }
  }
})

app.use(Quasar)
app.mount('#satspoll-public')
