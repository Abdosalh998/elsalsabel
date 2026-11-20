import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardCheck, Plus, Search, Calendar, FileText, CheckCircle2,
  AlertTriangle, Clock, RefreshCw, Printer, Trash2, Eye,
  ArrowDownToLine, Scale, Layers, ChevronRight, X, AlertCircle,
  Building2, Check, Lock, Save, Sparkles, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { stocktakingService } from '../../services/stocktaking.service';
import { inventoryService } from '../../services/inventory.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import './StocktakingPage.css';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const STATUS_LABELS = {
  draft: { text: 'مسودة حصر', color: '#64748b', bg: '#f1f5f9' },
  in_progress: { text: 'قيد الجرد الفعلي', color: '#d97706', bg: '#fef3c7' },
  completed: { text: 'مكتمل بانتظار الاعتماد', color: '#2563eb', bg: '#dbeafe' },
  settled: { text: 'معتمد ومُسوّى بالمخزن', color: '#059669', bg: '#d1fae5' },
  cancelled: { text: 'ملغي', color: '#dc2626', bg: '#fee2e2' },
};

const EMPTY_SESSION_FORM = {
  title: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  type: 'full', // 'full' | 'section'
  section_id: '',
  auditor_name: '',
  notes: '',
};

const StocktakingPage = () => {
  const [stocktakes, setStocktakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [sections, setSections] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    startDate: '',
    endDate: '',
    search: '',
  });

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState(EMPTY_SESSION_FORM);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Active Count/Audit Modal
  const [activeSession, setActiveSession] = useState(null);
  const [sessionItems, setSessionItems] = useState([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isCountModalOpen, setIsCountModalOpen] = useState(false);
  const [isSavingCounts, setIsSavingCounts] = useState(false);
  const [countSearch, setCountSearch] = useState('');
  const [countFilter, setCountFilter] = useState('all'); // 'all' | 'counted' | 'uncounted' | 'diff_only'

  // Settle Confirm Modal
  const [isSettleConfirmOpen, setIsSettleConfirmOpen] = useState(false);
  const [sessionToSettle, setSessionToSettle] = useState(null);
  const [isSettling, setIsSettling] = useState(false);

  // Delete Confirm Modal
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Print Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printSession, setPrintSession] = useState(null);
  const [printType, setPrintType] = useState('final'); // 'final' (محضر جرد نهائي) | 'blank' (كشف حصر ميداني فارغ)

  // Fetch sections
  useEffect(() => {
    inventoryService.getSections({ include_inactive: false })
      .then(res => setSections(res.data || []))
      .catch(() => {});
  }, []);

  // Fetch stocktakes list
  const fetchStocktakes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stocktakingService.getStocktakes(filters);
      setStocktakes(res.data?.stocktakes || []);
      setSummary(res.data?.summary || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تحميل جلسات الجرد');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchStocktakes();
  }, [fetchStocktakes]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setCreateFormData({
      ...EMPTY_SESSION_FORM,
      title: `جرد مخزن بتاريخ ${format(new Date(), 'yyyy/MM/dd')}`,
      date: format(new Date(), 'yyyy-MM-dd'),
    });
    setIsCreateModalOpen(true);
  };

  // Submit Create Session
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createFormData.title.trim()) {
      return toast.error('يرجى إدخال عنوان جلسة الجرد');
    }
    setIsSubmittingCreate(true);
    try {
      const res = await stocktakingService.createStocktake(createFormData);
      toast.success(res.message || 'تم بدء جلسة الجرد بنجاح');
      setIsCreateModalOpen(false);
      fetchStocktakes();
      // Automatically open count modal for newly created session
      if (res.data?.id) {
        handleOpenCountModal(res.data.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل إنشاء جلسة الجرد');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Open Count & Entry Modal
  const handleOpenCountModal = async (sessionId) => {
    setIsLoadingSession(true);
    setIsCountModalOpen(true);
    try {
      const res = await stocktakingService.getStocktakeById(sessionId);
      setActiveSession(res.data);
      // Map items to manageable local state
      const mapped = (res.data?.items || []).map(item => ({
        ...item,
        local_weight: item.actual_weight !== null && item.actual_weight !== undefined ? String(item.actual_weight) : '',
        local_rolls: item.actual_rolls !== null && item.actual_rolls !== undefined ? String(item.actual_rolls) : '',
        local_notes: item.notes || '',
      }));
      setSessionItems(mapped);
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تحميل بيانات الجرد');
      setIsCountModalOpen(false);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Update item local input in count modal
  const handleItemInputChange = (itemId, field, value) => {
    setSessionItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const updated = { ...it, [field]: value };
      return updated;
    }));
  };

  // Quick Action: Match item with system
  const handleMatchItemWithSystem = (itemId) => {
    setSessionItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      return {
        ...it,
        local_weight: String(it.system_weight ?? 0),
        local_rolls: String(it.system_rolls ?? 0),
      };
    }));
  };

  // Quick Action: Match ALL remaining uncounted items with system
  const handleMatchAllUncounted = () => {
    let count = 0;
    setSessionItems(prev => prev.map(it => {
      if (it.local_weight === '' || it.local_weight === null) {
        count++;
        return {
          ...it,
          local_weight: String(it.system_weight ?? 0),
          local_rolls: String(it.system_rolls ?? 0),
        };
      }
      return it;
    }));
    toast.success(`تمت مطابقة ${count} صنف مع الرصيد الدفتري`);
  };

  // Save Counts
  const handleSaveCounts = async (markAsCompleted = false) => {
    if (!activeSession) return;
    setIsSavingCounts(true);
    try {
      const payloadItems = sessionItems.map(it => ({
        id: it.id,
        actual_weight: it.local_weight !== '' ? Number(it.local_weight) : null,
        actual_rolls: it.local_rolls !== '' ? Number(it.local_rolls) : null,
        notes: it.local_notes,
      }));

      const res = await stocktakingService.saveCounts(activeSession.id, payloadItems, markAsCompleted);
      toast.success(res.message || 'تم حفظ نتائج الجرد بنجاح');
      fetchStocktakes();
      // Reload session details
      const refreshed = await stocktakingService.getStocktakeById(activeSession.id);
      setActiveSession(refreshed.data);
      const mapped = (refreshed.data?.items || []).map(item => ({
        ...item,
        local_weight: item.actual_weight !== null && item.actual_weight !== undefined ? String(item.actual_weight) : '',
        local_rolls: item.actual_rolls !== null && item.actual_rolls !== undefined ? String(item.actual_rolls) : '',
        local_notes: item.notes || '',
      }));
      setSessionItems(mapped);
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل حفظ النتائج');
    } finally {
      setIsSavingCounts(false);
    }
  };

  // Settle Stocktake
  const handleSettle = async () => {
    if (!sessionToSettle) return;
    setIsSettling(true);
    try {
      const res = await stocktakingService.settleStocktake(sessionToSettle.id);
      toast.success(res.message || 'تم اعتماد وتسوية الجرد بنجاح وتحديث أرصدة المخزن');
      setIsSettleConfirmOpen(false);
      setSessionToSettle(null);
      if (isCountModalOpen) {
        setIsCountModalOpen(false);
      }
      fetchStocktakes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل تسوية الجرد');
    } finally {
      setIsSettling(false);
    }
  };

  // Delete Stocktake
  const handleDelete = async () => {
    if (!sessionToDelete) return;
    setIsDeleting(true);
    try {
      await stocktakingService.deleteStocktake(sessionToDelete.id);
      toast.success('تم حذف جلسة الجرد بنجاح');
      setIsDeleteConfirmOpen(false);
      setSessionToDelete(null);
      fetchStocktakes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'فشل حذف الجلسة');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open Print Modal
  const handleOpenPrint = async (session) => {
    try {
      const res = await stocktakingService.getStocktakeById(session.id);
      setPrintSession(res.data);
      setIsPrintModalOpen(true);
    } catch (err) {
      toast.error('فشل تجهيز بيانات الطباعة');
    }
  };

  // Trigger Native Browser Print
  const handlePrintAction = () => {
    window.print();
  };

  // Filtered items in count modal
  const filteredSessionItems = useMemo(() => {
    return sessionItems.filter(it => {
      // Search
      if (countSearch.trim()) {
        const q = countSearch.trim().toLowerCase();
        const pMatch = it.product?.toLowerCase().includes(q);
        const cMatch = it.company?.toLowerCase().includes(q);
        const sMatch = it.section_name?.toLowerCase().includes(q);
        if (!pMatch && !cMatch && !sMatch) return false;
      }
      // Status filter
      const isCounted = it.local_weight !== '' && it.local_weight !== null;
      if (countFilter === 'counted' && !isCounted) return false;
      if (countFilter === 'uncounted' && isCounted) return false;
      if (countFilter === 'diff_only') {
        const curW = it.local_weight !== '' ? Number(it.local_weight) : null;
        const curR = it.local_rolls !== '' ? Number(it.local_rolls) : null;
        const wDiff = curW !== null ? curW - Number(it.system_weight || 0) : 0;
        const rDiff = curR !== null ? curR - Number(it.system_rolls || 0) : 0;
        if (wDiff === 0 && rDiff === 0) return false;
      }
      return true;
    });
  }, [sessionItems, countSearch, countFilter]);

  // Real-time live stats in count modal
  const liveStats = useMemo(() => {
    let countedCount = 0;
    let totalSysW = 0;
    let totalActW = 0;
    let totalShortageW = 0;
    let totalSurplusW = 0;
    let totalShortageVal = 0;
    let totalSurplusVal = 0;

    sessionItems.forEach(it => {
      const sysW = Number(it.system_weight || 0);
      const uPrice = Number(it.unit_price || 0);
      totalSysW += sysW;

      if (it.local_weight !== '' && it.local_weight !== null) {
        countedCount++;
        const actW = Number(it.local_weight || 0);
        totalActW += actW;
        const diff = actW - sysW;
        if (diff < 0) {
          totalShortageW += Math.abs(diff);
          totalShortageVal += Math.abs(diff) * uPrice;
        } else if (diff > 0) {
          totalSurplusW += diff;
          totalSurplusVal += diff * uPrice;
        }
      }
    });

    const netWDiff = totalSurplusW - totalShortageW;
    const netValDiff = totalSurplusVal - totalShortageVal;

    return {
      totalItems: sessionItems.length,
      countedCount,
      percent: sessionItems.length > 0 ? Math.round((countedCount / sessionItems.length) * 100) : 0,
      totalSysW,
      totalActW,
      totalShortageW,
      totalSurplusW,
      totalShortageVal,
      totalSurplusVal,
      netWDiff,
      netValDiff
    };
  }, [sessionItems]);

  // Columns for main stocktakes list
  const columns = [
    {
      header: 'رقم الجرد',
      accessor: 'stocktake_number',
      cell: (row) => (
        <div style={{ fontWeight: 600, color: '#1e293b' }}>
          {row.stocktake_number}
        </div>
      ),
    },
    {
      header: 'التاريخ',
      accessor: 'date',
      cell: (row) => row.date ? format(new Date(row.date), 'yyyy/MM/dd') : '-',
    },
    {
      header: 'مسمى الجرد والنوع',
      accessor: 'title',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.title}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {row.type === 'section' ? `قسم: ${row.section_name || 'قسم مخصص'}` : 'جرد كلي شامل لجميع الأصناف'}
          </div>
        </div>
      ),
    },
    {
      header: 'القائم بالجرد',
      accessor: 'auditor_name',
      cell: (row) => row.auditor_name || <span style={{ color: '#94a3b8' }}>غير محدد</span>,
    },
    {
      header: 'الحالة',
      accessor: 'status',
      cell: (row) => {
        const conf = STATUS_LABELS[row.status] || STATUS_LABELS.draft;
        return (
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 600,
            color: conf.color,
            backgroundColor: conf.bg,
          }}>
            {conf.text}
          </span>
        );
      },
    },
    {
      header: 'نسبة الحصر',
      cell: (row) => {
        const total = Number(row.total_items || 0);
        const counted = Number(row.items_counted || 0);
        const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
        return (
          <div style={{ minWidth: 100 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 2 }}>
              <span>{counted} من {total}</span>
              <span style={{ fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ width: '100%', height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: pct === 100 ? '#10b981' : '#3b82f6',
                borderRadius: 3
              }} />
            </div>
          </div>
        );
      },
    },
    {
      header: 'فروقات الوزن',
      cell: (row) => {
        const diff = Number(row.total_weight_diff || 0);
        if (diff === 0) return <span style={{ color: '#64748b' }}>مطابق (0.00)</span>;
        const isSurplus = diff > 0;
        return (
          <span style={{
            fontWeight: 600,
            color: isSurplus ? '#059669' : '#dc2626',
            direction: 'ltr',
            display: 'inline-block'
          }}>
            {isSurplus ? `+${fmt(diff)}` : fmt(diff)} كجم
          </span>
        );
      },
    },
    {
      header: 'القيمة المالية للفرق',
      cell: (row) => {
        const diff = Number(row.total_financial_diff || 0);
        if (diff === 0) return <span style={{ color: '#64748b' }}>0.00 ج.م</span>;
        const isSurplus = diff > 0;
        return (
          <span style={{
            fontWeight: 600,
            color: isSurplus ? '#059669' : '#dc2626',
            direction: 'ltr',
            display: 'inline-block'
          }}>
            {isSurplus ? `+${fmt(diff)}` : fmt(diff)} ج.م
          </span>
        );
      },
    },
    {
      header: 'إجراءات',
      cell: (row) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {row.status !== 'settled' ? (
            <button
              className="stocktake-action-btn primary"
              title="إدخال وحصر الأرصدة الفعلية"
              onClick={() => handleOpenCountModal(row.id)}
            >
              <ClipboardCheck size={16} />
              <span>إدخال الحصر</span>
            </button>
          ) : (
            <button
              className="stocktake-action-btn secondary"
              title="عرض تفاصيل الجرد المعتمد"
              onClick={() => handleOpenCountModal(row.id)}
            >
              <Eye size={16} />
              <span>عرض</span>
            </button>
          )}

          {row.status !== 'settled' && (
            <button
              className="stocktake-action-btn success"
              title="اعتماد وتسوية فروقات الجرد في المخزن"
              onClick={() => {
                setSessionToSettle(row);
                setIsSettleConfirmOpen(true);
              }}
            >
              <CheckCircle2 size={16} />
              <span>تسوية</span>
            </button>
          )}

          <button
            className="stocktake-action-btn outline"
            title="طباعة محضر الجرد / كشف الحصر"
            onClick={() => handleOpenPrint(row)}
          >
            <Printer size={16} />
          </button>

          {row.status !== 'settled' && (
            <button
              className="stocktake-action-btn danger"
              title="حذف جلسة الجرد"
              onClick={() => {
                setSessionToDelete(row);
                setIsDeleteConfirmOpen(true);
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="stocktaking-page">
      {/* Page Header */}
      <div className="stocktaking-header">
        <div className="stocktaking-title-section">
          <div className="stocktaking-icon-box">
            <ClipboardCheck size={28} />
          </div>
          <div>
            <h1 className="stocktaking-title">جرد ومطابقة المخزن</h1>
            <p className="stocktaking-subtitle">
              إدارة جلسات الجرد الدوري والمفاجئ، حصر الأوزان واللفات، ورصد العجز والزيادة مع تسوية المخزون فورياً
            </p>
          </div>
        </div>

        <div className="stocktaking-actions">
          <button
            className="stocktaking-btn refresh-btn"
            onClick={fetchStocktakes}
            title="تحديث البيانات"
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="stocktaking-btn primary-btn"
            onClick={handleOpenCreateModal}
          >
            <Plus size={18} />
            <span>بدء جلسة جرد جديدة</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stocktaking-stats-grid">
        <div className="stocktake-kpi-card">
          <div className="kpi-icon-wrapper blue">
            <ClipboardCheck size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">إجمالي جلسات الجرد</span>
            <span className="kpi-value">{summary?.total_stocktakes || 0}</span>
          </div>
        </div>

        <div className="stocktake-kpi-card">
          <div className="kpi-icon-wrapper amber">
            <Clock size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">جلسات قيد الحصر والتنفيذ</span>
            <span className="kpi-value">
              {Number(summary?.draft_count || 0) + Number(summary?.in_progress_count || 0) + Number(summary?.completed_count || 0)}
            </span>
          </div>
        </div>

        <div className="stocktake-kpi-card">
          <div className="kpi-icon-wrapper emerald">
            <CheckCircle2 size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">جلسات معتمدة ومُسوّاة</span>
            <span className="kpi-value">{summary?.settled_count || 0}</span>
          </div>
        </div>

        <div className="stocktake-kpi-card">
          <div className={`kpi-icon-wrapper ${Number(summary?.net_weight_diff || 0) >= 0 ? 'emerald' : 'rose'}`}>
            <Scale size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">صافي فروقات الوزن</span>
            <span className={`kpi-value ${Number(summary?.net_weight_diff || 0) >= 0 ? 'positive' : 'negative'}`} style={{ direction: 'ltr' }}>
              {fmt(summary?.net_weight_diff || 0)} كجم
            </span>
          </div>
        </div>

        <div className="stocktake-kpi-card">
          <div className={`kpi-icon-wrapper ${Number(summary?.net_financial_diff || 0) >= 0 ? 'emerald' : 'rose'}`}>
            <AlertCircle size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">القيمة المالية للفروقات</span>
            <span className={`kpi-value ${Number(summary?.net_financial_diff || 0) >= 0 ? 'positive' : 'negative'}`} style={{ direction: 'ltr' }}>
              {fmt(summary?.net_financial_diff || 0)} ج.م
            </span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="stocktaking-filter-card">
        <div className="filter-group search">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="بحث برقم الجرد، مسمى الجلسة، القائم بالجرد..."
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
          <label>الحالة:</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="all">كل الحالات</option>
            <option value="draft">مسودة</option>
            <option value="in_progress">قيد الجرد الفعلي</option>
            <option value="completed">مكتمل بانتظار الاعتماد</option>
            <option value="settled">معتمد ومُسوّى بالمخزن</option>
          </select>
        </div>

        <div className="filter-group">
          <label>النوع:</label>
          <select
            value={filters.type}
            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
          >
            <option value="all">كل الأنواع</option>
            <option value="full">جرد كلي شامل</option>
            <option value="section">جرد قسم محدد</option>
          </select>
        </div>

        <div className="filter-group">
          <label>من تاريخ:</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
          />
        </div>

        <div className="filter-group">
          <label>إلى تاريخ:</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="stocktaking-table-container">
        <DataTable
          columns={columns}
          data={stocktakes}
          loading={loading}
          emptyMessage="لا توجد جلسات جرد مسجلة حتى الآن. اضغط 'بدء جلسة جرد جديدة' للبدء."
        />
      </div>

      {/* ─── MODAL 1: Create Stocktake Session ─── */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="بدء جلسة جرد جديدة للمخزن"
      >
        <form onSubmit={handleCreateSubmit} className="stocktake-form">
          <div className="form-group">
            <label className="required">عنوان / مسمى الجلسة</label>
            <input
              type="text"
              required
              placeholder="مثال: جرد شامل دوري لشهر نوفمبر 2026"
              value={createFormData.title}
              onChange={(e) => setCreateFormData(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="required">تاريخ الجرد</label>
              <input
                type="date"
                required
                value={createFormData.date}
                onChange={(e) => setCreateFormData(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>المراجع / القائم بالجرد</label>
              <input
                type="text"
                placeholder="اسم الموظف أو رئيس لجنة الجرد"
                value={createFormData.auditor_name}
                onChange={(e) => setCreateFormData(prev => ({ ...prev, auditor_name: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>نطاق الجرد</label>
              <select
                value={createFormData.type}
                onChange={(e) => setCreateFormData(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="full">جرد كلي شامل (كافة الأصناف بالمخزن)</option>
                <option value="section">جرد قسم محدد فقط</option>
              </select>
            </div>

            {createFormData.type === 'section' && (
              <div className="form-group">
                <label className="required">اختر القسم المراد جرده</label>
                <select
                  required
                  value={createFormData.section_id}
                  onChange={(e) => setCreateFormData(prev => ({ ...prev, section_id: e.target.value }))}
                >
                  <option value="">-- اختر القسم --</option>
                  {sections.map(sec => (
                    <option key={sec.id} value={sec.id}>{sec.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>ملاحظات إضافية</label>
            <textarea
              rows="3"
              placeholder="أي تعليمات أو ملاحظات خاصة بهذه الجلسة..."
              value={createFormData.notes}
              onChange={(e) => setCreateFormData(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div className="form-alert-info">
            <Sparkles size={18} style={{ flexShrink: 0 }} />
            <span>
              عند بدء الجلسة، سيقوم النظام تلقائياً بأخذ لقطة فورية (Snapshot) لأرصدة المخزن الدفترية الحالية لجميع الأصناف، لتمكينك من حصر الأرصدة ومقارنتها دون تأثر بحركات البيع والشراء اللاحقة.
            </span>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCreateModalOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmittingCreate}
            >
              {isSubmittingCreate ? 'جاري إنشاء الجلسة...' : 'بدء جلسة الجرد وحصر الأصناف'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL 2: Full Screen-like Count & Entry Modal ─── */}
      <Modal
        isOpen={isCountModalOpen}
        onClose={() => setIsCountModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClipboardCheck size={22} color="#2563eb" />
            <div>
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {activeSession?.title || 'شاشة حصر وعدّ أرصدة الجرد'}
              </span>
              <span style={{ fontSize: '0.82rem', color: '#64748b', marginRight: 10 }}>
                ({activeSession?.stocktake_number})
              </span>
            </div>
          </div>
        }
        maxWidth="1200px"
      >
        {isLoadingSession ? (
          <div className="loading-state">
            <RefreshCw className="spinner" size={32} />
            <p>جاري تحميل بنود الجرد والأرصدة الدفترية...</p>
          </div>
        ) : (
          <div className="count-modal-wrapper">
            {/* Live Progress Bar & Status */}
            <div className="count-progress-bar-card">
              <div className="progress-info-row">
                <div className="progress-stat">
                  <span className="stat-label">نسبة الإنجاز بالحصر:</span>
                  <span className="stat-val">{liveStats.countedCount} من {liveStats.totalItems} صنف ({liveStats.percent}%)</span>
                </div>

                <div className="progress-stat">
                  <span className="stat-label">حالة الجلسة:</span>
                  <span style={{
                    fontWeight: 600,
                    color: STATUS_LABELS[activeSession?.status]?.color || '#334155'
                  }}>
                    {STATUS_LABELS[activeSession?.status]?.text || 'قيد الجرد'}
                  </span>
                </div>

                <div className="progress-stat">
                  <span className="stat-label">القائم بالجرد:</span>
                  <span className="stat-val">{activeSession?.auditor_name || 'غير محدد'}</span>
                </div>
              </div>

              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${liveStats.percent}%` }} />
              </div>
            </div>

            {/* Quick Actions & Toolbar */}
            <div className="count-toolbar">
              <div className="toolbar-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="بحث في الأصناف أو الشركات أو الأقسام..."
                  value={countSearch}
                  onChange={(e) => setCountSearch(e.target.value)}
                />
              </div>

              <div className="toolbar-filters">
                <button
                  className={`tb-filter-btn ${countFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setCountFilter('all')}
                >
                  الكل ({sessionItems.length})
                </button>
                <button
                  className={`tb-filter-btn ${countFilter === 'uncounted' ? 'active' : ''}`}
                  onClick={() => setCountFilter('uncounted')}
                >
                  لم تُجرد ({sessionItems.length - liveStats.countedCount})
                </button>
                <button
                  className={`tb-filter-btn ${countFilter === 'diff_only' ? 'active' : ''}`}
                  onClick={() => setCountFilter('diff_only')}
                >
                  أصناف بها فروقات فقط
                </button>
              </div>

              {activeSession?.status !== 'settled' && (
                <div className="toolbar-actions">
                  <button
                    className="btn btn-outline-primary btn-sm"
                    onClick={handleMatchAllUncounted}
                    title="تعيين الرصيد الفعلي مطابقاً للدفتري لجميع الأصناف التي لم يتم عدّها بعد"
                  >
                    <Check size={15} />
                    <span>مطابقة باقي الأصناف</span>
                  </button>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="count-items-table-wrapper">
              <table className="count-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الصنف / المنتج</th>
                    <th>الشركة</th>
                    <th>القسم</th>
                    <th style={{ backgroundColor: '#f8fafc' }}>الوزن الدفتري (كجم)</th>
                    <th style={{ backgroundColor: '#f8fafc' }}>اللفات الدفترية</th>
                    <th style={{ backgroundColor: '#eff6ff', minWidth: 130 }}>الوزن الفعلي (كجم) *</th>
                    <th style={{ backgroundColor: '#eff6ff', minWidth: 100 }}>اللفات الفعلية</th>
                    <th>فارق الوزن</th>
                    <th>فارق اللفات</th>
                    <th>القيمة المالية</th>
                    <th>ملاحظات</th>
                    {activeSession?.status !== 'settled' && <th>إجراء</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredSessionItems.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                        لا توجد أصناف تطابق شروط البحث أو الفلترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    filteredSessionItems.map((item, idx) => {
                      const isCounted = item.local_weight !== '' && item.local_weight !== null;
                      const curW = isCounted ? Number(item.local_weight) : null;
                      const curR = item.local_rolls !== '' && item.local_rolls !== null ? Number(item.local_rolls) : null;
                      const sysW = Number(item.system_weight || 0);
                      const sysR = Number(item.system_rolls || 0);
                      const uPrice = Number(item.unit_price || 0);

                      const wDiff = curW !== null ? (curW - sysW) : 0;
                      const rDiff = curR !== null ? (curR - sysR) : 0;
                      const fDiff = wDiff * uPrice;

                      let rowClass = '';
                      if (isCounted) {
                        if (wDiff < 0) rowClass = 'row-shortage';
                        else if (wDiff > 0) rowClass = 'row-surplus';
                        else rowClass = 'row-matched';
                      }

                      return (
                        <tr key={item.id} className={rowClass}>
                          <td style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 600 }}>{item.product}</td>
                          <td style={{ color: '#64748b' }}>{item.company || '-'}</td>
                          <td>
                            {item.section_name ? (
                              <span className="section-pill">{item.section_name}</span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600, direction: 'ltr', backgroundColor: '#f8fafc' }}>
                            {fmt(sysW)}
                          </td>
                          <td style={{ direction: 'ltr', backgroundColor: '#f8fafc' }}>
                            {sysR}
                          </td>

                          {/* Inputs */}
                          <td style={{ backgroundColor: '#eff6ff' }}>
                            {activeSession?.status === 'settled' ? (
                              <span style={{ fontWeight: 700, direction: 'ltr', display: 'inline-block' }}>
                                {item.actual_weight !== null ? fmt(item.actual_weight) : '-'}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="0.001"
                                className="count-input weight"
                                placeholder="الوزن بالميزان..."
                                value={item.local_weight}
                                onChange={(e) => handleItemInputChange(item.id, 'local_weight', e.target.value)}
                              />
                            )}
                          </td>

                          <td style={{ backgroundColor: '#eff6ff' }}>
                            {activeSession?.status === 'settled' ? (
                              <span style={{ fontWeight: 600, direction: 'ltr', display: 'inline-block' }}>
                                {item.actual_rolls !== null ? item.actual_rolls : '-'}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="1"
                                className="count-input rolls"
                                placeholder="اللفات..."
                                value={item.local_rolls}
                                onChange={(e) => handleItemInputChange(item.id, 'local_rolls', e.target.value)}
                              />
                            )}
                          </td>

                          {/* Calculated Diffs */}
                          <td>
                            {!isCounted ? (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            ) : wDiff === 0 ? (
                              <span className="diff-pill matched">مطابق (0.00)</span>
                            ) : wDiff > 0 ? (
                              <span className="diff-pill surplus" style={{ direction: 'ltr' }}>
                                +{fmt(wDiff)} كجم
                              </span>
                            ) : (
                              <span className="diff-pill shortage" style={{ direction: 'ltr' }}>
                                {fmt(wDiff)} كجم
                              </span>
                            )}
                          </td>

                          <td>
                            {!isCounted ? (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            ) : rDiff === 0 ? (
                              <span style={{ color: '#64748b' }}>0</span>
                            ) : rDiff > 0 ? (
                              <span style={{ color: '#059669', fontWeight: 600, direction: 'ltr', display: 'inline-block' }}>
                                +{rDiff}
                              </span>
                            ) : (
                              <span style={{ color: '#dc2626', fontWeight: 600, direction: 'ltr', display: 'inline-block' }}>
                                {rDiff}
                              </span>
                            )}
                          </td>

                          <td>
                            {!isCounted ? (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            ) : fDiff === 0 ? (
                              <span style={{ color: '#64748b' }}>0.00</span>
                            ) : fDiff > 0 ? (
                              <span style={{ color: '#059669', fontWeight: 600, direction: 'ltr', display: 'inline-block' }}>
                                +{fmt(fDiff)} ج.م
                              </span>
                            ) : (
                              <span style={{ color: '#dc2626', fontWeight: 600, direction: 'ltr', display: 'inline-block' }}>
                                {fmt(fDiff)} ج.م
                              </span>
                            )}
                          </td>

                          <td>
                            {activeSession?.status === 'settled' ? (
                              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>{item.notes || '-'}</span>
                            ) : (
                              <input
                                type="text"
                                className="count-input notes"
                                placeholder="ملاحظة..."
                                value={item.local_notes}
                                onChange={(e) => handleItemInputChange(item.id, 'local_notes', e.target.value)}
                              />
                            )}
                          </td>

                          {activeSession?.status !== 'settled' && (
                            <td>
                              <button
                                className="match-row-btn"
                                title="مطابقة هذا البند مع الدفتري"
                                onClick={() => handleMatchItemWithSystem(item.id)}
                              >
                                <Check size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Live Summary Footer */}
            <div className="count-summary-footer">
              <div className="summary-col">
                <span className="lbl">إجمالي الدفتري:</span>
                <span className="val">{fmt(liveStats.totalSysW)} كجم</span>
              </div>
              <div className="summary-col">
                <span className="lbl">إجمالي الفعلي المحصور:</span>
                <span className="val">{fmt(liveStats.totalActW)} كجم</span>
              </div>
              <div className="summary-col">
                <span className="lbl">إجمالي العجز:</span>
                <span className="val text-danger">{fmt(liveStats.totalShortageW)} كجم ({fmt(liveStats.totalShortageVal)} ج.م)</span>
              </div>
              <div className="summary-col">
                <span className="lbl">إجمالي الزيادة:</span>
                <span className="val text-success">{fmt(liveStats.totalSurplusW)} كجم ({fmt(liveStats.totalSurplusVal)} ج.م)</span>
              </div>
              <div className="summary-col net">
                <span className="lbl">الصافي النهائي:</span>
                <span className={`val ${liveStats.netWDiff >= 0 ? 'text-success' : 'text-danger'}`} style={{ direction: 'ltr' }}>
                  {liveStats.netWDiff >= 0 ? `+${fmt(liveStats.netWDiff)}` : fmt(liveStats.netWDiff)} كجم ({fmt(liveStats.netValDiff)} ج.م)
                </span>
              </div>
            </div>

            {/* Modal Bottom Buttons */}
            <div className="count-modal-actions">
              <div className="left-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCountModalOpen(false)}
                >
                  إغلاق النافذة
                </button>
              </div>

              {activeSession?.status !== 'settled' && (
                <div className="right-actions">
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    disabled={isSavingCounts}
                    onClick={() => handleSaveCounts(false)}
                  >
                    <Save size={16} />
                    <span>{isSavingCounts ? 'جاري الحفظ...' : 'حفظ كمسودة ومتابعة لاحقاً'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isSavingCounts}
                    onClick={() => handleSaveCounts(true)}
                  >
                    <CheckCircle2 size={16} />
                    <span>حفظ واعتبار الجلسة مكتملة</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                      // Save counts first then open settle confirmation
                      handleSaveCounts(true).then(() => {
                        setSessionToSettle(activeSession);
                        setIsSettleConfirmOpen(true);
                      });
                    }}
                  >
                    <Lock size={16} />
                    <span>اعتماد وتسوية المخزن الآن</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ─── MODAL 3: Settle Confirm Modal ─── */}
      <ConfirmModal
        isOpen={isSettleConfirmOpen}
        onClose={() => {
          setIsSettleConfirmOpen(false);
          setSessionToSettle(null);
        }}
        onConfirm={handleSettle}
        loading={isSettling}
        title="تأكيد اعتماد وتسوية فروقات الجرد بالمخزن"
        message={
          <div>
            <p style={{ marginBottom: 12 }}>
              هل أنت متأكد من رغبتك في اعتماد جلسة الجرد رقم <strong>{sessionToSettle?.stocktake_number}</strong>؟
            </p>
            <div style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #fde68a',
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: '0.88rem',
              color: '#92400e',
              lineHeight: 1.6
            }}>
              ⚠️ <strong>تنبيه هام:</strong> سيقوم النظام فوراً بتسوية أرصدة المخزن الفعلية، بحيث يتم خصم العجز وإضافة الزيادات للأصناف المحددة، وسيتم قفل جلسة الجرد نهائياً ولا يمكن التراجع عنها.
            </div>
          </div>
        }
        confirmText="نعم، اعتمد وطبّق التسوية بالمخزن"
        cancelText="إلغاء"
        type="warning"
      />

      {/* ─── MODAL 4: Delete Confirm Modal ─── */}
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setSessionToDelete(null);
        }}
        onConfirm={handleDelete}
        loading={isDeleting}
        title="حذف جلسة الجرد"
        message={`هل أنت متأكد من حذف جلسة الجرد رقم "${sessionToDelete?.stocktake_number}"؟ سيتم حذف كافة بيانات الحصر الخاصة بها.`}
        confirmText="نعم، حذف"
        cancelText="إلغاء"
        type="danger"
      />

      {/* ─── MODAL 5: Printable Stocktaking Sheet / Final Report ─── */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="طباعة محضر ونموذج الجرد"
        maxWidth="950px"
      >
        <div className="print-modal-content">
          <div className="print-type-selector no-print">
            <button
              className={`pt-btn ${printType === 'final' ? 'active' : ''}`}
              onClick={() => setPrintType('final')}
            >
              <FileText size={16} />
              <span>محضر الجرد النهائي والمطابقة (مع الفروقات)</span>
            </button>
            <button
              className={`pt-btn ${printType === 'blank' ? 'active' : ''}`}
              onClick={() => setPrintType('blank')}
            >
              <ClipboardCheck size={16} />
              <span>نموذج حصر ميداني (ورقة جرد فارغة للمخزن)</span>
            </button>
            <button
              className="btn btn-primary"
              style={{ marginRight: 'auto' }}
              onClick={handlePrintAction}
            >
              <Printer size={16} />
              <span>طباعة المستند (Ctrl+P)</span>
            </button>
          </div>

          {/* Printable Layout */}
          <div className="printable-stocktake-document" id="printable-stocktake">
            {/* Header */}
            <div className="print-header">
              <div className="header-top">
                <div>
                  <h2 className="company-name">شركة السلسبيل</h2>
                  <p className="branch-title">فرع الشركة / المخازن</p>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <h3 className="doc-type-title">
                    {printType === 'final' ? 'محضر جرد ومطابقة المخزن' : 'نموذج كشف حصر مخزني ميداني'}
                  </h3>
                  <p className="doc-num">رقم الجلسة: {printSession?.stocktake_number}</p>
                </div>
              </div>

              <div className="print-meta-grid">
                <div><strong>مسمى الجلسة:</strong> {printSession?.title}</div>
                <div><strong>تاريخ الجرد:</strong> {printSession?.date ? format(new Date(printSession.date), 'yyyy/MM/dd') : '-'}</div>
                <div><strong>نطاق الجرد:</strong> {printSession?.type === 'section' ? `قسم (${printSession.section_name})` : 'جرد كلي شامل'}</div>
                <div><strong>القائم بالجرد:</strong> {printSession?.auditor_name || 'لجنة الجرد'}</div>
                <div><strong>حالة الجلسة:</strong> {STATUS_LABELS[printSession?.status]?.text || printSession?.status}</div>
                <div><strong>تاريخ الطباعة:</strong> {format(new Date(), 'yyyy/MM/dd HH:mm')}</div>
              </div>
            </div>

            {/* Document Body */}
            <table className="print-table">
              <thead>
                <tr>
                  <th>م</th>
                  <th>الصنف / المنتج</th>
                  <th>الشركة</th>
                  <th>القسم</th>
                  {printType === 'final' && <th>الوزن الدفتري</th>}
                  {printType === 'final' && <th>اللفات الدفترية</th>}
                  <th>الوزن الفعلي (كجم)</th>
                  <th>عدد اللفات الفعلي</th>
                  {printType === 'final' && <th>فارق الوزن</th>}
                  {printType === 'final' && <th>القيمة المالية</th>}
                  <th style={{ width: '15%' }}>ملاحظات وتوقيع</th>
                </tr>
              </thead>
              <tbody>
                {(printSession?.items || []).map((it, idx) => {
                  const sysW = Number(it.system_weight || 0);
                  const actW = it.actual_weight !== null ? Number(it.actual_weight) : null;
                  const wDiff = Number(it.weight_diff || 0);
                  const fDiff = Number(it.financial_diff || 0);

                  return (
                    <tr key={it.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{it.product}</td>
                      <td>{it.company || '-'}</td>
                      <td>{it.section_name || '-'}</td>
                      {printType === 'final' && <td style={{ direction: 'ltr', textAlign: 'center' }}>{fmt(sysW)}</td>}
                      {printType === 'final' && <td style={{ textAlign: 'center' }}>{it.system_rolls}</td>}

                      {/* Actual */}
                      <td style={{ textAlign: 'center', direction: 'ltr' }}>
                        {printType === 'final' ? (actW !== null ? fmt(actW) : '-') : ''}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {printType === 'final' ? (it.actual_rolls !== null ? it.actual_rolls : '-') : ''}
                      </td>

                      {/* Diffs */}
                      {printType === 'final' && (
                        <td style={{
                          textAlign: 'center',
                          direction: 'ltr',
                          fontWeight: 600,
                          color: wDiff < 0 ? '#dc2626' : wDiff > 0 ? '#059669' : '#334155'
                        }}>
                          {wDiff > 0 ? `+${fmt(wDiff)}` : fmt(wDiff)}
                        </td>
                      )}
                      {printType === 'final' && (
                        <td style={{
                          textAlign: 'center',
                          direction: 'ltr',
                          fontWeight: 600,
                          color: fDiff < 0 ? '#dc2626' : fDiff > 0 ? '#059669' : '#334155'
                        }}>
                          {fDiff > 0 ? `+${fmt(fDiff)}` : fmt(fDiff)}
                        </td>
                      )}
                      <td>{it.notes || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Print Summary (Only for final report) */}
            {printType === 'final' && (
              <div className="print-summary-box">
                <div className="summary-item">
                  <span>إجمالي الوزن الدفتري:</span>
                  <strong>{fmt(printSession?.total_system_weight)} كجم</strong>
                </div>
                <div className="summary-item">
                  <span>إجمالي الوزن الفعلي:</span>
                  <strong>{fmt(printSession?.total_actual_weight)} كجم</strong>
                </div>
                <div className="summary-item">
                  <span>صافي فرق الوزن:</span>
                  <strong style={{ direction: 'ltr' }}>{fmt(printSession?.total_weight_diff)} كجم</strong>
                </div>
                <div className="summary-item">
                  <span>صافي القيمة المالية للفروقات:</span>
                  <strong style={{ direction: 'ltr' }}>{fmt(printSession?.total_financial_diff)} ج.م</strong>
                </div>
              </div>
            )}

            {/* Signatures */}
            <div className="print-signatures">
              <div className="sig-box">
                <p>أمين المخزن</p>
                <div className="sig-line" />
                <p>الاسم: ........................</p>
              </div>
              <div className="sig-box">
                <p>لجنة الجرد / المراجع</p>
                <div className="sig-line" />
                <p>الاسم: {printSession?.auditor_name || '........................'}</p>
              </div>
              <div className="sig-box">
                <p>مدير الفرع / الإدارة</p>
                <div className="sig-line" />
                <p>الاسم: ........................</p>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StocktakingPage;
