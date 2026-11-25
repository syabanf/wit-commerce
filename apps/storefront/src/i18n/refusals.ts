import { ApiError } from '@rc/api'
import { type MessageKey, t } from '.'

// The API and the shared rules in @rc/fixtures refuse in English, and the reducer, the Go twin and the
// golden file depend on those exact sentences. The storefront translates them here: first by sentence,
// then by pattern, then by the problem's code. Anything unknown shows the server's text as it came.
// test/refusals.test.ts checks every sentence against the real rule outputs and the Go source, so a
// reworded rule fails a test instead of reaching shoppers in English.

/** Every fixed refusal a shop route or a storefront check can return, by its English sentence. */
export const REFUSAL_SENTENCES: Record<string, MessageKey> = {
  // orderPlaceBlocker, PlaceOrder and shopPlaceOrder
  'Your cart is empty.': 'refusal.order.cartEmpty',
  'One item has no stock at this warehouse. Remove it or try again after restocking.':
    'refusal.order.noStock',
  'One item just sold out. Remove it to continue.': 'refusal.order.soldOut',
  'This order was already placed.': 'refusal.order.placed',
  'An order needs an id and a customer.': 'refusal.order.incomplete',
  "The new customer must be the order's customer.": 'refusal.order.customerMismatch',
  'The order belongs to another store.': 'refusal.order.otherStore',
  'You can only place orders for your own account.': 'refusal.order.ownAccount',
  'Sign in, or check out as a new customer.': 'refusal.order.signIn',
  'This customer already exists. Sign in to order for them.': 'refusal.order.customerExists',
  "Agree to the store's Terms and Privacy Policy to place the order.": 'refusal.order.terms',
  "The store's terms changed. Reload the checkout, read them, and agree again.": 'refusal.order.termsChanged',
  'Your order is in, but the payment page did not open. The store will contact you.':
    'refusal.order.paymentDidNotOpen',
  'A cancelled order gets no invoice.': 'refusal.order.noInvoice',
  // RepriceShopperOrder
  'Prices or offers changed since you opened the checkout. Check the new total and place the order again.':
    'refusal.order.priceChanged',
  'The store does not allow this agent discount. Ask the agent for a new total.':
    'refusal.order.agentDiscount',
  // shopLead
  'The lead belongs to another store.': 'refusal.lead.otherStore',
  'This lead was already sent.': 'refusal.lead.sent',
  // returnRequestBlocker, returnCancelBlocker, RequestReturn and shopReturn
  'You can ask for a return once the order is delivered.': 'account.returns.block.notDelivered',
  'Choose at least one item to return.': 'account.returns.block.none',
  'One item is not part of this order.': 'account.returns.block.notInOrder',
  'List each item once.': 'account.returns.block.once',
  'Choose a reason for each item.': 'account.returns.block.reason',
  'Enter how many units to return.': 'account.returns.block.qty',
  'One item already has an open return. Finish that one first.': 'account.returns.block.open',
  'One item was already returned in full.': 'account.returns.block.full',
  'This store takes change-of-mind and fit returns by message. Contact the store.':
    'account.returns.block.byMessage',
  'Only a return that has not been received can be cancelled.': 'refusal.return.cancel',
  'A return needs an id and an order.': 'refusal.return.incomplete',
  'This return was already requested.': 'refusal.return.requested',
  'Sign in to ask for a return.': 'refusal.return.signIn',
  // paymentConfirmationBlocker, SubmitPaymentConfirmation and the proof upload
  'Cash on delivery is paid to the courier.': 'refusal.payment.cod',
  'This order is not waiting for payment.': 'payment.block.notWaiting',
  'The store is already checking your payment.': 'payment.block.checking',
  'Enter the amount you sent.': 'payment.block.amount',
  'Enter the bank or wallet you paid from.': 'payment.block.channel',
  'Enter the name on the account you paid from.': 'payment.block.sender',
  'Enter when you sent the money.': 'payment.block.time',
  'Upload the proof image here.': 'payment.block.proof',
  'This order is paid on the payment page. Press Pay now on the order page.': 'refusal.payment.gateway',
  'Sign in to tell the store you paid.': 'refusal.payment.signIn',
  'Sign in to upload a payment proof.': 'refusal.payment.signInProof',
  'The image is larger than 5 MB.': 'refusal.image.tooLarge',
  'Send the image as multipart/form-data in the field file.': 'refusal.image.form',
  'Your role cannot upload images.': 'refusal.image.role',
  'Upload a PNG, JPEG or WebP image. Other files, SVG included, are not accepted.': 'refusal.image.type',
  'The image could not be read. Save it again as PNG, JPEG or WebP and retry.': 'refusal.image.unreadable',
  // complaintBlocker, OpenTicket and shopComplaint
  'Give your complaint a subject of 3 to 120 characters.': 'account.help.block.subject',
  'Describe the problem in 10 to 2000 characters.': 'account.help.block.message',
  'Enter your name, up to 80 characters.': 'account.help.block.name',
  'Leave an email or a phone number so we can reply.': 'account.help.block.contact',
  'Enter an email such as you@example.com.': 'account.help.block.email',
  'Enter a phone number of 8 to 15 digits.': 'account.help.block.phone',
  'Too many complaints from here. Try again in an hour, or contact the store directly.':
    'refusal.complaint.tooMany',
  'Pick one of your own orders, or leave the order out.': 'refusal.complaint.order',
  // RequestPrivacy, consentBlocker, shopConsent and shopExport
  'Choose access, correction, erasure or withdraw_consent.': 'refusal.privacy.kind',
  "This customer's personal data is already erased.": 'refusal.privacy.erased',
  "This customer's personal data is erased.": 'refusal.privacy.erasedNow',
  'A request of this kind is already open. The store answers it within 3x24 hours.': 'refusal.privacy.open',
  'Ask for a copy of your data first. The store prepares it within 3x24 hours.':
    'refusal.privacy.exportFirst',
  'Send source checkout or account.': 'refusal.consent.source',
  'Unknown consent source.': 'refusal.consent.unknownSource',
  'Name the wording the shopper agreed to.': 'refusal.consent.wording',
  'This customer already agreed to marketing messages.': 'refusal.consent.agreed',
  'This customer already receives no marketing messages.': 'refusal.consent.withdrawn',
  // Sign-in, registration, passwords and email links
  'Too many attempts. Try again in a minute.': 'refusal.account.tooMany',
  'Use a password of 10 to 200 characters.': 'refusal.account.weakPassword',
  'That email and password do not match.': 'refusal.account.badCredentials',
  'Enter your name and a valid email address.': 'refusal.account.nameEmail',
  'An account with this email already exists. Sign in instead.': 'refusal.account.exists',
  'An account with this email already exists. Sign in to it instead.': 'refusal.account.existsSignIn',
  'Your current password is not correct.': 'refusal.account.currentPassword',
  'Sign in first.': 'refusal.account.signIn',
  'Sign in to see your account.': 'refusal.account.signInAccount',
  'Sign in to see your invoice.': 'refusal.account.signInInvoice',
  'Complete the check that shows you are a person, then try again.': 'refusal.account.captcha',
  'We could not run the check that shows you are a person. Try again in a minute.':
    'refusal.account.captchaDown',
  'Email is not set up yet. Contact the store or your admin.': 'refusal.account.emailOff',
  'This link has expired or was already used. Ask for a new one.': 'refusal.account.linkExpired',
  'Too many sign-ins at once. Try again in a few seconds.': 'refusal.account.busy',
  'Demo sign-in is off.': 'refusal.account.demoOff',
  'That shopper does not exist at this store.': 'refusal.account.noShopper',
  // The store assistant
  'The assistant model is not configured.': 'refusal.ai.off',
  'Too many messages. Try again in a minute.': 'refusal.ai.tooMany',
  'The assistant model did not answer.': 'refusal.ai.failed',
  'Send a message of 500 characters or fewer.': 'refusal.ai.long',
  // Any route
  'Something went wrong on our side.': 'refusal.any.internal',
}

/** Refusals with a number or a name in them. Each pattern's groups fill the key's placeholders in order. */
export const REFUSAL_PATTERNS: [RegExp, MessageKey, ...string[]][] = [
  [/^Only (\d+) left of one item\. Lower the quantity to continue\.$/, 'refusal.order.fewLeft', 'count'],
  [
    /^(.+) has only (\d+) left\. Lower the quantity or choose another option\.$/,
    'refusal.order.fewOption',
    'option',
    'count',
  ],
  [/^Only (\d+) of one item can still be returned\.$/, 'account.returns.block.only', 'count'],
  [
    /^The (\d+)-working-day return window for this order has closed\.$/,
    'account.returns.block.windowWorking',
    'days',
  ],
  [/^The (\d+)-day return window for this order has closed\.$/, 'account.returns.block.windowDays', 'days'],
  [/^not found$/, 'refusal.any.notFound'],
  [/^store not found$/, 'refusal.any.storeNotFound'],
  [/^order not found$/, 'refusal.any.orderNotFound'],
  [/^return not found$/, 'refusal.any.returnNotFound'],
  [/^The request body is not valid JSON: /, 'refusal.any.badJson'],
  [/^no access to tenant /, 'refusal.any.noAccess'],
]

/** A text for each problem code a shop route returns, used when the map does not know its sentence. */
export const REFUSAL_CODES: Record<string, MessageKey> = {
  RATE_LIMITED: 'refusal.account.tooMany',
  UNAUTHENTICATED: 'refusal.account.signIn',
  FORBIDDEN: 'refusal.code.forbidden',
  NOT_FOUND: 'refusal.code.notFound',
  BUSY: 'refusal.code.busy',
  INTERNAL: 'refusal.any.internal',
  TOO_LARGE: 'refusal.code.tooLarge',
  WEAK_PASSWORD: 'refusal.account.weakPassword',
  BAD_CREDENTIALS: 'refusal.account.badCredentials',
  ACCOUNT_EXISTS: 'refusal.account.exists',
  TERMS_NOT_ACCEPTED: 'refusal.order.terms',
  PRICE_CHANGED: 'refusal.order.priceChanged',
  LINK_EXPIRED: 'refusal.account.linkExpired',
  CAPTCHA_FAILED: 'refusal.account.captcha',
  CAPTCHA_UNAVAILABLE: 'refusal.code.unavailable',
  EMAIL_OFF: 'refusal.account.emailOff',
  AI_OFF: 'refusal.code.aiOff',
  AI_FAILED: 'refusal.code.unavailable',
}

/** A response without a problem document (a proxy's 502, say) carries only its HTTP status. */
function statusKey(code: string): MessageKey | undefined {
  const status = /^HTTP_(\d{3})$/.exec(code)?.[1]
  if (!status) return undefined
  if (status === '401') return 'refusal.account.signIn'
  if (status === '403') return 'refusal.code.forbidden'
  if (status === '404') return 'refusal.code.notFound'
  if (status === '413') return 'refusal.code.tooLarge'
  if (status === '429') return 'refusal.account.tooMany'
  if (status.startsWith('5')) return 'refusal.code.unavailable'
  return undefined
}

/** A refusal in the shopper's language: the server's English sentence, with its problem code if any. */
export function refusalText(message: string, code?: string): string {
  const fixed = REFUSAL_SENTENCES[message]
  if (fixed) return t(fixed)
  for (const [pattern, key, ...names] of REFUSAL_PATTERNS) {
    const match = pattern.exec(message)
    if (match) return t(key, Object.fromEntries(names.map((name, i) => [name, match[i + 1]!])))
  }
  const byCode = code ? (REFUSAL_CODES[code] ?? statusKey(code)) : undefined
  return byCode ? t(byCode) : message
}

/** What to tell the shopper about a failed request: the API's refusal translated, else that the store did not answer. */
export function problemText(err: unknown): string {
  return err instanceof ApiError ? refusalText(err.message, err.code) : t('account.noAnswer')
}
