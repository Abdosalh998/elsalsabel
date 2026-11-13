import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import { format } from 'date-fns';
import { ArrowRight, TrendingUp, ShoppingCart, DollarSign, Users, Package, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import '../../components/common/DataTable.css';

const tabs = [
  { key: 'sales', label: 'المبيعات', icon: TrendingUp },
  { key: 'purchases', label: 'المشتريات', icon: ShoppingCart },
  { key: 'treasury', label: 'الخزينة', icon: Wallet },
  { key: 'customers', label: 'العملاء', icon: Users },
  { key: 'expenses', label: 'المصروفات', icon: DollarSign },
  { key: 'inventory', label: 'المخازن', icon: Package },
];

const fmt = (n) => Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => { try { return format(new Date(d), 'yyyy/MM/dd'); } catch { return d; } };

const AdminBranchView = () => {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('sales');
  const [branch, setBranch] = useState(null);
  const [data, setData] = useState([]);
  const [treasury, setTreasury] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminService.getBranches().then(r => {
      const b = r.data.branches.find(b => b.id === parseInt(branchId));
      setBranch(b);
    });
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    const fetchFns = {
      sales: () => adminService.getBranchSales(branchId),
      purchases: () => adminService.getBranchPurchases(branchId),
      customers: () => adminService.getBranchCustomers(branchId),
      expenses: () => adminService.getBranchExpenses(branchId),
      inventory: () => adminService.getBranchInventory(branchId),
      treasury: () => adminService.getBranchTreasury(branchId),
    };
    fetchFns[activeTab]()
      .then(r => {
        if (activeTab === 'treasury') {
          setTreasury(r.data);
          const allT = [
            ...(r.data.records || []),
            ...(r.data.expenses || []),
            ...(r.data.purchases || []),
            ...(r.data.transfers_out || []),
            ...(r.data.transfers_in || [])
          ].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
          setData(allT);
        } else {
          const key = activeTab === 'sales' ? 'sales'
            : activeTab === 'purchases' ? 'purchases'
            : activeTab === 'customers' ? 'customers'
            : activeTab === 'expenses' ? 'expenses'
            : 'inventory';
          setData(r.data[key] || []);
        }
      })
      .catch(() => toast.error('حدث خطأ في التحميل'))
      .finally(() => setLoading(false));
  }, [activeTab, branchId]);

  const renderTable = () => {
    if (loading) return <div className="loading-overlay" style={{ minHeight: '300px' }}><div className="spinner" /></div>;
    if (!data.length) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>لا توجد بيانات</div>;

    const configs = {
      sales: [
        { h: 'التاريخ', r: r => fmtDate(r.date) },
        { h: 'العميل', r: r => r.customer_name || '-' },
        { h: 'المنتج', r: r => r.product || '-' },
        { h: 'الكمية', r: r => r.quantity },
        { h: 'السعر', r: r => fmt(r.unit_price) },
        { h: 'الإجمالي', r: r => <span style={{ color: 'var(--success)', fontWeight: 700 }}>{fmt(r.total)}</span> },
        { h: 'المدفوع', r: r => fmt(r.paid_amount) },
      ],
      purchases: [
        { h: 'التاريخ', r: r => fmtDate(r.date) },
        { h: 'المورد', r: r => r.supplier_name || '-' },
        { h: 'المنتج', r: r => r.product },
        { h: 'الكمية', r: r => r.quantity },
        { h: 'الإجمالي', r: r => <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{fmt(r.total)}</span> },
      ],
      treasury: [
        { h: 'التاريخ', r: r => fmtDate(r.date) },
        { h: 'النوع', r: r => <span style={{ color: (r.source === 'treasury' || r.source === 'transfer_in') ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{(r.source === 'treasury' || r.source === 'transfer_in') ? 'وارد' : 'صادر'}</span> },
        { h: 'المبلغ', r: r => <span style={{ color: (r.source === 'treasury' || r.source === 'transfer_in') ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{fmt(r.amount)}</span> },
        { h: 'البيان', r: r => r.notes || '-' },
      ],
      customers: [
        { h: 'الاسم', r: r => r.name },
        { h: 'الهاتف', r: r => r.phone || '-' },
        { h: 'إجمالي الفواتير', r: r => fmt(r.customer_total) },
        { h: 'المدفوع', r: r => fmt(r.total_payments) },
        { h: 'الرصيد', r: r => <span style={{ color: r.remaining_balance > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>{fmt(r.remaining_balance)}</span> },
      ],
      expenses: [
        { h: 'التاريخ', r: r => fmtDate(r.date) },
        { h: 'البيان', r: r => r.description },
        { h: 'المبلغ', r: r => <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(r.amount)}</span> },
        { h: 'ملاحظات', r: r => r.notes || '-' },
      ],
      inventory: [
        { h: 'التاريخ', r: r => fmtDate(r.date) },
        { h: 'الشركة', r: r => r.company || '-' },
        { h: 'المنتج', r: r => r.product },
        { h: 'الوزن', r: r => r.weight_quantity },
        { h: 'العدد', r: r => r.count },
        { h: 'المباع', r: r => <span style={{ color: 'var(--warning)' }}>{r.issued_quantity}</span> },
        { h: 'المتاح', r: r => <span style={{ color: 'var(--success)', fontWeight: 700 }}>{r.available_quantity}</span> },
        { h: 'الإجمالي', r: r => fmt(r.total) },
      ],
    };
    const cols = configs[activeTab] || [];

    return (
      <div className="table-container datatable-wrapper">
        <table className="datatable">
          <thead>
            <tr>
              {cols.map(c => <th key={c.h} style={{ textAlign: 'right' }}>{c.h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {cols.map((c, j) => <td key={j}>{c.r(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate('/admin/branches')} className="btn btn-secondary" style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowRight size={18} />
          </button>
          <div>
            <h1 className="page-title">{branch?.name || '...'}</h1>
            <p className="page-subtitle">كود: {branch?.code}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {branch && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '20px' }}>
          {[
            { label: 'المبيعات', val: fmt(branch.sales_total), color: 'var(--success)' },
            { label: 'المشتريات', val: fmt(branch.purchases_total), color: 'var(--warning)' },
            { label: 'المصروفات', val: fmt(branch.expenses_total), color: 'var(--danger)' },
            { label: 'الخزينة', val: fmt(branch.treasury_total), color: 'var(--primary)' },
          ].map(({ label, val, color }) => (
            <div key={label} className="card stat-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{label}</div>
              <div style={{ color, fontWeight: 700, fontSize: '1.2rem' }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Treasury totals */}
      {activeTab === 'treasury' && treasury?.totals && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'الوارد', val: fmt(treasury.totals.total_in), color: 'var(--success)' },
            { label: 'الصادر', val: fmt(treasury.totals.total_out), color: 'var(--danger)' },
            { label: 'الصافي', val: fmt(treasury.totals.net), color: 'var(--primary)' },
          ].map(({ label, val, color }) => (
            <div key={label} className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{label}: </span>
              <span style={{ color, fontWeight: 700, fontSize: '1.1rem' }}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="card" style={{ display: 'flex', gap: '4px', marginBottom: '20px', padding: '6px', flexWrap: 'wrap' }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`btn ${activeTab === key ? 'btn-primary' : ''}`}
            style={{
              background: activeTab === key ? 'var(--primary)' : 'transparent',
              color: activeTab === key ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: '6px', border: 'none', boxShadow: 'none'
            }}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        {renderTable()}
      </div>
    </div>
  );
};

export default AdminBranchView;
