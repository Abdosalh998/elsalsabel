import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, AlertTriangle, PackagePlus, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { purchasesService } from '../../services/purchases.service';
import { customerService } from '../../services/customer.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const PurchasesPage = () => {
  const [purchases, setPurchases] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueValues, setUniqueValues] = useState({ products: [] });
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState(null);

  // Transfer to Inventory Modal States
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [itemToTransfer, setItemToTransfer] = useState(null);
  const [transferData, setTransferData] = useState({
    company: '',
    count: '',
    roll_price: '',
    weight_quantity: ''
  });
  const [isTransferring, setIsTransferring] = useState(false);

  // Debt Offset Modal
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtInfo, setDebtInfo] = useState({ invoices: [], total_debt: 0 });
  const [pendingPayload, setPendingPayload] = useState(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    product: '',
    quantity: '',
    discount: '0',
    total: '',
    notes: '',
    add_to_inventory: false,
    inventory_company: '',
    inventory_count: '',
    inventory_roll_price: '',
    inventory_weight: ''
  });

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await purchasesService.getPurchases(params);
      setPurchases(res.data.purchases);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب المشتريات');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await customerService.getCustomers({ limit: 1000 });
      setCustomers(res.data.customers);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchCustomers();
    purchasesService.getUniqueValues().then(res => {
      setUniqueValues({ products: res.data.products || [] });
    }).catch(console.error);
  }, [fetchData]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        customer_id: item.customer_id,
        customer_name: '',
        phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        product: item.product,
        quantity: item.quantity,
        discount: item.discount,
        total: item.total,
        notes: item.notes || '',
        add_to_inventory: false,
        inventory_company: '',
        inventory_count: '',
        inventory_roll_price: '',
        inventory_weight: ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        customer_id: '',
        customer_name: '',
        phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        product: '',
        quantity: '',
        discount: '0',
        total: '',
        notes: '',
        add_to_inventory: false,
        inventory_company: '',
        inventory_count: '',
        inventory_roll_price: '',
        inventory_weight: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenTransferModal = (purchase) => {
    setItemToTransfer(purchase);
    const qty = Number(purchase.quantity_after_discount || purchase.quantity || 0);
    setTransferData({
      company: '',
      count: '',
      roll_price: '',
      weight_quantity: qty > 0 ? qty : ''
    });
    setTransferModalOpen(true);
  };

  const handleExecuteTransfer = async (e) => {
    e.preventDefault();
    if (!itemToTransfer) return;
    if (!transferData.count || Number(transferData.count) <= 0) {
      return toast.error('يرجى تحديد عدد اللفات للمخزن');
    }
    if (!transferData.roll_price || Number(transferData.roll_price) < 0) {
      return toast.error('يرجى تحديد سعر بيع اللفة للمخزن');
    }

    setIsTransferring(true);
    try {
      await purchasesService.transferToInventory(itemToTransfer.id, transferData);
      toast.success('تم ترحيل الصنف إلى المخزن بنجاح 📦');
      setTransferModalOpen(false);
      setItemToTransfer(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'فشل الترحيل إلى المخزن');
    } finally {
      setIsTransferring(false);
    }
  };

  const executeSubmit = async (payload) => {
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await purchasesService.updatePurchase(editingItem.id, payload);
        toast.success('تم تحديث المشتريات بنجاح');
      } else {
        await purchasesService.addPurchase(payload);
        toast.success(payload.add_to_inventory ? 'تم تسجيل المشتريات وترحيلها للمخزن بنجاح 📦' : 'تم تسجيل المشتريات بنجاح');
        if (formData.isNewCustomer) fetchCustomers();
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
    if (!formData.date || !formData.product || !formData.total) {
      return toast.error('التاريخ والمنتج والمبلغ الإجمالي مطلوبة');
    }

    if (formData.isNewCustomer && !formData.customer_name.trim()) return toast.error('يرجى إدخال اسم المورد');

    if (formData.add_to_inventory) {
      if (!formData.inventory_count || Number(formData.inventory_count) <= 0) {
        return toast.error('يرجى تحديد عدد اللفات للمخزن');
      }
      if (!formData.inventory_roll_price || Number(formData.inventory_roll_price) < 0) {
        return toast.error('يرجى تحديد سعر بيع اللفة للمخزن');
      }
    }

    const payload = {
      ...formData,
      quantity: Number(formData.quantity || 0),
      discount: Number(formData.discount || 0),
      total: Number(formData.total || 0),
      apply_debt_offset: false,
    };

    // Check for outstanding invoices only when editing is not happening and customer is selected
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
    setPurchaseToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!purchaseToDelete) return;
    try {
      await purchasesService.deletePurchase(purchaseToDelete);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setPurchaseToDelete(null);
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'customer_name', label: 'المورد/العميل' },
    { key: 'product', label: 'الصنف/المنتج' },
    { key: 'quantity', label: 'الكمية', render: (row) => Number(row.quantity).toFixed(2) },
    { key: 'discount', label: 'الخصم', render: (row) => Number(row.discount).toFixed(2) },
    { key: 'quantity_after_discount', label: 'الصافي', render: (row) => Number(row.quantity_after_discount).toFixed(2) },
    { key: 'total', label: 'الإجمالي (الفاتورة)', render: (row) => <span style={{ fontWeight: 'bold' }}>{Number(row.total).toFixed(2)}</span> },
    { key: 'credit_used', label: 'خصم من الرصيد', render: (row) => <span style={{ color: 'var(--success)' }}>{Number(row.credit_used).toFixed(2)}</span> },
    { key: 'treasury_balance', label: 'مدفوع من الخزينة', render: (row) => <span style={{ color: 'var(--danger)' }}>{Number(row.treasury_balance).toFixed(2)}</span> },
    {
      key: 'transferred_to_inventory',
      label: 'المخزن',
      render: (row) => row.transferred_to_inventory ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a',
          padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600
        }}>
          <CheckCircle2 size={13} /> بالمخزن
        </span>
      ) : (
        <button
          type="button"
          className="btn btn-sm"
          style={{
            fontSize: '0.78rem', padding: '3px 8px',
            background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7',
            border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: '6px',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
          }}
          onClick={(e) => { e.stopPropagation(); handleOpenTransferModal(row); }}
          title="ترحيل هذا الصنف إلى المخزن"
        >
          <PackagePlus size={13} /> ترحيل للمخزن
        </button>
      )
    }
  ];

  const renderActions = (row) => (
    <>
      {!row.transferred_to_inventory && (
        <button
          className="btn btn-icon btn-ghost"
          onClick={() => handleOpenTransferModal(row)}
          title="ترحيل إلى المخزن"
          style={{ color: '#0284c7' }}
        >
          <PackagePlus size={16} />
        </button>
      )}
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
      label: 'المورد',
      type: 'select',
      options: customers.map(c => ({ label: c.name, value: c.id }))
    },
    {
      key: 'product',
      label: 'المنتج',
      type: 'select',
      options: uniqueValues.products.map(p => ({ label: p, value: p }))
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range'
    }
  ];

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginBottom: '8px' }}>المشتريات</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          تأثير المشتريات: يخصم من رصيد العميل إن وُجد، والباقي يُخصم من الخزينة. 
          <strong style={{ color: 'var(--warning)', marginRight: '8px' }}>ملاحظة:</strong> المشتريات لا تضاف للمخزن تلقائياً.
        </p>
      </div>

      <DataTable
        title="سجل المشتريات"
        columns={columns}
        data={purchases}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'تعديل فاتورة مشتريات' : 'إضافة فاتورة مشتريات'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
          </div>

          {!editingItem && (
            <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="newSupplier" checked={formData.isNewCustomer} onChange={(e) => setFormData({ ...formData, isNewCustomer: e.target.checked, customer_id: '', customer_name: '' })} />
              <label htmlFor="newSupplier" className="form-label" style={{ margin: 0 }}>مورد جديد؟</label>
            </div>
          )}

          {formData.isNewCustomer && !editingItem ? (
            <div className="form-group">
              <label className="form-label">اسم المورد الجديد *</label>
              <input type="text" className="form-input" placeholder="أدخل اسم المورد" value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} />
              <input type="tel" className="form-input" style={{ marginTop: '8px' }} placeholder="رقم الهاتف (اختياري)" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <input
                  type="checkbox"
                  id="saveNewSupplier"
                  checked={formData.saveNewCustomer}
                  onChange={(e) => setFormData({ ...formData, saveNewCustomer: e.target.checked })}
                />
                <label htmlFor="saveNewSupplier" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>حفظ المورد في سجل العملاء</label>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">اختر المورد (اختياري)</label>
              <select className="form-select" value={formData.customer_id} onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })} disabled={!!editingItem}>
                <option value="">-- بدون مورد --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">الصنف / المنتج *</label>
            <input type="text" className="form-input" value={formData.product} onChange={(e) => setFormData({ ...formData, product: e.target.value })} />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">الكمية / الوزن (اختياري)</label>
              <input type="number" step="0.001" min="0" className="form-input" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">الخصم (الكمية/الوزن)</label>
              <input type="number" step="0.001" min="0" className="form-input" value={formData.discount} onChange={(e) => setFormData({ ...formData, discount: e.target.value })} />
            </div>
          </div>
          {Number(formData.quantity) > 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--success)', marginTop: '-8px', marginBottom: '16px' }}>
              الصافي بعد الخصم: {(Number(formData.quantity) - Number(formData.discount)).toFixed(3)}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">المبلغ الإجمالي (الفاتورة) *</label>
            <input type="number" step="0.01" min="0" className="form-input" value={formData.total} onChange={(e) => setFormData({ ...formData, total: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea className="form-textarea" rows="2" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}></textarea>
          </div>

          {(!editingItem || !editingItem.transferred_to_inventory) && (
            <div style={{ marginTop: '16px', marginBottom: '16px', padding: '14px', background: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="addToInventory"
                  checked={formData.add_to_inventory}
                  onChange={(e) => setFormData({ ...formData, add_to_inventory: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="addToInventory" style={{ margin: 0, fontWeight: 700, cursor: 'pointer', fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  📦 إضافة هذا الصنف إلى المخزن مباشرة
                </label>
              </div>

              {formData.add_to_inventory && (
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label className="form-label">الشركة المصنعة (اختياري)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="مثال: التحرير"
                        value={formData.inventory_company}
                        onChange={(e) => setFormData({ ...formData, inventory_company: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label className="form-label">عدد اللفات / القطع *</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="form-input"
                        placeholder="عدد اللفات المدخلة للمخزن"
                        value={formData.inventory_count}
                        onChange={(e) => setFormData({ ...formData, inventory_count: e.target.value })}
                        required={formData.add_to_inventory}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label className="form-label">سعر بيع اللفة في المخزن (ج.م) *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input"
                        placeholder="سعر بيع اللفة"
                        value={formData.inventory_roll_price}
                        onChange={(e) => setFormData({ ...formData, inventory_roll_price: e.target.value })}
                        required={formData.add_to_inventory}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label className="form-label">الوزن الإجمالي للمخزن</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        className="form-input"
                        placeholder={formData.quantity ? `افتراضي: ${Number(formData.quantity) - Number(formData.discount || 0)}` : 'الوزن الإجمالي'}
                        value={formData.inventory_weight}
                        onChange={(e) => setFormData({ ...formData, inventory_weight: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>حفظ الفاتورة</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setPurchaseToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذه المشتريات؟"
      />

      {/* ─── Debt Offset Confirmation Modal ─────────── */}
      {debtModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '16px',
            padding: '28px', maxWidth: '700px', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,165,0,0.3)',
            maxHeight: '85vh', overflowY: 'auto', direction: 'rtl'
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
                  هذا العميل/المورد لديه فواتير مبيعات غير مسددة
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
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>قيمة الشراء الحالي</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {Number(pendingPayload?.total || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ما سيتم مقاصته</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {Math.min(Number(debtInfo.total_debt), Number(pendingPayload?.total || 0)).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ما سيُدفع من الخزينة</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--danger)' }}>
                  {Math.max(0, Number(pendingPayload?.total || 0) - Number(debtInfo.total_debt)).toFixed(2)}
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

      {/* ─── Transfer to Inventory Modal ─────────── */}
      <Modal
        isOpen={transferModalOpen}
        onClose={() => { setTransferModalOpen(false); setItemToTransfer(null); }}
        title={`ترحيل صنف (${itemToTransfer?.product || ''}) إلى المخزن`}
      >
        <form onSubmit={handleExecuteTransfer}>
          <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '8px', border: '1px solid rgba(2, 132, 199, 0.2)', fontSize: '0.88rem' }}>
            فاتورة مشتريات بتاريخ: <strong>{itemToTransfer ? format(new Date(itemToTransfer.date), 'yyyy/MM/dd') : ''}</strong> — إجمالي: <strong>{Number(itemToTransfer?.total || 0).toFixed(2)} ج.م</strong>
          </div>

          <div className="form-group">
            <label className="form-label">الشركة المصنعة (اختياري)</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: التحرير"
              value={transferData.company}
              onChange={(e) => setTransferData({ ...transferData, company: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">عدد اللفات / القطع *</label>
              <input
                type="number"
                min="1"
                step="1"
                className="form-input"
                placeholder="أدخل عدد اللفات"
                value={transferData.count}
                onChange={(e) => setTransferData({ ...transferData, count: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">سعر بيع اللفة (ج.م) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                placeholder="سعر بيع اللفة للمخزن"
                value={transferData.roll_price}
                onChange={(e) => setTransferData({ ...transferData, roll_price: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">الوزن الإجمالي للكمية (كجم/طن)</label>
            <input
              type="number"
              min="0"
              step="0.001"
              className="form-input"
              placeholder="الوزن الإجمالي"
              value={transferData.weight_quantity}
              onChange={(e) => setTransferData({ ...transferData, weight_quantity: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isTransferring}>
              {isTransferring ? 'جاري الترحيل...' : '📦 تأكيد الترحيل للمخزن'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setTransferModalOpen(false); setItemToTransfer(null); }}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default PurchasesPage;
