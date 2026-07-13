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

test("admin mounts without runtime compilation and submits through QForm", async () => {
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
  instance.form.title = "Lunch?";
  instance.form.options = ["Pizza", "Soup"];

  const nodes = [];
  walk(instance.render(), (node) => nodes.push(node));
  assert.ok(nodes.some((node) => node.type === "q-dialog"));
  assert.ok(nodes.some((node) => node.type === "q-input"));
  assert.ok(nodes.some((node) => node.type === "q-select"));
  const form = nodes.find((node) => node.type === "q-form");
  assert.ok(form, "QForm must own poll submission");
  await form.props.onSubmit();

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
