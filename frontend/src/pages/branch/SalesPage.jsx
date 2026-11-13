import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2, Plus, Minus, ChevronDown, ChevronUp, Printer, TrendingUp, DollarSign, AlertCircle, Eye, Landmark, X, Upload } from 'lucide-react';
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
import PrintableInvoice from '../../components/sales/PrintableInvoice';
import PartyPicker from '../../components/common/PartyPicker';

const EMPTY_ITEM = { inventory_id: '', weight: '', rolls_count: '1', price: '' };

const SalesPage = () => {
  const { user } = useAuth();
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({ total_sales_amount: 0, total_collected_amount: 0, total_remaining_amount: 0 });
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

  // Print states
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState(null);
  const [isPrintLoading, setIsPrintLoading] = useState(null); // stores sale id being loaded

  // Bank Receipt Modal
  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    paid_amount: '',
    payment_type_id: '',
    notes: '',
    use_customer_credit: true,
    receipt_image: null
  });

  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await salesService.getSales(params);
      setSales(res.data.sales);
      if (res.data.summary) {
        setSummary(res.data.summary);
      }
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

  const handlePrintInvoice = async (sale) => {
    setIsPrintLoading(sale.id);
    try {
      const res = await salesService.getSaleById(sale.id);
      setSelectedInvoiceForPrint(res.data);
      setIsPrintModalOpen(true);
    } catch (error) {
      toast.error('تعذّر تحميل بيانات الفاتورة للطباعة');
    } finally {
      setIsPrintLoading(null);
    }
  };

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
        notes: sale.notes || '',
        use_customer_credit: true,
        receipt_image: sale.receipt_image || null
      });
      const cust = customers.find(c => c.id === sale.customer_id);
      setSelectedCustomerDetails(cust || null);
      // Rebuild items from sale.items
      const saleItems = (sale.items && sale.items.length > 0)
        ? sale.items.map(i => ({
            inventory_id: String(i.inventory_id),
            weight: String(i.weight ?? i.quantity ?? ''),
            rolls_count: String(i.rolls_count ?? '1'),
            price: String(i.price ?? i.unit_price ?? '')
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
        notes: '',
        use_customer_credit: true,
        receipt_image: null
      });
      setSelectedCustomerDetails(null);
      setItems([{ ...EMPTY_ITEM }]);
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
    setSelectedCustomerDetails(partyData.selectedCustomer || null);
  };

  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'inventory_id' && value) {
        const inv = inventoryList.find(i => String(i.id) === String(value));
        if (inv && !updated[index].price && (inv.price_per_kg || inv.roll_price)) {
          updated[index].price = String(inv.price_per_kg || inv.roll_price);
        }
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
      const weight = Number(item.weight) || 0;
      const price = Number(item.price) || 0;
      return sum + (weight * price);
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
      if (!item.inventory_id || !item.weight || !item.price) {
        return toast.error(`يرجى إكمال بيانات الصنف رقم ${i + 1} (المنتج، الوزن، والسعر)`);
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
        use_customer_credit: formData.use_customer_credit,
        notes: formData.notes,
        receipt_image: formData.receipt_image || null,
        items: items.map(item => ({
          inventory_id: item.inventory_id,
          weight: Number(item.weight),
          rolls_count: Number(item.rolls_count || 1),
          price: Number(item.price),
          quantity: Number(item.weight),
          unit_price: Number(item.price)
        }))
      };

      if (formData.isNewCustomer) {
        payload.customer_name = formData.customer_name;
        payload.phone = formData.phone;
        payload.saveNewCustomer = formData.saveNewCustomer;
      } else {
        payload.customer_id = formData.customer_id;
      }

      let savedSaleId = null;
      if (editingSale) {
        await salesService.updateSale(editingSale.id, payload);
        toast.success('تم تحديث الفاتورة بنجاح');
        savedSaleId = editingSale.id;
      } else {
        const res = await salesService.addSale(payload);
        toast.success('تم إضافة الفاتورة بنجاح');
        savedSaleId = res.data?.id;
        if (formData.isNewCustomer) fetchDropdownData();
      }
      setIsModalOpen(false);
      fetchData();

      // Auto-open print dialog for new invoice
      if (!editingSale && savedSaleId) {
        setTimeout(async () => {
          try {
            const printRes = await salesService.getSaleById(savedSaleId);
            setSelectedInvoiceForPrint(printRes.data);
            setIsPrintModalOpen(true);
          } catch {}
        }, 400);
      }
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
    {
      key: 'total',
      label: 'الإجمالي',
      sum: true,
      renderSummary: (t) => `${t.toFixed(2)} ج.م`,
      render: (row) => (
        <div>
          <span style={{ fontWeight: 'bold' }}>{Number(row.total).toFixed(2)}</span>
          {Number(row.returns_total || 0) > 0 && (
            <div style={{ fontSize: '0.73rem', color: '#dc2626', fontWeight: 600 }}>
              مرتجع: -{Number(row.returns_total).toFixed(2)}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'paid_amount',
      label: 'المدفوع',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{t.toFixed(2)} ج.م</span>,
      render: (row) => <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{Number(row.paid_amount).toFixed(2)}</span>
    },
    {
      key: 'remaining_balance',
      label: 'المتبقي',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{t.toFixed(2)} ج.م</span>,
      render: (row) => <span style={{ color: 'var(--danger)' }}>{Number(row.remaining_balance).toFixed(2)}</span>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  عدد البنود: <strong>{row.items.length}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => handlePrintInvoice(row)}
                  disabled={isPrintLoading === row.id}
                  title="طباعة الفاتورة"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    background: '#16a34a', color: '#fff',
                    border: 'none', borderRadius: '7px',
                    padding: '4px 12px', cursor: 'pointer',
                    fontSize: '0.78rem', fontWeight: 700,
                    opacity: isPrintLoading === row.id ? 0.6 : 1
                  }}
                >
                  <Printer size={13} />
                  {isPrintLoading === row.id ? 'جاري التحميل...' : 'طباعة'}
                </button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)', width: '40px' }}>#</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>الصنف</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>الوزن المباع (كج)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>عدد اللفات</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>سعر الكيلو</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>الإجمالي (الوزن × السعر)</th>
                </tr>
              </thead>
              <tbody>
                {row.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: idx < row.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.product_name || '-'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--primary)' }}>{Number(item.weight ?? item.quantity).toFixed(3)} كج</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.rolls_count ?? 1}</td>
                    <td style={{ padding: '8px 12px' }}>{Number(item.price ?? item.unit_price).toFixed(2)} ج.م</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--success)' }}>{Number(item.total).toFixed(2)} ج.م</td>
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
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => handlePrintInvoice(row)}
        disabled={isPrintLoading === row.id}
        title="طباعة الفاتورة"
        style={{ color: '#16a34a' }}
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
      label: 'اسم العميل',
      type: 'multi-select',
      options: customers.map(c => ({ label: c.name, value: c.id }))
    },
    {
      key: 'inventory_id',
      label: 'المنتج',
      type: 'multi-select',
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

      {/* ═══ Bottom Totals Bar ═══ */}
      {!loading && (
        <div style={{
          margin: '0 0 24px 0',
          borderRadius: '14px',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          background: 'var(--bg-card)'
        }}>
          <div style={{
            padding: '10px 20px',
            background: 'linear-gradient(135deg, #0284c7, #0369a1)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <TrendingUp size={16} />
            ملخص المبيعات {summary.total_sales_amount > 0 ? '(وفق الفلتر الحالي)' : ''}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 0
          }}>
            {/* Total Sales */}
            <div style={{
              padding: '18px 24px',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <TrendingUp size={13} />
                إجمالي المبيعات
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.35rem', color: 'var(--primary)' }}>
                {Number(summary.total_sales_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>ج.م</span>
              </div>
            </div>

            {/* Collected */}
            <div style={{
              padding: '18px 24px',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <DollarSign size={13} />
                إجمالي المحصّل
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.35rem', color: 'var(--success)' }}>
                {Number(summary.total_collected_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>ج.م</span>
              </div>
            </div>

            {/* Remaining */}
            <div style={{
              padding: '18px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertCircle size={13} />
                إجمالي المتبقي (الذمم)
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.35rem', color: Number(summary.total_remaining_amount) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {Number(summary.total_remaining_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>ج.م</span>
              </div>
            </div>
          </div>
        </div>
      )}

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

          {/* Customer Selection with PartyPicker */}
          <PartyPicker
            type="customer"
            customers={customers}
            value={{
              customer_id: formData.customer_id,
              customer_name: formData.customer_name,
              phone: formData.phone,
              isNewCustomer: formData.isNewCustomer,
              saveNewCustomer: formData.saveNewCustomer
            }}
            onChange={handlePartyChange}
            disabled={!!editingSale}
            required={true}
          />
          {selectedCustomerDetails && (
                  <div style={{ marginTop: '8px', fontSize: '0.84rem' }}>
                    {Number(selectedCustomerDetails.total_payments) > 0 ? (
                      <div style={{
                        padding: '10px 14px', background: 'rgba(2, 132, 199, 0.08)',
                        borderRadius: '8px', border: '1.5px solid rgba(2, 132, 199, 0.35)',
                        color: 'var(--primary)'
                      }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 700 }}>
                          <input
                            type="checkbox"
                            checked={formData.use_customer_credit}
                            onChange={(e) => setFormData(prev => ({ ...prev, use_customer_credit: e.target.checked }))}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                          />
                          <span>💳 استخدام الرصيد الدائن المتاح للعميل ({Number(selectedCustomerDetails.total_payments).toFixed(2)} ج.م)</span>
                        </label>
                        {formData.use_customer_credit ? (
                          <div style={{ fontSize: '0.78rem', color: '#0369a1', marginTop: '6px', marginRight: '24px' }}>
                            ✓ سيتم خصم {Math.min(Number(selectedCustomerDetails.total_payments), invoiceTotal).toFixed(2)} ج.م من رصيد العميل لتغطية الفاتورة.
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px', marginRight: '24px' }}>
                            لن يتم الخصم من الرصيد، وسيتم دفع الفاتورة نقداً/إلكترونياً أو إبقاؤها مديونية.
                          </div>
                        )}
                      </div>
                    ) : Number(selectedCustomerDetails.customer_total) > 0 ? (
                      <div style={{ padding: '6px 10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)', color: 'var(--danger)', fontWeight: 600 }}>
                        ⚠️ العميل عليه مديونية سابقة: {Number(selectedCustomerDetails.customer_total).toFixed(2)} ج.م
                      </div>
                    ) : (
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ حساب العميل خالص</span>
                    )}
                  </div>
                )}

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
                const availableWeight = inv ? Math.max(0, Number(inv.available_quantity ?? inv.remaining_weight ?? 0)) : 0;
                const availableRolls = inv ? Math.max(0, Number(inv.available_rolls ?? (Number(inv.count || 0) - Number(inv.issued_rolls || 0)))) : 0;
                const lineTotal = (Number(item.weight) || 0) * (Number(item.price) || 0);

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
                            const availW = Number(inv.available_quantity ?? inv.remaining_weight ?? 0);
                            const availR = Math.max(0, Number(inv.available_rolls ?? (Number(inv.count || 0) - Number(inv.issued_rolls || 0))));
                            return (
                              <option key={inv.id} value={inv.id}>
                                {inv.product} — متاح: {availW.toFixed(2)} كجم | {availR} لفة
                              </option>
                            );
                          })}
                        </select>
                        {inv && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            المتاح بالمخزن: <strong style={{ color: 'var(--primary)' }}>{availableWeight.toFixed(3)} كج</strong> ({availableRolls} لفة)
                          </div>
                        )}
                      </div>
                      <div style={{ flex: '1', minWidth: '100px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>الوزن المراد بيعه (كج) *</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          className="form-input"
                          value={item.weight}
                          onChange={(e) => handleItemChange(index, 'weight', e.target.value)}
                          placeholder="الوزن كج"
                        />
                      </div>
                      <div style={{ flex: '1', minWidth: '80px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>عدد اللفات *</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          className="form-input"
                          value={item.rolls_count}
                          onChange={(e) => handleItemChange(index, 'rolls_count', e.target.value)}
                          placeholder="اللفات"
                        />
                      </div>
                      <div style={{ flex: '1', minWidth: '90px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>السعر (ج.م) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input"
                          value={item.price}
                          onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                          placeholder="سعر الكيلو"
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
          {selectedCustomerDetails && Number(selectedCustomerDetails.total_payments) > 0 && formData.use_customer_credit && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '8px', padding: '8px 14px', marginBottom: '14px', fontSize: '0.84rem'
            }}>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                💳 مغطى من الرصيد الدائن: {Math.min(Number(selectedCustomerDetails.total_payments), invoiceTotal).toFixed(2)} ج.م
              </span>
              {invoiceTotal > Number(selectedCustomerDetails.total_payments) && (
                <span style={{ marginRight: '10px', color: '#b91c1c', fontWeight: 600 }}>
                  (المتبقي المطلوب سداده أو كمديونية: {(invoiceTotal - Number(selectedCustomerDetails.total_payments)).toFixed(2)} ج.م)
                </span>
              )}
            </div>
          )}
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
                <div style={{ marginTop: '4px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'block' }}>
                    ✓ سيتم توريد {Number(formData.paid_amount).toFixed(2)} ج.م للخزينة فوراً.
                  </span>
                  {(() => {
                    const creditToUse = (selectedCustomerDetails && Number(selectedCustomerDetails.total_payments) > 0 && formData.use_customer_credit)
                      ? Math.min(Number(selectedCustomerDetails.total_payments), invoiceTotal)
                      : 0;
                    const netRequired = Math.max(0, invoiceTotal - creditToUse);
                    const overpaid = Number(formData.paid_amount) > netRequired ? (Number(formData.paid_amount) - netRequired) : 0;
                    if (overpaid > 0) {
                      return (
                        <span style={{ fontSize: '0.82rem', color: '#0284c7', marginTop: '3px', display: 'block', fontWeight: 600 }}>
                          💡 سداد الفاتورة بالكامل ({netRequired.toFixed(2)} ج.م) + إضافة الباقي ({overpaid.toFixed(2)} ج.م) لرصيد العميل.
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>

              {Number(formData.paid_amount) > 0 && (
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">طريقة الدفع في الخزينة *</label>
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

            {/* Bank Receipt Upload for Sales */}
            {(() => {
              const selectedPT = paymentTypes.find(p => String(p.id) === String(formData.payment_type_id));
              const isBank = selectedPT?.channel === 'bank';
              if (!isBank || Number(formData.paid_amount) <= 0) return null;
              return (
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
              );
            })()}

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

      {/* Print Invoice Modal */}
      <PrintableInvoice
        isOpen={isPrintModalOpen}
        onClose={() => { setIsPrintModalOpen(false); setSelectedInvoiceForPrint(null); }}
        sale={selectedInvoiceForPrint}
      />

      {/* Receipt Image Preview Modal */}
      {selectedReceiptModal && (
        <Modal isOpen={Boolean(selectedReceiptModal)} onClose={() => setSelectedReceiptModal(null)} title="صورة إيصال التحويل / الإيداع البنكي">
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <img
              src={selectedReceiptModal}
              alt="إيصال المبيعات البنكي"
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

export default SalesPage;
