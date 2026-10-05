import { createBrowserRouter } from 'react-router'
import { RequireAuth } from './auth/auth'
import { MobileLayout } from './layouts/MobileLayout'
import { LoginPage } from './pages/auth/LoginPage'
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage'
import { CustomersPage } from './pages/customers/CustomersPage'
import { HomePage } from './pages/home/HomePage'
import { LeadDetailPage } from './pages/leads/LeadDetailPage'
import { LeadsPage } from './pages/leads/LeadsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { StorePage } from './pages/store/StorePage'
import { SellerScopeProvider } from './state/scope'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <SellerScopeProvider>
          <MobileLayout />
        </SellerScopeProvider>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'leads/:id', element: <LeadDetailPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'store', element: <StorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
