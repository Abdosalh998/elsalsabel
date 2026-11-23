import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Edit, Trash2, Package, Plus, Eye, X, Upload,
  Scale, Layers, DollarSign, CheckCircle2, TrendingDown,
  Warehouse, ClipboardList, Building2, ArrowDownToLine, Search,
  FolderTree, Link2, Unlink2, Check, AlertCircle, ClipboardCheck
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
  section_id: '',
};

const EMPTY_SECTION_FORM = {
  name: '',
  total_weight: '',
  notes: '',
  is_active: true,
};

const InventoryPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'supplies' | 'sections'
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [uniqueValues, setUniqueValues] = useState({ products: [], companies: [] });

  // Supply log state
  const [supplies, setSupplies] = useState([]);
  const [suppliesLoading, setSuppliesLoading] = useState(false);
  const [suppliesSummary, setSuppliesSummary] = useState(null);

  // Sections state
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [sectionFormData, setSectionFormData] = useState(EMPTY_SECTION_FORM);
  const [isSectionConfirmOpen, setIsSectionConfirmOpen] = useState(false);
  const [sectionToDelete, setSectionToDelete] = useState(null);
  const [activeSectionForItems, setActiveSectionForItems] = useState(null);
  const [isSectionItemsModalOpen, setIsSectionItemsModalOpen] = useState(false);

  // Add Weight to Section Modal State
  const [addWeightModal, setAddWeightModal] = useState({
    isOpen: false,
    section: null,
    addedWeight: '',
    notes: '',
    isSubmitting: false,
  });

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

  const fetchSections = useCallback(async () => {
    setSectionsLoading(true);
    try {
      const res = await inventoryService.getSections({ include_inactive: true });
      setSections(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('خطأ في جلب بيانات الأقسام');
    } finally {
      setSectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchSections();
    inventoryService.getUniqueValues().then(res => {
      setUniqueValues({
        products: res.data?.products || [],
        companies: res.data?.companies || []
      });
    }).catch(console.error);
  }, [fetchData, fetchSections]);

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
    if (activeTab === 'sections') fetchSections();
  }, [activeTab, fetchSupplies, fetchSections]);

  const handleOpenSectionModal = (sec = null) => {
    if (sec) {
      setEditingSection(sec);
      setSectionFormData({
        name: sec.name || '',
        total_weight: sec.total_weight ?? '',
        notes: sec.notes || '',
        is_active: sec.is_active !== false
      });
    } else {
      setEditingSection(null);
      setSectionFormData(EMPTY_SECTION_FORM);
    }
    setIsSectionModalOpen(true);
  };

  const handleSectionSubmit = async (e) => {
    e.preventDefault();
    if (!sectionFormData.name.trim()) {
      return toast.error('اسم القسم مطلوب');
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name: sectionFormData.name.trim(),
        total_weight: Number(sectionFormData.total_weight || 0),
        notes: sectionFormData.notes || '',
        is_active: sectionFormData.is_active
      };
      if (editingSection) {
        await inventoryService.updateSection(editingSection.id, payload);
        toast.success('تم تحديث القسم بنجاح');
      } else {
        await inventoryService.createSection(payload);
        toast.success('تم إضافة القسم بنجاح');
      }
      setIsSectionModalOpen(false);
      fetchSections();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ القسم');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSectionDeleteClick = (id) => {
    setSectionToDelete(id);
    setIsSectionConfirmOpen(true);
  };

  const confirmSectionDelete = async () => {
    if (!sectionToDelete) return;
    try {
      await inventoryService.deleteSection(sectionToDelete);
      toast.success('تم حذف القسم بنجاح');
      fetchSections();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'تعذر حذف القسم');
    } finally {
      setIsSectionConfirmOpen(false);
      setSectionToDelete(null);
    }
  };

  const handleOpenSectionItems = async (sec) => {
    try {
      const res = await inventoryService.getSectionById(sec.id);
      setActiveSectionForItems(res.data);
      setIsSectionItemsModalOpen(true);
    } catch (err) {
      toast.error('تعذر جلب أصناف القسم');
    }
  };

  const handleAssignItem = async (inventoryId, sectionId) => {
    try {
      await inventoryService.assignItemToSection({ inventory_id: inventoryId, section_id: sectionId });
      toast.success('تم تحديث ربط الصنف');
      if (activeSectionForItems) {
        const res = await inventoryService.getSectionById(activeSectionForItems.id);
        setActiveSectionForItems(res.data);
      }
      fetchSections();
      fetchData();
    } catch (err) {
      toast.error('تعذر ربط الصنف');
    }
  };

  const handleOpenAddWeightModal = (sec) => {
    setAddWeightModal({
      isOpen: true,
      section: sec,
      addedWeight: '',
      notes: '',
      isSubmitting: false,
    });
  };

  const handleSaveAddWeight = async (e) => {
    e.preventDefault();
    const w = parseFloat(addWeightModal.addedWeight);
    if (isNaN(w) || w <= 0) {
      toast.error('يرجى إدخال وزن صحيح أكبر من الصفر');
      return;
    }
    setAddWeightModal(p => ({ ...p, isSubmitting: true }));
    try {
      await inventoryService.addSectionWeight(addWeightModal.section.id, {
        added_weight: w,
        notes: addWeightModal.notes,
      });
      toast.success(`تمت إضافة ${w} كجم لرصيد القسم بنجاح`);
      setAddWeightModal({ isOpen: false, section: null, addedWeight: '', notes: '', isSubmitting: false });
      fetchSections();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل إضافة الوزن للقسم');
      setAddWeightModal(p => ({ ...p, isSubmitting: false }));
    }
  };

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
        section_id: item.section_id || '',
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
      section_id: item.section_id || '',
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
        section_id: formData.section_id || null,
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
      key: 'section_name',
      label: 'القسم',
      render: (row) => row.section_name ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe',
          borderRadius: 6, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700
        }}>
          <FolderTree size={12} /> {row.section_name}
        </span>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
      )
    },
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            className="inv-add-btn"
            onClick={() => navigate('/branch/stocktaking')}
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <ClipboardCheck size={18} />
            جرد ومطابقة المخزن
          </button>
          {activeTab === 'stock' && (
            <button className="inv-add-btn" onClick={() => handleOpenModal()}>
              <Plus size={18} />
              إضافة صنف للمخزن
            </button>
          )}
          {activeTab === 'sections' && (
            <button className="inv-add-btn" onClick={() => handleOpenSectionModal()} style={{ background: '#7c3aed' }}>
              <Plus size={18} />
              إضافة قسم جديد
            </button>
          )}
        </div>
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
          onClick={() => setActiveTab('sections')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
            border: '2px solid',
            borderColor: activeTab === 'sections' ? '#7c3aed' : '#e2e8f0',
            background: activeTab === 'sections' ? '#7c3aed' : '#f8fafc',
            color: activeTab === 'sections' ? '#fff' : '#475569',
            cursor: 'pointer', transition: 'all 0.18s'
          }}
        >
          <FolderTree size={16} /> أقسام المخزن
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
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>المتاح حالياً بالمخزن (شامل الأقسام)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>{fmt(summary.total_remaining_weight, 2)} كجم</div>
              {Number(summary.sections_available_weight || 0) > 0 && (
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                  (أصناف: {fmt(summary.items_remaining_weight ?? (summary.total_remaining_weight - summary.sections_available_weight), 1)} + أقسام: {fmt(summary.sections_available_weight, 1)})
                </div>
              )}
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

      {/* ─── Sections Tab (أقسام المخزن) ─────────────────────────────────── */}
      {activeTab === 'sections' && (
        <div>
          {/* Sections KPI Cards */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16, marginBottom: 24
          }}>
            <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FolderTree size={22} color="#7c3aed" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي الأقسام</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{sections.length} قسم</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Scale size={22} color="#2563eb" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي الوزن المخصص</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2563eb' }}>
                  {fmt(sections.reduce((acc, s) => acc + Number(s.total_weight || 0), 0), 2)} كجم
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={22} color="#dc2626" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي المنصرف (مبيعات)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>
                  {fmt(sections.reduce((acc, s) => acc + Number(s.issued_weight || 0), 0), 2)} كجم
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={22} color="#16a34a" />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>المتاح حالياً بالأقسام</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                  {fmt(sections.reduce((acc, s) => acc + Number(s.available_weight || 0), 0), 2)} كجم
                </div>
              </div>
            </div>
          </div>

          {/* Sections Table Container */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 10px rgba(15,35,64,0.04)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1A3A5C', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderTree size={18} color="#7c3aed" /> أقسام المخزن والأوزان الإجمالية
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                  كل قسم يحدد وزناً إجمالياً، وعند بيع أي صنف تابع للقسم يُخصم الوزن تلقائياً من رصيد القسم
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenSectionModal()}
                style={{
                  background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '7px 16px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                <Plus size={16} /> إضافة قسم جديد
              </button>
            </div>

            {sectionsLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>جاري تحميل الأقسام...</div>
            ) : sections.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                <FolderTree size={36} color="#94a3b8" style={{ marginBottom: 10 }} />
                <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6 }}>لا توجد أقسام مسجلة بالمخزن بعد</div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 14 }}>
                  أضف قسماً (مثل: قطاع فضي) مع وزنه الإجمالي واربط به أصنافه الفرعية
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenSectionModal()}
                  style={{
                    background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '8px 18px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer'
                  }}
                >
                  <Plus size={16} style={{ marginLeft: 4 }} /> إضافة أول قسم الآن
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', textAlign: 'right', color: '#475569', fontSize: '0.8rem', fontWeight: 700 }}>
                      <th style={{ padding: '12px 16px' }}>اسم القسم</th>
                      <th style={{ padding: '12px 16px' }}>الوزن الكلي (كجم)</th>
                      <th style={{ padding: '12px 16px' }}>المنصرف (كجم)</th>
                      <th style={{ padding: '12px 16px' }}>المتاح حالياً (كجم)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>الأصناف التابعة</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>الحالة</th>
                      <th style={{ padding: '12px 16px' }}>ملاحظات</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((sec) => {
                      const avail = Number(sec.available_weight ?? (sec.total_weight - sec.issued_weight));
                      const isZero = avail <= 0;
                      return (
                        <tr
                          key={sec.id}
                          style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#faf5ff'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '12px 16px', fontWeight: 800, color: '#1A3A5C' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <FolderTree size={15} color="#7c3aed" />
                              {sec.name}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                            {fmt(sec.total_weight, 2)} كجم
                          </td>
                          <td style={{ padding: '12px 16px', color: '#dc2626', fontWeight: 700 }}>
                            {fmt(sec.issued_weight, 2)} كجم
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 10px', borderRadius: 6, fontWeight: 800, fontSize: '0.84rem',
                              background: isZero ? '#fee2e2' : '#dcfce7',
                              color: isZero ? '#dc2626' : '#15803d',
                              border: `1px solid ${isZero ? '#fecaca' : '#bbf7d0'}`
                            }}>
                              {fmt(avail, 2)} كجم
                              {isZero && <span style={{ fontSize: '0.72rem' }}>(نفذ)</span>}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenSectionItems(sec)}
                              style={{
                                background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                                borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem',
                                fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5
                              }}
                              title="إدارة الأصناف المربوطة بهذا القسم"
                            >
                              <Layers size={13} /> {sec.items_count || 0} صنف
                            </button>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              background: sec.is_active ? '#dcfce7' : '#fee2e2',
                              color: sec.is_active ? '#166534' : '#991b1b',
                              padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700
                            }}>
                              {sec.is_active ? 'نشط' : 'معطل'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '0.82rem' }}>
                            {sec.notes || '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleOpenAddWeightModal(sec)}
                                style={{
                                  background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
                                  borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem',
                                  fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                                  transition: 'all 0.15s'
                                }}
                                title="إضافة وزن جديد لرصيد هذا القسم"
                              >
                                <Plus size={13} /> إضافة وزن
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSectionItems(sec)}
                                className="btn btn-icon btn-ghost"
                                style={{ color: '#2563eb' }}
                                title="ربط وإدارة الأصناف"
                              >
                                <Link2 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSectionModal(sec)}
                                className="btn btn-icon btn-ghost"
                                title="تعديل القسم"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSectionDeleteClick(sec.id)}
                                className="btn btn-icon btn-ghost"
                                style={{ color: '#dc2626' }}
                                title="حذف القسم"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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

          <div className="form-group">
            <label className="form-label">القسم التابع له هذا الصنف (اختياري)</label>
            <select
              className="form-input"
              value={formData.section_id || ''}
              onChange={(e) => setFormData({ ...formData, section_id: e.target.value })}
            >
              <option value="">-- بدون قسم (صنف مستقل) --</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} (متاح بالقسم: {fmt(s.available_weight)} كجم)
                </option>
              ))}
            </select>
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

      {/* ─── Add / Edit Section Modal ────────────────────────────────────── */}
      <Modal
        isOpen={isSectionModalOpen}
        onClose={() => setIsSectionModalOpen(false)}
        title={editingSection ? 'تعديل بيانات القسم' : 'إضافة قسم جديد بالمخزن'}
      >
        <form onSubmit={handleSectionSubmit}>
          <div className="form-group">
            <label className="form-label">اسم القسم *</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: قطاع فضي، قطاع ملون، قطاع جامبو..."
              value={sectionFormData.name}
              onChange={(e) => setSectionFormData({ ...sectionFormData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">الوزن الإجمالي للقسم (كجم) *</label>
            <input
              type="number"
              step="0.001"
              min="0"
              className="form-input"
              placeholder="إجمالي وزن هذا القسم بالكيلوجرام"
              value={sectionFormData.total_weight}
              onChange={(e) => setSectionFormData({ ...sectionFormData, total_weight: e.target.value })}
              required
            />
            {editingSection && (
              <span style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                ملاحظة: تم صرف {fmt(editingSection.issued_weight)} كجم بالفعل، لا يمكن وضع وزن أقل من هذا المنصرف.
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-textarea"
              rows="2"
              placeholder="أي ملاحظات حول هذا القسم ومواصفاته..."
              value={sectionFormData.notes}
              onChange={(e) => setSectionFormData({ ...sectionFormData, notes: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="sec-active"
              checked={sectionFormData.is_active}
              onChange={(e) => setSectionFormData({ ...sectionFormData, is_active: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="sec-active" style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1A3A5C', cursor: 'pointer' }}>
              القسم نشط ومتاح للبيع منه
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1, background: '#7c3aed' }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : (editingSection ? 'تحديث القسم' : 'حفظ القسم')}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsSectionModalOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Manage Section Items Modal ─────────────────────────────────── */}
      {isSectionItemsModalOpen && activeSectionForItems && (
        <Modal
          isOpen={isSectionItemsModalOpen}
          onClose={() => {
            setIsSectionItemsModalOpen(false);
            setActiveSectionForItems(null);
          }}
          title={`أصناف قسم: ${activeSectionForItems.name}`}
        >
          <div style={{ padding: '4px 0' }}>
            {/* Header info bar */}
            <div style={{
              background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: 10,
              padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 20, flexWrap: 'wrap'
            }}>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#6b21a8', display: 'block' }}>الوزن الكلي</span>
                <strong style={{ fontSize: '1rem', color: '#7c3aed' }}>{fmt(activeSectionForItems.total_weight)} كجم</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#6b21a8', display: 'block' }}>المنصرف</span>
                <strong style={{ fontSize: '1rem', color: '#dc2626' }}>{fmt(activeSectionForItems.issued_weight)} كجم</strong>
              </div>
              <div>
                <span style={{ fontSize: '0.74rem', color: '#6b21a8', display: 'block' }}>المتاح حالياً</span>
                <strong style={{ fontSize: '1rem', color: '#16a34a' }}>{fmt(activeSectionForItems.available_weight)} كجم</strong>
              </div>
            </div>

            {/* List of items currently assigned */}
            <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#1A3A5C', fontWeight: 800 }}>
              الأصناف المندرجة تحت هذا القسم ({activeSectionForItems.items?.length || 0}):
            </h4>

            {(!activeSectionForItems.items || activeSectionForItems.items.length === 0) ? (
              <div style={{ padding: 18, textAlign: 'center', background: '#f8fafc', borderRadius: 8, color: '#64748b', fontSize: '0.84rem' }}>
                لا توجد أصناف مربوطة بهذا القسم حالياً. يمكنك ربط أصناف المخزن من القائمة أدناه.
              </div>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 18 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'right', color: '#475569' }}>
                      <th style={{ padding: '8px 10px' }}>الصنف</th>
                      <th style={{ padding: '8px 10px' }}>الشركة</th>
                      <th style={{ padding: '8px 10px' }}>الوزن المتاح</th>
                      <th style={{ padding: '8px 10px' }}>اللفات</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSectionForItems.items.map((it) => (
                      <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1A3A5C' }}>{it.product}</td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{it.company || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(it.available_quantity)} كجم</td>
                        <td style={{ padding: '8px 10px' }}>{it.available_rolls || 0} لفة</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleAssignItem(it.id, null)}
                            style={{
                              background: '#fee2e2', color: '#dc2626', border: 'none',
                              borderRadius: 4, padding: '3px 8px', fontSize: '0.74rem',
                              cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4
                            }}
                            title="إلغاء ربط الصنف من هذا القسم"
                          >
                            <Unlink2 size={12} /> إلغاء الربط
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Link another item from inventory */}
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px dashed #cbd5e1', marginTop: 14 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                ➕ ربط صنف من المخزن بهذا القسم:
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <select
                  id="assign-inv-select"
                  className="form-input"
                  style={{ flex: 1, fontSize: '0.82rem' }}
                  defaultValue=""
                >
                  <option value="">-- اختر صنفاً لربطه بالقسم --</option>
                  {inventory
                    .filter(inv => !activeSectionForItems.items?.some(it => it.id === inv.id))
                    .map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.product} {inv.company ? `(${inv.company})` : ''} — متاح: {fmt(inv.remaining_weight || inv.available_quantity)} كجم {inv.section_name ? `[مربوط بـ: ${inv.section_name}]` : ''}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const sel = document.getElementById('assign-inv-select');
                    if (sel && sel.value) {
                      handleAssignItem(sel.value, activeSectionForItems.id);
                      sel.value = '';
                    } else {
                      toast.error('يرجى اختيار صنف أولاً');
                    }
                  }}
                  style={{
                    background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
                    padding: '7px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <Link2 size={14} /> ربط الآن
                </button>
              </div>
            </div>

            <div style={{ marginTop: 20, textAlign: 'left' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setIsSectionItemsModalOpen(false);
                  setActiveSectionForItems(null);
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Modal: Add Weight to Section ───────────────────────────── */}
      {addWeightModal.isOpen && (
        <Modal
          isOpen={addWeightModal.isOpen}
          onClose={() => setAddWeightModal(p => ({ ...p, isOpen: false, section: null }))}
          title={`إضافة وزن لرصيد القسم: ${addWeightModal.section?.name || ''}`}
          maxWidth="520px"
        >
          <form onSubmit={handleSaveAddWeight} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#64748b' }}>الرصيد المتاح الحالي بالقسم:</span>
                <strong style={{ color: '#16a34a', fontSize: '0.95rem' }}>
                  {fmt(addWeightModal.section ? (Number(addWeightModal.section.total_weight || 0) - Number(addWeightModal.section.issued_weight || 0)) : 0)} كجم
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>الوزن الإجمالي المسجل:</span>
                <strong>{fmt(addWeightModal.section?.total_weight || 0)} كجم</strong>
              </div>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155' }}>
                الوزن المراد إضافته (كجم) *
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                placeholder="مثال: 500"
                value={addWeightModal.addedWeight}
                onChange={e => setAddWeightModal(p => ({ ...p, addedWeight: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: '0.92rem', outline: 'none' }}
              />
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                سيتم زيادة هذا الوزن على إجمالي رصيد القسم وينعكس فوراً على المتاح العام بالمخزن
              </span>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#334155' }}>
                البيان / سبب الإضافة (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: وارد بضاعة إضافي، تسوية ميزان..."
                value={addWeightModal.notes}
                onChange={e => setAddWeightModal(p => ({ ...p, notes: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 8, fontSize: '0.92rem', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAddWeightModal(p => ({ ...p, isOpen: false, section: null }))}
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={addWeightModal.isSubmitting}
                style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', color: '#fff' }}
              >
                {addWeightModal.isSubmitting ? 'جاري الحفظ...' : 'تأكيد إضافة الوزن (+)'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── Confirm Section Delete Modal ───────────────────────────────── */}
      <ConfirmModal
        isOpen={isSectionConfirmOpen}
        onClose={() => {
          setIsSectionConfirmOpen(false);
          setSectionToDelete(null);
        }}
        onConfirm={confirmSectionDelete}
        title="تأكيد حذف القسم"
        message="هل أنت متأكد من حذف هذا القسم؟ سيتم إلغاء ربط كافة الأصناف التابعة له (ولن يتم حذف الأصناف نفسها من المخزن)."
      />
    </div>
  );
};

export default InventoryPage;
