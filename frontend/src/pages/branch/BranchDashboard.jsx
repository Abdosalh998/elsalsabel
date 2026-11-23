import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Users, Package, ShoppingCart, Landmark, TrendingUp, TrendingDown, AlertTriangle, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../services/api';
import toast from 'react-hot-toast';

const StatCard = ({ title, value, sub, icon: Icon, color, link, onClick }) => (
  <div
    className="card stat-card"
    onClick={onClick}
    style={{ cursor: onClick ? 'pointer' : 'default', transition: 'all 0.22s' }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px' }}>
      <div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>{title}</p>
        <p style={{ fontSize: '1.65rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</p>
        {sub && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px' }}>{sub}</p>}
      </div>
      <div style={{ background: `${color}18`, color, padding: '14px', borderRadius: '14px', flexShrink: 0 }}>
        <Icon size={26} />
      </div>
    </div>
  </div>
);

const BranchDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/dashboard/stats');
        setStats(data.data);
      } catch (err) {
        toast.error('تعذّر تحميل بيانات اللوحة');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const fmt = (n) => Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="loading-overlay" style={{ minHeight: '400px' }}>
        <div className="spinner" />
      </div>
    );
  }

  const balance = stats?.treasury?.current_balance ?? 0;

  return (
    <div style={{ direction: 'rtl', width: '100%', boxSizing: 'border-box' }}>
      {/* Welcome bar */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.3rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
          مرحباً، {user?.full_name} 👋
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          إليك ملخص شهر {format(new Date(), 'MMMM yyyy')} لفرعك.
        </p>
      </div>

      {/* KPI Grid */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          title="رصيد الخزينة الحالي"
          value={`${fmt(balance)} ج.م`}
          icon={Landmark}
          color={balance >= 0 ? '#16A34A' : '#DC2626'}
          onClick={() => navigate('/branch/treasury')}
        />
        <StatCard
          title="مبيعات الشهر"
          value={`${fmt(stats?.sales?.total_sales)} ج.م`}
          sub={`${stats?.sales?.invoices_count} فاتورة — محصّل: ${fmt(stats?.sales?.total_collected)}`}
          icon={ShoppingCart}
          color="#0284C7"
          onClick={() => navigate('/branch/sales')}
        />
        <StatCard
          title="مديونية العملاء"
          value={`${fmt(stats?.sales?.total_remaining)} ج.م`}
          sub="المتبقي غير المسدد هذا الشهر"
          icon={Users}
          color="#D97706"
          onClick={() => navigate('/branch/customers')}
        />
        <StatCard
          title="العملاء النشطون"
          value={stats?.customers?.count ?? 0}
          sub={`${stats?.inventory?.items_count} صنف في المخزن`}
          icon={Package}
          color="#7C3AED"
          onClick={() => navigate('/branch/inventory')}
        />
      </div>

      {/* Second row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
        <StatCard
          title="مصروفات الشهر"
          value={`${fmt(stats?.expenses?.total_expenses)} ج.م`}
          icon={TrendingDown}
          color="#DC2626"
          onClick={() => navigate('/branch/expenses')}
        />
        <StatCard
          title="مشتريات الشهر"
          value={`${fmt(stats?.purchases?.total_purchases)} ج.م`}
          icon={TrendingUp}
          color="#0284C7"
          onClick={() => navigate('/branch/purchases')}
        />
        <StatCard
          title="إجمالي وزن المخزن المتاح"
          value={`${Number(stats?.inventory?.total_available_weight ?? 0).toFixed(2)} كجم`}
          sub={`${stats?.inventory?.items_count ?? 0} صنف — ${stats?.inventory?.total_rolls ?? 0} لفة`}
          icon={BarChart2}
          color="#059669"
          onClick={() => navigate('/branch/inventory')}
        />
      </div>

      {/* Bottom 2 col */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '16px' }}>
        {/* Recent Sales */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">أحدث الفواتير</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/branch/sales')}>عرض الكل</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            {stats?.recent_sales?.length === 0 ? (
              <p className="empty-state" style={{ padding: '32px' }}>لا توجد فواتير بعد</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.88rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>رقم</th>
                    <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>العميل</th>
                    <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>الإجمالي</th>
                    <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.recent_sales?.map((s) => (
                    <tr key={s.invoice_number}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>#{s.invoice_number}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{s.customer_name}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>{fmt(s.total)}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: Number(s.remaining_balance) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                        {fmt(s.remaining_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="card">
          <div className="card-header" style={{ gap: '8px' }}>
            <h3 className="card-title">
              <AlertTriangle size={18} style={{ color: 'var(--warning)', marginLeft: '6px', verticalAlign: 'middle' }} />
              تنبيهات المخزون المنخفض
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/branch/inventory')}>المخزن</button>
          </div>
          <div style={{ padding: '8px 0' }}>
            {stats?.low_stock?.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '32px', color: 'var(--success)', fontWeight: 600 }}>✓ مخزون جيد لجميع الأصناف</p>
            ) : (
              stats?.low_stock?.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{item.product}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>الأصلي: {Number(item.weight_quantity).toFixed(3)}</p>
                  </div>
                  <span style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '4px 12px', borderRadius: '99px', fontWeight: 700, fontSize: '0.85rem' }}>
                    متبقي: {Number(item.available_quantity).toFixed(3)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchDashboard;
