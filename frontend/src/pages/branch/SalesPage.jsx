import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { salesService } from '../../services/sales.service';
import { customerService } from '../../services/customer.service';
import { inventoryService } from '../../services/inventory.service';
import { treasuryService } from '../../services/treasury.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const EMPTY_ITEM = { inventory_id: '', quantity: '', unit_price: '' };

const SalesPage = () => {
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerDetails, setSelectedCustomerDetails] = useState(null);
  const [inventoryList, setInventoryList] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [saleToDelete, setSaleToDelete] = useState(null);

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    paid_amount: '',
    payment_type_id: '',
    notes: ''
  });

  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await salesService.getSales(params);
      setSales(res.data.sales);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب المبيعات');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDropdownData = async () => {
    try {
      const [custRes, invRes, ptRes] = await Promise.all([
        customerService.getCustomers({ limit: 1000 }),
        inventoryService.getInventory({ limit: 1000 }),
        treasuryService.getPaymentTypes()
      ]);
      setCustomers(custRes.data.customers || []);
      setInventoryList(invRes.data.inventory || []);
      setPaymentTypes(ptRes.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDropdownData();
  }, [fetchData]);

  const handleOpenModal = (sale = null) => {
    if (sale) {
      setEditingSale(sale);
      setFormData({
        date: format(new Date(sale.date), 'yyyy-MM-dd'),
        customer_id: sale.customer_id,
        customer_name: '',
        phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        paid_amount: 0,
        payment_type_id: '',
        notes: sale.notes || ''
      });
      const cust = customers.find(c => c.id === sale.customer_id);
      setSelectedCustomerDetails(cust || null);
      // Rebuild items from sale.items
      const saleItems = (sale.items && sale.items.length > 0)
        ? sale.items.map(i => ({
            inventory_id: String(i.inventory_id),
            quantity: String(i.quantity),
            unit_price: String(i.unit_price)
          }))
        : [{ ...EMPTY_ITEM }];
      setItems(saleItems);
    } else {
      setEditingSale(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        customer_id: '',
        customer_name: '',
        phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        paid_amount: '',
        payment_type_id: '',
        notes: ''
      });
      setSelectedCustomerDetails(null);
      setItems([{ ...EMPTY_ITEM }]);
    }
    setIsModalOpen(true);
  };

  const handleCustomerChange = (e) => {
    const custId = e.target.value;
    setFormData(prev => ({ ...prev, customer_id: custId }));
    const cust = customers.find(c => String(c.id) === String(custId));
    setSelectedCustomerDetails(cust || null);
  };

  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // Auto-fill unit_price from inventory
      if (field === 'inventory_id' && value) {
        const inv = inventoryList.find(i => String(i.id) === String(value));
        if (inv) updated[index].unit_price = String(inv.roll_price);
      }
      return updated;
    });
  };

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);

  const removeItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const getInvoiceTotal = () => {
    return items.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      return sum + qty * price;
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const hasCustomer = formData.isNewCustomer
      ? formData.customer_name.trim()
      : formData.customer_id;

    if (!formData.date || !hasCustomer) {
      return toast.error('التاريخ والعميل مطلوبان');
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.inventory_id || !item.quantity || !item.unit_price) {
        return toast.error(`يرجى إكمال بيانات الصنف رقم ${i + 1}`);
      }
    }

    if (Number(formData.paid_amount) > 0 && !formData.payment_type_id) {
      return toast.error('يجب اختيار طريقة الدفع للمبلغ المدفوع');
    }

    setIsSubmitting(true);
    try {
      const payload = {
        date: formData.date,
        paid_amount: Number(formData.paid_amount || 0),
        payment_type_id: formData.payment_type_id || undefined,
        notes: formData.notes,
        items: items.map(item => ({
          inventory_id: item.inventory_id,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price)
        }))
      };

      if (formData.isNewCustomer) {
        payload.customer_name = formData.customer_name;
        payload.phone = formData.phone;
        payload.saveNewCustomer = formData.saveNewCustomer;
      } else {
        payload.customer_id = formData.customer_id;
      }

      if (editingSale) {
        await salesService.updateSale(editingSale.id, payload);
        toast.success('تم تحديث الفاتورة بنجاح');
      } else {
        await salesService.addSale(payload);
        toast.success('تم إضافة الفاتورة بنجاح');
        if (formData.isNewCustomer) fetchDropdownData();
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
    setSaleToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!saleToDelete) return;
    try {
      await salesService.deleteSale(saleToDelete);
      toast.success('تم حذف الفاتورة واسترجاع الكميات والمبالغ بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setSaleToDelete(null);
    }
  };

  const toggleRowExpand = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const columns = [
    { key: 'invoice_number', label: 'رقم الفاتورة', render: (row) => `#${row.invoice_number}` },
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'customer_name', label: 'اسم العميل' },
    { key: 'customer_phone', label: 'رقم الهاتف', render: (row) => row.customer_phone || '-' },
    {
      key: 'items',
      label: 'الأصناف',
      render: (row) => {
        const itemCount = (row.items || []).length;
        if (itemCount === 0) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
        if (itemCount === 1) {
          const item = row.items[0];
          return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600 }}>{item.product_name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleRowExpand(row.id); }}
                title={expandedRows[row.id] ? 'إخفاء التفاصيل' : 'عرض الكمية والسعر'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                  background: expandedRows[row.id] ? 'var(--primary)' : 'rgba(2,132,199,0.08)',
                  color: expandedRows[row.id] ? '#fff' : 'var(--primary)',
                  border: '1px solid rgba(2,132,199,0.25)', borderRadius: '6px',
                  padding: '2px 8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                  transition: 'all 0.15s ease'
                }}
              >
                {expandedRows[row.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <span>تفاصيل</span>
              </button>
            </div>
          );
        }
        return (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleRowExpand(row.id); }}
            title={expandedRows[row.id] ? 'إخفاء الأصناف' : 'عرض الأصناف'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              background: expandedRows[row.id] ? 'var(--primary)' : 'rgba(2,132,199,0.1)',
              color: expandedRows[row.id] ? '#fff' : 'var(--primary)',
              border: '1px solid rgba(2,132,199,0.3)', borderRadius: '6px',
              padding: '3px 10px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
              boxShadow: expandedRows[row.id] ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            {expandedRows[row.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{itemCount} أصناف</span>
          </button>
        );
      }
    },
    { key: 'total', label: 'الإجمالي', render: (row) => <span style={{ fontWeight: 'bold' }}>{Number(row.total).toFixed(2)}</span> },
    { key: 'paid_amount', label: 'المدفوع', render: (row) => <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{Number(row.paid_amount).toFixed(2)}</span> },
    { key: 'remaining_balance', label: 'المتبقي', render: (row) => <span style={{ color: 'var(--danger)' }}>{Number(row.remaining_balance).toFixed(2)}</span> },
  ];

  const renderExpandedRow = (row) => {
    if (!expandedRows[row.id] || !row.items || row.items.length === 0) return null;
    return (
      <tr key={`expanded-${row.id}`} className="expanded-row-details">
        <td colSpan={columns.length + 1} style={{ padding: '6px 20px 14px', background: 'rgba(2,132,199,0.02)' }}>
          <div style={{
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--white)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}>
            <div style={{
              padding: '8px 14px',
              background: 'rgba(2,132,199,0.06)',
              borderBottom: '1px solid var(--border)',
              fontWeight: 600,
              fontSize: '0.84rem',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                📋 تفاصيل أصناف الفاتورة #{row.invoice_number}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                عدد البنود: <strong>{row.items.length}</strong>
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)', width: '40px' }}>#</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>الصنف</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>الشركة</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>الكمية (لفات)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>سعر اللفة</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {row.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: idx < row.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.product_name || '-'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{item.company || '-'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{Number(item.quantity)}</td>
                    <td style={{ padding: '8px 12px' }}>{Number(item.unit_price).toFixed(2)} ج.م</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--primary)' }}>{Number(item.total).toFixed(2)} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    );
  };

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
      options: customers.map(c => ({ label: c.name, value: c.id }))
    },
    {
      key: 'inventory_id',
      label: 'المنتج',
      type: 'select',
      options: inventoryList.map(i => ({ label: i.product, value: i.id }))
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range'
    }
  ];

  const invoiceTotal = getInvoiceTotal();

  return (
    <>
      <DataTable
        title="المبيعات"
        columns={columns}
        data={sales}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
        renderExpandedRow={renderExpandedRow}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSale ? `تعديل فاتورة #${editingSale.invoice_number}` : 'فاتورة مبيعات جديدة'}
      >
        <form onSubmit={handleSubmit}>
          {/* Date */}
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input
              type="date"
              className="form-input"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
            />
          </div>

          {/* Customer */}
          <div className="form-group">
            <label className="form-label">العميل *</label>
            {!editingSale && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  id="saleNewCustomer"
                  checked={formData.isNewCustomer}
                  onChange={(e) => setFormData(prev => ({ ...prev, isNewCustomer: e.target.checked, customer_id: '', customer_name: '' }))}
                />
                <label htmlFor="saleNewCustomer" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>عميل جديد؟</label>
              </div>
            )}

            {formData.isNewCustomer && !editingSale ? (
              <>
                <input
                  type="text"
                  className="form-input"
                  placeholder="أدخل اسم العميل الجديد"
                  value={formData.customer_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                  autoFocus
                />
                <input
                  type="tel"
                  className="form-input"
                  style={{ marginTop: '8px' }}
                  placeholder="رقم الهاتف (اختياري)"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="checkbox"
                    id="saveNewCustomer"
                    checked={formData.saveNewCustomer}
                    onChange={(e) => setFormData(prev => ({ ...prev, saveNewCustomer: e.target.checked }))}
                  />
                  <label htmlFor="saveNewCustomer" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>حفظ العميل في السجل الدائم</label>
                </div>
              </>
            ) : (
              <>
                <select
                  className="form-select"
                  value={formData.customer_id}
                  onChange={handleCustomerChange}
                  disabled={!!editingSale}
                >
                  <option value="">-- اختر العميل --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {selectedCustomerDetails && (
                  <div style={{ marginTop: '6px', fontSize: '0.82rem' }}>
                    {Number(selectedCustomerDetails.total_payments) > 0 ? (
                      <div style={{ padding: '6px 10px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: '6px', border: '1px solid rgba(2, 132, 199, 0.25)', color: 'var(--primary)' }}>
                        💳 <strong>رصيد متاح للعميل:</strong> {Number(selectedCustomerDetails.total_payments).toFixed(2)} ج.م
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          يتم خصم الفاتورة من هذا الرصيد تلقائياً.
                        </div>
                      </div>
                    ) : Number(selectedCustomerDetails.customer_total) > 0 ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                        ⚠️ عليه مديونية سابقة: {Number(selectedCustomerDetails.customer_total).toFixed(2)} ج.م
                      </span>
                    ) : (
                      <span style={{ color: 'var(--success)' }}>✓ حسابه خالص</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Items */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>الأصناف *</label>
              <button
                type="button"
                onClick={addItem}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: 'rgba(22, 163, 74, 0.12)', color: '#16a34a',
                  border: '1px solid rgba(22, 163, 74, 0.3)', borderRadius: '8px',
                  padding: '5px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600
                }}
              >
                <Plus size={14} /> إضافة صنف
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, index) => {
                const inv = inventoryList.find(i => String(i.id) === String(item.inventory_id));
                const available = inv ? Number(inv.count) - Number(inv.issued_quantity) : 0;
                const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);

                return (
                  <div key={index} style={{
                    padding: '12px', background: 'var(--bg-secondary)',
                    borderRadius: '10px', border: '1px solid var(--border-color)',
                    position: 'relative'
                  }}>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        style={{
                          position: 'absolute', top: '8px', left: '8px',
                          background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                          border: 'none', borderRadius: '50%', width: '24px', height: '24px',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                      >
                        <Minus size={12} />
                      </button>
                    )}
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                      الصنف {index + 1}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '2', minWidth: '160px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>المنتج *</label>
                        <select
                          className="form-select"
                          value={item.inventory_id}
                          onChange={(e) => handleItemChange(index, 'inventory_id', e.target.value)}
                        >
                          <option value="">-- اختر المنتج --</option>
                          {inventoryList.map(inv => {
                            const avail = Number(inv.count) - Number(inv.issued_quantity);
                            return (
                              <option key={inv.id} value={inv.id}>
                                {inv.product} (متاح: {avail} لفة)
                              </option>
                            );
                          })}
                        </select>
                        {inv && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            متاح: {available} لفة
                          </div>
                        )}
                      </div>
                      <div style={{ flex: '1', minWidth: '90px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>عدد اللفات *</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          className="form-input"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      <div style={{ flex: '1', minWidth: '90px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>سعر اللفة *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      {lineTotal > 0 && (
                        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                          <span style={{
                            background: 'rgba(2,132,199,0.1)', color: 'var(--primary)',
                            padding: '6px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap'
                          }}>
                            {lineTotal.toFixed(2)} ج.م
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {invoiceTotal > 0 && (
              <div style={{
                marginTop: '12px', padding: '10px 16px',
                background: 'var(--bg-card)', borderRadius: '10px',
                border: '2px solid var(--primary)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>إجمالي الفاتورة</span>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--primary)' }}>
                  {invoiceTotal.toFixed(2)} ج.م
                </span>
              </div>
            )}
          </div>

          {/* Payment */}
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">مبلغ نقدي مدفوع الآن (اختياري)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={formData.paid_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, paid_amount: e.target.value }))}
                placeholder="في حال استلام نقدية ستدخل الخزينة فوراً"
              />
              {Number(formData.paid_amount) > 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '3px', display: 'block' }}>
                  ✓ سيتم توريد {Number(formData.paid_amount).toFixed(2)} ج.م للخزينة فوراً.
                </span>
              )}
            </div>

            {Number(formData.paid_amount) > 0 && (
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">طريقة الدفع *</label>
                <select
                  className="form-select"
                  value={formData.payment_type_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, payment_type_id: e.target.value }))}
                >
                  <option value="">-- اختر نوع الدفع --</option>
                  {paymentTypes.map(pt => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-textarea"
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ الفاتورة'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => { setIsConfirmOpen(false); setSaleToDelete(null); }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذه الفاتورة؟ (سيتم استرجاع الكميات للمخزن وتحديث أرصدة العملاء تلقائياً)"
      />
    </>
  );
};

export default SalesPage;
