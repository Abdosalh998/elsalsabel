import { useState, useEffect, useCallback } from 'react';
import { Edit, Plus, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { treasuryService } from '../../services/treasury.service';
import { customerService } from '../../services/customer.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const TreasuryPage = () => {
  const [treasury, setTreasury] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [treasuryToDelete, setTreasuryToDelete] = useState(null);

  // Debt Offset Modal (المقاصة)
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtInfo, setDebtInfo] = useState({ invoices: [], total_debt: 0 });
  const [pendingPayload, setPendingPayload] = useState(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    payment_type_id: '',
    amount: '',
    notes: ''
  });

  const [newTypeName, setNewTypeName] = useState('');

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await treasuryService.getTreasury(params);
      setTreasury(res.data.treasury);
      setCurrentBalance(res.data.currentBalance);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب الخزينة');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDropdowns = async () => {
    try {
      const [custRes, typeRes] = await Promise.all([
        customerService.getCustomers({ limit: 1000 }),
        treasuryService.getPaymentTypes()
      ]);
      setCustomers(custRes.data.customers);
      setPaymentTypes(typeRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDropdowns();
  }, [fetchData]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        customer_id: item.customer_id || '',
        customer_name: '',
        customer_phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        payment_type_id: item.payment_type_id || '',
        amount: item.amount,
        notes: item.notes || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        payment_type_id: '',
        amount: '',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  // ── Execute the actual API call ──────────────────────────────────────────
  const executeSubmit = async (payload) => {
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await treasuryService.updateTreasury(editingItem.id, payload);
        toast.success('تم تحديث الحركة بنجاح');
      } else {
        await treasuryService.addTreasury(payload);
        toast.success('تم إضافة الحركة بنجاح');
        if (formData.isNewCustomer) fetchDropdowns();
      }
      setIsModalOpen(false);
      setDebtModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
      setPendingPayload(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.payment_type_id || !formData.amount) {
      return toast.error('التاريخ ونوع الدفع والمبلغ مطلوبة');
    }

    if (formData.isNewCustomer && !formData.customer_name.trim()) {
      return toast.error('يرجى إدخال اسم العميل الجديد');
    }

    const payload = {
      ...formData,
      amount: Number(formData.amount),
      apply_debt_offset: false,
    };

    if (formData.isNewCustomer) {
      delete payload.customer_id;
    } else {
      delete payload.customer_name;
      delete payload.customer_phone;
    }
    delete payload.isNewCustomer;

    // Check outstanding invoices only for existing customers on new entries
    if (!editingItem && formData.customer_id) {
      try {
        const res = await customerService.getOutstandingInvoices(formData.customer_id);
        const outstanding = res.data;
        if (outstanding.invoices && outstanding.invoices.length > 0 && outstanding.total_debt > 0) {
          setDebtInfo(outstanding);
          setPendingPayload(payload);
          setDebtModalOpen(true);
          return;
        }
      } catch (err) {
        console.error('Failed to check outstanding invoices', err);
      }
    }

    await executeSubmit(payload);
  };

  const handleDeleteClick = (id) => {
    setTreasuryToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!treasuryToDelete) return;
    try {
      await treasuryService.deleteTreasury(treasuryToDelete);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setTreasuryToDelete(null);
    }
  };

  const handleAddPaymentType = async (e) => {
    e.preventDefault();
    if (!newTypeName.trim()) return toast.error('أدخل اسم النوع');
    try {
      await treasuryService.addPaymentType(newTypeName);
      toast.success('تم إضافة نوع الدفع');
      setNewTypeName('');
      setIsTypeModalOpen(false);
      fetchDropdowns();
    } catch (error) {
      toast.error('حدث خطأ أثناء الإضافة');
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'customer_name', label: 'العميل', render: (row) => row.customer_name || '—' },
    { key: 'payment_type', label: 'نوع الدفع' },
    { key: 'amount', label: 'المبلغ (إيداع)', render: (row) => <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{Number(row.amount).toFixed(2)}</span> },
    { key: 'notes', label: 'ملاحظات', render: (row) => row.notes || '—' }
  ];

  const renderActions = (row) => (
    <>
      <button className="btn btn-icon btn-ghost" onClick={() => handleOpenModal(row)} title="تعديل">
        <Edit size={16} />
      </button>
      <button className="btn btn-icon btn-ghost" onClick={() => handleDeleteClick(row.id)} style={{ color: 'var(--danger)' }} title="حذف">
        <Trash2 size={16} />
      </button>
    </>
  );

  const filterConfig = [
    {
      key: 'payment_type_id',
      label: 'نوع الدفع',
      type: 'select',
      options: paymentTypes.map(p => ({ label: p.name, value: p.id }))
    },
    {
      key: 'customer_id',
      label: 'العميل',
      type: 'select',
      options: customers.map(c => ({ label: c.name, value: c.id }))
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range'
    }
  ];

  return (
    <>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '8px' }}>إدارة الخزينة</h2>
          <p style={{ color: 'var(--text-muted)' }}>متابعة حركات الخزينة (الإيداعات). المشتريات والمصروفات تخصم تلقائياً.</p>
        </div>
        <div className="card" style={{ padding: '16px 24px', background: 'var(--primary)', color: 'white' }}>
          <span style={{ fontSize: '0.9rem', opacity: 0.9, display: 'block', marginBottom: '4px' }}>رصيد الخزينة الحالي</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold' }}>{currentBalance.toFixed(2)} ج.م</span>
        </div>
      </div>

      <DataTable
        title="حركات الخزينة الواردة"
        columns={columns}
        data={treasury}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      {/* Main Treasury Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'تعديل إيداع خزينة' : 'إضافة إيداع للخزينة'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">العميل (اختياري - في حال سداد المديونية)</label>
            {!editingItem && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  id="treasuryNewCustomer"
                  checked={formData.isNewCustomer}
                  onChange={(e) => setFormData({ ...formData, isNewCustomer: e.target.checked, customer_id: '', customer_name: '', customer_phone: '' })}
                />
                <label htmlFor="treasuryNewCustomer" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>عميل جديد؟</label>
              </div>
            )}

            {formData.isNewCustomer && !editingItem ? (
              <>
                <input
                  type="text"
                  className="form-input"
                  placeholder="أدخل اسم العميل الجديد"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  autoFocus
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="رقم الهاتف (اختياري)"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  style={{ marginTop: '8px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="checkbox"
                    id="saveNewCustomerTreasury"
                    checked={formData.saveNewCustomer}
                    onChange={(e) => setFormData({ ...formData, saveNewCustomer: e.target.checked })}
                  />
                  <label htmlFor="saveNewCustomerTreasury" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>حفظ العميل في السجل الدائم</label>
                </div>
              </>
            ) : (
              <select className="form-select" value={formData.customer_id} onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })} disabled={!!editingItem}>
                <option value="">-- بدون عميل محدد --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>نوع الدفع *</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsTypeModalOpen(true)}>
                <Plus size={14} /> إضافة نوع جديد
              </button>
            </div>
            <select className="form-select" value={formData.payment_type_id} onChange={(e) => setFormData({ ...formData, payment_type_id: e.target.value })}>
              <option value="">-- اختر نوع الدفع --</option>
              {paymentTypes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">المبلغ *</label>
            <input type="number" step="0.01" min="0" className="form-input" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea className="form-textarea" rows="2" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}></textarea>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>حفظ</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      {/* Payment Type Modal */}
      <Modal isOpen={isTypeModalOpen} onClose={() => setIsTypeModalOpen(false)} title="إضافة نوع دفع جديد">
        <form onSubmit={handleAddPaymentType}>
          <div className="form-group">
            <label className="form-label">اسم نوع الدفع (مثال: فودافون كاش) *</label>
            <input type="text" className="form-input" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>حفظ</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsTypeModalOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      {/* ── Debt Offset Modal (المقاصة) ─────────────────────────────────────── */}
      {debtModalOpen && pendingPayload && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '16px', padding: '28px',
            width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                background: 'rgba(245,158,11,0.15)', borderRadius: '50%',
                width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <AlertTriangle size={24} color="#f59e0b" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>تنبيه: يوجد دين غير مسدد</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  هذا العميل لديه فواتير مبيعات غير مسددة
                </p>
              </div>
            </div>

            {/* Summary */}
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '10px', padding: '14px 18px', marginBottom: '20px',
              display: 'flex', gap: '32px', flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>إجمالي الدين</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  {Number(debtInfo.total_debt).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>قيمة الإيداع</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {Number(pendingPayload?.amount || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ما سيتم مقاصته</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {Math.min(Number(debtInfo.total_debt), Number(pendingPayload?.amount || 0)).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>رصيد للعميل بعدها</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {Math.max(0, Number(pendingPayload?.amount || 0) - Number(debtInfo.total_debt)).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Invoices Table */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                الفواتير الغير مسددة ({debtInfo.invoices.length} فاتورة)
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['رقم الفاتورة', 'التاريخ', 'إجمالي الفاتورة', 'المدفوع', 'المتبقي'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {debtInfo.invoices.map((inv, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 12px' }}>#{inv.invoice_number}</td>
                        <td style={{ padding: '8px 12px' }}>{format(new Date(inv.date), 'yyyy/MM/dd')}</td>
                        <td style={{ padding: '8px 12px' }}>{Number(inv.invoice_amount).toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--success)' }}>{Number(inv.paid_amount).toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--danger)', fontWeight: 'bold' }}>{Number(inv.remaining).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, minWidth: '180px' }}
                disabled={isSubmitting}
                onClick={() => executeSubmit({ ...pendingPayload, apply_debt_offset: true })}
              >
                ✅ تطبيق المقاصة والحفظ
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, minWidth: '180px', border: '1px solid var(--border-color)' }}
                disabled={isSubmitting}
                onClick={() => executeSubmit({ ...pendingPayload, apply_debt_offset: false })}
              >
                متابعة بدون مقاصة
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, minWidth: '120px', color: 'var(--danger)' }}
                disabled={isSubmitting}
                onClick={() => { setDebtModalOpen(false); setPendingPayload(null); }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setTreasuryToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذه الحركة؟"
      />
    </>
  );
};

export default TreasuryPage;