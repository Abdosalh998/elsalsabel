import { useState, useEffect } from 'react';
import { adminService } from '../../services/admin.service';
import { Users, Plus, Edit, Trash2, X, Shield, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import '../../components/common/DataTable.css';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'branch_user', branch_id: '', is_active: true });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [uRes, bRes] = await Promise.all([adminService.getUsers(), adminService.getBranches()]);
      setUsers(uRes.data.users);
      setBranches(bRes.data.branches);
    } catch (e) {
      toast.error('خطأ في التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openAdd = () => {
    setForm({ username: '', password: '', full_name: '', role: 'branch_user', branch_id: branches[0]?.id || '', is_active: true });
    setModal({ mode: 'add' });
  };
  const openEdit = (u) => {
    setForm({ username: u.username, password: '', full_name: u.full_name || '', role: u.role, branch_id: u.branch_id || '', is_active: u.is_active });
    setModal({ mode: 'edit', id: u.id });
  };

  const handleSubmit = async () => {
    if (!form.username || !form.role) return toast.error('بيانات غير مكتملة');
    if (modal.mode === 'add' && !form.password) return toast.error('كلمة المرور مطلوبة');
    if (form.role === 'branch_user' && !form.branch_id) return toast.error('يجب اختيار الفرع');

    setSubmitting(true);
    const data = { ...form };
    if (data.role === 'admin') data.branch_id = null;
    if (modal.mode === 'edit' && !data.password) delete data.password;

    try {
      if (modal.mode === 'add') await adminService.addUser(data);
      else await adminService.updateUser(modal.id, data);
      toast.success(modal.mode === 'add' ? 'تم إنشاء المستخدم' : 'تم تحديث المستخدم');
      setModal(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('تأكيد حذف المستخدم؟')) return;
    try {
      await adminService.deleteUser(id);
      toast.success('تم الحذف');
      fetchData();
    } catch (e) {
      toast.error('خطأ في الحذف');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">إدارة المستخدمين</h1>
          <p className="page-subtitle">إنشاء وإدارة حسابات المستخدمين</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> إضافة مستخدم
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay" style={{ minHeight: '400px' }}><div className="spinner" /></div>
      ) : (
        <div className="card table-container datatable-wrapper">
          <table className="datatable">
            <thead>
              <tr>
                <th>الاسم / اسم المستخدم</th>
                <th>الدور</th>
                <th>الفرع</th>
                <th>الحالة</th>
                <th style={{ textAlign: 'left' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.full_name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{u.username}</div>
                  </td>
                  <td>
                    <span style={{ 
                      background: u.role === 'admin' ? 'rgba(139,92,246,0.1)' : 'rgba(14,165,233,0.1)',
                      color: u.role === 'admin' ? '#8b5cf6' : '#0ea5e9',
                      padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem',
                      display: 'inline-flex', alignItems: 'center', gap: '6px'
                    }}>
                      {u.role === 'admin' ? <Shield size={14} /> : <Users size={14} />}
                      {u.role === 'admin' ? 'مدير نظام' : 'مستخدم فرع'}
                    </span>
                  </td>
                  <td>
                    {u.branch_name ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                        <Building2 size={16} style={{ color: 'var(--text-muted)' }} /> {u.branch_name}
                      </span>
                    ) : '-'}
                  </td>
                  <td>
                    <span style={{ color: u.is_active ? 'var(--success)' : 'var(--danger)', fontSize: '0.85rem' }}>
                      {u.is_active ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button onClick={() => openEdit(u)} className="btn btn-icon" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}><Edit size={16} /></button>
                      <button onClick={() => handleDelete(u.id)} className="btn btn-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>لا يوجد مستخدمين</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{modal.mode === 'add' ? 'مستخدم جديد' : 'تعديل مستخدم'}</h3>
              <button onClick={() => setModal(null)} className="close-btn"><X size={20} /></button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">الاسم بالكامل</label>
                <input className="form-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">اسم المستخدم (للدخول) *</label>
                <input className="form-input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} dir="ltr" />
              </div>
              <div className="form-group">
                <label className="form-label">كلمة المرور {modal.mode === 'edit' && '(اتركها فارغة لعدم التغيير)'}</label>
                <input className="form-input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} dir="ltr" />
              </div>
              <div className="form-group">
                <label className="form-label">الدور</label>
                <select className="form-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="branch_user">مستخدم فرع</option>
                  <option value="admin">مدير نظام</option>
                </select>
              </div>
              
              {form.role === 'branch_user' && (
                <div className="form-group">
                  <label className="form-label">الفرع *</label>
                  <select className="form-input" value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
                    <option value="">-- اختر الفرع --</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {modal.mode === 'edit' && (
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" id="is_active_u" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  <label htmlFor="is_active_u" style={{ color: 'var(--text-primary)', cursor: 'pointer' }}>حساب نشط</label>
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

export default AdminUsers;
