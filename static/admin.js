const client = window.createLNbitsExtensionClient({ extensionId: "satspoll" });

const app = Vue.createApp({
  data() {
    return {
      polls: [],
      wallets: [],
      createDialog: false,
      creating: false,
      form: {
        title: "",
        description: "",
        walletId: "",
        amountSats: 100,
        options: ["", ""],
      },
    };
  },

  async mounted() {
    await Promise.all([this.fetchWallets(), this.fetchPolls()]);
  },

  computed: {
    canCreatePoll() {
      const title = this.form.title.trim();
      const description = this.form.description.trim();
      const amount = Number(this.form.amountSats);
      const options = this.form.options.map((option) => option.trim());
      return (
        title.length > 0 &&
        title.length <= 100 &&
        description.length <= 500 &&
        !!this.form.walletId &&
        Number.isSafeInteger(amount) &&
        amount > 0 &&
        options.length >= 2 &&
        options.length <= 8 &&
        options.every((option) => option.length > 0 && option.length <= 80) &&
        new Set(options.map((option) => option.toLowerCase())).size ===
          options.length
      );
    },
  },

  methods: {
    async fetchWallets() {
      try {
        const response = await client.listWallets();
        this.wallets = response.wallets || [];
        if (!this.form.walletId && this.wallets.length) {
          this.form.walletId = this.wallets[0].id;
        }
      } catch (error) {
        this.showError(error);
      }
    },

    async fetchPolls() {
      try {
        const response = await client.listPolls();
        this.polls = response.polls || [];
      } catch (error) {
        this.showError(error);
      }
    },

    closeCreateDialog() {
      this.createDialog = false;
      this.form = {
        title: "",
        description: "",
        walletId: this.wallets[0]?.id || "",
        amountSats: 100,
        options: ["", ""],
      };
    },

    async createPoll() {
      if (!this.canCreatePoll || this.creating) return;
      this.creating = true;
      try {
        await client.createPoll({
          title: this.form.title,
          description: this.form.description,
          walletId: this.form.walletId,
          amountSats: this.form.amountSats,
          options: [...this.form.options],
        });
        this.closeCreateDialog();
        await this.fetchPolls();
      } catch (error) {
        this.showError(error);
      } finally {
        this.creating = false;
      }
    },

    async togglePoll(poll) {
      try {
        await client.updatePoll(poll.id, {
          status: poll.status === "open" ? "closed" : "open",
        });
        await this.fetchPolls();
      } catch (error) {
        this.showError(error);
      }
    },

    deletePoll(poll) {
      Quasar.Dialog.create({
        title: "Delete poll",
        message: `Delete "${poll.title}"?`,
        cancel: true,
      }).onOk(async () => {
        try {
          await client.deletePoll(poll.id);
          await this.fetchPolls();
        } catch (error) {
          this.showError(error);
        }
      });
    },

    openPublicPoll(id) {
      window.open(this.publicUrl(id), "_blank", "noopener");
    },

    async copyPublicUrl(id) {
      try {
        await navigator.clipboard.writeText(this.publicUrl(id));
        Quasar.Notify.create({
          type: "positive",
          message: "Public link copied.",
        });
      } catch (error) {
        this.showError(error);
      }
    },

    publicUrl(id) {
      return new URL(
        `/ext/satspoll/${encodeURIComponent(id)}`,
        window.location.href,
      ).href;
    },

    showError(error) {
      const message = error instanceof Error ? error.message : String(error);
      client.notifyError(message).catch(() => {
        Quasar.Notify.create({ type: "negative", message });
      });
    },
  },

  render() {
    const h = Vue.h;
    const component = (name) => Vue.resolveComponent(name);
    const QBadge = component("q-badge");
    const QBtn = component("q-btn");
    const QCard = component("q-card");
    const QDialog = component("q-dialog");
    const QForm = component("q-form");
    const QInput = component("q-input");
    const QSelect = component("q-select");

    const button = (props) => h(QBtn, { flat: true, round: true, ...props });
    const formInput = (field, props = {}) =>
      h(QInput, {
        modelValue: this.form[field],
        "onUpdate:modelValue": (value) => {
          this.form[field] = value;
        },
        dark: true,
        filled: true,
        dense: true,
        ...props,
      });

    const pollRows = this.polls.length
      ? this.polls.map((poll) =>
          h(
            "article",
            {
              key: poll.id,
              class: "poll-row row items-center q-col-gutter-md",
            },
            [
              h("div", { class: "col-12 col-md" }, [
                h("div", { class: "text-weight-medium" }, poll.title),
                h(
                  "div",
                  { class: "text-caption text-grey-5" },
                  poll.description || "No description.",
                ),
              ]),
              h(
                "div",
                { class: "col-auto" },
                h(QBadge, {
                  color: poll.status === "open" ? "positive" : "grey-7",
                  label: poll.status,
                }),
              ),
              h("div", { class: "col-auto" }, `${poll.amountSats} sats / vote`),
              h("div", { class: "col-auto" }, `${poll.totalVotes} votes`),
              h("div", { class: "col-auto row q-gutter-xs" }, [
                button({
                  icon: "link",
                  "aria-label": "Open public poll",
                  onClick: () => this.openPublicPoll(poll.id),
                }),
                button({
                  icon: "content_copy",
                  "aria-label": "Copy public link",
                  onClick: () => this.copyPublicUrl(poll.id),
                }),
                button({
                  icon: poll.status === "open" ? "lock" : "lock_open",
                  "aria-label":
                    poll.status === "open" ? "Close poll" : "Reopen poll",
                  onClick: () => this.togglePoll(poll),
                }),
                button({
                  icon: "delete",
                  color: "negative",
                  "aria-label": "Delete poll",
                  disable: poll.totalVotes > 0,
                  onClick: () => this.deletePoll(poll),
                }),
              ]),
            ],
          ),
        )
      : [h("div", { class: "text-grey-5" }, "No polls yet.")];

    const optionFields = this.form.options.map((option, index) =>
      h(
        "div",
        {
          key: index,
          class: "option-field row items-center no-wrap q-gutter-sm",
        },
        [
          h(QInput, {
            modelValue: option,
            "onUpdate:modelValue": (value) => {
              this.form.options[index] = value;
            },
            dark: true,
            filled: true,
            dense: true,
            label: `Option ${index + 1}`,
            maxlength: 80,
            rules: [
              (value) => !!String(value || "").trim() || "Option is required.",
              (value) =>
                this.form.options.filter(
                  (option) =>
                    option.trim().toLowerCase() ===
                    String(value || "").trim().toLowerCase(),
                ).length === 1 || "Options must be unique.",
            ],
            class: "col",
          }),
          this.form.options.length > 2
            ? button({
                icon: "remove_circle",
                color: "negative",
                type: "button",
                "aria-label": "Remove option",
                onClick: () => this.form.options.splice(index, 1),
              })
            : null,
        ],
      ),
    );

    return h("main", { class: "shell q-pa-md" }, [
      h(
        "header",
        { class: "row items-center justify-between q-mb-lg q-gutter-md" },
        [
          h("div", { class: "row items-center q-gutter-sm" }, [
            h("img", {
              class: "app-icon",
              src: "/ext-assets/satspoll/assets/icon.png",
              alt: "",
            }),
            h("div", [
              h(
                "h1",
                { class: "text-h5 text-weight-bold q-my-none" },
                "Sats Poll",
              ),
              h(
                "div",
                { class: "text-caption text-grey-5" },
                "Lightning-powered voting",
              ),
            ]),
          ]),
          h(QBtn, {
            color: "primary",
            icon: "add",
            label: "Create poll",
            onClick: () => {
              this.createDialog = true;
            },
          }),
        ],
      ),

      h(
        QCard,
        { dark: true, class: "panel q-pa-md" },
        { default: () => pollRows },
      ),

      h(
        QDialog,
        {
          modelValue: this.createDialog,
          "onUpdate:modelValue": (value) => {
            this.createDialog = value;
          },
          persistent: true,
        },
        {
          default: () =>
            h(
              QCard,
              { dark: true, class: "modal-card" },
              {
                default: () =>
                  h(
                    QForm,
                    {
                      class: "q-pa-lg q-gutter-md",
                    },
                    {
                      default: () => [
                        h(
                          "div",
                          { class: "row items-center justify-between" },
                          [
                            h(
                              "h2",
                              { class: "text-h6 q-my-none" },
                              "Create poll",
                            ),
                            button({
                              icon: "close",
                              type: "button",
                              "aria-label": "Close",
                              onClick: this.closeCreateDialog,
                            }),
                          ],
                        ),
                        formInput("title", {
                          label: "Title",
                          maxlength: 100,
                          rules: [
                            (value) =>
                              !!String(value || "").trim() ||
                              "Title is required.",
                          ],
                        }),
                        formInput("description", {
                          label: "Description",
                          type: "textarea",
                          maxlength: 500,
                        }),
                        h(QSelect, {
                          modelValue: this.form.walletId,
                          "onUpdate:modelValue": (value) => {
                            this.form.walletId = value;
                          },
                          dark: true,
                          filled: true,
                          dense: true,
                          emitValue: true,
                          mapOptions: true,
                          label: "Receiving wallet",
                          options: this.wallets.map((wallet) => ({
                            label: wallet.name,
                            value: wallet.id,
                          })),
                          disable: !this.wallets.length,
                          rules: [(value) => !!value || "Wallet is required."],
                        }),
                        formInput("amountSats", {
                          label: "Sats per vote",
                          type: "number",
                          min: 1,
                          step: 1,
                          rules: [
                            (value) =>
                              (Number.isSafeInteger(Number(value)) &&
                                Number(value) > 0) ||
                              "Enter a positive whole number.",
                          ],
                        }),
                        h("div", { class: "q-gutter-y-sm" }, optionFields),
                        this.form.options.length < 8
                          ? h(QBtn, {
                              flat: true,
                              color: "primary",
                              icon: "add",
                              label: "Add option",
                              type: "button",
                              onClick: () => this.form.options.push(""),
                            })
                          : null,
                        h("div", { class: "row justify-end q-gutter-sm" }, [
                          h(QBtn, {
                            flat: true,
                            label: "Cancel",
                            type: "button",
                            onClick: this.closeCreateDialog,
                          }),
                          h(QBtn, {
                            color: "primary",
                            label: "Create",
                            type: "button",
                            loading: this.creating,
                            disable: !this.canCreatePoll,
                            onClick: this.createPoll,
                          }),
                        ]),
                      ],
                    },
                  ),
              },
            ),
        },
      ),
    ]);
  },
});

app.use(Quasar);
app.mount("#satspoll-admin-app");
