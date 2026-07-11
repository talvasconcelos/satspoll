const client = window.createLNbitsExtensionClient({extensionId: 'satspoll'})

const app = Vue.createApp({
  template: `
    <main class="shell q-pa-md">
      <header class="row items-center justify-between q-mb-lg q-gutter-md">
        <div class="row items-center q-gutter-sm">
          <img class="app-icon" src="/ext-assets/satspoll/assets/icon.png" alt="">
          <div><h1 class="text-h5 text-weight-bold q-my-none">Sats Poll</h1><div class="text-caption text-grey-5">Lightning-powered voting</div></div>
        </div>
        <q-btn unelevated color="primary" icon="add" label="Create poll" @click="dialog = true"></q-btn>
      </header>

      <q-card flat bordered>
        <q-card-section class="q-pa-none">
          <q-table flat :rows="polls" :columns="columns" row-key="id" :loading="loading" no-data-label="No polls yet">
            <template #body-cell-status="props"><q-td :props="props"><q-badge :color="props.row.status === 'open' ? 'positive' : 'grey'" :label="props.row.status"></q-badge></q-td></template>
            <template #body-cell-title="props"><q-td :props="props"><div class="text-weight-medium" v-text="props.row.title"></div><div class="text-caption text-grey-5" v-text="props.row.description"></div></q-td></template>
            <template #body-cell-actions="props"><q-td :props="props" class="q-gutter-xs">
              <q-btn flat round dense icon="link" color="primary" @click="openPublic(props.row.id)"><q-tooltip>Open public poll</q-tooltip></q-btn>
              <q-btn flat round dense icon="content_copy" @click="copyPublic(props.row.id)"><q-tooltip>Copy public link</q-tooltip></q-btn>
              <q-btn flat round dense :icon="props.row.status === 'open' ? 'lock' : 'lock_open'" @click="toggle(props.row)"><q-tooltip>{{props.row.status === 'open' ? 'Close poll' : 'Reopen poll'}}</q-tooltip></q-btn>
              <q-btn flat round dense icon="delete" color="negative" :disable="props.row.totalVotes > 0" @click="remove(props.row)"><q-tooltip>Delete poll</q-tooltip></q-btn>
            </q-td></template>
          </q-table>
        </q-card-section>
      </q-card>

      <q-dialog v-model="dialog" @hide="resetForm">
        <q-card class="dialog-card q-pa-lg">
          <q-form class="q-gutter-md" @submit="create">
            <h2 class="text-h6 q-my-none">Create poll</h2>
            <q-input filled dense v-model.trim="form.title" label="Title *" maxlength="100" counter></q-input>
            <q-input filled dense v-model.trim="form.description" type="textarea" label="Description" maxlength="500" counter></q-input>
            <q-select filled dense emit-value map-options v-model="form.walletId" :options="walletOptions" label="Receiving wallet *"></q-select>
            <q-input filled dense v-model.number="form.amountSats" type="number" min="1" step="1" label="Sats per vote *"></q-input>
            <div v-for="(_, index) in form.options" :key="index" class="row items-center no-wrap q-gutter-sm">
              <q-input class="col" filled dense v-model.trim="form.options[index]" :label="'Option ' + (index + 1) + ' *'" maxlength="80"></q-input>
              <q-btn v-if="form.options.length > 2" flat round icon="remove_circle" color="negative" @click="form.options.splice(index, 1)"><q-tooltip>Remove option</q-tooltip></q-btn>
            </div>
            <q-btn v-if="form.options.length < 8" flat icon="add" label="Add option" @click="form.options.push('')"></q-btn>
            <div class="row justify-end q-gutter-sm"><q-btn flat label="Cancel" v-close-popup></q-btn><q-btn unelevated color="primary" label="Create" type="submit" :loading="saving"></q-btn></div>
          </q-form>
        </q-card>
      </q-dialog>
    </main>`,
  data() {
    return {
      columns: [
        {name: 'title', label: 'Poll', field: 'title', align: 'left'},
        {name: 'status', label: 'Status', field: 'status', align: 'left'},
        {name: 'amount', label: 'Sats / vote', field: 'amountSats', align: 'right'},
        {name: 'votes', label: 'Votes', field: 'totalVotes', align: 'right'},
        {name: 'actions', label: '', field: 'id', align: 'right'}
      ],
      dialog: false, loading: false, saving: false, polls: [], wallets: [],
      form: this.emptyForm()
    }
  },
  computed: {
    walletOptions() { return this.wallets.map(wallet => ({label: wallet.name, value: wallet.id})) }
  },
  async mounted() {
    await Promise.all([this.loadPolls(), this.loadWallets()])
  },
  methods: {
    emptyForm() { return {title: '', description: '', walletId: null, amountSats: 100, options: ['', '']} },
    async loadPolls() { this.loading = true; try { this.polls = (await client.listPolls()).polls || [] } catch (e) { this.error(e) } finally { this.loading = false } },
    async loadWallets() { try { this.wallets = (await client.listWallets()).wallets || []; this.form.walletId ||= this.wallets[0]?.id || null } catch (e) { this.error(e) } },
    async create() { this.saving = true; try { await client.createPoll(this.form); this.dialog = false; await this.loadPolls(); Quasar.Notify.create({type: 'positive', message: 'Poll created.'}) } catch (e) { this.error(e) } finally { this.saving = false } },
    async toggle(poll) { try { await client.updatePoll(poll.id, {status: poll.status === 'open' ? 'closed' : 'open'}); await this.loadPolls() } catch (e) { this.error(e) } },
    async remove(poll) { if (!window.confirm(`Delete "${poll.title}"?`)) return; try { await client.deletePoll(poll.id); await this.loadPolls() } catch (e) { this.error(e) } },
    publicUrl(id) { return new URL(`/ext/satspoll/${encodeURIComponent(id)}`, window.location.href).href },
    openPublic(id) { window.open(this.publicUrl(id), '_blank', 'noopener') },
    async copyPublic(id) { await navigator.clipboard.writeText(this.publicUrl(id)); Quasar.Notify.create({type: 'positive', message: 'Public link copied.'}) },
    resetForm() { const walletId = this.form.walletId; this.form = this.emptyForm(); this.form.walletId = walletId },
    error(value) { const message = value instanceof Error ? value.message : String(value); Quasar.Notify.create({type: 'negative', message}); client.notifyError(message).catch(() => {}) }
  }
})

app.use(Quasar, {plugins: {Notify: Quasar.Notify}})
app.mount('#satspoll-admin')
