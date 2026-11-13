import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, Printer, Plus, Trash, Layers, Landmark, Eye, X, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { expensesService } from '../../services/expenses.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import PrintableExpenseVoucher from '../../components/expenses/PrintableExpenseVoucher';

const ExpensesPage = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueValues, setUniqueValues] = useState({ descriptions: [] });
  
  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multi-item Mode
  const [isMultiItem, setIsMultiItem] = useState(false);
  const [itemsList, setItemsList] = useState([{ description: '', amount: '', notes: '' }]);

  // Print Voucher Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedExpenseForPrint, setSelectedExpenseForPrint] = useState(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    amount: '',
    recipient_name: '',
    channel: 'cash',
    notes: '',
    override_reason: '',
    receipt_image: null
  });

  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);

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
      const parsedItems = Array.isArray(item.items) && item.items.length > 0 ? item.items : [];
      setIsMultiItem(parsedItems.length > 0);
      setItemsList(parsedItems.length > 0 ? parsedItems : [{ description: item.description || '', amount: item.amount || '', notes: '' }]);
      setFormData({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        description: item.description || '',
        amount: item.amount || '',
        recipient_name: item.recipient_name || '',
        channel: item.channel || 'cash',
        notes: item.notes || '',
        override_reason: item.override_reason || '',
        receipt_image: item.receipt_image || null
      });
    } else {
      setEditingItem(null);
      setIsMultiItem(false);
      setItemsList([{ description: '', amount: '', notes: '' }]);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        description: '',
        amount: '',
        recipient_name: '',
        channel: 'cash',
        notes: '',
        override_reason: '',
        receipt_image: null
      });
    }
    setOverrideData({ required: false, message: '' });
    setIsModalOpen(true);
  };

  const handleAddItem = () => {
    setItemsList([...itemsList, { description: '', amount: '', notes: '' }]);
  };

  const handleRemoveItem = (index) => {
    if (itemsList.length <= 1) return;
    const updated = itemsList.filter((_, idx) => idx !== index);
    setItemsList(updated);
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...itemsList];
    updated[index][field] = value;
    setItemsList(updated);

    if (field === 'amount') {
      const sum = updated.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      setFormData(prev => ({ ...prev, amount: sum > 0 ? sum : '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let finalAmount = Number(formData.amount);
    let finalDesc = formData.description.trim();
    let payloadItems = [];

    if (isMultiItem) {
      const validItems = itemsList.filter(it => it.description.trim() && Number(it.amount) > 0);
      if (validItems.length === 0) {
        return toast.error('يرجى إدخال بند واحد على الأقل بمبلغ صحيح');
      }
      finalAmount = validItems.reduce((s, it) => s + Number(it.amount), 0);
      finalDesc = validItems.map(it => it.description.trim()).join(' + ');
      payloadItems = validItems;
    }

    if (!formData.date || !finalDesc || finalAmount <= 0) {
      return toast.error('التاريخ والوصف والمبلغ مطلوبة');
    }

    if (overrideData.required && !formData.override_reason.trim()) {
      return toast.error('يرجى إدخال سبب التجاوز لإتمام العملية');
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        description: finalDesc,
        amount: finalAmount,
        items: payloadItems
      };
      
      let savedExpense = null;
      if (editingItem) {
        const res = await expensesService.updateExpense(editingItem.id, payload);
        savedExpense = res.data;
        toast.success('تم تحديث المصروف بنجاح');
      } else {
        const res = await expensesService.addExpense(payload);
        savedExpense = res.data;
        toast.success('تم إضافة المصروف بنجاح');
      }
      
      setIsModalOpen(false);
      fetchData();

      // Open print voucher option for new expense
      if (!editingItem && savedExpense) {
        setSelectedExpenseForPrint(savedExpense);
        setIsPrintModalOpen(true);
      }
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

  const channelLabels = {
    cash: 'نقدي (كاش)',
    wallet: 'محفظة إلكترونية',
    instapay: 'انستاباي',
    bank: 'إيداع بنكي'
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    {
      key: 'description',
      label: 'بند المصروف',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.description}</div>
          {Array.isArray(row.items) && row.items.length > 1 && (
            <div style={{ fontSize: '0.75rem', color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Layers size={11} /> {row.items.length} بنود فرعية
            </div>
          )}
        </div>
      )
    },
    { key: 'recipient_name', label: 'المستلم / الجهة', render: (row) => row.recipient_name || '—' },
    {
      key: 'channel',
      label: 'طريقة الصرف',
      render: (row) => (
        <span style={{
          display: 'inline-block', background: 'rgba(2, 132, 199, 0.08)', color: '#0369a1',
          padding: '2px 7px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 600
        }}>
          {channelLabels[row.channel] || channelLabels.cash}
        </span>
      )
    },
    {
      key: 'amount',
      label: 'المبلغ',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{t.toFixed(2)} ج.م</span>,
      render: (row) => <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{Number(row.amount).toFixed(2)}</span>
    },
    {
      key: 'receipt_image',
      label: 'إيصال البنك',
      render: (row) => row.receipt_image ? (
        <button
          type="button"
          onClick={() => setSelectedReceiptModal(row.receipt_image)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
            borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700
          }}
          title="عرض صورة الإيصال البنكي"
        >
          <Eye size={13} /> عرض الإيصال
        </button>
      ) : '—'
    },
    { key: 'notes', label: 'ملاحظات', render: (row) => row.notes || '—' },
    { key: 'override_reason', label: 'سبب العجز (إن وجد)', render: (row) => row.override_reason ? <span style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>{row.override_reason}</span> : '—' }
  ];

  const renderActions = (row) => (
    <>
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => { setSelectedExpenseForPrint(row); setIsPrintModalOpen(true); }}
        title="طباعة سند الصرف"
        style={{ color: '#dc2626' }}
      >
        <Printer size={16} />
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
      key: 'description',
      label: 'بند المصروف',
      type: 'multi-select',
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
        title="المصروفات وسندات الصرف"
        columns={columns}
        data={expenses}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'تعديل مصروف / سند صرف' : 'تسجيل مصروف جديد (سند صرف)'}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">التاريخ *</label>
              <input
                type="date"
                className="form-input"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                disabled={overrideData.required}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">طريقة الصرف (الخزينة) *</label>
              <select
                className="form-select"
                value={formData.channel}
                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                disabled={overrideData.required}
              >
                <option value="cash">نقدي (كاش)</option>
                <option value="wallet">محفظة إلكترونية</option>
                <option value="instapay">انستاباي</option>
                <option value="bank">إيداع بنكي</option>
              </select>
            </div>
          </div>

          {/* Bank Receipt Upload for Expenses */}
          {formData.channel === 'bank' && (
            <div className="form-group" style={{
              background: 'rgba(217, 119, 6, 0.05)', border: '1.5px dashed #d97706',
              borderRadius: 10, padding: '12px 14px', marginBottom: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Landmark size={14} color="#d97706" /> صورة إيصال التحويل / الإيداع البنكي *
                </label>
                {formData.receipt_image && (
                  <button
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, receipt_image: null }))}
                    style={{
                      background: '#fee2e2', color: '#dc2626', border: 'none',
                      borderRadius: 6, padding: '2px 8px', fontSize: '0.72rem',
                      fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <X size={12} /> حذف الصورة
                  </button>
                )}
              </div>
              {formData.receipt_image ? (
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={formData.receipt_image}
                    alt="إيصال البنك"
                    style={{ maxHeight: 150, maxWidth: '100%', borderRadius: 8, border: '1px solid #fed7aa', objectFit: 'contain' }}
                  />
                </div>
              ) : (
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px', borderRadius: 8, background: '#fff', border: '1px dashed #cbd5e1',
                  cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#b45309'
                }}>
                  <Upload size={16} />
                  انقر لاختيار صورة إيصال البنك
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => setFormData(p => ({ ...p, receipt_image: ev.target.result }));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">يُصرف إلى السيد / الجهة (اختياري)</label>
            <input
              type="text"
              className="form-input"
              placeholder="اسم المستلم أو العامل أو الجهة المصروف لها..."
              value={formData.recipient_name}
              onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
              disabled={overrideData.required}
            />
          </div>

          {/* Mode Switch: Single Item vs Multi Item */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(2, 132, 199, 0.06)', padding: '10px 14px', borderRadius: '8px',
            marginBottom: '16px', border: '1px solid rgba(2, 132, 199, 0.15)'
          }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0369a1' }}>
              نوع المصروف: {isMultiItem ? 'متعدد البنود' : 'بند واحد'}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                fontSize: '0.78rem', background: isMultiItem ? '#0284c7' : '#fff',
                color: isMultiItem ? '#fff' : '#0284c7', border: '1px solid #0284c7'
              }}
              onClick={() => setIsMultiItem(!isMultiItem)}
            >
              {isMultiItem ? 'التحويل لبند واحد' : 'تحويل لمتعدد البنود ➕'}
            </button>
          </div>

          {/* Single Item Inputs */}
          {!isMultiItem ? (
            <>
              <div className="form-group">
                <label className="form-label">الوصف (بند المصروف) *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: كهرباء، بوفيه، رواتب، نثريات..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={overrideData.required}
                />
              </div>

              <div className="form-group">
                <label className="form-label">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  disabled={overrideData.required}
                />
              </div>
            </>
          ) : (
            /* Multi-item Inputs */
            <div style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontWeight: 700 }}>بنود إذن الصرف:</label>
              {itemsList.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px',
                  background: 'var(--bg-subtle, #f8fafc)', padding: '8px', borderRadius: '8px',
                  border: '1px solid var(--border)'
                }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 2 }}
                    placeholder={`بند ${idx + 1} (مثال: نثريات)`}
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    style={{ flex: 1.2 }}
                    placeholder="المبلغ"
                    value={item.amount}
                    onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                    required
                  />
                  {itemsList.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost"
                      style={{ color: 'var(--danger)', padding: 6 }}
                      onClick={() => handleRemoveItem(idx)}
                      title="حذف البند"
                    >
                      <Trash size={15} />
                    </button>
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={handleAddItem}
                >
                  <Plus size={14} /> إضافة بند آخر
                </button>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}>
                  إجمالي البنود: {Number(formData.amount || 0).toFixed(2)} ج.م
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">ملاحظات عامة (اختياري)</label>
            <textarea
              className="form-textarea"
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              disabled={overrideData.required}
            ></textarea>
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
              {overrideData.required ? 'تأكيد وحفظ رغم العجز' : 'حفظ وسند الصرف'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      {/* Printable Expense Voucher */}
      <PrintableExpenseVoucher
        isOpen={isPrintModalOpen}
        onClose={() => { setIsPrintModalOpen(false); setSelectedExpenseForPrint(null); }}
        expense={selectedExpenseForPrint}
      />

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

      {/* Receipt Image Preview Modal */}
      {selectedReceiptModal && (
        <Modal isOpen={Boolean(selectedReceiptModal)} onClose={() => setSelectedReceiptModal(null)} title="صورة إيصال التحويل / الإيداع البنكي">
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <img
              src={selectedReceiptModal}
              alt="إيصال الصرف البنكي"
              style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
            />
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSelectedReceiptModal(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default ExpensesPage;
