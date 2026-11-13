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
  LogOut,
  Zap,
  FileText,
  ArrowLeftRight,
  RotateCcw,
  Palette,
  HandCoins
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './Layout.css';
import logo from '../../assets/logo.jpg';

const Sidebar = ({ isOpen, toggleSidebar }) => {
  const { logout, user } = useAuth();

  const menuItems = [
    { name: 'الرئيسية', path: '/branch', icon: LayoutDashboard, exact: true },
    { name: 'المتحكم', path: '/branch/pos', icon: Zap, highlight: true },
    { name: 'العملاء', path: '/branch/customers', icon: Users },
    { name: 'أرصدة العملاء', path: '/branch/balances', icon: Wallet },
    { name: 'المخزن', path: '/branch/inventory', icon: Package },
    { name: 'المشتريات', path: '/branch/purchases', icon: Truck },
    { name: 'التلوين', path: '/branch/coloring', icon: Palette },
    { name: 'المبيعات', path: '/branch/sales', icon: ShoppingCart },
    { name: 'المرتجعات', path: '/branch/returns', icon: RotateCcw },
    { name: 'الخزينة', path: '/branch/treasury', icon: Landmark },
    { name: 'المصروفات', path: '/branch/expenses', icon: Receipt },
    { name: 'العهد', path: '/branch/custody', icon: HandCoins },
    { name: 'التحويلات', path: '/branch/transfers', icon: ArrowLeftRight },
    { name: 'التقارير', path: '/branch/reports', icon: FileText },
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
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''} ${item.highlight ? 'pos-highlight' : ''}`}
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
