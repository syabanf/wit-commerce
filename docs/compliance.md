# Compliance

How WIT Commerce covers PP 80/2019 (Perdagangan Melalui Sistem Elektronik), UU 27/2022 (Pelindungan Data Pribadi) and related rules. Brands
on WIT Commerce are the merchants (Pedagang); WIT Commerce is the platform (PPMSE). Each section names
the Pasal, the code that covers it, and what the brand or the operator still has to do.

## Returns and refunds

### Pasal 69(1): at least 2 working days

A shopper may ask for an exchange or a cancellation for at least 2 working days after the parcel
arrives, whatever the brand set.

- `legalReturnDeadline` in `packages/fixtures/src/rules.ts` and `LegalReturnDeadline` in
  `apps/api/internal/rules/returns.go` count 2 working days (Monday to Friday, WIB) from the day
  after delivery and end at 23:59:59 WIB of the second one. Delivered on a Friday or a Saturday, the
  window runs to the end of Tuesday.
- `returnDeadline` takes the later of the brand's window (calendar days) and the legal one for the
  Pasal 69(2) reasons. The brand's window can only extend it.
- The return window setting (`tenants/setShopSettings`, `SetShopSettings` in
  `apps/api/internal/modules/identity/tenants.go`, `ShopSettingsCard` in the admin) accepts 0 or 2 to
  90 days and refuses 1. 0 turns change-of-mind and fit returns off; the legal reasons stay open.
  Migration `0027_return_window_floor.sql` lifts any saved 1-day window to 2.
- The storefront order page (`apps/storefront/src/features/OrderReturns.tsx`) shows both deadlines.

Still to do: public holidays (hari libur nasional, cuti bersama) are counted as working days. Until a
holiday calendar is added, a brand that wants to be safe sets a window of 7 days or more. The
deadline counts from the "delivered" step on the order's timeline, so staff or the courier sync must
mark delivery on the day it happens.

### Pasal 69(2): reasons a store must accept

Reasons: `damaged`, `wrong_item`, `not_as_described`, `late_delivery`, `hidden_defect`, `expired`
(`LEGAL_RETURN_REASONS`, `LegalReturnReasons`), plus the brand-policy reasons `size_or_fit` and
`changed_mind`. `returnRequestBlocker` / `ReturnRequestBlocker` accept a legal reason inside the legal
window even when the brand turned returns off or set a short window. Change of mind and fit follow
the brand's window only.

Still to do: the brand reviews each request and may still reject one that is not what the shopper
claims (for example a worn item reported as damaged). The rejection reason is shown to the shopper.

### Pasal 69(3-4): return shipping cost

Each return records `shippingPaidBy` when it is requested (`returnShippingPayer`,
`ReturnShippingPayer`): the brand when any item carries a Pasal 69(2) reason, the shopper only when
every item comes back by the shopper's own choice. The shopper sees who pays before submitting and on
each return; staff see it on the return page. When the brand pays, staff can add the return shipping
cost to the refund (`shippingCost` on `returns/refund`, split by `returnRefundSplit`, recorded as
`refundShipping`), capped at what the order still holds.

Still to do: booking the courier pickup is outside the product. The brand tells the shopper how to
send the parcel back and refunds the receipt the shopper shows.

### Pasal 71: a refund mechanism

- Orders paid through Midtrans: `Service.RefundReturn` in
  `apps/api/internal/service/returns_refund.go` calls the Midtrans refund API
  (`POST /v2/{order_id}/refund`, `RefundMidtrans` in
  `apps/api/internal/modules/integrations/midtrans_refund.go`) with a refund key per attempt, stored
  in the `payment_refunds` table (migration `0026_payment_refunds.sql`). An attempt Midtrans never
  answered stays pending; the next try asks Midtrans whether that key already refunded before it
  calls again, so the money moves once. A refusal keeps the return received, records
  `gatewayStatus` and `gatewayError` on it and shows the reason to staff.
- After Midtrans refuses (for example a payment method Midtrans cannot refund, such as a bank
  virtual account), and for orders paid any other way (manual transfer, COD), staff send the money
  themselves and record the bank transfer reference and date (`refundMethod: manual`,
  `refundReference`, `refundedOn`). The shopper sees the reference on the order page and in the
  refund email.
- `returnRefundProofBlocker` / `ReturnRefundProofBlocker` refuse to mark a return refunded without a
  gateway reference or a recorded transfer, in both the TypeScript reducer and the API.

- Cancellations: `orders/cancel` of a paid order (`Service.CancelOrder` in
  `apps/api/internal/service/order_payments.go`) refunds through Midtrans first when Midtrans took the
  payment, on the same `payment_refunds` path (`kind = 'cancellation'`, migration 0033, refund keys
  `cancel-<order>-<attempt>`). A refusal or a lost answer still cancels the order and releases its
  stock, with `Order.cancelRefund` recording the amount, `failed` or `pending` and the reason;
  `orders/refundCancelled` (`POST /orders/{id}/cancel-refund`, permission `order.refund`) retries under
  the same key while the last try had no answer, so the money moves once. For any other payment, and
  after Midtrans said no, the order stays cancelled with the refund `owed` until staff record the bank
  transfer reference and date, at cancel time or later; the same `returnRefundProofBlocker` refuses
  without them. Only then does the order turn `refunded`. `orders/refund` refuses a cancelled order, so
  a bare amount cannot stand in for the proof. The console lists owed refunds under Orders → Payments
  to check; the shopper sees the status and reference on the order page and in the cancellation and
  refund emails.

Still to do: the brand keeps its Midtrans account able to refund (balance and enabled refund
methods). The timer cancels only unpaid orders, so a paid order never expires into a refund.

### Paid status: set by the server only

The refund duty above rests on knowing what the shopper paid, so the paid status comes only from the
server. A shopper's request can never set `paymentStatus` paid:
`orders/place` from a shopper (`rules.ShopperPlacement`, `shopperPlacement` in
`packages/fixtures/src/payments.ts`) arrives `confirmed` and `pending`, whatever the browser sent.
Midtrans orders turn paid only from a notification whose signature matches and whose amount the
status check confirms. Manual transfers and static QRIS: the shopper reports the payment
(`orders/submitPayment`, `POST /shop/{store}/orders/{id}/payment-confirmation`, with an optional proof
image through `POST /shop/{store}/payment-proof`); staff with `order.refund` confirm it
(`orders/confirmPayment`), which marks the order paid, or reject it with a reason
(`orders/rejectPayment`). While staff check, the timer does not expire the order; a rejection gives the
shopper a new 24-hour window. COD still turns paid on delivery. The test
`TestShopperCannotSetPaidByAnyRoute` tries every shop route that takes an order or payment body.
An erasure blanks the sender name and proof image of a confirmation and keeps the amount and dates.

## Seller identity, terms and complaints

| Pasal | What the law asks | Code that covers it |
| --- | --- | --- |
| 9, 13 | Clear, documented seller identity | `Tenant.legal` (`SellerLegal` in `packages/types`, `domain.SellerLegal` in Go): legal name, business type (perorangan, CV, PT), NIB, NPWP, address, city, customer service phone, email and hours. Owners edit it at Online store → Legal & policies (`/store/legal`, `brand.manage`), saved with `tenants/setLegal` (`PUT /tenants/{id}/legal`). Every theme footer shows it (`apps/storefront/src/components/SellerIdentity.tsx`). The dashboard and the legal page warn while any identity field is missing (`legalMissing`). |
| 27 | Complaint service: contact, procedure, follow-up, competent staff, resolution time | `legal.complaintProcedure` (default text `DEFAULT_COMPLAINT_PROCEDURE`) and `legal.complaintDays` (default 3 working days). The storefront page `/help` shows contact, procedure, follow-up and resolution time, and its form sends `tickets/open` to `POST /shop/{store}/complaints` (public, 5 per client per hour in the shared `complaint-client` window). The ticket is a `complaint` on the `web` channel, coded `{TENANT}-T0001`, due `complaintDays` working days later (`addWorkingDays`, Monday to Friday WIB); staff see the shopper's text and contact on the Support sheet. Staff can log one with `POST /tickets` (`ticket.manage`). Migration `0028` makes ticket codes unique per brand. |
| 39 | Offer information: payment mechanism and deadline, delivery mechanism, conditions | The product page shows payment methods, the 24-hour payment deadline, each courier with delivery days and fee, the return policy and a link to the terms (`components/OfferInfo.tsx`). Delivery days come from `Tenant.courierEtaDays` (`tenants/setCourierEta`, `PUT /tenants/{id}/courier-eta`) or `DEFAULT_COURIER_ETA`. |
| 46 | Consent before the contract | Checkout requires the box "I agree to the Terms and the Privacy Policy". The order stores `termsVersion` and `termsAcceptedAt`. `POST /shop/{store}/orders` refuses an order without the store's current version (`422 TERMS_NOT_ACCEPTED`) and stamps `termsAcceptedAt` with the server clock. Buying-agent orders carry the same consent: the Approve button says approving means agreeing. |
| 53, 55, 56 | Contract content, in Bahasa Indonesia, that the shopper can keep | `/terms` (`apps/storefront/src/lib/terms.ts`) writes the Syarat & Ketentuan in Indonesian from tenant data: parties, goods and price, ordering and consent, payment and deadline, delivery, returns (the brand's window and the 2-working-day floor for wrong or damaged goods), cancellation, complaints, dispute forum (`legal.disputeForum`: district court of the brand's city by default, BPSK or arbitration; `legal.disputeVenue` names the body), personal data, and the brand's own clauses (`legal.termsExtra`). The page has a print or save button. `termsVersion` is `TERMS_REVISION` plus an FNV-1a hash of the values it prints, identical in TypeScript and Go (`rules.TermsVersion`); tests pin the same versions on both sides. |
| 66 | Delivery time and status information | The order page shows courier, tracking number with a copy button, an arrival window from the shipped time and the courier's delivery days, and the status history (status changes only, never staff notes). |

`/privacy` is a placeholder (`apps/storefront/src/features/PrivacyPage.tsx`) that the privacy work fills.

What the brand still has to do:

- Fill in its legal details, NIB and customer service contact, and keep them true.
- Staff the complaint queue and answer within the working days it set. Public holidays are not
  skipped when the due time is computed.
- Check the generated terms, add its own clauses, and pick the dispute forum it accepts.
- Set realistic delivery days per courier.

What the operator still has to do:

- Have a lawyer review the terms template. Raise `TERMS_REVISION` in `packages/fixtures/src/legal.ts`
  and `rules.TermsRevision` together whenever the wording changes.
- Courier rates and live tracking from a courier API need a provider account and are not built yet;
  delivery days are the brand's estimate.
- Payment method names on the terms page come from checkout and are not part of the terms version.

## Personal data

Brands are the controllers of their shoppers' data; WIT Commerce processes it for them.

### What the code covers

| Rule | Covered by |
| --- | --- |
| PP 80 Pasal 59(3)-(4), UU PDP Pasal 8 and 43-45: erasure on request | `customers/erase` (`POST /customers/{id}/erase`, permission `privacy.manage`, owner roles only). `service.EraseCustomer` runs one transaction: `rules.EraseCustomer` blanks name, email, phone, city, birthday, tags, interests and consent on the customer; `crm.EraseCustomer` replaces the free text of their notes, reviews, support and search events, their leads and their tickets; `orders.EraseCustomer` blanks the city and the payment confirmation's sender name and proof image on their orders and the shopper's note on their returns; `identity.RevokeCustomer` ends the password and every token; `notifications.ForgetCustomer` deletes their email links, drops unsent email and blanks the address on sent email; `kernel.Tx.ScrubDeliveries` replaces their email, phone and name in webhook payloads. `order_rows` follows through the read model projection. The test `TestErasureRemovesPersonalDataEverywhere` searches every table for the email, phone and name afterwards. |
| PP 80 Pasal 25: keep transaction data 10 years, other PMSE data 5 years | Erasure keeps order amounts, items, dates, payment records (`payments`), delivery status and return records. The customer row stays with its code, points and tier, so totals and loyalty still add up. |
| Erasure blocker | `CustomerEraseBlocker` (Go) and `customerEraseBlocker` (TS) refuse while an order is before delivery or a return is open, because the courier and the refund still need the contact details. |
| UU PDP Pasal 20-24: lawful basis and proof of consent | `Customer.marketingConsent` holds granted, at, source (checkout, account, staff, unsubscribe, request) and the wording version (`MARKETING_CONSENT_VERSION`). Every change writes a `privacy` event on the customer timeline. `customers/save` keeps the stored consent and `erasedAt`, so an edit cannot forge them. |
| Optional consent at checkout | An unticked "Send me offers and news" checkbox on the review step; ticking it sends `customers/setConsent` with source checkout after the order is placed. |
| Marketing goes only to consenting customers | `rules.MarketingAllowed`, `marketing.Recipients` and `GET /campaigns/{id}/audience` (reach and skipped). The campaign page shows how many it skips. Transactional order email does not pass through this check. |
| Unsubscribe in every marketing email | `notifications.ComposeMarketing` takes the unsubscribe link as a required argument. The link is `/api/v1/unsubscribe?token=` with a token from `auth.Signer.Seal("unsubscribe", customerID)`. GET shows a confirm button, so mail scanners withdraw nothing; POST (also one-click from mail apps) withdraws consent at once and logs a customer event. |
| UU PDP Pasal 5-13: shopper rights | Account page: "Offers and news" toggle and "Your data" card to ask for a copy, a correction or erasure. `POST /shop/{store}/privacy-requests`. |
| UU PDP Pasal 30, 32, 40, 41: answer within 3x24 hours | `privacy_requests` (migration 0030) with `due_at = requested_at + 72 hours`. Admin page Customers → Privacy requests lists open requests by deadline, overdue in danger tone, and completes them (`POST /customers/privacy-requests/{id}/complete`). Completing an erasure erases; completing a consent withdrawal withdraws. Staff erasure without a request logs a completed one as a record. |
| UU PDP Pasal 7: copy of the data | `GET /customers/{id}/export` (admin download as JSON) and `GET /shop/{store}/export` (the shopper, once their access request is completed). |
| UU PDP Pasal 21: privacy notice | `apps/storefront/src/features/PrivacyPage.tsx`, in Bahasa Indonesia, built from the tenant: controller, data collected, purposes and lawful basis, retention, processors and transfers abroad, rights, response time, breach notice, contact. |
| UU PDP Pasal 31: record of processing | `audit_log` (migration 0036): one row for every write a staff member or an API key makes, written by `kernel.Runtime.Run` in the action's own transaction, so a change cannot commit without its record. A row holds the actor (kind, id, name, role, API key id), the reducer action (`products/save`, `orders/cancel`, `customers/erase`), the record and every row it touched, a field diff with before and after, the request id and the caller's network truncated to /24 (IPv4) or /48 (IPv6). Password hashes, secrets, tokens, emails, phone numbers, addresses, birthdays, free text (notes, labels, descriptions, reasons) and a person's name, city and tags read "changed", never the value, so an erasure leaves nothing to scrub; `TestErasureRemovesPersonalDataEverywhere` searches this table too. A database trigger refuses every update and every delete except the retention prune. There is no write route. Settings → Audit log (`user.manage`) filters by person, action, record and date, pages by id and exports CSV; orders, products and customers show a History card. |
| Shopper and system writes are not audited | A shopper's own writes (orders, account, returns) already sit on the order and customer timelines, and copying them into a 5-year table would keep shopper data longer than its purpose needs. The minute tick is the system acting on rules, not a person. |
| UU PDP Pasal 16(2), 27: collect no more than the purpose needs | Storefront search terms (`searchTerms`, `modules/storefront/search_terms.go`) keep the folded words, daily counts and the result count, never the shopper, their address or their session. A query that looks like an email address or a phone number is not kept at all. |
| UU PDP Pasal 46: breach notice within 3x24 hours | `docs/sop-insiden-data.md`: detect, contain, assess, notify shoppers and the authority with the Pasal 46(2) contents, record, review, with notice templates. |

### Defaults

- Seeded demo customers have no `marketingConsent`, so campaigns reach none of them until one agrees.
  Consent must be proven, and the demo has no proof. Launching a campaign still works on the segment
  size, since no campaign sends email yet.
- The consent wording is "Send me offers and news", version `2026-11`. A new wording needs a new version.

### What the brand still has to do

- Answer each request in the console within 3x24 hours. Access: download the data and send it, or let
  the shopper download it from their account. Correction: edit the customer, then mark the request done.
- Add a contact address for privacy questions to the store; the privacy page points to the store's
  customer service.
- Keep any data it copies out of WIT Commerce (spreadsheets, chat) under the same rules.

### What the operator still has to do

- Appoint a data protection officer (UU PDP Pasal 53) and name them in the breach SOP. Left out of the
  code on purpose.
- Data residency: Resend sends email from the United States, and the AI model provider may sit outside
  Indonesia. PP 80 Pasal 59(2)(h) and UU PDP Pasal 56 allow transfers only with equal protection.
  Choosing providers or regions is an operator decision; the code does not change it.
- Sign data processing agreements with Resend, Midtrans and the AI provider.
- Delete data when the retention periods end. The hourly retention job prunes logs (see Performance and
  retention below); nothing prunes orders, customer events or erased customers after 10 and 5 years yet.
- Pasal 25 asks to keep customer data ("pelanggan") 5 years, while Pasal 59(3)-(4) and UU PDP give the
  right to erasure. The code keeps the pseudonymous customer row (code, points, dates) and erases the
  identifying fields. Confirm this reading with counsel.
- No campaign or automation sends email yet. When one does, it must pick recipients with
  `marketing.Recipients` and compose with `notifications.ComposeMarketing`.
- `assistant_log` questions have emails and phone numbers masked but may hold a typed name; it is pruned
  after 90 days. `request_log` and `staff_events` hold staff ids only.

## Language

### Pasal 55: the contract in Bahasa Indonesia; Pasal 13: clear information

Shoppers read the storefront and get the shopper emails in Bahasa Indonesia unless the brand or the
shopper picks English.

- Store setting: `Tenant.storeLanguage` (`'id' | 'en'`, unset means `'id'`; `StoreLanguage` in
  `packages/types`, `domain.Tenant.StoreLanguage` and `rules.StoreLanguage` in Go). Owners change it
  next to the return window at Online store → Domains & SEO (`/store/domains`, `ShopSettingsCard`), saved with
  `tenants/setShopSettings` (`storeLanguage` is optional; leaving it out keeps the saved value, an
  unknown language refuses the whole change).
- Storefront: every shopper-facing string goes through `t`, `tp` and `tx` in
  `apps/storefront/src/i18n/`. The text lives in `i18n/areas/*.ts`, one file per area, English and
  Indonesian side by side; `en.ts` and `id.ts` join them and the compiler checks that both carry the
  same keys. Dates and numbers use `id-ID` in Indonesian (`i18n/format.ts`); rupiah formatting is
  unchanged. A footer switch (ID | EN, `LanguageSwitch`) remembers the shopper's pick in
  localStorage; `<html lang>` follows the language. Brand-entered content (product names,
  descriptions, page sections, menus, payment type names) shows as the brand typed it.
- Terms and privacy pages stay in Indonesian. In English the page opens with a one-line note that the
  Indonesian text is the binding version.
- Shopper emails: `phrases["id"]` in `apps/api/internal/modules/notifications/shopper.go` holds every
  key of the English map. `ShopperFacts.Lang` comes from the tenant's language
  (`internal/service/notices.go`), and English fills any key a language lacks. The marketing footer,
  the unsubscribe label and the unsubscribe page (`GET /api/v1/unsubscribe`) use the same phrases;
  the page answers in the customer's store language, or Indonesian for a link that opens no customer.
- Tests: `apps/storefront/test/i18n.test.ts` (same keys, same placeholders, default language,
  plurals), `notifications/language_test.go` (key parity, language choice, English fallback),
  `TestShopperEmailFollowsTheStoreLanguage` in `service/notices_test.go`, and two golden cases for
  `tenants/setShopSettings`.

Still to do: error messages the API writes (stock refusals, validation errors) and the English
refusals some `@rc/fixtures` rules return reach the shopper in English unless the storefront maps
them (`codeErrorText`, `returnBlockerText`, `complaintBlockerText`). Brands that sell to Indonesian
consumers should write their product content in Indonesian too. The admin console and the seller
PWA stay in English.

## Performance and retention

### PP 80/2019 Pasal 25: keep transaction data 10 years, other PMSE data 5 years

The API's tick runs `service.PruneIfDue` once an hour (any API process, coordinated through the `meta`
row `retention_pruned_at`). It deletes in batches of 5,000 rows, at most 20 batches per table per run,
so a backlog clears over several runs without long locks. Every period can be changed by environment
variable (`apps/api/cmd/README.md`); 0 keeps that log forever.

| Table | Kept | Rule and reason |
| --- | --- | --- |
| `stock_moves` | 10 years (`RETAIN_STOCK_MOVES_YEARS`, floor 10) | Transaction data: each move records what an order, a return or a stock count did to stock. |
| `integration_logs` | 5 years (`RETAIN_INTEGRATION_LOGS_YEARS`, floor 5) | Other PMSE data: a record of connector calls and their results. The transaction itself lives in orders and payments, which are never pruned. |
| `traffic` | 5 years (`RETAIN_TRAFFIC_YEARS`, floor 5) | Other PMSE data: daily visit and conversion counts per store, with no personal data. |
| `audit_log` | 5 years (`RETAIN_AUDIT_LOG_YEARS`, floor 5) | Other PMSE data: the record of who changed what in the electronic system (UU PDP Pasal 31). The prune sets `audit.prune` for its own transaction, which the append-only trigger checks. |
| `product_imports` | 30 days (`RETAIN_PRODUCT_IMPORTS_DAYS`) | Operational: the checked rows of an uploaded product CSV between its dry run and its last batch. What the import changed stays in `audit_log`. |
| `request_log` | 30 days (`RETAIN_REQUEST_LOG_DAYS`) | Operational: method, path, status, timing and the staff or key id, for debugging and the API key console (which reads the last 24 hours). |
| `webhook_deliveries` | 30 days after creation, once delivered or failed (`RETAIN_WEBHOOK_DELIVERIES_DAYS`) | Operational queue. Pending deliveries are never pruned. A failed delivery can be retried from the console until it goes. |
| `email_outbox` | 30 days, once sent or given up (`RETAIN_EMAIL_OUTBOX_DAYS`) | Operational queue. Sent rows already have no body; pruning also removes the recipient address, which UU PDP asks to keep no longer than its purpose needs. |
| `event_log`, `rate_limits`, `assistant_log` | 10 minutes, the window's end, 90 days | Pruned as before by their own writers and the tick. |

A value below a legal floor is raised to the floor and logged at start. The job never deletes from
`orders`, `payments`, `payment_refunds`, `returns`, `invoices` or `customers`.

### What the operator still has to do

- Confirm with counsel that integration logs and traffic count as other PMSE data (5 years) and not
  transaction data. If counsel says 10, set `RETAIN_INTEGRATION_LOGS_YEARS=10` and `RETAIN_TRAFFIC_YEARS=10`.
- Backups keep pruned rows until the backups themselves expire. Set backup retention to match.


## Tax

PPN (Indonesian VAT) under UU PPN as amended by UU HPP, with the 2025 rate change. The rules sit
in `packages/fixtures/src/tax.ts` and its Go twin `apps/api/internal/rules/tax.go`; the shared cases
in `apps/api/testdata/tax_cases.json` keep the two equal to the rupiah.

### What the code assumes

- The rate is 12%. Most goods are taxed on a base (DPP, *nilai lain*) of 11/12 of the selling price,
  so 11% in effect; luxury goods pay 12% on the full price. PwC's Indonesia tax summary (reviewed
  June 2026) confirms this split. We could not read the PMK text itself, so the rate and the
  fraction are settings (`Tenant.tax.ratePct`, `dppNumerator`, `dppDenominator`), with 12 and 11/12
  when unset. A change in the law is a settings change, and every order keeps the rates of the day
  it was placed in `Order.tax`.
- Only a PKP charges PPN. A brand turns PKP on under Legal & policies → Tax (PPN), which needs
  `brand.manage` and an NPWP in the seller identity. While PKP is on, the NPWP cannot be removed.
  The code does not check the PKP turnover threshold; registering is the brand's decision.
- Each brand picks one default profile (standard, luxury or exempt) and may override it for a
  product or a category. A product's own override wins over its category's. A category override
  covers products filed directly under that category, not under its sub-categories.
- Shipping is the courier's charge passed through and carries no PPN from the brand. A brand that
  sells delivery as its own service would need shipping taxed; that is not built.
- Rounding: whole rupiah, half up, per line. The order discount is spread over the lines in
  proportion to their value, rounding the running total so the shares add up to the discount
  exactly. Prices including PPN: `ppn = amount × rate × base / (100 + rate × base)` and
  `net = amount − ppn`, then `dpp = net × base`. Prices excluding PPN: `dpp = amount × base` and
  `ppn = dpp × rate / 100`. The order's DPP and PPN are the sums of its lines, so lines and totals
  reconcile with no remainder. We found no primary rule on invoice rounding; check this with the
  brand's tax adviser.

### What it changes

- Brands that are not PKP see no change: their orders carry no `tax` and keep their totals. The
  seed has no PKP brand, so `pnpm gen:fixtures` is unchanged.
- Prices including PPN: the shopper pays what they pay today. The cart and checkout say
  "Termasuk PPN", the order page, the shopper emails and the console show DPP and PPN.
- Prices excluding PPN: checkout adds a PPN line and the total becomes
  `subtotal − discount + PPN + shipping`. The API computes the tax itself from the brand's settings
  when the order is placed, whatever the client sent. A return refunds the PPN paid on the returned
  items with them.
- Revenue in sales and analytics stays the order total, which is gross: it includes PPN in both
  modes, as it did before.

### Invoices

`GET /orders/{id}/invoice.pdf` (staff who can read the order) and
`GET /shop/{store}/orders/{id}/invoice.pdf` (the signed-in shopper, own orders only) render a PDF
invoice with no outside library (`apps/api/internal/pdf`). It names the seller from the legal
details, with the NPWP when the brand is a PKP, the buyer's name, contact and city (the product
stores no street address), the lines, discount, DPP, PPN, shipping, total and payment status. The
first download issues the number `INV/{brand code}/{YYYY}/{MM}/{seq}`, where seq runs per brand and
never resets, and keeps it in `order_invoices`. An order cancelled before payment gets no invoice.

The invoice says it is not a Faktur Pajak. A PKP still issues its e-Faktur through Coretax; that
integration, and withholding taxes (PPh), are out of scope.
