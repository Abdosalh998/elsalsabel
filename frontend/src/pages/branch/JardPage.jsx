import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers, Plus, Search, Calendar, FileText, CheckCircle2,
  AlertTriangle, Clock, RefreshCw, Printer, Trash2, Eye,
  ArrowDownToLine, Scale, ChevronRight, X, AlertCircle,
  Building2, Check, ArrowUpRight, ArrowDownLeft, Edit,
  ArrowLeftRight, FolderTree, Package, Filter, Smartphone
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { jardService } from '../../services/jard.service';
import { inventoryService } from '../../services/inventory.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import './JardPage.css';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const EMPTY_JARD_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  company: '',
  section_id: '',
  product: '',
  opening_rolls: '',
  opening_weight: '',
  notes: '',
};

const EMPTY_MOVEMENT_FORM = {
  jard_id: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  type: 'incoming', // 'incoming' | 'outgoing'
  rolls: '',
  weight: '',
  notes: '',
};

const JardPage = () => {
  const [jardItems, setJardItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [companiesList, setCompaniesList] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    company: 'all',
    section_id: 'all',
    availability: 'all', // 'all' | 'in_stock' | 'out_of_stock'
    startDate: '',
    endDate: '',
    search: '',
  });

  // Modal 1: Add / Edit Item
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_JARD_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal 2: Add Movement (Incoming / Outgoing)
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movementForm, setMovementForm] = useState(EMPTY_MOVEMENT_FORM);
  const [isSubmittingMovement, setIsSubmittingMovement] = useState(false);

  // Modal 3: Movements History
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Modal 4: Delete Confirm
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal 5: Print Report
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Load sections on mount
  useEffect(() => {
    inventoryService.getSections({ include_inactive: false })
      .then(res => setSectionsList(res.data || []))
      .catch(() => {});
  }, []);

  // Fetch Jard list
  const fetchJardList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await jardService.getJardList(filters);
      setJardItems(res.data?.items || []);
      setSummary(res.data?.summary || null);
      if (res.data?.companies) {
        setCompaniesList(res.data.companies);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تحميل سجل الجرد');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchJardList();
  }, [fetchJardList]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setFormData(EMPTY_JARD_FORM);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      date: item.date ? format(new Date(item.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      company: item.company || '',
      section_id: item.section_id ? String(item.section_id) : '',
      product: item.product || '',
      opening_rolls: String(item.opening_rolls ?? ''),
      opening_weight: item.opening_weight ? String(item.opening_weight) : '',
      notes: item.notes || '',
    });
    setIsModalOpen(true);
  };

  // Submit Create / Edit
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.company.trim() || !formData.product.trim()) {
      return toast.error('يرجى إدخال اسم الشركة واسم الصنف');
    }
    if (formData.opening_rolls === '' || Number(formData.opening_rolls) < 0) {
      return toast.error('يرجى إدخال رصيد أول المدة (عدد اللفات)');
    }

    setIsSubmitting(true);
    try {
      const payload = {
        date: formData.date,
        company: formData.company.trim(),
        section_id: formData.section_id ? Number(formData.section_id) : null,
        product: formData.product.trim(),
        opening_rolls: Number(formData.opening_rolls || 0),
        opening_weight: Number(formData.opening_weight || 0),
        notes: formData.notes?.trim() || null,
      };

      if (editingItem) {
        await jardService.updateJardItem(editingItem.id, payload);
        toast.success('تم تحديث صنف الجرد بنجاح');
      } else {
        await jardService.addJardItem(payload);
        toast.success('تمت إضافة صنف الجرد ورصيد أول المدة بنجاح');
      }
      setIsModalOpen(false);
      fetchJardList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ الصنف');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Movement Modal
  const handleOpenMovementModal = (jardId = '') => {
    setMovementForm({
      ...EMPTY_MOVEMENT_FORM,
      jard_id: jardId ? String(jardId) : (jardItems[0]?.id ? String(jardItems[0].id) : ''),
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    setIsMovementModalOpen(true);
  };

  // Submit Movement
  const handleSubmitMovement = async (e) => {
    e.preventDefault();
    if (!movementForm.jard_id) {
      return toast.error('يرجى تحديد الصنف');
    }
    const numRolls = Number(movementForm.rolls || 0);
    const numWeight = Number(movementForm.weight || 0);
    if (numRolls <= 0 && numWeight <= 0) {
      return toast.error('يرجى إدخال عدد اللفات أو الوزن للحركة');
    }

    setIsSubmittingMovement(true);
    try {
      const payload = {
        jard_id: Number(movementForm.jard_id),
        date: movementForm.date,
        type: movementForm.type,
        rolls: numRolls,
        weight: numWeight,
        notes: movementForm.notes?.trim() || null,
      };

      const res = await jardService.addMovement(payload);
      toast.success(res.message || 'تم تسجيل الحركة بنجاح');
      setIsMovementModalOpen(false);
      fetchJardList();
      if (isHistoryModalOpen && historyItem && String(historyItem.id) === String(movementForm.jard_id)) {
        handleOpenHistory(historyItem.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تسجيل الحركة');
    } finally {
      setIsSubmittingMovement(false);
    }
  };

  // Open History Modal
  const handleOpenHistory = async (itemId) => {
    setIsLoadingHistory(true);
    setIsHistoryModalOpen(true);
    try {
      const res = await jardService.getJardById(itemId);
      setHistoryItem(res.data);
    } catch (err) {
      toast.error('فشل تحميل سجل الحركات');
      setIsHistoryModalOpen(false);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Delete Manual Movement
  const handleDeleteMovement = async (movId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الحركة واسترجاع الرصيد؟')) return;
    try {
      await jardService.deleteMovement(movId);
      toast.success('تم حذف الحركة بنجاح');
      fetchJardList();
      if (historyItem) {
        handleOpenHistory(historyItem.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل حذف الحركة');
    }
  };

  // Delete Item
  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await jardService.deleteJardItem(itemToDelete.id);
      toast.success('تم حذف صنف الجرد بنجاح');
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);
      fetchJardList();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل حذف الصنف');
    } finally {
      setIsDeleting(false);
    }
  };

  // Columns for DataTable
  const columns = [
    {
      key: 'date',
      label: 'التاريخ',
      header: 'التاريخ',
      accessor: 'date',
      render: (row) => row.date ? format(new Date(row.date), 'yyyy/MM/dd') : '-',
      cell: (row) => row.date ? format(new Date(row.date), 'yyyy/MM/dd') : '-',
    },
    {
      key: 'company',
      label: 'اسم الشركة',
      header: 'اسم الشركة',
      accessor: 'company',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#1e293b' }}>
          {row.company}
        </span>
      ),
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#1e293b' }}>
          {row.company}
        </span>
      ),
    },
    {
      key: 'section_name',
      label: 'القسم',
      header: 'القسم',
      accessor: 'section_name',
      render: (row) => row.section_name ? (
        <span className="jard-section-tag">{row.section_name}</span>
      ) : (
        <span style={{ color: '#94a3b8' }}>-</span>
      ),
      cell: (row) => row.section_name ? (
        <span className="jard-section-tag">{row.section_name}</span>
      ) : (
        <span style={{ color: '#94a3b8' }}>-</span>
      ),
    },
    {
      key: 'product',
      label: 'الصنف / المنتج',
      header: 'الصنف / المنتج',
      accessor: 'product',
      render: (row) => (
        <div style={{ fontWeight: 600 }}>{row.product}</div>
      ),
      cell: (row) => (
        <div style={{ fontWeight: 600 }}>{row.product}</div>
      ),
    },
    {
      key: 'opening_rolls',
      label: 'أول المدة (لفات)',
      header: 'أول المدة (لفات)',
      accessor: 'opening_rolls',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#475569', direction: 'ltr', display: 'inline-block' }}>
          {row.opening_rolls}
        </span>
      ),
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#475569', direction: 'ltr', display: 'inline-block' }}>
          {row.opening_rolls}
        </span>
      ),
    },
    {
      key: 'incoming_rolls',
      label: 'الوارد (لفات)',
      header: 'الوارد (لفات)',
      accessor: 'incoming_rolls',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#2563eb', direction: 'ltr', display: 'inline-block' }}>
          {Number(row.incoming_rolls) > 0 ? `+${row.incoming_rolls}` : '0'}
        </span>
      ),
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#2563eb', direction: 'ltr', display: 'inline-block' }}>
          {Number(row.incoming_rolls) > 0 ? `+${row.incoming_rolls}` : '0'}
        </span>
      ),
    },
    {
      key: 'outgoing_rolls',
      label: 'الصادر (لفات)',
      header: 'الصادر (لفات)',
      accessor: 'outgoing_rolls',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#dc2626', direction: 'ltr', display: 'inline-block' }}>
          {Number(row.outgoing_rolls) > 0 ? `-${row.outgoing_rolls}` : '0'}
        </span>
      ),
      cell: (row) => (
        <span style={{ fontWeight: 700, color: '#dc2626', direction: 'ltr', display: 'inline-block' }}>
          {Number(row.outgoing_rolls) > 0 ? `-${row.outgoing_rolls}` : '0'}
        </span>
      ),
    },
    {
      key: 'available_rolls',
      label: 'المتاح الفعلي (لفات)',
      header: 'المتاح الفعلي (لفات)',
      accessor: 'available_rolls',
      render: (row) => {
        const avail = Number(row.available_rolls || 0);
        const isAvail = avail > 0;
        return (
          <span className={`jard-avail-pill ${isAvail ? 'available' : 'empty'}`}>
            {avail} لفة
          </span>
        );
      },
      cell: (row) => {
        const avail = Number(row.available_rolls || 0);
        const isAvail = avail > 0;
        return (
          <span className={`jard-avail-pill ${isAvail ? 'available' : 'empty'}`}>
            {avail} لفة
          </span>
        );
      },
    },
    {
      key: 'available_weight',
      label: 'المتاح بالوزن',
      header: 'المتاح بالوزن',
      accessor: 'available_weight',
      render: (row) => (
        <span style={{ fontSize: '0.85rem', color: '#64748b', direction: 'ltr', display: 'inline-block' }}>
          {fmt(row.available_weight)} كجم
        </span>
      ),
      cell: (row) => (
        <span style={{ fontSize: '0.85rem', color: '#64748b', direction: 'ltr', display: 'inline-block' }}>
          {fmt(row.available_weight)} كجم
        </span>
      ),
    },
    {
      key: 'notes',
      label: 'ملاحظات',
      header: 'ملاحظات',
      accessor: 'notes',
      render: (row) => row.notes || <span style={{ color: '#94a3b8' }}>-</span>,
      cell: (row) => row.notes || <span style={{ color: '#94a3b8' }}>-</span>,
    },
    {
      key: 'actions',
      label: 'إجراءات',
      header: 'إجراءات',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="jard-action-btn primary"
            title="تسجيل حركة وارد أو صادر لهذا الصنف"
            onClick={() => handleOpenMovementModal(row.id)}
          >
            <ArrowLeftRight size={15} />
            <span>حركة</span>
          </button>

          <button
            className="jard-action-btn secondary"
            title="عرض سجل حركات الوارد والصادر"
            onClick={() => handleOpenHistory(row.id)}
          >
            <Clock size={15} />
            <span>سجل ({row.movements_count || 0})</span>
          </button>

          <button
            className="jard-action-btn edit"
            title="تعديل الصنف"
            onClick={() => handleOpenEditModal(row)}
          >
            <Edit size={15} />
          </button>

          <button
            className="jard-action-btn danger"
            title="حذف الصنف"
            onClick={() => {
              setItemToDelete(row);
              setIsDeleteConfirmOpen(true);
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      cell: (row) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            className="jard-action-btn primary"
            title="تسجيل حركة وارد أو صادر لهذا الصنف"
            onClick={() => handleOpenMovementModal(row.id)}
          >
            <ArrowLeftRight size={15} />
            <span>حركة</span>
          </button>

          <button
            className="jard-action-btn secondary"
            title="عرض سجل حركات الوارد والصادر"
            onClick={() => handleOpenHistory(row.id)}
          >
            <Clock size={15} />
            <span>سجل ({row.movements_count || 0})</span>
          </button>

          <button
            className="jard-action-btn edit"
            title="تعديل الصنف"
            onClick={() => handleOpenEditModal(row)}
          >
            <Edit size={15} />
          </button>

          <button
            className="jard-action-btn danger"
            title="حذف الصنف"
            onClick={() => {
              setItemToDelete(row);
              setIsDeleteConfirmOpen(true);
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="jard-page">
      {/* Header */}
      <div className="jard-header">
        <div className="jard-title-section">
          <div className="jard-icon-box">
            <Layers size={28} />
          </div>
          <div>
            <h1 className="jard-title">سجل الجرد المستقل</h1>
            <p className="jard-subtitle">
              حصر رصيد الجرد المعتمد (أول المدة باللفات)، تسجيل حركات الوارد والصادر، واحتساب المتاح الفعلي تلقائياً
            </p>
          </div>
        </div>

        <div className="jard-actions">
          <button
            className="jard-btn refresh-btn"
            onClick={fetchJardList}
            title="تحديث البيانات"
          >
            <RefreshCw size={18} />
          </button>

          <button
            className="jard-btn outline-btn"
            onClick={() => setIsPrintModalOpen(true)}
            title="طباعة كشف الجرد"
          >
            <Printer size={18} />
            <span>طباعة الكشف</span>
          </button>

          <button
            className="jard-btn movement-btn"
            onClick={() => handleOpenMovementModal()}
          >
            <ArrowLeftRight size={18} />
            <span>تسجيل وارد / صادر</span>
          </button>

          <button
            className="jard-btn primary-btn"
            onClick={handleOpenCreateModal}
          >
            <Plus size={18} />
            <span>إضافة صنف جرد جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="jard-stats-grid">
        <div className="jard-kpi-card">
          <div className="kpi-icon-wrapper blue">
            <Package size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">إجمالي الأصناف المسجلة</span>
            <span className="kpi-value">{summary?.total_items || 0} صنف</span>
          </div>
        </div>

        <div className="jard-kpi-card">
          <div className="kpi-icon-wrapper gray">
            <Clock size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">رصيد أول المدة (المعتمد)</span>
            <span className="kpi-value">{summary?.total_opening_rolls || 0} لفة</span>
            <span className="kpi-subval">({fmt(summary?.total_opening_weight)} كجم)</span>
          </div>
        </div>

        <div className="jard-kpi-card">
          <div className="kpi-icon-wrapper blue">
            <ArrowDownLeft size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">إجمالي الوارد للجرد</span>
            <span className="kpi-value text-blue">+{summary?.total_incoming_rolls || 0} لفة</span>
            <span className="kpi-subval">({fmt(summary?.total_incoming_weight)} كجم)</span>
          </div>
        </div>

        <div className="jard-kpi-card">
          <div className="kpi-icon-wrapper rose">
            <ArrowUpRight size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">إجمالي المنصرف من الجرد</span>
            <span className="kpi-value text-rose">-{summary?.total_outgoing_rolls || 0} لفة</span>
            <span className="kpi-subval">({fmt(summary?.total_outgoing_weight)} كجم)</span>
          </div>
        </div>

        <div className="jard-kpi-card highlight">
          <div className="kpi-icon-wrapper emerald">
            <CheckCircle2 size={24} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">المتاح الفعلي بالجرد</span>
            <span className="kpi-value text-emerald">{summary?.total_available_rolls || 0} لفة</span>
            <span className="kpi-subval">({fmt(summary?.total_available_weight)} كجم)</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="jard-filter-card">
        <div className="filter-group search">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="بحث بالصنف، الشركة، الملاحظات..."
            value={filters.search}
            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
          {filters.search && (
            <button className="clear-btn" onClick={() => setFilters(prev => ({ ...prev, search: '' }))}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-group">
          <label>الشركة:</label>
          <select
            value={filters.company}
            onChange={(e) => setFilters(prev => ({ ...prev, company: e.target.value }))}
          >
            <option value="all">كل الشركات</option>
            {companiesList.map(comp => (
              <option key={comp} value={comp}>{comp}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>القسم:</label>
          <select
            value={filters.section_id}
            onChange={(e) => setFilters(prev => ({ ...prev, section_id: e.target.value }))}
          >
            <option value="all">كل الأقسام</option>
            {sectionsList.map(sec => (
              <option key={sec.id} value={sec.id}>{sec.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>حالة الرصيد:</label>
          <select
            value={filters.availability}
            onChange={(e) => setFilters(prev => ({ ...prev, availability: e.target.value }))}
          >
            <option value="all">الكل</option>
            <option value="in_stock">المتوفر فقط (&gt; 0)</option>
            <option value="out_of_stock">النافذ فقط (= 0)</option>
          </select>
        </div>

        <div className="filter-group">
          <label>من:</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
          />
        </div>

        <div className="filter-group">
          <label>إلى:</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
          />
        </div>

        {(filters.company !== 'all' || filters.section_id !== 'all' || filters.availability !== 'all' || filters.startDate || filters.endDate || filters.search) && (
          <button
            className="reset-filters-btn"
            onClick={() => setFilters({
              company: 'all',
              section_id: 'all',
              availability: 'all',
              startDate: '',
              endDate: '',
              search: '',
            })}
          >
            إعادة تعيين
          </button>
        )}
      </div>

      {/* Main Table */}
      <div className="jard-table-container">
        <DataTable
          title="سجل أصناف الجرد المستقل"
          columns={columns}
          data={jardItems}
          loading={loading}
        />
      </div>

      {/* ─── MODAL 1: Add / Edit Item ─── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'تعديل بيانات صنف الجرد' : 'إضافة صنف جرد جديد (رصيد أول المدة)'}
        maxWidth="620px"
      >
        <form onSubmit={handleSubmitForm} className="jard-modal-form">
          <div className="form-row">
            <div className="form-group">
              <label className="required">التاريخ</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="required">اسم الشركة</label>
              <input
                type="text"
                required
                placeholder="مثال: العالمية، ألكو، سمارت..."
                value={formData.company}
                onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="required">اسم الصنف / المنتج</label>
              <input
                type="text"
                required
                placeholder="مثال: قطاع فضي ملون 10 سم"
                value={formData.product}
                onChange={(e) => setFormData(prev => ({ ...prev, product: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>القسم (اختياري)</label>
              <select
                value={formData.section_id}
                onChange={(e) => setFormData(prev => ({ ...prev, section_id: e.target.value }))}
              >
                <option value="">-- بدون قسم --</option>
                {sectionsList.map(sec => (
                  <option key={sec.id} value={sec.id}>{sec.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="required">
                رصيد أول المدة (عدد اللفات) *
              </label>
              <input
                type="number"
                step="1"
                min="0"
                required
                placeholder="عدد اللفات المعتمدة بالجرد"
                value={formData.opening_rolls}
                onChange={(e) => setFormData(prev => ({ ...prev, opening_rolls: e.target.value }))}
              />
              <span className="field-hint">هو الرصيد المعتمد والأساس المتاح في بداية الجرد</span>
            </div>

            <div className="form-group">
              <label>رصيد أول المدة (الوزن كجم - اختياري)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="الوزن الإجمالي المقابل"
                value={formData.opening_weight}
                onChange={(e) => setFormData(prev => ({ ...prev, opening_weight: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label>ملاحظات</label>
            <textarea
              rows="2"
              placeholder="أي ملاحظات خاصة بهذا الصنف أو حالة البضاعة..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsModalOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'جاري الحفظ...' : (editingItem ? 'تحديث الصنف' : 'إضافة لرصيد الجرد')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL 2: Add Movement (Incoming / Outgoing) ─── */}
      <Modal
        isOpen={isMovementModalOpen}
        onClose={() => setIsMovementModalOpen(false)}
        title="تسجيل حركة وارد / صادر على رصيد الجرد"
        maxWidth="620px"
      >
        <form onSubmit={handleSubmitMovement} className="jard-modal-form">
          <div className="form-group">
            <label className="required">اختر صنف الجرد</label>
            <select
              required
              value={movementForm.jard_id}
              onChange={(e) => setMovementForm(prev => ({ ...prev, jard_id: e.target.value }))}
            >
              <option value="">-- اختر الصنف --</option>
              {jardItems.map(it => (
                <option key={it.id} value={it.id}>
                  {it.product} — [{it.company}] (المتاح حالياً: {it.available_rolls} لفة)
                </option>
              ))}
            </select>
          </div>

          <div className="movement-type-tabs">
            <button
              type="button"
              className={`mov-tab ${movementForm.type === 'incoming' ? 'active incoming' : ''}`}
              onClick={() => setMovementForm(prev => ({ ...prev, type: 'incoming' }))}
            >
              <ArrowDownLeft size={18} />
              <span>تسجيل وارد للجرد (+)</span>
            </button>

            <button
              type="button"
              className={`mov-tab ${movementForm.type === 'outgoing' ? 'active outgoing' : ''}`}
              onClick={() => setMovementForm(prev => ({ ...prev, type: 'outgoing' }))}
            >
              <ArrowUpRight size={18} />
              <span>تسجيل صادر / صرف (-)</span>
            </button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="required">عدد اللفات *</label>
              <input
                type="number"
                step="1"
                min="0"
                required
                placeholder="عدد اللفات"
                value={movementForm.rolls}
                onChange={(e) => setMovementForm(prev => ({ ...prev, rolls: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>الوزن (كجم - اختياري)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="الوزن الإجمالي"
                value={movementForm.weight}
                onChange={(e) => setMovementForm(prev => ({ ...prev, weight: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="required">تاريخ الحركة</label>
              <input
                type="date"
                required
                value={movementForm.date}
                onChange={(e) => setMovementForm(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>البيان / ملاحظات الحركة</label>
              <input
                type="text"
                placeholder="سبب الوارد أو الصادر..."
                value={movementForm.notes}
                onChange={(e) => setMovementForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsMovementModalOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className={`btn ${movementForm.type === 'incoming' ? 'btn-primary' : 'btn-danger'}`}
              disabled={isSubmittingMovement}
            >
              {isSubmittingMovement ? 'جاري التسجيل...' : (movementForm.type === 'incoming' ? 'تسجيل الوارد (+) ' : 'تسجيل الصادر (-) ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL 3: Movements History ─── */}
      <Modal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={20} color="#2563eb" />
            <span>سجل حركات الوارد والصادر: {historyItem?.product} [{historyItem?.company}]</span>
          </div>
        }
        maxWidth="850px"
      >
        {isLoadingHistory ? (
          <div className="loading-state">
            <RefreshCw className="spinner" size={28} />
            <p>جاري تحميل سجل الحركات...</p>
          </div>
        ) : (
          <div className="history-modal-body">
            {/* Quick Balances Summary */}
            <div className="history-summary-strip">
              <div><strong>رصيد أول المدة:</strong> {historyItem?.opening_rolls} لفة</div>
              <div className="text-blue"><strong>إجمالي الوارد:</strong> +{historyItem?.incoming_rolls} لفة</div>
              <div className="text-rose"><strong>إجمالي الصادر:</strong> -{historyItem?.outgoing_rolls} لفة</div>
              <div className="text-emerald"><strong>المتاح الفعلي:</strong> {historyItem?.available_rolls} لفة</div>
            </div>

            {/* Movements List */}
            <div className="history-table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>م</th>
                    <th>التاريخ</th>
                    <th>نوع الحركة</th>
                    <th>المصدر</th>
                    <th>اللفات</th>
                    <th>الوزن</th>
                    <th>البيان / ملاحظات</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {(!historyItem?.movements || historyItem.movements.length === 0) ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                        لا توجد حركات وارد أو صادر مسجلة بعد على هذا الصنف.
                      </td>
                    </tr>
                  ) : (
                    historyItem.movements.map((m, idx) => (
                      <tr key={m.id}>
                        <td style={{ color: '#94a3b8' }}>{idx + 1}</td>
                        <td>{m.date ? format(new Date(m.date), 'yyyy/MM/dd') : '-'}</td>
                        <td>
                          {m.type === 'incoming' ? (
                            <span className="mov-tag incoming">وارد (+)</span>
                          ) : (
                            <span className="mov-tag outgoing">صادر (-)</span>
                          )}
                        </td>
                        <td>
                          {m.source === 'pos' ? (
                            <span className="source-tag pos">مبيعات #{m.sale_invoice_number || m.reference_id}</span>
                          ) : (
                            <span className="source-tag manual">تسجيل يدوي</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 700, direction: 'ltr', textAlign: 'center' }}>
                          {m.rolls}
                        </td>
                        <td style={{ direction: 'ltr', textAlign: 'center', color: '#64748b' }}>
                          {fmt(m.weight)} كجم
                        </td>
                        <td>{m.notes || '-'}</td>
                        <td>
                          {m.source !== 'pos' && (
                            <button
                              className="del-mov-btn"
                              title="حذف الحركة اليدوية"
                              onClick={() => handleDeleteMovement(m.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsHistoryModalOpen(false)}
              >
                إغلاق
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsHistoryModalOpen(false);
                  handleOpenMovementModal(historyItem?.id);
                }}
              >
                <Plus size={16} />
                <span>إضافة حركة جديدة للصنف</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── MODAL 4: Delete Confirm ─── */}
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
        loading={isDeleting}
        title="حذف صنف من الجرد"
        message={`هل أنت متأكد من حذف الصنف "${itemToDelete?.product}"؟ لن يمكنك حذف الصنف إذا كان مرتبطاً بحركات مبيعات سابقة.`}
        confirmText="نعم، حذف"
        cancelText="إلغاء"
        type="danger"
      />

      {/* ─── MODAL 5: Print Report ─── */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="طباعة كشف الجرد المستقل"
        maxWidth="950px"
      >
        <div className="print-modal-box">
          <div className="print-actions-bar no-print">
            <button className="btn btn-primary" onClick={() => window.print()}>
              <Printer size={16} />
              <span>طباعة الكشف الآن (Ctrl + P)</span>
            </button>
          </div>

          <div className="printable-jard-document" id="printable-jard">
            <div className="print-header">
              <div className="header-row">
                <div>
                  <h2 className="company-title">شركة السلسبيل</h2>
                  <p className="branch-sub">كشف رصيد وحركات الجرد المستقل</p>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <h3 className="doc-heading">تقرير الجرد المعتمد</h3>
                  <p className="print-time">تاريخ الطباعة: {format(new Date(), 'yyyy/MM/dd HH:mm')}</p>
                </div>
              </div>

              <div className="print-kpi-summary">
                <div><strong>إجمالي الأصناف:</strong> {summary?.total_items || 0} صنف</div>
                <div><strong>رصيد أول المدة:</strong> {summary?.total_opening_rolls || 0} لفة</div>
                <div><strong>إجمالي الوارد:</strong> +{summary?.total_incoming_rolls || 0} لفة</div>
                <div><strong>إجمالي الصادر:</strong> -{summary?.total_outgoing_rolls || 0} لفة</div>
                <div><strong>المتاح الفعلي:</strong> {summary?.total_available_rolls || 0} لفة ({fmt(summary?.total_available_weight)} كجم)</div>
              </div>
            </div>

            <table className="print-table">
              <thead>
                <tr>
                  <th>م</th>
                  <th>التاريخ</th>
                  <th>اسم الشركة</th>
                  <th>القسم</th>
                  <th>الصنف / المنتج</th>
                  <th>رصيد أول المدة</th>
                  <th>الوارد</th>
                  <th>الصادر</th>
                  <th>المتاح الفعلي</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {jardItems.map((it, idx) => (
                  <tr key={it.id}>
                    <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                    <td>{it.date ? format(new Date(it.date), 'yyyy/MM/dd') : '-'}</td>
                    <td style={{ fontWeight: 700 }}>{it.company}</td>
                    <td>{it.section_name || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{it.product}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr' }}>{it.opening_rolls} لفة</td>
                    <td style={{ textAlign: 'center', direction: 'ltr', color: '#2563eb' }}>+{it.incoming_rolls}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr', color: '#dc2626' }}>-{it.outgoing_rolls}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr', fontWeight: 800, color: '#059669' }}>
                      {it.available_rolls} لفة
                    </td>
                    <td>{it.notes || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="print-signatures">
              <div className="sig-item">
                <p>أمين المخزن / مسؤول الجرد</p>
                <div className="sig-underline" />
                <p>التوقيع: ........................</p>
              </div>
              <div className="sig-item">
                <p>المراجع الداخلي</p>
                <div className="sig-underline" />
                <p>التوقيع: ........................</p>
              </div>
              <div className="sig-item">
                <p>مدير الفرع والإدارة</p>
                <div className="sig-underline" />
                <p>التوقيع: ........................</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default JardPage;
