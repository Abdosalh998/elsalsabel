import { useState, useEffect, useCallback } from 'react';
import {
  Edit, Trash2, Package, Plus, Eye, X, Upload,
  Scale, Layers, DollarSign, CheckCircle2, TrendingDown,
  Warehouse, ClipboardList, Building2, ArrowDownToLine, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { inventoryService } from '../../services/inventory.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import './InventoryPage.css';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  company: '',
  product: '',
  weight_quantity: '',
  count: '',
  roll_price: '',
  price_per_kg: '',
  notes: '',
  scale_ticket_image: null,
};

const InventoryPage = () => {
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'supplies'
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [uniqueValues, setUniqueValues] = useState({ products: [], companies: [] });

  // Supply log state
  const [supplies, setSupplies] = useState([]);
  const [suppliesLoading, setSuppliesLoading] = useState(false);
  const [suppliesSummary, setSuppliesSummary] = useState(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Scale Ticket Image Preview Modal
  const [scaleTicketModal, setScaleTicketModal] = useState(null);

  // Form State
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await inventoryService.getInventory(params);
      setInventory(res.data?.inventory || []);
      setSummary(res.data?.summary || null);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب بيانات المخزن');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    inventoryService.getUniqueValues().then(res => {
      setUniqueValues({
        products: res.data?.products || [],
        companies: res.data?.companies || []
      });
    }).catch(console.error);
  }, [fetchData]);

  // ─── Supply Log ─────────────────────────────────────────────────
  const fetchSupplies = useCallback(async (params = {}) => {
    setSuppliesLoading(true);
    try {
      const res = await inventoryService.getInventorySupplies({ limit: 500, ...params });
      setSupplies(res.data?.supplies || []);
      setSuppliesSummary(res.data?.summary || null);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب سجل التوريدات');
    } finally {
      setSuppliesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'supplies') fetchSupplies();
  }, [activeTab, fetchSupplies]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        company: item.company || '',
        product: item.product || '',
        weight_quantity: item.weight_quantity || '',
        count: item.count || '',
        roll_price: item.roll_price || '',
        price_per_kg: item.price_per_kg || '',
        notes: item.notes || '',
        scale_ticket_image: item.scale_ticket_image || null,
      });
    } else {
      setEditingItem(null);
      setFormData(EMPTY_FORM);
    }
    setIsModalOpen(true);
  };

  const handleRestock = (item) => {
    setEditingItem(null); // New entry that will merge on the backend
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      company: item.company || '',
      product: item.product || '',
      weight_quantity: '',
      count: '',
      roll_price: item.roll_price || '',
      price_per_kg: item.price_per_kg || '',
      notes: '',
      scale_ticket_image: null,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.product.trim()) {
      return toast.error('التاريخ واسم المنتج مطلوبان');
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        weight_quantity: Number(formData.weight_quantity || 0),
        count: Number(formData.count || 0),
        roll_price: Number(formData.roll_price || 0),
        price_per_kg: Number(formData.price_per_kg || 0),
      };

      if (editingItem) {
        await inventoryService.updateInventory(editingItem.id, payload);
        toast.success('تم تحديث بيانات المخزن بنجاح');
      } else {
        await inventoryService.addInventory(payload);
        toast.success('تم إضافة المنتج للمخزن بنجاح');
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
    setItemToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await inventoryService.deleteInventory(itemToDelete);
      toast.success('تم حذف الصنف من المخزن بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'company', label: 'الشركة', render: (row) => row.company || '—' },
    { key: 'product', label: 'الصنف / المنتج' },
    {
      key: 'weight_quantity',
      label: 'الوزن الكلي (كجم)',
      sum: true,
      renderSummary: (t) => `${fmt(t, 2)} كجم`,
      render: (row) => `${fmt(row.weight_quantity, 2)} كجم`
    },
    {
      key: 'issued_quantity',
      label: 'المنصرف (كجم)',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--danger)' }}>{fmt(t, 2)} كجم</span>,
      render: (row) => Number(row.issued_quantity || 0) > 0 ? (
        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmt(row.issued_quantity, 2)} كجم</span>
      ) : '0 كجم'
    },
    {
      key: 'remaining_weight',
      label: 'المتاح حالياً (كجم)',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{fmt(t, 2)} كجم</span>,
      render: (row) => {
        const rem = Number(row.remaining_weight ?? (row.weight_quantity - row.issued_quantity));
        return (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem',
            background: rem > 0 ? 'rgba(22, 163, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: rem > 0 ? '#16a34a' : '#ef4444'
          }}>
            {fmt(rem, 2)} كجم
          </span>
        );
      }
    },
    {
      key: 'count',
      label: 'إجمالي اللفات',
      sum: true,
      renderSummary: (t) => `${t} لفة`,
      render: (row) => `${row.count || 0} لفة`
    },
    {
      key: 'available_rolls',
      label: 'اللفات المتاحة',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--success)' }}>{t} لفة</span>,
      render: (row) => {
        const rolls = Number(row.available_rolls ?? (row.count - (row.issued_rolls || 0)));
        return (
          <span style={{ fontWeight: 700, color: rolls > 0 ? 'var(--success)' : 'var(--danger)' }}>
            {rolls} لفة
          </span>
        );
      }
    },
    {
      key: 'price_per_kg',
      label: 'سعر الكيلو',
      render: (row) => Number(row.price_per_kg) > 0 ? `${fmt(row.price_per_kg)} ج` : '—'
    },
    {
      key: 'roll_price',
      label: 'سعر اللفة',
      render: (row) => Number(row.roll_price) > 0 ? `${fmt(row.roll_price)} ج` : '—'
    },
    {
      key: 'total',
      label: 'إجمالي القيمة',
      sum: true,
      renderSummary: (t) => `${fmt(t)} ج.م`,
      render: (row) => <span style={{ fontWeight: 700 }}>{fmt(row.total)} ج.م</span>
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
          title="عرض صورة كارتة الميزان"
        >
          <Eye size={13} /> عرض الكارتة
        </button>
      ) : '—'
    },
    {
      key: 'notes',
      label: 'ملاحظات',
      render: (row) => row.notes || '—'
    }
  ];

  const renderActions = (row) => (
    <>
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => handleRestock(row)}
        title="تزويد كمية للمخزن من نفس الصنف"
        style={{ color: '#16a34a' }}
      >
        <Plus size={16} />
      </button>
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => handleOpenModal(row)}
        title="تعديل"
      >
        <Edit size={16} />
      </button>
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => handleDeleteClick(row.id)}
        style={{ color: 'var(--danger)' }}
        title="حذف"
      >
        <Trash2 size={16} />
      </button>
    </>
  );

  const filterConfig = [
    {
      key: 'product',
      label: 'الصنف / المنتج',
      type: 'multi-select',
      options: uniqueValues.products.map(p => ({ label: p, value: p }))
    },
    {
      key: 'company',
      label: 'الشركة',
      type: 'multi-select',
      options: uniqueValues.companies.map(c => ({ label: c, value: c }))
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range'
    }
  ];

  const suppliesColumns = [
    { key: 'date', label: 'التاريخ', render: (row) => row.date ? format(new Date(row.date), 'yyyy/MM/dd') : '—' },
    {
      key: 'company',
      label: 'الشركة / المورد',
      render: (row) => (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: '#eff6ff', color: '#1d4ed8',
          padding: '2px 8px', borderRadius: 5, fontSize: '0.8rem', fontWeight: 600
        }}>
          <Building2 size={12} /> {row.company || row.supplier_name || '—'}
        </span>
      )
    },
    { key: 'product', label: 'الصنف / المنتج' },
    {
      key: 'weight_quantity',
      label: 'الوزن الوارد (كجم)',
      sum: true,
      renderSummary: (t) => `${fmt(t, 2)} كجم`,
      render: (row) => <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{fmt(row.weight_quantity, 2)} كجم</span>
    },
    {
      key: 'count',
      label: 'عدد اللفات',
      sum: true,
      renderSummary: (t) => `${t} لفة`,
      render: (row) => row.count ? `${row.count} لفة` : '—'
    },
    {
      key: 'price_per_kg',
      label: 'سعر الكيلو',
      render: (row) => Number(row.price_per_kg) > 0 ? `${fmt(row.price_per_kg)} ج` : '—'
    },
    {
      key: 'roll_price',
      label: 'سعر اللفة',
      render: (row) => Number(row.roll_price) > 0 ? `${fmt(row.roll_price)} ج` : '—'
    },
    {
      key: 'total',
      label: 'إجمالي القيمة',
      sum: true,
      renderSummary: (t) => `${fmt(t)} ج.م`,
      render: (row) => <span style={{ fontWeight: 700 }}>{Number(row.total) > 0 ? `${fmt(row.total)} ج.م` : '—'}</span>
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
          title="عرض صورة كارتة الميزان"
        >
          <Eye size={13} /> عرض الكارتة
        </button>
      ) : '—'
    },
    {
      key: 'notes',
      label: 'ملاحظات',
      render: (row) => row.notes || '—'
    }
  ];

  return (
    <div className="inventory-page">
      {/* Page Header */}
      <div className="inv-page-header">
        <div>
          <h2 className="inv-page-title">
            <Warehouse className="inv-title-icon" size={26} />
            المخزن
          </h2>
          <p className="inv-page-subtitle">
            إدارة المخزون، الكميات المتاحة، والمنصرف من البضاعة لكل صنف
          </p>
        </div>
        {activeTab === 'stock' && (
          <button className="inv-add-btn" onClick={() => handleOpenModal()}>
            <Plus size={18} />
            إضافة صنف للمخزن
          </button>
        )}
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('stock')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
            border: '2px solid',
            borderColor: activeTab === 'stock' ? '#1A3A5C' : '#e2e8f0',
            background: activeTab === 'stock' ? '#1A3A5C' : '#f8fafc',
            color: activeTab === 'stock' ? '#fff' : '#475569',
            cursor: 'pointer', transition: 'all 0.18s'
          }}
        >
          <Package size={16} /> أرصدة المخزن
        </button>
        <button
          onClick={() => setActiveTab('supplies')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
            border: '2px solid',
            borderColor: activeTab === 'supplies' ? '#2563eb' : '#e2e8f0',
            background: activeTab === 'supplies' ? '#2563eb' : '#f8fafc',
            color: activeTab === 'supplies' ? '#fff' : '#475569',
            cursor: 'pointer', transition: 'all 0.18s'
          }}
        >
          <ClipboardList size={16} /> سجل التوريدات
        </button>
      </div>

      {/* Summary KPI Cards */}
      {activeTab === 'stock' && summary && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16, marginBottom: 24
        }}>
          <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Scale size={22} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي الوزن الوارد</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(summary.total_weight_in, 2)} كجم</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={22} color="#dc2626" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي المنصرف (مبيعات)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>{fmt(summary.total_issued, 2)} كجم</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={22} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>المتاح حالياً بالمخزن</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>{fmt(summary.total_remaining_weight, 2)} كجم</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={22} color="#9333ea" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>اللفات المتاحة</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9333ea' }}>{summary.total_remaining_rolls || 0} لفة</div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={22} color="#d97706" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي القيمة التقديرية</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>{fmt(summary.total_value)} ج.م</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table (Stock Tab) */}
      {activeTab === 'stock' && (
        <DataTable
          title="أرصدة أصناف المخزن"
          columns={columns}
          data={inventory}
          loading={loading}
          filterConfig={filterConfig}
          onFilter={fetchData}
          onAdd={() => handleOpenModal()}
          actions={renderActions}
        />
      )}

      {/* Supply Log Tab */}
      {activeTab === 'supplies' && (
        <div>
          {/* Supply Log Summary Cards */}
          {suppliesSummary && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16, marginBottom: 24
            }}>
              <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ClipboardList size={22} color="#2563eb" />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>عدد التوريدات</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{suppliesSummary.total_records || 0}</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Scale size={22} color="#2563eb" />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي الوزن الوارد</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>{fmt(suppliesSummary.total_weight, 2)} كجم</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={22} color="#9333ea" />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي اللفات الواردة</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9333ea' }}>{suppliesSummary.total_rolls || 0} لفة</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DollarSign size={22} color="#d97706" />
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي قيمة التوريدات</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#d97706' }}>{fmt(suppliesSummary.total_value)} ج.م</div>
                </div>
              </div>
            </div>
          )}

          <DataTable
            title="سجل التوريدات الواردة"
            columns={suppliesColumns}
            data={supplies}
            loading={suppliesLoading}
            filterConfig={filterConfig}
            onFilter={fetchSupplies}
          />
        </div>
      )}

      {/* Add / Edit Inventory Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'تعديل بيانات صنف بالمخزن' : 'إضافة صنف جديد للمخزن'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input
              type="date"
              className="form-input"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">الشركة المصنعة (اختياري)</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل اسم الشركة"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">الصنف / المنتج *</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل اسم المنتج / القطاع"
                value={formData.product}
                onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">الوزن الإجمالي (كجم)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                className="form-input"
                value={formData.weight_quantity}
                onChange={(e) => setFormData({ ...formData, weight_quantity: e.target.value })}
                placeholder="أدخل الوزن بالكيلوجرام"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">
                عدد اللفات {editingItem && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>(استخدم زر + للزيادة)</span>}
              </label>
              <input
                type="number"
                step="1"
                min="0"
                className="form-input"
                value={formData.count}
                onChange={(e) => setFormData({ ...formData, count: e.target.value })}
                placeholder="عدد اللفات"
                disabled={!!editingItem}
                style={editingItem ? { background: 'var(--bg-secondary)', cursor: 'not-allowed' } : {}}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">سعر بيع اللفة (ج.م)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={formData.roll_price}
                onChange={(e) => setFormData({ ...formData, roll_price: e.target.value })}
                placeholder="سعر اللفة"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">سعر الكيلو (ج.م)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={formData.price_per_kg}
                onChange={(e) => setFormData({ ...formData, price_per_kg: e.target.value })}
                placeholder="سعر الكيلو"
              />
            </div>
          </div>

          {/* Scale Ticket Image (كارتة الميزان) */}
          <div className="form-group" style={{
            background: 'rgba(22, 163, 74, 0.05)', border: '1.5px dashed #16a34a',
            borderRadius: 10, padding: '12px 14px', marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0, color: '#14532d', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                🏷️ صورة كارتة الميزان (اختياري)
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

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-textarea"
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="أي ملاحظات إضافية..."
            ></textarea>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : (editingItem ? 'تحديث الصنف' : 'حفظ الصنف')}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا الصنف من المخزن؟"
      />

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
    </div>
  );
};

export default InventoryPage;
