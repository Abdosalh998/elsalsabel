import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const BranchLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Define page titles based on routes
  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/customers')) return 'إدارة العملاء';
    if (path.includes('/balances')) return 'أرصدة العملاء';
    if (path.includes('/inventory') || path.includes('/purchases')) return 'المخزن';
    if (path.includes('/sales')) return 'المبيعات';
    if (path.includes('/returns')) return 'المرتجعات';
    if (path.includes('/treasury')) return 'الخزينة';
    if (path.includes('/expenses')) return 'المصروفات';
    if (path.includes('/transfers')) return 'التحويلات';
    if (path.includes('/reports')) return 'التقارير';
    if (path.includes('/pos')) return '⚡ المتحكم الرئيسي';
    return 'الرئيسية';
  };

  // Sidebar is now a drawer on all screens, controlled by the user.

  return (
    <div className="app-layout">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

      <main className="main-content">
        <Header toggleSidebar={toggleSidebar} title={getPageTitle()} />
        <div className="page-wrapper">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default BranchLayout;
