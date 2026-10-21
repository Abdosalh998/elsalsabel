import { NavLink } from 'react-router-dom';
import { 
  Users, 
  Wallet, 
  Package, 
  ShoppingCart, 
  Landmark, 
  Receipt, 
  Truck,
  LayoutDashboard,
  LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';
import logo from '../../assets/logo.jpg';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { logout, user } = useAuth();

  const menuItems = [
    { name: 'الرئيسية', path: '/branch', icon: LayoutDashboard, exact: true },
    { name: 'العملاء', path: '/branch/customers', icon: Users },
    { name: 'أرصدة العملاء', path: '/branch/balances', icon: Wallet },
    { name: 'المخازن', path: '/branch/inventory', icon: Package },
    { name: 'المبيعات', path: '/branch/sales', icon: ShoppingCart },
    { name: 'الخزينة', path: '/branch/treasury', icon: Landmark },
    { name: 'المصروفات', path: '/branch/expenses', icon: Receipt },
    { name: 'المشتريات', path: '/branch/purchases', icon: Truck },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={toggleSidebar}></div>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <img src={logo} alt="السلسبيل" className="sidebar-logo" />
          <h2 className="sidebar-title">السلسبيل</h2>
          <p className="sidebar-subtitle">{user?.branch_name || 'لوحة الفرع'}</p>
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

export default Sidebar;
