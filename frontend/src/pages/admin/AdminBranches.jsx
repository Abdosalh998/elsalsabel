import { useState, useEffect } from 'react';
import { adminService } from '../../services/admin.service';
import { Building2, Plus, Edit, Trash2, X, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const AdminBranches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', address: '', is_active: true });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const fetch = () => {
    setLoading(true);
    adminService.getBranches()
      .then(r => setBranches(r.data.branches))
      .catch(() => toast.error('خطأ في التحميل'))
      .finally(() => setLoading(false));
  };

  useEffect(fetch, []);

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
      fetch();
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
      fetch();
    } catch (e) {
      toast.error(e.response?.data?.message || 'لا يمكن الحذف');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">إدارة الفروع</h1>
          <p className="page-subtitle">إنشاء وإدارة فروع الشركة</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> إضافة فرع
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay" style={{ minHeight: '400px' }}><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: '16px' }}>
          {branches.map(branch => (
            <div key={branch.id} className="card stat-card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={20} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{branch.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>كود: {branch.code} · {branch.user_count} مستخدم</div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => navigate(`/admin/branches/${branch.id}`)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>عرض</button>
                  <button onClick={() => openEdit(branch)} className="btn btn-icon" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}><Edit size={16} /></button>
                  <button onClick={() => handleDelete(branch.id)} className="btn btn-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: branch.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: branch.is_active ? 'var(--success)' : 'var(--danger)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {branch.is_active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {branch.is_active ? 'نشط' : 'موقوف'}
                </span>
                {branch.address && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>{branch.address}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{modal.mode === 'add' ? 'إضافة فرع جديد' : 'تعديل الفرع'}</h3>
              <button onClick={() => setModal(null)} className="close-btn"><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              {[
                { label: 'اسم الفرع *', key: 'name', placeholder: 'مثال: فرع القاهرة' },
                { label: 'كود الفرع *', key: 'code', placeholder: 'مثال: CAI' },
                { label: 'العنوان', key: 'address', placeholder: 'عنوان الفرع' },
              ].map(({ label, key, placeholder }) => (
                <div key={key} className="form-group">
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
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  <label htmlFor="is_active" style={{ color: 'var(--text-primary)', cursor: 'pointer' }}>الفرع نشط</label>
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
