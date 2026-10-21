import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import Header from '../../components/layout/Header';

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const getPageTitle = () => {
    const path = location.pathname;
    if (path.includes('/branches/')) return 'تفاصيل الفرع';
    if (path.includes('/branches')) return 'إدارة الفروع';
    if (path.includes('/users')) return 'المستخدمون';
    return 'لوحة تحكم المدير';
  };

  return (
    <div className="app-layout">
      <AdminSidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      
      <main className="main-content">
        <Header toggleSidebar={toggleSidebar} title={getPageTitle()} />
        <div className="page-wrapper">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
