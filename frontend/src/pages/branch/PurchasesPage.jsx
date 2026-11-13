import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, AlertTriangle, PackagePlus, CheckCircle2, Printer, Landmark, Eye, X, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { purchasesService } from '../../services/purchases.service';
import { customerService } from '../../services/customer.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import PrintablePurchaseInvoice from '../../components/purchases/PrintablePurchaseInvoice';
import PartyPicker from '../../components/common/PartyPicker';

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
  const [isTransferring, setIsTransferring] = useState(false);

  // Debt Offset Modal
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtInfo, setDebtInfo] = useState({ invoices: [], total_debt: 0 });
  const [pendingPayload, setPendingPayload] = useState(null);

  // Print Invoice Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedPurchaseForPrint, setSelectedPurchaseForPrint] = useState(null);

  // Bank Receipt Modal
  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);
  // Scale Ticket Modal
  const [scaleTicketModal, setScaleTicketModal] = useState(null);
  // Purchase / Material Image Modal
  const [selectedImageModal, setSelectedImageModal] = useState(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    product: '',
    material_type: 'section',
    quantity: '',
    discount: '0',
    total: '',
    notes: '',
    channel: 'cash',
    receipt_image: null,
    image_url: null,
    scale_ticket_image: null,
    add_to_inventory: false,
    inventory_company: '',
    inventory_count: '',
    inventory_roll_price: '',
    inventory_weight: '',
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
        material_type: item.material_type || 'section',
        quantity: item.quantity,
        discount: item.discount,
        total: item.total,
        notes: item.notes || '',
        channel: item.channel || 'cash',
        receipt_image: item.receipt_image || null,
        image_url: item.image_url || null,
        add_to_inventory: false,
        inventory_company: '',
        inventory_count: '',
        inventory_roll_price: '',
        inventory_weight: '',
        scale_ticket_image: item.scale_ticket_image || null,
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
        material_type: 'section',
        quantity: '',
        discount: '0',
        total: '',
        notes: '',
        channel: 'cash',
        receipt_image: null,
        image_url: null,
        add_to_inventory: false,
        inventory_company: '',
        inventory_count: '',
        inventory_roll_price: '',
        inventory_weight: '',
        scale_ticket_image: null,
      });
    }
    setIsModalOpen(true);
  };

  const handlePartyChange = (partyData) => {
    setFormData(prev => ({
      ...prev,
      customer_id: partyData.customer_id,
      customer_name: partyData.customer_name,
      phone: partyData.phone,
      isNewCustomer: partyData.isNewCustomer,
      saveNewCustomer: partyData.saveNewCustomer
    }));
  };

  const handleOpenTransferModal = (purchase) => {
    setItemToTransfer(purchase);
    setTransferModalOpen(true);
  };

  const handleExecuteTransfer = async (e) => {
    e.preventDefault();
    if (!itemToTransfer) return;

    setIsTransferring(true);
    try {
      await purchasesService.transferToInventory(itemToTransfer.id);
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

    if (formData.add_to_inventory && formData.material_type !== 'scrap') {
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
    {
      key: 'material_type',
      label: 'النوع',
      render: (row) => {
        const type = row.material_type || 'section';
        const config = {
          scrap: { label: 'سكراب', bg: '#fef3c7', color: '#92400e' },
          section: { label: 'قطاع', bg: '#eff6ff', color: '#1e40af' },
          other: { label: 'أخرى', bg: '#f1f5f9', color: '#475569' }
        };
        const c = config[type] || config.section;
        return (
          <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
            fontSize: '0.78rem', fontWeight: 700, background: c.bg, color: c.color
          }}>
            {c.label}
          </span>
        );
      }
    },
    {
      key: 'quantity',
      label: 'الكمية',
      sum: true,
      renderSummary: (t) => t.toFixed(2),
      render: (row) => Number(row.quantity).toFixed(2)
    },
    {
      key: 'discount',
      label: 'الخصم',
      sum: true,
      renderSummary: (t) => t.toFixed(2),
      render: (row) => Number(row.discount).toFixed(2)
    },
    {
      key: 'quantity_after_discount',
      label: 'الصافي',
      sum: true,
      renderSummary: (t) => t.toFixed(2),
      render: (row) => Number(row.quantity_after_discount).toFixed(2)
    },
    {
      key: 'total',
      label: 'الإجمالي (الفاتورة)',
      sum: true,
      renderSummary: (t) => `${t.toFixed(2)} ج.م`,
      render: (row) => <span style={{ fontWeight: 'bold' }}>{Number(row.total).toFixed(2)}</span>
    },
    {
      key: 'credit_used',
      label: 'خصم من الرصيد',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--success)' }}>{t.toFixed(2)} ج.م</span>,
      render: (row) => <span style={{ color: 'var(--success)' }}>{Number(row.credit_used).toFixed(2)}</span>
    },
    {
      key: 'treasury_balance',
      label: 'مدفوع من الخزينة',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--danger)' }}>{t.toFixed(2)} ج.م</span>,
      render: (row) => <span style={{ color: 'var(--danger)' }}>{Number(row.treasury_balance).toFixed(2)}</span>
    },
    {
      key: 'channel',
      label: 'طريقة الدفع',
      render: (row) => {
        const ch = row.channel || 'cash';
        const labels = { cash: 'نقدي (كاش)', wallet: 'محفظة', instapay: 'انستاباي', bank: 'إيداع بنكي' };
        return (
          <span style={{
            display: 'inline-block', background: 'rgba(37, 99, 235, 0.08)', color: '#1d4ed8',
            padding: '2px 7px', borderRadius: 5, fontSize: '0.78rem', fontWeight: 600
          }}>
            {labels[ch] || ch}
          </span>
        );
      }
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
    {
      key: 'scale_ticket_image',
      label: 'كارتة الميزان',
      render: (row) => row.scale_ticket_image ? (
        <button
          type="button"
          onClick={() => setScaleTicketModal(row.scale_ticket_image)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
            borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700
          }}
          title="عرض كارتة الميزان"
        >
          <Eye size={13} /> عرض الكارتة
        </button>
      ) : '—'
    },
    {
      key: 'image_url',
      label: 'صورة الشراء',
      render: (row) => row.image_url ? (
        <button
          type="button"
          onClick={() => setSelectedImageModal(row.image_url)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
            borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700
          }}
          title="عرض صورة البضاعة / الشراء"
        >
          <Eye size={13} /> عرض الصورة
        </button>
      ) : '—'
    },
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
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => { setSelectedPurchaseForPrint(row); setIsPrintModalOpen(true); }}
        title="طباعة الفاتورة"
        style={{ color: '#0284c7' }}
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
      key: 'customer_id',
      label: 'المورد',
      type: 'multi-select',
      options: customers.map(c => ({ label: c.name, value: c.id }))
    },
    {
      key: 'product',
      label: 'المنتج',
      type: 'multi-select',
      options: uniqueValues.products.map(p => ({ label: p, value: p }))
    },
    {
      key: 'material_type',
      label: 'نوع الخامة',
      type: 'multi-select',
      options: [
        { label: 'قطاع', value: 'section' },
        { label: 'سكراب', value: 'scrap' },
        { label: 'أخرى', value: 'other' }
      ]
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

          {/* Supplier Selection with PartyPicker */}
          <PartyPicker
            type="supplier"
            customers={customers}
            value={{
              customer_id: formData.customer_id,
              customer_name: formData.customer_name,
              phone: formData.phone,
              isNewCustomer: formData.isNewCustomer,
              saveNewCustomer: formData.saveNewCustomer
            }}
            onChange={handlePartyChange}
            disabled={!!editingItem}
            required={false}
            allowNone={true}
          />

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">الصنف / المنتج *</label>
              <input type="text" className="form-input" value={formData.product} onChange={(e) => setFormData({ ...formData, product: e.target.value })} placeholder="مثال: قطاع فضي، سكراب خردة..." required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">نوع الخامة</label>
              <select
                className="form-select"
                value={formData.material_type}
                onChange={(e) => setFormData({ ...formData, material_type: e.target.value })}
              >
                <option value="section">قطاع (ألومنيوم)</option>
                <option value="scrap">سكراب (خردة)</option>
                <option value="other">أخرى</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">
                الوزن / الكمية (كجم) {formData.material_type === 'scrap' ? '(اختياري)' : '(اختياري)'}
              </label>
              <input type="number" step="0.001" min="0" className="form-input" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} placeholder="الوزن بالكيلوجرام" />
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
            <label className="form-label">طريقة الدفع (الخصم من الخزينة) *</label>
            <select
              className="form-select"
              value={formData.channel}
              onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
            >
              <option value="cash">نقدي (كاش)</option>
              <option value="wallet">محفظة إلكترونية</option>
              <option value="instapay">انستاباي</option>
              <option value="bank">إيداع بنكي</option>
            </select>
          </div>

          {/* Bank Receipt Upload for Purchases */}
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

          {/* Scale Ticket Image (كارتة الميزان) */}
          <div className="form-group" style={{
            background: 'rgba(22, 163, 74, 0.05)', border: '1.5px dashed #16a34a',
            borderRadius: 10, padding: '12px 14px', marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0, color: '#14532d', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                🏷️ كارتة الميزان (اختياري)
              </label>
              {formData.scale_ticket_image && (
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, scale_ticket_image: null }))}
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
            {formData.scale_ticket_image ? (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={formData.scale_ticket_image}
                  alt="كارتة الميزان"
                  style={{ maxHeight: 150, maxWidth: '100%', borderRadius: 8, border: '1px solid #bbf7d0', objectFit: 'contain' }}
                />
              </div>
            ) : (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 8, background: '#fff', border: '1px dashed #cbd5e1',
                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#15803d'
              }}>
                <Upload size={16} />
                انقر لاختيار أو التقاط صورة كارتة الميزان
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setFormData(p => ({ ...p, scale_ticket_image: ev.target.result }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
          </div>

          {/* Purchase / Material Image (صورة البضاعة أو الفاتورة) */}
          <div className="form-group" style={{
            background: 'rgba(37, 99, 235, 0.05)', border: '1.5px dashed #2563eb',
            borderRadius: 10, padding: '12px 14px', marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                📷 صورة البضاعة / الفاتورة عند الشراء (اختياري)
              </label>
              {formData.image_url && (
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, image_url: null }))}
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
            {formData.image_url ? (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={formData.image_url}
                  alt="صورة البضاعة"
                  style={{ maxHeight: 150, maxWidth: '100%', borderRadius: 8, border: '1px solid #bfdbfe', objectFit: 'contain' }}
                />
              </div>
            ) : (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 8, background: '#fff', border: '1px dashed #cbd5e1',
                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#2563eb'
              }}>
                <Upload size={16} />
                انقر لاختيار أو التقاط صورة البضاعة أو الفاتورة
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setFormData(p => ({ ...p, image_url: ev.target.result }));
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
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
                      <label className="form-label">
                        عدد اللفات / القطع {formData.material_type === 'scrap' ? '(اختياري للسكراب)' : '*'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="form-input"
                        placeholder="عدد اللفات المدخلة للمخزن"
                        value={formData.inventory_count}
                        onChange={(e) => setFormData({ ...formData, inventory_count: e.target.value })}
                        required={formData.add_to_inventory && formData.material_type !== 'scrap'}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <label className="form-label">
                        سعر بيع اللفة في المخزن (ج.م) {formData.material_type === 'scrap' ? '(اختياري للسكراب)' : '*'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input"
                        placeholder="سعر بيع اللفة"
                        value={formData.inventory_roll_price}
                        onChange={(e) => setFormData({ ...formData, inventory_roll_price: e.target.value })}
                        required={formData.add_to_inventory && formData.material_type !== 'scrap'}
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
        title={`ترحيل صنف إلى المخزن`}
      >
        <form onSubmit={handleExecuteTransfer}>
          <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '10px', border: '1px solid rgba(2, 132, 199, 0.2)', fontSize: '0.9rem', lineHeight: '1.7' }}>
            <div><strong>الصنف:</strong> {itemToTransfer?.product}</div>
            <div><strong>التاريخ:</strong> {itemToTransfer ? format(new Date(itemToTransfer.date), 'yyyy/MM/dd') : ''}</div>
            <div><strong>الوزن:</strong> {Number(itemToTransfer?.weight_quantity || 0).toFixed(3)} كجم</div>
            <div><strong>عدد اللفات:</strong> {itemToTransfer?.count || '—'}</div>
            <div><strong>إجمالي الفاتورة:</strong> <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{Number(itemToTransfer?.total || 0).toFixed(2)} ج.م</span></div>
          </div>

          <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(22, 163, 74, 0.07)', borderRadius: '8px', border: '1px solid rgba(22, 163, 74, 0.2)', fontSize: '0.85rem', color: '#166534' }}>
            📦 سيتم إضافة هذه الفاتورة للمخزن بنفس بيانات الشراء (الوزن، العدد، الشركة، السعر).
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isTransferring}>
              {isTransferring ? 'جاري الترحيل...' : '📦 تأكيد الترحيل للمخزن'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setTransferModalOpen(false); setItemToTransfer(null); }}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Printable Purchase Invoice */}
      <PrintablePurchaseInvoice
        isOpen={isPrintModalOpen}
        onClose={() => { setIsPrintModalOpen(false); setSelectedPurchaseForPrint(null); }}
        purchase={selectedPurchaseForPrint}
      />

      {/* Receipt Image Preview Modal */}
      {selectedReceiptModal && (
        <Modal isOpen={Boolean(selectedReceiptModal)} onClose={() => setSelectedReceiptModal(null)} title="صورة إيصال التحويل / الإيداع البنكي">
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <img
              src={selectedReceiptModal}
              alt="إيصال المشتريات البنكي"
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

      {/* Scale Ticket Preview Modal */}
      {scaleTicketModal && (
        <Modal isOpen={Boolean(scaleTicketModal)} onClose={() => setScaleTicketModal(null)} title="صورة كارتة الميزان">
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <img
              src={scaleTicketModal}
              alt="كارتة الميزان"
              style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '8px', border: '1px solid #bbf7d0', objectFit: 'contain' }}
            />
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setScaleTicketModal(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Purchase / Material Image Preview Modal */}
      {selectedImageModal && (
        <Modal isOpen={Boolean(selectedImageModal)} onClose={() => setSelectedImageModal(null)} title="صورة البضاعة / الفاتورة عند الشراء">
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <img
              src={selectedImageModal}
              alt="صورة البضاعة"
              style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '8px', border: '1px solid #bfdbfe', objectFit: 'contain' }}
            />
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSelectedImageModal(null)}
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

export default PurchasesPage;
