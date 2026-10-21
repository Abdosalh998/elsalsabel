import { Menu, UserCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Header = ({ toggleSidebar, title }) => {
  const { user } = useAuth();

  return (
    <header className="header">
      <div className="header-left">
        <button className="hamburger-btn" onClick={toggleSidebar}>
          <Menu size={24} />
        </button>
        <h1 className="header-title">{title}</h1>
      </div>

      <div className="header-right">
        <div className="user-profile">
          <div className="user-info">
            <span className="user-name">{user?.full_name}</span>
            <span className="user-role">{user?.role === 'admin' ? 'مدير النظام' : 'مسؤول فرع'}</span>
          </div>
          <div className="user-avatar">
            <UserCircle size={32} strokeWidth={1.5} />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
