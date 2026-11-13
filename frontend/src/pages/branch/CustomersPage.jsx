import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, CircleDollarSign, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { customerService } from '../../services/customer.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const CustomersPage = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueValues, setUniqueValues] = useState({ names: [], phones: [] });
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  // Adjustment Modal states
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedCustomerForAdjust, setSelectedCustomerForAdjust] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    type: 'credit', // 'credit' (له) or 'debit' (عليه)
    amount: '',
    reason: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });
  const [adjustHistory, setAdjustHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Confirm Delete Modal states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  
  // Form states
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCustomers = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const response = await customerService.getCustomers(params);
      setCustomers(response.data.customers);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب بيانات العملاء');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    customerService.getUniqueValues().then(res => {
      setUniqueValues({
        names: res.data.names || [],
        phones: res.data.phones || []
      });
    }).catch(console.error);
  }, [fetchCustomers]);

  const handleOpenModal = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({ 
        name: customer.name, 
        phone: customer.phone || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', phone: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', total_payments: '', customer_total: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return toast.error('اسم العميل مطلوب');
    }

    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        await customerService.updateCustomer(editingCustomer.id, formData);
        toast.success('تم تحديث بيانات العميل بنجاح');
      } else {
        await customerService.addCustomer(formData);
        toast.success('تم إضافة العميل بنجاح');
      }
      handleCloseModal();
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id) => {
    setCustomerToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await customerService.deleteCustomer(customerToDelete);
      toast.success('تم حذف العميل بنجاح');
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'لا يمكن حذف هذا العميل');
    } finally {
      setCustomerToDelete(null);
      setIsConfirmOpen(false);
    }
  };

  const handleOpenAdjustModal = async (customer) => {
    setSelectedCustomerForAdjust(customer);
    setAdjustForm({
      type: 'credit',
      amount: '',
      reason: '',
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    setShowHistory(false);
    setIsAdjustModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await customerService.getBalanceHistory(customer.id);
      setAdjustHistory(res.data || []);
    } catch {
      setAdjustHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomerForAdjust) return;
    const amt = parseFloat(adjustForm.amount);
    if (!amt || amt <= 0) {
      return toast.error('أدخل مبلغ صحيح أكبر من الصفر');
    }

    setIsSubmitting(true);
    try {
      const res = await customerService.adjustBalance(selectedCustomerForAdjust.id, {
        ...adjustForm,
        amount: amt,
      });
      toast.success(res.message || 'تم تعديل رصيد العميل بنجاح');
      setIsAdjustModalOpen(false);
      setSelectedCustomerForAdjust(null);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تعديل الرصيد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'اسم العميل' },
    { key: 'phone', label: 'رقم الهاتف', render: (row) => row.phone || '—' },
    { key: 'total_payments', label: 'الرصيد الدائن (له)', render: (row) => <span style={{ color: Number(row.total_payments) > 0 ? 'var(--success)' : 'inherit', fontWeight: Number(row.total_payments) > 0 ? 600 : 'normal' }}>{Number(row.total_payments).toFixed(2)} ج.م</span> },
    { key: 'customer_total', label: 'إجمالي المديونية (عليه)', render: (row) => <span style={{ color: Number(row.customer_total) > 0 ? 'var(--danger)' : 'inherit', fontWeight: Number(row.customer_total) > 0 ? 600 : 'normal' }}>{Number(row.customer_total).toFixed(2)} ج.م</span> },
    { key: 'remaining_balance', label: 'صافي الحساب', render: (row) => {
        const bal = Number(row.remaining_balance);
        const color = bal > 0 ? 'var(--danger)' : bal < 0 ? 'var(--success)' : 'inherit';
        return <span style={{ color, fontWeight: 'bold' }}>{bal === 0 ? 'خالص (0.00 ج.م)' : `${Math.abs(bal).toFixed(2)} ج.م ${bal > 0 ? '(عليه)' : '(له)'}`}</span>;
      }
    }
  ];

  const renderActions = (row) => (
    <>
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => handleOpenAdjustModal(row)}
        style={{ color: '#2563eb' }}
        title="إضافة رصيد للعميل (له أو عليه)"
      >
        <CircleDollarSign size={17} />
      </button>
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
      key: 'name',
      label: 'اسم العميل',
      type: 'multi-select',
      options: uniqueValues.names.map(n => ({ label: n, value: n }))
    },
    {
      key: 'phone',
      label: 'رقم الهاتف',
      type: 'multi-select',
      options: uniqueValues.phones.map(p => ({ label: p, value: p }))
    },
    {
      key: 'balance_type',
      label: 'حالة الرصيد',
      type: 'select',
      options: [
        { label: 'رصيد عليه (مدين)', value: 'debtor' },
        { label: 'رصيد له (دائن)', value: 'creditor' },
        { label: 'بدون رصيد', value: 'zero' },
      ]
    }
  ];

  return (
    <>
      <DataTable
        title="إدارة العملاء"
        columns={columns}
        data={customers}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchCustomers}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">اسم العميل *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="أدخل اسم العميل ثلاثي"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">رقم الهاتف</label>
            <input
              type="tel"
              className="form-input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="مثال: 01012345678"
            />
          </div>

          
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={handleCloseModal}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setCustomerToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا العميل؟ (لا يمكن حذف عميل لديه فواتير أو أرصدة سابقة)"
      />

      {/* Modal: Customer Balance Adjustment */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => {
          setIsAdjustModalOpen(false);
          setSelectedCustomerForAdjust(null);
        }}
        title={`إضافة رصيد للعميل: ${selectedCustomerForAdjust?.name || ''}`}
      >
        {selectedCustomerForAdjust && (
          <div>
            {/* Current Balance Display */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                background: '#f8fafc',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                marginBottom: 16,
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>الرصيد الدائن (له)</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#16a34a' }}>
                  {Number(selectedCustomerForAdjust.total_payments || 0).toFixed(2)} ج.م
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>إجمالي المديونية (عليه)</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#dc2626' }}>
                  {Number(selectedCustomerForAdjust.customer_total || 0).toFixed(2)} ج.م
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>صافي الحساب</div>
                <div
                  style={{
                    fontSize: '1rem',
                    fontWeight: 800,
                    color:
                      Number(selectedCustomerForAdjust.remaining_balance) > 0
                        ? '#dc2626'
                        : Number(selectedCustomerForAdjust.remaining_balance) < 0
                        ? '#16a34a'
                        : '#64748b',
                  }}
                >
                  {Number(selectedCustomerForAdjust.remaining_balance) === 0
                    ? '0.00 ج.م'
                    : `${Math.abs(Number(selectedCustomerForAdjust.remaining_balance)).toFixed(2)} ج.م ${
                        Number(selectedCustomerForAdjust.remaining_balance) > 0 ? '(عليه)' : '(له)'
                      }`}
                </div>
              </div>
            </div>

            <form onSubmit={handleAdjustSubmit}>
              {/* Type Switcher: Credit vs Debit */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  background: '#f1f5f9',
                  padding: 4,
                  borderRadius: 10,
                  marginBottom: 16,
                }}
              >
                <button
                  type="button"
                  onClick={() => setAdjustForm((prev) => ({ ...prev, type: 'credit' }))}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: adjustForm.type === 'credit' ? '#16a34a' : 'transparent',
                    color: adjustForm.type === 'credit' ? '#fff' : '#64748b',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  🟢 إضافة رصيد له (دائن)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustForm((prev) => ({ ...prev, type: 'debit' }))}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: adjustForm.type === 'debit' ? '#dc2626' : 'transparent',
                    color: adjustForm.type === 'debit' ? '#fff' : '#64748b',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  🔴 إضافة دين عليه (مدين)
                </button>
              </div>

              {/* Explanatory text */}
              <div
                style={{
                  background: adjustForm.type === 'credit' ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${adjustForm.type === 'credit' ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: 8,
                  padding: '8px 12px',
                  marginBottom: 14,
                  fontSize: '0.82rem',
                  color: adjustForm.type === 'credit' ? '#166534' : '#991b1b',
                  fontWeight: 600,
                }}
              >
                {adjustForm.type === 'credit'
                  ? '✨ سيتم زيادة رصيد العميل الدائن (يزيد المبلغ اللي له في حسابه).'
                  : '⚠️ سيتم زيادة مديونية العميل (يزيد المبلغ المطلوب منه).'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">التاريخ *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={adjustForm.date}
                    onChange={(e) => setAdjustForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">المبلغ (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={adjustForm.amount}
                    onChange={(e) => setAdjustForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                    style={{
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      color: adjustForm.type === 'credit' ? '#16a34a' : '#dc2626',
                    }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">البيان / سبب التعديل</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: رصيد افتتاحي، تسوية فرق حساب، خصم إضافي..."
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm((prev) => ({ ...prev, reason: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 1,
                    background: adjustForm.type === 'credit' ? '#16a34a' : '#dc2626',
                    borderColor: adjustForm.type === 'credit' ? '#16a34a' : '#dc2626',
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'جاري الحفظ...' : adjustForm.type === 'credit' ? 'تأكيد إضافة رصيد له' : 'تأكيد إضافة دين عليه'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsAdjustModalOpen(false)}
                >
                  إلغاء
                </button>
              </div>
            </form>

            {/* Adjustments History Toggle */}
            <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: 0,
                }}
              >
                <History size={16} />
                <span>{showHistory ? 'إخفاء سجل التسويات السابقة' : `عرض سجل التسويات السابقة (${adjustHistory.length})`}</span>
              </button>

              {showHistory && (
                <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <tr>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>التاريخ</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center' }}>النوع</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center' }}>المبلغ</th>
                        <th style={{ padding: '6px 10px', textAlign: 'right' }}>السبب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adjustHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: 12, color: '#94a3b8' }}>
                            لا توجد تسويات سابقة لهذا العميل
                          </td>
                        </tr>
                      ) : (
                        adjustHistory.map((h) => (
                          <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 10px' }}>{format(new Date(h.date), 'yyyy/MM/dd')}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              <span
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: h.type === 'credit' ? '#f0fdf4' : '#fef2f2',
                                  color: h.type === 'credit' ? '#16a34a' : '#dc2626',
                                }}
                              >
                                {h.type === 'credit' ? 'له (دائن)' : 'عليه (مدين)'}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: '6px 10px',
                                textAlign: 'center',
                                fontWeight: 700,
                                color: h.type === 'credit' ? '#16a34a' : '#dc2626',
                              }}
                            >
                              {Number(h.amount).toFixed(2)} ج.م
                            </td>
                            <td style={{ padding: '6px 10px', color: '#64748b' }}>{h.reason || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default CustomersPage;
