# Sats Poll — LNbits WASM extension specification

## 1. Product

**Extension ID:** `satspoll`  
**Name:** Sats Poll  
**Short description:** Create public polls where each Lightning payment counts as a vote.

Sats Poll lets an LNbits user create a poll, choose a wallet and a fixed sat price per vote, then share a public voting page. A visitor chooses an option, pays the generated Lightning invoice, and the result updates after settlement.

This is a real small product and a focused test of LNbits WASM extensions: sandboxed UI, public/private routes, scoped storage, public invoice creation, and invoice-paid events.

## 2. User value

Useful for:

- community decisions where contribution shows commitment;
- meetup or conference polls;
- livestream audience voting;
- funding a creator while voting;
- playful questions shared by QR code or link.

The product is deliberately not a lottery. Payments buy votes, not a chance to win money.

## 3. MVP

An authenticated LNbits user can:

1. Create a poll with a title, optional description, 2–8 options, wallet, and sats per vote.
2. See their polls and current totals.
3. Open or close a poll.
4. Copy/open the public poll URL.
5. Delete a poll only when it has no paid votes.

A public visitor can:

1. Open the poll without an LNbits account.
2. See its title, description, options, price, status, and paid results.
3. Select one option and generate an invoice.
4. Pay the invoice and see confirmation/results update.
5. Vote again by generating another invoice.

Each settled invoice equals exactly one vote. Unpaid or expired invoices do not count.

## 4. Non-goals

Not in the MVP:

- user accounts or voter identity;
- one-person-one-vote enforcement;
- free polls;
- weighted payments or “more sats = more votes”;
- refunds, prizes, payouts, jackpots, or outgoing payments;
- comments, moderation, teams, categories, scheduling, analytics, exports;
- fiat conversion;
- external HTTP calls;
- calls to other LNbits extensions;
- live websockets if simple payment watching/polling from the supplied bridge is sufficient.

## 5. Core rules

- Price is fixed per poll in whole sats and must be at least 1 sat.
- A poll has 2–8 options.
- Option labels are unique within a poll after trimming and case-folding.
- Poll title: maximum 100 characters.
- Description: maximum 500 characters.
- Option label: maximum 80 characters.
- Only `open` polls may create invoices.
- The public caller supplies a poll ID and option ID, never a wallet ID.
- The selected option must belong to the selected poll.
- A vote is recorded only by the invoice-paid event export.
- Re-delivery of the same payment event must not create another vote.
- Closing a poll blocks new invoices but does not invalidate invoices already issued.
- Results show paid votes only.

## 6. Storage

Use three tables. Do not add a cached result/tally table; totals are derived from paid votes.

### `polls`

| Column | Purpose |
|---|---|
| `id` | Poll ID |
| `title` | Public title |
| `description` | Optional public description |
| `wallet_id` | Private receiving wallet reference |
| `amount_sats` | Fixed price for one vote |
| `status` | `open` or `closed` |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

Public fields:

- `id`
- `title`
- `description`
- `amount_sats`
- `status`

Never expose `wallet_id`.

### `poll_options`

| Column | Purpose |
|---|---|
| `id` | Option ID |
| `poll_id` | Parent poll ID |
| `label` | Public option label |
| `position` | Stable display order |

Public fields:

- `id`
- `poll_id`
- `label`
- `position`

### `votes`

| Column | Purpose |
|---|---|
| `id` | Vote record ID |
| `poll_id` | Poll voted in |
| `option_id` | Selected option |
| `payment_hash` | Idempotency and audit reference |
| `amount_sats` | Settled amount captured from event |
| `paid_at` | Settlement timestamp |

`payment_hash` must be unique. Votes are written by the payment event handler, not by the public invoice request.

Public result responses return aggregated counts, not raw vote records or payment hashes.

## 7. WASM exports and API routes

All responses use the envelope:

```json
{"ok": true, "data": {}}
```

or:

```json
{"ok": false, "error": "Clear message"}
```

### Authenticated exports

| Method/path | Export | Purpose |
|---|---|---|
| `POST /polls` | `create-poll` | Create poll and its options |
| `GET /polls` | `list-polls` | List current user's polls with totals |
| `GET /polls/{poll_id}` | `get-poll` | Private poll detail |
| `PATCH /polls/{poll_id}` | `update-poll` | Edit title/description/status before or during use |
| `DELETE /polls/{poll_id}` | `delete-poll` | Delete only if no paid votes |
| `GET /wallets` | `list-wallets` | Choose a receiving wallet |

MVP update behaviour:

- Title and description may change.
- Status may change between `open` and `closed`.
- Wallet, amount and options are immutable after creation. Create a new poll when those need to change.

This avoids ambiguous invoices and historical votes after edits.

### Public exports

| Method/path | Export | Purpose |
|---|---|---|
| `GET /polls/{poll_id}/public` | `get-public-poll` | Public poll, options and paid counts |
| `POST /polls/{poll_id}/invoice` | `create-vote-invoice` | Validate option and create one-vote invoice |

Invoice request:

```json
{"optionId": "option-id"}
```

Invoice response:

```json
{
  "paymentHash": "...",
  "paymentRequest": "...",
  "checkingId": "..."
}
```

`create-vote-invoice` calls `wallet.createInvoicePublic` with:

- `sourceId`: poll ID;
- `amount`: poll `amount_sats`;
- `currency`: `sat`;
- memo containing the poll title;
- extension `extra` containing `optionId`.

### Event export

| Event | Export | Purpose |
|---|---|---|
| `onInvoicePaid` | `record-vote` | Record one paid vote idempotently |

`record-vote` must:

1. Extract poll/source ID, option ID, payment hash and paid amount from the event.
2. Reject malformed or unrelated events safely.
3. Confirm the poll and option exist and belong together.
4. Return success without writing if `payment_hash` already exists.
5. Store one vote with the event settlement timestamp.

## 8. Permissions

Request only:

| Permission | Why |
|---|---|
| `ext.storage.read` | Read the owner's polls/options/votes |
| `ext.storage.write` | Create/update polls and record paid votes |
| `ext.storage.read_public` | Expose allow-listed poll and option fields |
| `wallet.list` | Let the owner choose the receiving wallet |
| `wallet.create_invoice_public` | Create public vote invoices tied to a stored poll wallet |

Public storage policies:

- `polls`: only `id`, `title`, `description`, `amount_sats`, `status`;
- `poll_options`: only `id`, `poll_id`, `label`, `position`.

Public invoice policy:

- table: `polls`;
- wallet field: `wallet_id`.

Do not request wallet balances, outgoing payment, camera, utility, HTTP, or cross-extension permissions.

## 9. UI

### Admin page: `/satspoll`

One page with:

- “Create poll” button;
- poll cards/table showing title, status, sats/vote, votes and share action;
- create dialog/form;
- close/reopen action;
- delete action only when allowed.

Create form fields:

- title;
- description;
- receiving wallet;
- sats per vote;
- option labels, initially two;
- add option, up to eight;
- create.

Use native inputs and simple CSS/HTML. No chart library. Results are counts, percentages and horizontal CSS bars.

### Public page: `/satspoll/{poll_id}`

Show:

- title and description;
- price: “Each vote costs N sats”;
- options with count, percentage and select button;
- “Vote with Lightning” action;
- invoice QR/payment dialog using the supplied LNbits iframe bridge/SDK;
- paid confirmation;
- closed state with final results.

Accessibility basics:

- options remain keyboard-selectable;
- text labels accompany colours/bars;
- payment status is announced as text;
- buttons have explicit labels.

## 10. Result calculation

For each option:

```text
count = number of paid vote rows for option_id
total = number of paid vote rows for poll_id
percentage = 0 when total is 0, otherwise count / total × 100
```

Round percentage only for display. Counts are authoritative.

## 11. Security and abuse boundaries

- Validate all public IDs and ensure option belongs to poll before invoice creation.
- Never accept or return wallet IDs on public routes.
- Never count a vote from the invoice-creation response.
- Deduplicate by payment hash in both logic and storage constraint.
- Treat event payloads as untrusted input.
- Keep raw payment hashes private.
- Limit text lengths and option count at the backend boundary.
- Escape/render user-created text as text, never HTML.
- No outgoing wallet capability.

Sats Poll is anonymous pay-to-vote. It does not claim Sybil resistance, representative polling, or one-person-one-vote fairness. State this briefly on the public page.

## 12. Small runnable checks

Minimum automated checks:

1. Create rejects fewer than 2, more than 8, or duplicate options.
2. Public invoice rejects closed poll, unknown option, and option from another poll.
3. Public response does not expose `wallet_id` or payment hashes.
4. Paid event creates one vote with the correct poll/option.
5. Duplicate paid event/payment hash remains one vote.
6. Unpaid invoice creation does not change results.
7. Owner-scoped admin reads do not expose another user's polls.

Manual flow:

1. Install and review the five permissions.
2. Enable Sats Poll.
3. Create a two-option poll.
4. Open its public page in a signed-out browser.
5. Generate but do not pay an invoice; confirm total stays zero.
6. Pay one invoice; confirm the selected option becomes one.
7. Refresh/restart LNbits; confirm the vote persists.
8. Close the poll; confirm new invoice creation is blocked and final results remain visible.

## 13. Definition of done

- Installs as a WASM extension and asks only for the declared permissions.
- Owner can create, list, edit status and share a poll.
- Signed-out visitor can view it and create a vote invoice.
- Only settled invoices count.
- Duplicate event delivery cannot double-count.
- Wallet IDs and raw payment records never appear publicly.
- State survives LNbits restart.
- The small automated and manual checks above pass.

## 14. Later, only if users ask

- Optional free polls.
- Poll expiry/scheduling.
- Multiple vote prices or weighted voting.
- Result visibility controls before voting/closing.
- QR poster download.
- Nostr sharing or identity.
- CSV export.

None belongs in the first release.

## References

- LNbits WASM PR: <https://github.com/lnbits/lnbits/pull/4021>
- WASM extension guide: <https://github.com/motorina0/tips/blob/main/agent.md>
- Tips example used for the public-invoice/event pattern: <https://github.com/motorina0/tips>
- Local WASM primer: `~/nova-kb/04-code-projects/lnbits/wasm-extensions-pr-4021-primer.md`
