import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import LoginPage from './pages/Login/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminBranches from './pages/admin/AdminBranches';
import AdminUsers from './pages/admin/AdminUsers';
import AdminBranchView from './pages/admin/AdminBranchView';
import BranchLayout from './components/layout/BranchLayout';
import BranchDashboard from './pages/branch/BranchDashboard';
import CustomersPage from './pages/branch/CustomersPage';
import BalancesPage from './pages/branch/BalancesPage';
import InventoryPage from './pages/branch/InventoryPage';
import SalesPage from './pages/branch/SalesPage';
import TreasuryPage from './pages/branch/TreasuryPage';
import ExpensesPage from './pages/branch/ExpensesPage';
import PurchasesPage from './pages/branch/PurchasesPage';
import './index.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: {
              fontFamily: 'Cairo, sans-serif',
              fontSize: '0.9rem',
              direction: 'rtl',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(15,35,64,0.15)',
            },
            success: {
              style: { background: '#DCFCE7', color: '#16A34A', border: '1px solid #BBF7D0' },
            },
            error: {
              style: { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' },
            },
          }}
        />

        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Admin */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={['admin']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="branches" element={<AdminBranches />} />
            <Route path="branches/:branchId" element={<AdminBranchView />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>

          {/* Branch — Phase 2 */}
          <Route
            path="/branch"
            element={
              <ProtectedRoute roles={['branch_user']}>
                <BranchLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<BranchDashboard />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="balances" element={<BalancesPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="treasury" element={<TreasuryPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="purchases" element={<PurchasesPage />} />
          </Route>


          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
