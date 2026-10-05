/** Routes of the seller app. Build every in-app link through these. */
export const paths = {
  home: '/',
  login: '/login',
  leads: (tab?: string) => (tab && tab !== 'open' ? `/leads?tab=${tab}` : '/leads'),
  lead: (id: string) => `/leads/${id}`,
  customers: '/customers',
  customer: (id: string) => `/customers/${id}`,
  store: '/store',
}
