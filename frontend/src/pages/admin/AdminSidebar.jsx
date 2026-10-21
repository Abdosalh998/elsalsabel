import { NavLink } from 'react-router-dom';
import { 
  Building2, 
  Users, 
  LayoutDashboard,
  LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import '../../components/layout/Layout.css';
import logo from '../../assets/logo.jpg';

const AdminSidebar = ({ isOpen, toggleSidebar }) => {
  const { logout, user } = useAuth();

  const menuItems = [
    { name: 'لوحة تحكم المدير', path: '/admin', icon: LayoutDashboard, exact: true },
    { name: 'الفروع', path: '/admin/branches', icon: Building2 },
    { name: 'المستخدمون', path: '/admin/users', icon: Users },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={toggleSidebar}></div>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src={logo} alt="السلسبيل" className="sidebar-logo" />
          <h2 className="sidebar-title">السلسبيل</h2>
          <p className="sidebar-subtitle">إدارة النظام</p>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (window.innerWidth <= 768) toggleSidebar();
              }}
            >
              <item.icon className="sidebar-icon" size={20} />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link logout-btn" onClick={logout}>
            <LogOut className="sidebar-icon" size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
