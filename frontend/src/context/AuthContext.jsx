import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/auth.service';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(() => localStorage.getItem('samh_token'));
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      const savedToken = localStorage.getItem('samh_token');
      if (!savedToken) { setLoading(false); return; }
      try {
        const { data } = await authService.getMe();
        setUser(data);
      } catch {
        localStorage.removeItem('samh_token');
        localStorage.removeItem('samh_user');
        setToken(null);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (username, password) => {
    const response = await authService.login(username, password);
    const { token: newToken, user: newUser } = response.data;
    localStorage.setItem('samh_token', newToken);
    localStorage.setItem('samh_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setToken(null);
    setUser(null);
  }, []);

  const isAdmin       = user?.role === 'admin';
  const isBranchUser  = user?.role === 'branch_user';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin, isBranchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
