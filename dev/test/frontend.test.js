import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

function walk(node, visit) {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (typeof node !== "object") return;
  visit(node);
  if (typeof node.children?.default === "function") {
    walk(node.children.default(), visit);
  } else {
    walk(node.children, visit);
  }
}

test("admin mounts without compilation and creates through a validated button", async () => {
  const html = await readFile(
    new URL("../../ui/admin.html", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../../static/admin.js", import.meta.url),
    "utf8",
  );
  const created = [];
  let options;
  let instance;

  const client = {
    createPoll: (payload) => {
      created.push(structuredClone(payload));
      return Promise.resolve({});
    },
    listPolls: () => Promise.resolve({ polls: [] }),
    listWallets: () =>
      Promise.resolve({ wallets: [{ id: "wallet-1", name: "Main wallet" }] }),
    notifyError: () => Promise.resolve(),
    updatePoll: () => Promise.resolve(),
    deletePoll: () => Promise.resolve(),
  };
  const Vue = {
    createApp(value) {
      options = value;
      return {
        use() {
          return this;
        },
        mount(target) {
          assert.equal(target, "#satspoll-admin-app");
          assert.equal(
            typeof options.render,
            "function",
            "CSP-safe render function required",
          );
          instance = options.data();
          instance.form = new Proxy(instance.form, {});
          for (const [name, method] of Object.entries(options.methods)) {
            instance[name] = method.bind(instance);
          }
          for (const [name, computed] of Object.entries(options.computed)) {
            Object.defineProperty(instance, name, {
              get: computed.bind(instance),
            });
          }
          instance.render = options.render.bind(instance);
          return instance;
        },
      };
    },
    h: (type, props, children) => ({ type, props: props || {}, children }),
    resolveComponent: (name) => name,
  };
  const Quasar = {
    Dialog: { create: () => ({ onOk: () => {} }) },
    Notify: { create: () => {} },
  };

  assert.match(html, /<div id="satspoll-admin-app" v-cloak><\/div>/);
  assert.doesNotMatch(html, /<q-|v-model|@submit/);
  const context = vm.createContext(
    {
      Vue,
      Quasar,
      navigator: { clipboard: { writeText: () => Promise.resolve() } },
      window: {
        createLNbitsExtensionClient: () => client,
        location: { href: "http://localhost:5000/ext/satspoll" },
        open: () => {},
      },
      URL,
      console,
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  assert.throws(
    () => vm.runInContext("Function('return 1')()", context),
    /Code generation from strings disallowed/,
  );
  vm.runInContext(source, context);

  await options.mounted.call(instance);
  instance.createDialog = true;

  let nodes = [];
  walk(instance.render(), (node) => nodes.push(node));
  assert.ok(nodes.some((node) => node.type === "q-dialog"));
  assert.ok(nodes.some((node) => node.type === "q-input"));
  assert.ok(nodes.some((node) => node.type === "q-select"));
  assert.ok(nodes.some((node) => node.type === "q-form"));
  let createButton = nodes.find(
    (node) => node.type === "q-btn" && node.props.label === "Create",
  );
  assert.equal(createButton.props.disable, true);

  instance.form.title = "Lunch?";
  instance.form.options = ["Pizza", "pizza"];
  nodes = [];
  walk(instance.render(), (node) => nodes.push(node));
  createButton = nodes.find(
    (node) => node.type === "q-btn" && node.props.label === "Create",
  );
  assert.equal(createButton.props.disable, true);

  instance.form.options = ["Pizza", "Soup"];
  assert.equal(instance.canCreatePoll, true);
  instance.form.walletId = "";
  assert.equal(instance.canCreatePoll, false);
  instance.form.walletId = "wallet-1";
  instance.form.amountSats = 1.5;
  assert.equal(instance.canCreatePoll, false);
  instance.form.amountSats = 100;
  instance.form.options = ["Only one"];
  assert.equal(instance.canCreatePoll, false);
  instance.form.options = Array.from({ length: 9 }, (_, index) => String(index));
  assert.equal(instance.canCreatePoll, false);
  instance.form.options = ["Pizza", "Soup"];

  nodes = [];
  walk(instance.render(), (node) => nodes.push(node));
  createButton = nodes.find(
    (node) => node.type === "q-btn" && node.props.label === "Create",
  );
  assert.equal(createButton.props.disable, false);
  assert.equal(createButton.props.type, "button");
  assert.equal(typeof createButton.props.onClick, "function");
  await createButton.props.onClick();

  assert.deepEqual(created, [
    {
      title: "Lunch?",
      description: "",
      walletId: "wallet-1",
      amountSats: 100,
      options: ["Pizza", "Soup"],
    },
  ]);
});

test("public payment page uses the CSP-safe Tips dialog pattern", async () => {
  const html = await readFile(
    new URL("../../ui/public.html", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../../static/public.js", import.meta.url),
    "utf8",
  );
  assert.match(html, /id="invoice-dialog"[^>]+hidden/);
  assert.match(html, /class="modal-backdrop"[^>]+data-close-invoice/);
  assert.match(source, /Invalid invoice response\./);
  assert.match(source, /QR code renderer is not available\./);
  assert.match(source, /setTimeout\(\(\) => loadPoll\(\)/);
  assert.doesNotMatch(source, /showModal\(|\.close\(\)|template:/);
});
