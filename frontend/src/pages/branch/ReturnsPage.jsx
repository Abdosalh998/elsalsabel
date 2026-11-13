import { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw, Trash2, Weight, DollarSign, Package,
  Building2, User, Calendar, Plus, Printer, Eye, Hash
} from 'lucide-react';
import PrintableReturnInvoice from '../../components/returns/PrintableReturnInvoice';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { returnsService } from '../../services/returns.service';
import { customerService } from '../../services/customer.service';
import { inventoryService } from '../../services/inventory.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import PartyPicker from '../../components/common/PartyPicker';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const EMPTY_RETURN_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  customer_id: '',
  customer_name: '',
  phone: '',
  isNewCustomer: false,
  saveNewCustomer: true,
  inventory_id: '',
  product: '',
  company: '',
  weight: '',
  rolls_count: '',
  price_per_ton: '',
  total: '',
  notes: '',
  add_to_balance: true,
};

const ReturnsPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [uniqueVals, setUniqueVals] = useState({ products: [], companies: [] });
  const [customers, setCustomers] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_RETURN_FORM);
  const [printData, setPrintData] = useState(null);

  // Fetch returns list
  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await returnsService.getReturns(params);
      const list = res.data?.returns || res.returns || [];
      const sum = res.data?.summary || res.summary || null;
      setRows(list);
      setSummary(sum);
    } catch (err) {
      toast.error('حدث خطأ أثناء جلب سجلات المرتجعات');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDropdowns = () => {
    returnsService.getUniqueValues().then(res => {
      const d = res.data || res;
      setUniqueVals({ products: d.products || [], companies: d.companies || [] });
    }).catch(console.error);

    customerService.getCustomers({ limit: 1000 }).then(res => {
      setCustomers(res.data?.customers || res.customers || []);
    }).catch(console.error);

    inventoryService.getInventory({ limit: 1000 }).then(res => {
      setInventoryList(res.data?.inventory || res.inventory || []);
    }).catch(console.error);
  };

  useEffect(() => {
    fetchData();
    loadDropdowns();
  }, [fetchData]);

  // Form field changes and derived total
  const handleFormChange = (field, val) => {
    setForm(prev => {
      const next = { ...prev, [field]: val };
      if (field === 'inventory_id' && val) {
        const selected = inventoryList.find(i => String(i.id) === String(val));
        if (selected) {
          next.product = selected.product || '';
          next.company = selected.company || '';
          if (selected.roll_price && !next.price_per_ton) {
            // keep existing or let user type
          }
        }
      }

      const w = parseFloat(field === 'weight' ? val : next.weight) || 0;
      const p = parseFloat(field === 'price_per_ton' ? val : next.price_per_ton) || 0;

      if (field === 'weight' || field === 'price_per_ton') {
        if (w > 0 && p > 0) {
          next.total = (w * p).toFixed(2);
        }
      } else if (field === 'total') {
        const t = parseFloat(val) || 0;
        if (t > 0 && w > 0) {
          next.price_per_ton = (t / w).toFixed(2);
        }
      }
      return next;
    });
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!form.product && !form.inventory_id) {
      return toast.error('يرجى تحديد الصنف أو المخزون المرتجع إليه');
    }
    if (!form.weight || Number(form.weight) <= 0) {
      return toast.error('يرجى إدخال وزن صحيح');
    }
    if (!form.price_per_ton || Number(form.price_per_ton) <= 0) {
      return toast.error('يرجى إدخال سعر طن صحيح');
    }

    setIsSubmitting(true);
    try {
      const payload = {
        date: form.date,
        customer_id: form.isNewCustomer ? null : (form.customer_id || null),
        customer_name: form.isNewCustomer ? form.customer_name : undefined,
        phone: form.isNewCustomer ? form.phone : undefined,
        saveNewCustomer: form.isNewCustomer ? form.saveNewCustomer : undefined,
        inventory_id: form.inventory_id ? Number(form.inventory_id) : null,
        product: form.product,
        company: form.company,
        weight: Number(form.weight),
        rolls_count: form.rolls_count ? Number(form.rolls_count) : 0,
        price_per_ton: Number(form.price_per_ton),
        notes: form.notes,
        add_to_balance: form.add_to_balance,
      };

      await returnsService.addReturn(payload);
      toast.success('✅ تم تسجيل فاتورة المرتجع وإضافة الوزن للمخزن بنجاح');
      setIsAddOpen(false);
      setForm(EMPTY_RETURN_FORM);
      fetchData();
      loadDropdowns();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'حدث خطأ أثناء تسجيل المرتجع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await returnsService.deleteReturn(deleteTarget.id);
      toast.success('تم حذف المرتجع واسترجاع كميات المخزون');
      setDeleteTarget(null);
      fetchData();
      loadDropdowns();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'حدث خطأ أثناء الحذف');
    }
  };

  // Columns per user request:
  // التاريخ - اسم العميل - الصنف - الشركه - الوزن - سعر طن - الاجمالي
  const columns = [
    {
      label: '#',
      key: 'id',
      render: (row) => <span style={{ fontWeight: 700, color: '#64748b' }}>#{row.id}</span>
    },
    {
      label: 'التاريخ',
      key: 'date',
      render: (row) => row.date ? format(new Date(row.date), 'yyyy-MM-dd') : '-'
    },
    {
      label: 'اسم العميل',
      key: 'customer_name',
      render: (row) => (
        <div>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.customer_name || 'بدون عميل'}</span>
          {row.customer_phone && <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{row.customer_phone}</div>}
        </div>
      )
    },
    {
      label: 'الصنف',
      key: 'product',
      render: (row) => <strong style={{ color: '#1A3A5C' }}>{row.product}</strong>
    },
    {
      label: 'الشركة',
      key: 'company',
      render: (row) => row.company ? <span style={{ color: '#475569' }}>{row.company}</span> : '-'
    },
    {
      label: 'الوزن (طن)',
      key: 'weight',
      render: (row) => (
        <span style={{ color: '#0369a1', fontWeight: 800 }}>
          {fmt(row.weight, 3)}
        </span>
      )
    },
    {
      label: 'اللفات',
      key: 'rolls_count',
      render: (row) => row.rolls_count ? (
        <span style={{ color: '#7c3aed', fontWeight: 700 }}>
          {Number(row.rolls_count).toLocaleString()}
        </span>
      ) : <span style={{ color: '#94a3b8' }}>-</span>
    },
    {
      label: 'سعر طن (ج)',
      key: 'price_per_ton',
      render: (row) => fmt(row.price_per_ton)
    },
    {
      label: 'الإجمالي (ج)',
      key: 'total',
      render: (row) => (
        <strong style={{ color: '#dc2626', fontSize: '0.95rem' }}>
          {fmt(row.total)}
        </strong>
      )
    },
    {
      label: 'المصدر',
      key: 'sale_id',
      render: (row) => row.sale_invoice_number ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#dcfce7', color: '#15803d',
          padding: '2px 8px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 700
        }}>
          فاتورة مبيعات #{row.sale_invoice_number}
        </span>
      ) : (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#f1f5f9', color: '#475569',
          padding: '2px 8px', borderRadius: 6, fontSize: '0.76rem'
        }}>
          مرتجع مباشر
        </span>
      )
    },
    {
      label: 'ملاحظات',
      key: 'notes',
      render: (row) => row.notes || '-'
    },
    {
      label: 'الإجراءات',
      key: 'actions',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <button
            type="button"
            title="طباعة فاتورة المرتجع"
            onClick={() => setPrintData(row)}
            style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              color: '#16a34a', borderRadius: 6, padding: '5px 8px', cursor: 'pointer'
            }}
          >
            <Printer size={14} />
          </button>
          <button
            type="button"
            className="action-btn delete-btn"
            title="حذف المرتجع"
            onClick={() => setDeleteTarget(row)}
            style={{
              background: '#fee2e2', border: '1px solid #fecaca',
              color: '#dc2626', borderRadius: 6, padding: '5px 8px', cursor: 'pointer'
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ];

  // Filter configuration
  const filterConfig = [
    {
      key: 'dateRange',
      type: 'date-range',
      label: 'الفترة الزمنية',
    },
    {
      key: 'customer_id',
      type: 'multi-select',
      label: 'العميل',
      placeholder: 'كل العملاء',
      options: customers.map(c => ({ value: String(c.id), label: c.name })),
    },
    {
      key: 'product',
      type: 'multi-select',
      label: 'الصنف',
      placeholder: 'كل الأصناف',
      options: uniqueVals.products.map(p => ({ value: p, label: p })),
    },
    {
      key: 'company',
      type: 'text',
      label: 'الشركة',
      placeholder: 'بحث بالشركة...',
    },
  ];

  const fieldStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontFamily: 'inherit', fontSize: '0.88rem',
    background: '#f8fafc', color: '#0f172a', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

  return (
    <div className="page-container" style={{ padding: '20px' }}>
      {/* ── Top Header & Actions ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 14, marginBottom: 20
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <RotateCcw size={26} color="#dc2626" />
            موديول المرتجعات
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.84rem' }}>
            تسجيل وإدارة فواتير مرتجعات البضاعة مع إضافة الوزن تلقائياً للمخزن
          </p>
        </div>

        <button
          type="button"
          onClick={() => { setForm(EMPTY_RETURN_FORM); setIsAddOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            color: '#fff', border: 'none', borderRadius: 10,
            fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(220,38,38,0.25)', transition: 'transform 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <Plus size={18} /> تسجيل مرتجع بضاعة
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14, marginBottom: 20
      }}>
        <div style={{
          background: '#fff', borderRadius: 12, padding: 16,
          border: '1.5px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,35,64,0.05)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <DollarSign size={22} color="#dc2626" />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>إجمالي قيمة المرتجعات</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#dc2626' }}>
              {fmt(summary?.total_returns_amount || 0)} <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>ج.م</span>
            </div>
          </div>
        </div>

        <div style={{
          background: '#fff', borderRadius: 12, padding: 16,
          border: '1.5px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,35,64,0.05)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: '#e0f2fe',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Weight size={22} color="#0284c7" />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>إجمالي الوزن الداخل للمخزن</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0284c7' }}>
              {fmt(summary?.total_weight || 0, 3)} <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>طن</span>
            </div>
          </div>
        </div>

        <div style={{
          background: '#fff', borderRadius: 12, padding: 16,
          border: '1.5px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,35,64,0.05)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: '#fef3c7',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <RotateCcw size={22} color="#d97706" />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>عدد فواتير المرتجع</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
              {Number(summary?.returns_count || rows.length).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* ── DataTable ── */}
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        searchPlaceholder="بحث في المرتجعات (العميل، الصنف، الشركة)..."
        emptyMessage="لا توجد مرتجعات مسجلة"
      />

      {/* ── Add Return Modal ── */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="تسجيل فاتورة مرتجع بضاعة"
        maxWidth="650px"
      >
        <form onSubmit={handleAddSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}><Calendar size={12} style={{ marginLeft: 4 }} />التاريخ</label>
              <input
                type="date"
                value={form.date}
                onChange={e => handleFormChange('date', e.target.value)}
                style={fieldStyle}
                required
              />
            </div>
            <div>
              <PartyPicker
                type="customer"
                customers={customers}
                value={{
                  customer_id: form.customer_id,
                  customer_name: form.customer_name,
                  phone: form.phone,
                  isNewCustomer: form.isNewCustomer,
                  saveNewCustomer: form.saveNewCustomer
                }}
                onChange={partyData => {
                  setForm(p => ({
                    ...p,
                    customer_id: partyData.customer_id,
                    customer_name: partyData.customer_name,
                    phone: partyData.phone,
                    isNewCustomer: partyData.isNewCustomer,
                    saveNewCustomer: partyData.saveNewCustomer,
                  }));
                }}
                required={false}
              />
            </div>
          </div>

          {/* Stock inventory selection */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}><Package size={12} style={{ marginLeft: 4 }} />المخزون المراد إضافة المرتجع إليه</label>
            <select
              value={form.inventory_id}
              onChange={e => handleFormChange('inventory_id', e.target.value)}
              style={fieldStyle}
            >
              <option value="">-- اختر من بضاعة المخزن المتاحة (أو اكتب صنف جديد أدناه) --</option>
              {inventoryList.map(inv => {
                const w = Number(inv.available_quantity ?? inv.remaining_weight ?? 0);
                const comp = inv.company ? ` [${inv.company}]` : '';
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.product}{comp} — رصيد المخزن الحالي: {w.toFixed(2)} كجم
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>الصنف / المنتج *</label>
              <input
                type="text"
                placeholder="اسم المنتج..."
                value={form.product}
                onChange={e => handleFormChange('product', e.target.value)}
                style={fieldStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>الشركة</label>
              <input
                type="text"
                placeholder="الشركة المصنعة..."
                value={form.company}
                onChange={e => handleFormChange('company', e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>الوزن (طن) *</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                placeholder="0.000"
                value={form.weight}
                onChange={e => handleFormChange('weight', e.target.value)}
                style={fieldStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}><Hash size={11} style={{ marginLeft: 3 }} />عدد اللفات</label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="0"
                value={form.rolls_count}
                onChange={e => handleFormChange('rolls_count', e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>سعر الطن (ج) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={form.price_per_ton}
                onChange={e => handleFormChange('price_per_ton', e.target.value)}
                style={fieldStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>الإجمالي (ج)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.total}
                onChange={e => handleFormChange('total', e.target.value)}
                style={{ ...fieldStyle, fontWeight: 800, color: '#dc2626' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>ملاحظات</label>
            <input
              type="text"
              placeholder="سبب الإرجاع أو ملاحظات إضافية..."
              value={form.notes}
              onChange={e => handleFormChange('notes', e.target.value)}
              style={fieldStyle}
            />
          </div>

          {/* Add to balance toggle */}
          {form.customer_id && (
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#0369a1' }}>
                <input
                  type="checkbox"
                  checked={form.add_to_balance}
                  onChange={e => handleFormChange('add_to_balance', e.target.checked)}
                />
                إضافة قيمة المرتجع ({fmt(form.total)} ج.م) إلى رصيد / مديونية العميل
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              style={{
                padding: '10px 18px', background: '#f1f5f9', color: '#475569',
                border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer'
              }}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 22px', background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800,
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              {isSubmitting ? 'جاري الحفظ...' : 'تأكيد وحفظ المرتجع'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Delete Modal ── */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="تأكيد حذف المرتجع"
        message={`هل أنت متأكد من حذف فاتورة المرتجع #${deleteTarget?.id} للصنف (${deleteTarget?.product})؟ سيتم خصم الوزن المسترجع (${deleteTarget?.weight} طن) من المخزن تلقائياً.`}
        confirmText="نعم، حذف المرتجع"
        confirmVariant="danger"
      />

      {/* ── Print Return Invoice ── */}
      <PrintableReturnInvoice
        isOpen={!!printData}
        returnData={printData}
        onClose={() => setPrintData(null)}
      />
    </div>
  );
};

export default ReturnsPage;
