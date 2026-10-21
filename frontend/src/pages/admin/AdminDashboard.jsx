import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, ShoppingCart, DollarSign, Users, Building2, Package, ArrowLeft } from 'lucide-react';
import { adminService } from '../../services/admin.service';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KpiCard = ({ label, value, icon: Icon, color, sub }) => (
  <div className="card stat-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
    <div style={{ width: 52, height: 52, borderRadius: '14px', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={24} color={color} />
    </div>
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', fontWeight: 600 }}>{label}</div>
      <div style={{ color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>{sub}</div>}
    </div>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([adminService.getStats(), adminService.getBranches()])
      .then(([s, b]) => {
        setStats(s.data);
        setBranches(b.data.branches);
      })
      .catch(() => toast.error('حدث خطأ في تحميل البيانات'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة تحكم المدير</h1>
          <p className="page-subtitle">نظرة عامة على أداء جميع الفروع</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-overlay" style={{ minHeight: '400px' }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: '16px', marginBottom: '28px' }}>
            <KpiCard label="إجمالي المبيعات" value={fmt(stats?.total_sales) + ' ج.م'} icon={TrendingUp} color="var(--success)" />
            <KpiCard label="إجمالي المشتريات" value={fmt(stats?.total_purchases) + ' ج.م'} icon={ShoppingCart} color="var(--warning)" />
            <KpiCard label="إجمالي المصروفات" value={fmt(stats?.total_expenses) + ' ج.م'} icon={DollarSign} color="var(--danger)" />
            <KpiCard label="رصيد الخزينة الكلي" value={fmt(stats?.total_treasury) + ' ج.م'} icon={DollarSign} color="var(--primary)" />
            <KpiCard label="عدد العملاء" value={stats?.total_customers} icon={Users} color="#8b5cf6" />
            <KpiCard label="الفروع النشطة" value={stats?.branches_count} icon={Building2} color="#06b6d4" />
          </div>

          {/* Branches grid */}
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 700, margin: '0 0 16px' }}>الفروع</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
              {branches.map(branch => (
                <div
                  key={branch.id}
                  className="card stat-card"
                  onClick={() => navigate(`/admin/branches/${branch.id}`)}
                  style={{ cursor: 'pointer', padding: '20px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={20} color="#fff" />
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '1.1rem' }}>{branch.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>كود: {branch.code}</div>
                      </div>
                    </div>
                    <div style={{ color: 'var(--primary)' }}><ArrowLeft size={18} /></div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: '10px', marginTop: '16px' }}>
                    {[
                      { label: 'المبيعات', val: fmt(branch.sales_total), color: 'var(--success)' },
                      { label: 'المشتريات', val: fmt(branch.purchases_total), color: 'var(--warning)' },
                      { label: 'المصروفات', val: fmt(branch.expenses_total), color: 'var(--danger)' },
                      { label: 'الخزينة', val: fmt(branch.treasury_total), color: 'var(--primary)' },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '10px 12px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>{label}</div>
                        <div style={{ color, fontWeight: 700, fontSize: '1rem' }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                    <span style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem' }}>
                      {branch.user_count} مستخدم
                    </span>
                    <span style={{ background: branch.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: branch.is_active ? 'var(--success)' : 'var(--danger)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem' }}>
                      {branch.is_active ? 'نشط' : 'موقوف'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
