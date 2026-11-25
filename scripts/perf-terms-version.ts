// Prints a store's current terms version, which a storefront checkout must send (PP 80/2019 Pasal 46).
// The k6 checkout profile reads it from TERMS_VERSION. Usage: tsx scripts/perf-terms-version.ts <api origin> <store>
import { termsVersion } from '../packages/fixtures/src/legal.ts'
import type { PaymentType, Tenant } from '../packages/types/src/index.ts'

const [origin = 'http://localhost:8090', store = 'lari'] = process.argv.slice(2)
const res = await fetch(`${origin}/api/v1/shop/${store}/state`)
if (!res.ok) throw new Error(`store state answered ${res.status}`)
const { state } = (await res.json()) as { state: { tenants: Tenant[]; paymentTypes: PaymentType[] } }
console.log(termsVersion(state.tenants[0]!, state.paymentTypes))
