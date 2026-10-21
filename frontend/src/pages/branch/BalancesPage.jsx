import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { balanceService } from '../../services/balance.service';
import { customerService } from '../../services/customer.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const BalancesPage = () => {
  const [balances, setBalances] = useState([]);
  const [customersList, setCustomersList] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [balanceToDelete, setBalanceToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '', // for new customer
    isNewCustomer: false,
    invoice_amount: '',
    paid_amount: '',
    notes: ''
  });

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await balanceService.getBalances(params);
      setBalances(res.data.balances);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب الأرصدة');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCustomersForSelect = async () => {
    try {
      // Fetch up to 1000 customers for the dropdown
      const res = await customerService.getCustomers({ limit: 1000 });
      setCustomersList(res.data.customers);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchCustomersForSelect();
  }, [fetchData]);

  const handleOpenModal = (balance = null) => {
    if (balance) {
      setEditingBalance(balance);
      setFormData({
        date: format(new Date(balance.date), 'yyyy-MM-dd'),
        customer_id: balance.customer_id,
        customer_name: '',
        isNewCustomer: false,
        invoice_amount: balance.invoice_amount,
        paid_amount: balance.paid_amount,
        notes: balance.notes || ''
      });
    } else {
      setEditingBalance(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        customer_id: '',
        customer_name: '',
        isNewCustomer: false,
        invoice_amount: '',
        paid_amount: '',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date) return toast.error('التاريخ مطلوب');
    if (!formData.isNewCustomer && !formData.customer_id) return toast.error('يرجى اختيار العميل');
    if (formData.isNewCustomer && !formData.customer_name.trim()) return toast.error('يرجى إدخال اسم العميل');
    if (!formData.invoice_amount && !formData.paid_amount) return toast.error('يجب إدخال قيمة الفاتورة أو المدفوع');

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        invoice_amount: Number(formData.invoice_amount || 0),
        paid_amount: Number(formData.paid_amount || 0),
      };

      if (editingBalance) {
        await balanceService.updateBalance(editingBalance.id, payload);
        toast.success('تم تحديث الرصيد بنجاح');
      } else {
        await balanceService.addBalance(payload);
        toast.success('تم إضافة الرصيد بنجاح');
        if (formData.isNewCustomer) fetchCustomersForSelect(); // Refresh list if new customer was created
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id) => {
    setBalanceToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!balanceToDelete) return;
    try {
      await balanceService.deleteBalance(balanceToDelete);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setBalanceToDelete(null);
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'customer_name', label: 'اسم العميل' },
    { key: 'invoice_amount', label: 'قيمة الفاتورة/المسحوب', render: (row) => `${Number(row.invoice_amount).toFixed(2)}` },
    { key: 'paid_amount', label: 'المدفوع', render: (row) => `${Number(row.paid_amount).toFixed(2)}` },
    { key: 'remaining_balance', label: 'الرصيد (عليه)', render: (row) => <span style={{color: 'var(--danger)'}}>{Number(row.remaining_balance).toFixed(2)}</span> },
    { key: 'customer_credit', label: 'الرصيد (له)', render: (row) => <span style={{color: 'var(--success)'}}>{Number(row.customer_credit).toFixed(2)}</span> },
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
      key: 'customer_id',
      label: 'اسم العميل',
      type: 'select',
      options: customersList.map(c => ({ label: c.name, value: c.id }))
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range'
    }
  ];

  return (
    <>
      <DataTable
        title="أرصدة العملاء"
        columns={columns}
        data={balances}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBalance ? 'تعديل رصيد' : 'إضافة رصيد / حركة'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input
              type="date"
              className="form-input"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>

          {!editingBalance && (
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="newCust"
                checked={formData.isNewCustomer}
                onChange={(e) => setFormData({ ...formData, isNewCustomer: e.target.checked, customer_id: '', customer_name: '' })}
              />
              <label htmlFor="newCust" className="form-label" style={{ margin: 0 }}>عميل جديد؟</label>
            </div>
          )}

          {formData.isNewCustomer && !editingBalance ? (
            <div className="form-group">
              <label className="form-label">اسم العميل الجديد *</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل اسم العميل"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
              />
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">اختر العميل *</label>
              <select
                className="form-select"
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                disabled={!!editingBalance}
              >
                <option value="">-- اختر --</option>
                {customersList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">قيمة الفاتورة (إن وجدت)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={formData.invoice_amount}
                onChange={(e) => setFormData({ ...formData, invoice_amount: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">المدفوع (إن وجد)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-textarea"
              rows="3"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            ></textarea>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setBalanceToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا الرصيد؟"
      />
    </>
  );
};

export default BalancesPage;
