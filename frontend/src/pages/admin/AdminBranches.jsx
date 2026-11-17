import { useState, useEffect, useMemo } from 'react';
import { adminService } from '../../services/admin.service';
import {
  Building2, Plus, Edit, Trash2, X, CheckCircle, XCircle,
  Search, Filter, ArrowUpDown, TrendingUp, ShoppingCart, DollarSign, Wallet,
  Eye, Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const fmt = (n) =>
  Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AdminBranches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', address: '', is_active: true });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('sales_desc');

  const fetchBranches = () => {
    setLoading(true);
    adminService.getBranches()
      .then(r => setBranches(r.data?.branches || []))
      .catch(() => toast.error('خطأ في تحميل الفروع'))
      .finally(() => setLoading(false));
  };

  useEffect(fetchBranches, []);

  // Summary KPIs across all branches
  const summary = useMemo(() => {
    return branches.reduce(
      (acc, b) => {
        acc.totalSales += Number(b.sales_total || 0);
        acc.totalTreasury += Number(b.treasury_total || 0);
        acc.totalPurchases += Number(b.purchases_total || 0);
        acc.totalExpenses += Number(b.expenses_total || 0);
        if (b.is_active) acc.activeCount += 1;
        return acc;
      },
      { totalSales: 0, totalTreasury: 0, totalPurchases: 0, totalExpenses: 0, activeCount: 0 }
    );
  }, [branches]);

  // Filtered & Sorted branches
  const filteredBranches = useMemo(() => {
    return branches
      .filter((b) => {
        if (statusFilter === 'active' && !b.is_active) return false;
        if (statusFilter === 'inactive' && b.is_active) return false;
        if (search) {
          const s = search.toLowerCase().trim();
          const matchName = (b.name || '').toLowerCase().includes(s);
          const matchCode = (b.code || '').toLowerCase().includes(s);
          const matchAddr = (b.address || '').toLowerCase().includes(s);
          if (!matchName && !matchCode && !matchAddr) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'sales_desc') return Number(b.sales_total || 0) - Number(a.sales_total || 0);
        if (sortBy === 'treasury_desc') return Number(b.treasury_total || 0) - Number(a.treasury_total || 0);
        if (sortBy === 'purchases_desc') return Number(b.purchases_total || 0) - Number(a.purchases_total || 0);
        if (sortBy === 'expenses_desc') return Number(b.expenses_total || 0) - Number(a.expenses_total || 0);
        if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '', 'ar');
        if (sortBy === 'id_asc') return a.id - b.id;
        return 0;
      });
  }, [branches, search, statusFilter, sortBy]);

  const openAdd = () => {
    setForm({ name: '', code: '', address: '', is_active: true });
    setModal({ mode: 'add' });
  };

  const openEdit = (b) => {
    setForm({ name: b.name, code: b.code, address: b.address || '', is_active: b.is_active });
    setModal({ mode: 'edit', id: b.id });
  };

  const handleSubmit = async () => {
    if (!form.name || !form.code) return toast.error('الاسم والكود مطلوبان');
    setSubmitting(true);
    try {
      if (modal.mode === 'add') {
        await adminService.addBranch(form);
        toast.success('تم إنشاء الفرع بنجاح');
      } else {
        await adminService.updateBranch(modal.id, form);
        toast.success('تم تحديث الفرع بنجاح');
      }
      setModal(null);
      fetchBranches();
    } catch (e) {
      toast.error(e.response?.data?.message || 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الفرع؟')) return;
    try {
      await adminService.deleteBranch(id);
      toast.success('تم حذف الفرع');
      fetchBranches();
    } catch (e) {
      toast.error(e.response?.data?.message || 'لا يمكن الحذف');
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">إدارة ومراقبة الفروع</h1>
          <p className="page-subtitle">متابعة الأداء المالي والتشغيلي لجميع الفروع وتتبع مؤشراتها الحية</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate('/admin/reports')}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            📊 تقارير الفروع الشاملة
          </button>
          <button
            onClick={openAdd}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={18} /> إضافة فرع جديد
          </button>
        </div>
      </div>

      {/* Top KPI Summary Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div className="card stat-card" style={{ padding: '16px 20px', borderTop: '3px solid #16a34a' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>إجمالي مبيعات الفروع</span>
            <TrendingUp size={18} color="#16a34a" />
          </div>
          <div style={{ color: '#16a34a', fontWeight: 800, fontSize: '1.35rem' }}>{fmt(summary.totalSales)} ج.م</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>عبر كل الفروع النشطة</div>
        </div>

        <div className="card stat-card" style={{ padding: '16px 20px', borderTop: '3px solid #2563eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>إجمالي رصيد الخزائن</span>
            <Wallet size={18} color="#2563eb" />
          </div>
          <div style={{ color: '#2563eb', fontWeight: 800, fontSize: '1.35rem' }}>{fmt(summary.totalTreasury)} ج.م</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>صافي السيولة النقدية المتاحة</div>
        </div>

        <div className="card stat-card" style={{ padding: '16px 20px', borderTop: '3px solid #d97706' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>إجمالي المشتريات</span>
            <ShoppingCart size={18} color="#d97706" />
          </div>
          <div style={{ color: '#d97706', fontWeight: 800, fontSize: '1.35rem' }}>{fmt(summary.totalPurchases)} ج.م</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>التوريدات والمشتريات المسجلة</div>
        </div>

        <div className="card stat-card" style={{ padding: '16px 20px', borderTop: '3px solid #dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>إجمالي المصروفات</span>
            <DollarSign size={18} color="#dc2626" />
          </div>
          <div style={{ color: '#dc2626', fontWeight: 800, fontSize: '1.35rem' }}>{fmt(summary.totalExpenses)} ج.م</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>المصاريف التشغيلية والإدارية</div>
        </div>

        <div className="card stat-card" style={{ padding: '16px 20px', borderTop: '3px solid #7c3aed' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>الفروع النشطة</span>
            <Building2 size={18} color="#7c3aed" />
          </div>
          <div style={{ color: '#7c3aed', fontWeight: 800, fontSize: '1.35rem' }}>
            {summary.activeCount} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {branches.length} فرع</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>
            {branches.length - summary.activeCount > 0 ? `${branches.length - summary.activeCount} فرع موقوف` : 'جميع الفروع تعمل'}
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div
        className="card"
        style={{
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', minWidth: 260, flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingRight: 36 }}
            placeholder="بحث باسم الفرع، الكود، أو العنوان..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={15} color="var(--text-muted)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>الحالة:</span>
          {[
            { key: 'all', label: 'الكل' },
            { key: 'active', label: 'نشطة فقط' },
            { key: 'inactive', label: 'موقوفة' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              style={{
                background: statusFilter === key ? 'var(--primary)' : 'var(--bg-secondary)',
                color: statusFilter === key ? '#fff' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowUpDown size={15} color="var(--text-muted)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>الترتيب:</span>
          <select
            className="form-input"
            style={{ width: 'auto', minWidth: 150, padding: '6px 10px', fontSize: '0.82rem' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="sales_desc">الأعلى مبيعات</option>
            <option value="treasury_desc">الأعلى رصيد خزينة</option>
            <option value="purchases_desc">الأعلى مشتريات</option>
            <option value="expenses_desc">الأعلى مصروفات</option>
            <option value="name_asc">الاسم (أبجدياً)</option>
            <option value="id_asc">تاريخ الإنشاء (الأقدم)</option>
          </select>
        </div>
      </div>

      {/* Branches Cards Grid */}
      {loading ? (
        <div className="loading-overlay" style={{ minHeight: '350px' }}><div className="spinner" /></div>
      ) : filteredBranches.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Building2 size={40} style={{ opacity: 0.3, marginBottom: 10 }} />
          <div>لا توجد فروع مطابقة لمعايير البحث والفلترة</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 370px), 1fr))', gap: '18px' }}>
          {filteredBranches.map((branch) => {
            const netProfitEst = Number(branch.sales_total || 0) - Number(branch.purchases_total || 0) - Number(branch.expenses_total || 0);

            return (
              <div
                key={branch.id}
                className="card stat-card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: branch.is_active ? '1px solid var(--border-color)' : '1px dashed #ef4444',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}
              >
                <div>
                  {/* Top Bar on Card */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: '12px',
                        background: branch.is_active ? 'var(--primary)' : '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Building2 size={22} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {branch.name}
                        </div>
                        <span
                          style={{
                            background: branch.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: branch.is_active ? 'var(--success)' : 'var(--danger)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.7rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontWeight: 700,
                          }}
                        >
                          {branch.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                          {branch.is_active ? 'نشط' : 'موقوف'}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                        كود: <strong>{branch.code}</strong> · {branch.user_count} مستخدم
                        {branch.address && ` · ${branch.address}`}
                      </div>
                    </div>

                    {/* Quick Edit/Delete */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => openEdit(branch)}
                        className="btn btn-icon"
                        title="تعديل الفرع"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: 6 }}
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(branch.id)}
                        className="btn btn-icon"
                        title="حذف الفرع"
                        style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', padding: 6 }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Financial Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                      background: 'var(--bg-secondary)',
                      padding: 12,
                      borderRadius: 10,
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>إجمالي المبيعات</div>
                      <div style={{ color: '#16a34a', fontWeight: 800, fontSize: '0.98rem' }}>{fmt(branch.sales_total)} ج.م</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>رصيد الخزينة</div>
                      <div style={{ color: '#2563eb', fontWeight: 800, fontSize: '0.98rem' }}>{fmt(branch.treasury_total)} ج.م</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>المشتريات</div>
                      <div style={{ color: '#d97706', fontWeight: 700, fontSize: '0.92rem' }}>{fmt(branch.purchases_total)} ج.م</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>المصروفات</div>
                      <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.92rem' }}>{fmt(branch.expenses_total)} ج.م</div>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => navigate(`/admin/branches/${branch.id}`)}
                    className="btn btn-primary"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 12px', fontSize: '0.85rem' }}
                  >
                    <Eye size={15} /> مراقبة وتتبع الفرع
                  </button>
                  <button
                    onClick={() => navigate(`/admin/reports?branchId=${branch.id}`)}
                    className="btn btn-secondary"
                    title="تقرير الفرع التفصيلي"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 12px', fontSize: '0.85rem' }}
                  >
                    📊 تقرير
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{modal.mode === 'add' ? 'إضافة فرع جديد' : 'تعديل بيانات الفرع'}</h3>
              <button onClick={() => setModal(null)} className="close-btn"><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              {[
                { label: 'اسم الفرع *', key: 'name', placeholder: 'مثال: فرع القاهرة / فرع الإسكندرية' },
                { label: 'كود الفرع *', key: 'code', placeholder: 'مثال: CAI' },
                { label: 'العنوان', key: 'address', placeholder: 'عنوان الفرع بالتفصيل' },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    placeholder={placeholder}
                  />
                </div>
              ))}
              
              {modal.mode === 'edit' && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: 10 }}>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                  />
                  <label htmlFor="is_active" style={{ color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>الفرع نشط ويعمل</label>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setModal(null)} className="btn btn-secondary">إلغاء</button>
              <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary">
                {submitting ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBranches;
