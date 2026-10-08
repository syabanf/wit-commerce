// apps/admin/src/i18n/en.ts
export const en = {
  breadcrumb: {
    // Commerce
    orders: 'Orders',
    orderDetail: (id: string) => `Order ${id}`,
    payments: 'Payments',
    products: 'Products',
    productDetail: (id: string) => `Product ${id}`,
    collections: 'Collections',
    categories: 'Categories',
    attributes: 'Attributes',
    modifiers: 'Modifiers',
    inventory: 'Inventory',
    // Store
    pages: 'Pages',
    pageDetail: (id: string) => `Page ${id}`,
    templates: 'Templates',
    brand: 'Brand',
    domains: 'Domains',
    // Customers
    allCustomers: 'All Customers',
    customerDetail: (id: string) => `Customer ${id}`,
    segments: 'Segments',
    segmentDetail: (id: string) => `Segment ${id}`,
    leads: 'Leads',
    leadDetail: (id: string) => `Lead ${id}`,
    loyalty: 'Loyalty',
    support: 'Support',
    // Marketing
    campaigns: 'Campaigns',
    campaignDetail: (id: string) => `Campaign ${id}`,
    automations: 'Automations',
    automationDetail: (id: string) => `Automation ${id}`,
    promotions: 'Promotions',
    // Sales
    sellers: 'Sellers',
    sellerDetail: (id: string) => `Seller ${id}`,
    performance: 'Performance',
    // Settings
    paymentTypes: 'Payment Types',
    users: 'Users',
    tenants: 'Tenants',
    newTenant: 'New Tenant',
    apps: 'Apps',
  },
  navigation: {
    dashboard: 'Dashboard',
    // add other navigation labels as needed
  },
};
