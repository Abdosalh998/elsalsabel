import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { expensesService } from '../../services/expenses.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const ExpensesPage = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueValues, setUniqueValues] = useState({ descriptions: [] });
  
  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    amount: '',
    notes: '',
    override_reason: ''
  });

  const [overrideData, setOverrideData] = useState({
    required: false,
    message: ''
  });

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await expensesService.getExpenses(params);
      setExpenses(res.data.expenses);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب المصروفات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    expensesService.getUniqueValues().then(res => {
      setUniqueValues({ descriptions: res.data.descriptions || [] });
    }).catch(console.error);
  }, [fetchData]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        description: item.description,
        amount: item.amount,
        notes: item.notes || '',
        override_reason: item.override_reason || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        amount: '',
        notes: '',
        override_reason: ''
      });
    }
    setOverrideData({ required: false, message: '' });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.description || !formData.amount) {
      return toast.error('التاريخ والوصف والمبلغ مطلوبة');
    }

    if (overrideData.required && !formData.override_reason.trim()) {
      return toast.error('يرجى إدخال سبب التجاوز لإتمام العملية');
    }

    setIsSubmitting(true);
    try {
      const payload = { ...formData, amount: Number(formData.amount) };
      
      if (editingItem) {
        await expensesService.updateExpense(editingItem.id, payload);
        toast.success('تم تحديث المصروف بنجاح');
      } else {
        await expensesService.addExpense(payload);
        toast.success('تم إضافة المصروف بنجاح');
      }
      
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      if (error.response?.data?.requiresOverride) {
        setOverrideData({
          required: true,
          message: error.response.data.message
        });
        toast.error('يرجى توضيح سبب العجز');
      } else {
        toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id) => {
    setExpenseToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    try {
      await expensesService.deleteExpense(expenseToDelete);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setExpenseToDelete(null);
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'description', label: 'بند المصروف' },
    { key: 'amount', label: 'المبلغ', render: (row) => <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{Number(row.amount).toFixed(2)}</span> },
    { key: 'notes', label: 'ملاحظات', render: (row) => row.notes || '—' },
    { key: 'override_reason', label: 'سبب العجز (إن وجد)', render: (row) => row.override_reason ? <span style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>{row.override_reason}</span> : '—' }
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
      key: 'description',
      label: 'بند المصروف',
      type: 'select',
      options: uniqueValues.descriptions.map(d => ({ label: d, value: d }))
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
        title="المصروفات"
        columns={columns}
        data={expenses}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'تعديل مصروف' : 'إضافة مصروف'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} disabled={overrideData.required} />
          </div>

          <div className="form-group">
            <label className="form-label">الوصف (بند المصروف) *</label>
            <input type="text" className="form-input" placeholder="مثال: كهرباء، رواتب..." value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} disabled={overrideData.required} />
          </div>

          <div className="form-group">
            <label className="form-label">المبلغ *</label>
            <input type="number" step="0.01" min="0" className="form-input" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} disabled={overrideData.required} />
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات (اختياري)</label>
            <textarea className="form-textarea" rows="2" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} disabled={overrideData.required}></textarea>
          </div>

          {overrideData.required && (
            <div className="form-group" style={{ background: '#FFFBEB', padding: '16px', borderRadius: '8px', border: '1px solid #FEF3C7', marginTop: '16px' }}>
              <p style={{ color: '#D97706', marginBottom: '12px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                {overrideData.message}
              </p>
              <label className="form-label" style={{ color: '#92400E' }}>اكتب سبب تجاوز الرصيد المتاح: *</label>
              <textarea 
                className="form-textarea" 
                rows="2" 
                value={formData.override_reason} 
                onChange={(e) => setFormData({ ...formData, override_reason: e.target.value })}
                placeholder="أدخل السبب للمتابعة الإجبارية..."
                autoFocus
              ></textarea>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {overrideData.required ? 'تأكيد وحفظ رغم العجز' : 'حفظ'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setExpenseToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا المصروف؟"
      />
    </>
  );
};

export default ExpensesPage;
