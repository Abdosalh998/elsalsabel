import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Printer,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Banknote,
  Package,
  Search,
  Filter,
  Eye,
  Trash2,
  Building2,
  RefreshCw,
  Wallet,
  Smartphone,
  Landmark,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { transfersService } from '../../services/transfers.service';
import { treasuryService } from '../../services/treasury.service';
import PrintableTransferVoucher from '../../components/transfers/PrintableTransferVoucher';
import { useAuth } from '../../context/AuthContext';
import './TransfersPage.css';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const getProductDisplayName = (inv) => {
  if (!inv) return '';
  const comp = inv.company ? inv.company.trim() : '';
  const prod = inv.product ? inv.product.trim() : '';
  if (comp && prod) return `${comp} — ${prod}`;
  return prod || comp || 'صنف غير مسمى';
};

const TransfersPage = () => {
  const { user } = useAuth();
  const currentBranchId = user?.branch_id;

  // Data States
  const [transfers, setTransfers] = useState([]);
  const [stats, setStats] = useState({
    total_outgoing: 0,
    total_incoming: 0,
    pending_incoming: 0,
    pending_outgoing: 0,
    total_completed: 0,
    total_monetary_sent: 0,
    total_monetary_received: 0
  });
  const [loading, setLoading] = useState(true);

  // Tab & Filters
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'incoming' | 'outgoing'
  const [filterType, setFilterType] = useState('all'); // 'all' | 'monetary' | 'inventory'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'completed' | 'rejected'
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown options
  const [availableBranches, setAvailableBranches] = useState([]);
  const [availableInventory, setAvailableInventory] = useState([]);
  const [treasuryChannels, setTreasuryChannels] = useState({ cash: 0, wallet: 0, instapay: 0, bank: 0 });

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [transferToConfirm, setTransferToConfirm] = useState(null);
  const [isSubmittingConfirm, setIsSubmittingConfirm] = useState(false);

  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [transferToReject, setTransferToReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [transferToCancel, setTransferToCancel] = useState(null);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [transferToDelete, setTransferToDelete] = useState(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Print Voucher
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [transferToPrint, setTransferToPrint] = useState(null);

  // Full Balance Transfer State
  const [isFullTransferOpen, setIsFullTransferOpen] = useState(false);
  const [fullTransferData, setFullTransferData] = useState({
    to_branch_id: '',
    notes: 'تحويل كامل رصيد الخزينة',
    selectedChannels: { cash: true, wallet: true, instapay: true, bank: true },
    channelAmounts: { cash: 0, wallet: 0, instapay: 0, bank: 0 }
  });
  const [isSubmittingFullTransfer, setIsSubmittingFullTransfer] = useState(false);

  // Create Form State
  const [formData, setFormData] = useState({
    to_branch_id: '',
    type: 'monetary',
    amount: '',
    channel: 'cash',
    notes: '',
    items: []
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Fetch Transfers List & Stats
  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transfersService.getTransfers({
        direction: activeTab,
        type: filterType,
        status: filterStatus
      });
      setTransfers(res.data.transfers || []);
      if (res.data.stats) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل بيانات التحويلات');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterType, filterStatus]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Fetch Auxiliary Data (branches, available inventory, treasury)
  const fetchCreateFormData = async () => {
    try {
      const [branchesRes, inventoryRes, treasuryRes] = await Promise.all([
        transfersService.getAvailableBranches(),
        transfersService.getAvailableInventory(),
        treasuryService.getTreasury().catch(() => ({ data: { channelBalances: { cash: 0, wallet: 0, instapay: 0, bank: 0 } } }))
      ]);
      setAvailableBranches(branchesRes.data || []);
      setAvailableInventory(inventoryRes.data || []);
      if (treasuryRes?.data?.channelBalances) {
        setTreasuryChannels(treasuryRes.data.channelBalances);
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تجهيز بيانات النموذج');
    }
  };

  const handleOpenCreateModal = () => {
    fetchCreateFormData();
    setFormData({
      to_branch_id: '',
      type: 'monetary',
      amount: '',
      channel: 'cash',
      notes: '',
      items: []
    });
    setIsCreateOpen(true);
  };

  const handleOpenFullTransferModal = async () => {
    try {
      await fetchCreateFormData();
    } catch (e) {
      // ignore
    }
    const cCash = Math.max(0, Number(treasuryChannels.cash || 0));
    const cWallet = Math.max(0, Number(treasuryChannels.wallet || 0));
    const cInstapay = Math.max(0, Number(treasuryChannels.instapay || 0));
    const cBank = Math.max(0, Number(treasuryChannels.bank || 0));

    const totalAvail = cCash + cWallet + cInstapay + cBank;
    if (totalAvail <= 0) {
      return toast.error('لا يوجد رصيد إيجابي متاح في الخزينة حالياً لإجراء التحويل الكامل');
    }

    setFullTransferData({
      to_branch_id: '',
      notes: 'تحويل كامل رصيد الخزينة',
      selectedChannels: {
        cash: cCash > 0,
        wallet: cWallet > 0,
        instapay: cInstapay > 0,
        bank: cBank > 0
      },
      channelAmounts: {
        cash: cCash,
        wallet: cWallet,
        instapay: cInstapay,
        bank: cBank
      }
    });
    setIsFullTransferOpen(true);
  };

  const handleFullTransferSubmit = async (e) => {
    e.preventDefault();
    if (!fullTransferData.to_branch_id) {
      return toast.error('يرجى تحديد الفرع المستلم للتحويل');
    }

    const channelsToTransfer = ['cash', 'wallet', 'instapay', 'bank'].filter(ch => {
      return fullTransferData.selectedChannels[ch] && Number(fullTransferData.channelAmounts[ch]) > 0;
    });

    if (channelsToTransfer.length === 0) {
      return toast.error('يرجى تحديد قناة واحدة على الأقل بها رصيد أكبر من الصفر');
    }

    for (const ch of channelsToTransfer) {
      const reqAmount = Number(fullTransferData.channelAmounts[ch]);
      const availAmount = Number(treasuryChannels[ch] || 0);
      if (reqAmount > availAmount) {
        const chName = ch === 'cash' ? 'نقدي' : ch === 'wallet' ? 'محفظة' : ch === 'instapay' ? 'انستاباي' : 'إيداع بنكي';
        return toast.error(`المبلغ المطلوب تحويله في (${chName}) يتجاوز الرصيد المتاح (${fmt(availAmount)} ج.م)`);
      }
    }

    setIsSubmittingFullTransfer(true);
    let successCount = 0;
    let totalTransferred = 0;
    let lastTransferId = null;

    try {
      for (const ch of channelsToTransfer) {
        const amt = Number(fullTransferData.channelAmounts[ch]);
        const chName = ch === 'cash' ? 'نقدي' : ch === 'wallet' ? 'محفظة' : ch === 'instapay' ? 'انستاباي' : 'إيداع بنكي';
        const res = await transfersService.createTransfer({
          to_branch_id: fullTransferData.to_branch_id,
          type: 'monetary',
          channel: ch,
          amount: amt,
          notes: `${fullTransferData.notes || 'تحويل كامل الرصيد'} - (${chName})`
        });
        successCount++;
        totalTransferred += amt;
        if (res?.data?.id) {
          lastTransferId = res.data.id;
        }
      }

      toast.success(`تم بنجاح إنشاء ${successCount} أذونات تحويل مالي بإجمالي ${fmt(totalTransferred)} ج.م`);
      setIsFullTransferOpen(false);
      fetchTransfers();
      fetchCreateFormData();

      if (lastTransferId) {
        try {
          const fullRes = await transfersService.getTransferById(lastTransferId);
          setTransferToPrint(fullRes.data);
          setIsPrintOpen(true);
        } catch (e) {
          // voucher print optional
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تنفيذ التحويل الكامل');
      fetchTransfers();
      fetchCreateFormData();
    } finally {
      setIsSubmittingFullTransfer(false);
    }
  };

  // Add Item to Inventory Transfer
  const handleAddInventoryItem = () => {
    if (!availableInventory.length) {
      toast.error('لا توجد خامات متاحة في المخزن للتحويل');
      return;
    }
    const firstAvailable = availableInventory[0];
    const availWeight = Math.max(0, Number(firstAvailable.available_quantity || 0));
    const availRolls = Math.max(0, Number(firstAvailable.available_rolls || 0));

    setFormData(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          inventory_id: firstAvailable.id,
          product_name: getProductDisplayName(firstAvailable),
          weight: '',
          rolls_count: '',
          max_weight: availWeight,
          max_rolls: availRolls,
          notes: ''
        }
      ]
    }));
  };

  const handleRemoveInventoryItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const nextItems = [...prev.items];
      if (field === 'inventory_id') {
        const selected = availableInventory.find(i => Number(i.id) === Number(value));
        if (selected) {
          const availWeight = Math.max(0, Number(selected.available_quantity || 0));
          const availRolls = Math.max(0, Number(selected.available_rolls || 0));
          nextItems[index] = {
            ...nextItems[index],
            inventory_id: selected.id,
            product_name: getProductDisplayName(selected),
            max_weight: availWeight,
            max_rolls: availRolls,
            weight: '',
            rolls_count: ''
          };
        }
      } else {
        nextItems[index] = {
          ...nextItems[index],
          [field]: value
        };
      }
      return { ...prev, items: nextItems };
    });
  };

  // Submit New Transfer
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.to_branch_id) {
      return toast.error('يرجى تحديد الفرع المستلم');
    }

    if (formData.type === 'monetary') {
      const amountNum = Number(formData.amount);
      if (!amountNum || amountNum <= 0) {
        return toast.error('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      }
      const availLiquidity = Number(treasuryChannels[formData.channel] || 0);
      if (amountNum > availLiquidity) {
        return toast.error(`رصيد القناة المحدد (${formData.channel === 'cash' ? 'نقدي' : formData.channel === 'wallet' ? 'محفظة' : formData.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي'}) غير كافٍ. المتاح: ${fmt(availLiquidity)} ج.م`);
      }
    } else {
      if (!formData.items.length) {
        return toast.error('يرجى إضافة صنف واحد على الأقل للتحويل');
      }
      for (let i = 0; i < formData.items.length; i++) {
        const item = formData.items[i];
        const weightNum = Number(item.weight || 0);
        const rollsNum = Number(item.rolls_count || 0);
        if (weightNum <= 0 && rollsNum <= 0) {
          return toast.error(`الصنف رقم ${i + 1}: يرجى إدخال وزن أو عدد لفات أكبر من الصفر`);
        }
        if (weightNum > item.max_weight) {
          return toast.error(`الصنف رقم ${i + 1}: الوزن المطلوب (${fmt(weightNum)}) أكبر من المتاح (${fmt(item.max_weight)})`);
        }
        if (rollsNum > item.max_rolls) {
          return toast.error(`الصنف رقم ${i + 1}: عدد اللفات (${rollsNum}) أكبر من المتاح بالمخزن (${item.max_rolls})`);
        }
      }
    }

    setIsSubmittingCreate(true);
    try {
      const res = await transfersService.createTransfer(formData);
      toast.success('تم إنشاء إذن التحويل وإرساله للفرع المستلم بنجاح');
      setIsCreateOpen(false);
      fetchTransfers();

      // Automatically open print voucher for the newly created transfer
      if (res.data) {
        const fullTransferRes = await transfersService.getTransferById(res.data.id);
        setTransferToPrint(fullTransferRes.data);
        setIsPrintOpen(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء إنشاء إذن التحويل');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Confirm Receipt Action
  const handleConfirmTransfer = async () => {
    if (!transferToConfirm) return;
    setIsSubmittingConfirm(true);
    try {
      await transfersService.confirmTransfer(transferToConfirm.id);
      toast.success('تم تأكيد استلام التحويل وإضافته لرصيد الفرع بنجاح');
      setIsConfirmOpen(false);
      setTransferToConfirm(null);
      fetchTransfers();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تأكيد الاستلام');
    } finally {
      setIsSubmittingConfirm(false);
    }
  };

  // Reject Transfer Action
  const handleRejectTransfer = async () => {
    if (!transferToReject) return;
    if (!rejectReason.trim()) {
      return toast.error('يرجى كتابة سبب رفض الاستلام');
    }
    setIsSubmittingReject(true);
    try {
      await transfersService.rejectTransfer(transferToReject.id, rejectReason);
      toast.success('تم تسجيل رفض الاستلام وإعادة الرصيد للفرع المرسل');
      setIsRejectOpen(false);
      setTransferToReject(null);
      setRejectReason('');
      fetchTransfers();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء رفض التحويل');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  // Cancel Outgoing Transfer Action
  const handleCancelTransfer = async () => {
    if (!transferToCancel) return;
    setIsSubmittingCancel(true);
    try {
      await transfersService.cancelTransfer(transferToCancel.id);
      toast.success('تم إلغاء إذن التحويل واستعادة الرصيد للفرع بنجاح');
      setIsCancelOpen(false);
      setTransferToCancel(null);
      fetchTransfers();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء إلغاء التحويل');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Delete Transfer Permanently Action
  const handleDeleteTransfer = async () => {
    if (!transferToDelete) return;
    setIsSubmittingDelete(true);
    try {
      await transfersService.deleteTransfer(transferToDelete.id);
      toast.success('تم حذف إذن التحويل نهائياً واسترجاع الأرصدة');
      setIsDeleteOpen(false);
      setTransferToDelete(null);
      if (isDetailsOpen && selectedTransfer?.id === transferToDelete.id) {
        setIsDetailsOpen(false);
        setSelectedTransfer(null);
      }
      fetchTransfers();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حذف إذن التحويل');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Open Full Print Voucher
  const handleOpenPrint = async (trf) => {
    try {
      const res = await transfersService.getTransferById(trf.id);
      setTransferToPrint(res.data);
      setIsPrintOpen(true);
    } catch (err) {
      toast.error('حدث خطأ أثناء جلب تفاصيل إذن التحويل للطباعة');
    }
  };

  // Open Details Modal
  const handleOpenDetails = async (trf) => {
    try {
      const res = await transfersService.getTransferById(trf.id);
      setSelectedTransfer(res.data);
      setIsDetailsOpen(true);
    } catch (err) {
      toast.error('حدث خطأ أثناء جلب تفاصيل التحويل');
    }
  };

  // Filter transfers by search query
  const filteredTransfers = transfers.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (t.transfer_number && t.transfer_number.toLowerCase().includes(q)) ||
      (t.from_branch_name && t.from_branch_name.toLowerCase().includes(q)) ||
      (t.to_branch_name && t.to_branch_name.toLowerCase().includes(q)) ||
      (t.notes && t.notes.toLowerCase().includes(q))
    );
  });

  return (
    <div className="transfers-page-container">
      {/* ─── Header ────────────────────────────────────────── */}
      <div className="transfers-header">
        <div className="transfers-header-info">
          <h1>
            <ArrowLeftRight size={26} color="var(--primary)" />
            إدارة التحويلات بين الفروع
          </h1>
          <p>تحويلات نقدية ومخزنية بين فروع الشركة مع إصدار أذونات التحويل الرسمية المعتمدة</p>
        </div>
        <div className="transfers-header-actions">
          <button
            type="button"
            className="btn btn-warning"
            onClick={handleOpenFullTransferModal}
            style={{
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              color: '#fff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.25)'
            }}
          >
            <Wallet size={18} />
            نقل كامل الرصيد
          </button>
          <button className="btn btn-primary" onClick={handleOpenCreateModal}>
            <Plus size={18} />
            إنشاء تحويل جديد
          </button>
          <button className="btn btn-outline" onClick={fetchTransfers} title="تحديث البيانات">
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────── */}
      <div className="transfers-kpi-grid">
        <div className="transfers-kpi-card outgoing">
          <div className="transfers-kpi-icon">
            <ArrowUpRight size={28} />
          </div>
          <div className="transfers-kpi-content">
            <div className="transfers-kpi-label">التحويلات الصادرة</div>
            <div className="transfers-kpi-value">{stats.total_outgoing}</div>
            <div className="transfers-kpi-sub">المحول مالياً: {fmt(stats.total_monetary_sent)} ج.م</div>
          </div>
        </div>

        <div className="transfers-kpi-card incoming">
          <div className="transfers-kpi-icon">
            <ArrowDownLeft size={28} />
          </div>
          <div className="transfers-kpi-content">
            <div className="transfers-kpi-label">التحويلات الواردة</div>
            <div className="transfers-kpi-value">{stats.total_incoming}</div>
            <div className="transfers-kpi-sub">المستلم مالياً: {fmt(stats.total_monetary_received)} ج.م</div>
          </div>
        </div>

        <div className="transfers-kpi-card pending">
          {Number(stats.pending_incoming || 0) > 0 && <span className="pulse-badge" />}
          <div className="transfers-kpi-icon">
            <Clock size={28} />
          </div>
          <div className="transfers-kpi-content">
            <div className="transfers-kpi-label">الوارد بانتظار التأكيد</div>
            <div className="transfers-kpi-value" style={{ color: '#d97706' }}>
              {stats.pending_incoming}
            </div>
            <div className="transfers-kpi-sub">صادر قيد الانتظار: {stats.pending_outgoing}</div>
          </div>
        </div>

        <div className="transfers-kpi-card completed">
          <div className="transfers-kpi-icon">
            <CheckCircle size={28} />
          </div>
          <div className="transfers-kpi-content">
            <div className="transfers-kpi-label">التحويلات المكتملة</div>
            <div className="transfers-kpi-value" style={{ color: '#059669' }}>
              {stats.total_completed}
            </div>
            <div className="transfers-kpi-sub">تم استلامها واعتمادها بنجاح</div>
          </div>
        </div>
      </div>

      {/* ─── Tabs & Controls ───────────────────────────────── */}
      <div className="transfers-controls-card">
        <div className="transfers-tabs">
          <button
            className={`transfers-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span>الكل</span>
            <span className="transfers-tab-badge">{Number(stats.total_outgoing || 0) + Number(stats.total_incoming || 0)}</span>
          </button>
          <button
            className={`transfers-tab-btn ${activeTab === 'incoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('incoming')}
          >
            <ArrowDownLeft size={16} />
            <span>الوارد إلى الفرع</span>
            <span className={`transfers-tab-badge ${Number(stats.pending_incoming || 0) > 0 ? 'badge-pending' : ''}`}>
              {stats.total_incoming} {Number(stats.pending_incoming || 0) > 0 ? `(${stats.pending_incoming} معلق)` : ''}
            </span>
          </button>
          <button
            className={`transfers-tab-btn ${activeTab === 'outgoing' ? 'active' : ''}`}
            onClick={() => setActiveTab('outgoing')}
          >
            <ArrowUpRight size={16} />
            <span>الصادر من الفرع</span>
            <span className="transfers-tab-badge">{stats.total_outgoing}</span>
          </button>
        </div>

        <div className="transfers-filter-row">
          <div className="transfers-search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="بحث برقم الإذن، اسم الفرع، أو الملاحظات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="transfers-select-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">كل الأنواع (مالي وخامات)</option>
            <option value="monetary">💵 تحويلات مالية فقط</option>
            <option value="inventory">📦 تحويلات خامات ومخزن</option>
          </select>

          <select
            className="transfers-select-filter"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">كل الحالات</option>
            <option value="pending">⏳ قيد الانتظار (معلق)</option>
            <option value="completed">✅ مكتمل (تم الاستلام)</option>
            <option value="rejected">❌ مرفوض / ملغي</option>
          </select>
        </div>
      </div>

      {/* ─── Transfers Table ───────────────────────────────── */}
      <div className="transfers-table-container">
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw className="spin" size={32} style={{ margin: '0 auto 12px' }} />
            <div>جاري تحميل بيانات التحويلات...</div>
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="transfers-empty-state">
            <ArrowLeftRight size={48} />
            <h3>لا توجد تحويلات مطابقة</h3>
            <p>يمكنك تغيير شروط البحث أو إنشاء إذن تحويل جديد بالضغط على الزر أعلاه</p>
          </div>
        ) : (
          <div className="transfers-table-responsive">
            <table className="transfers-table">
              <thead>
                <tr>
                  <th>رقم الإذن</th>
                  <th>التاريخ</th>
                  <th>النوع</th>
                  <th>الجهة</th>
                  <th>البيان والتفاصيل</th>
                  <th>الحالة</th>
                  <th>المسؤول</th>
                  <th style={{ textAlign: 'center' }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((t) => {
                  const isOutgoing = Number(t.from_branch_id) === Number(currentBranchId);
                  const isPending = t.status === 'pending';
                  const isCompleted = t.status === 'completed';
                  const isRejected = t.status === 'rejected';

                  return (
                    <tr key={t.id}>
                      {/* رقم الإذن */}
                      <td>
                        <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--primary)' }}>
                          {t.transfer_number}
                        </span>
                      </td>

                      {/* التاريخ */}
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>
                          {format(new Date(t.created_at), 'yyyy/MM/dd')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {format(new Date(t.created_at), 'hh:mm a')}
                        </div>
                      </td>

                      {/* النوع */}
                      <td>
                        {t.type === 'monetary' ? (
                          <span className="transfer-badge-type monetary">
                            <Banknote size={14} />
                            تحويل مالي
                          </span>
                        ) : (
                          <span className="transfer-badge-type inventory">
                            <Package size={14} />
                            تحويل خامات
                          </span>
                        )}
                      </td>

                      {/* الجهة */}
                      <td>
                        {isOutgoing ? (
                          <div className="transfer-branch-chip">
                            <ArrowUpRight size={16} color="#1e40af" />
                            <span>إلى: {t.to_branch_name}</span>
                          </div>
                        ) : (
                          <div className="transfer-branch-chip incoming">
                            <ArrowDownLeft size={16} color="#0284c7" />
                            <span>من: {t.from_branch_name}</span>
                          </div>
                        )}
                      </td>

                      {/* البيان والتفاصيل */}
                      <td>
                        {t.type === 'monetary' ? (
                          <div>
                            <span style={{ fontWeight: '800', color: '#047857', fontSize: '0.95rem' }}>
                              {fmt(t.amount)} ج.م
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '6px' }}>
                              ({t.channel === 'cash' ? 'نقدي' : t.channel === 'wallet' ? 'محفظة' : t.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي'})
                            </span>
                            {t.notes && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {t.notes}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                              {t.items?.length || 0} أصناف خامات
                            </span>
                            {t.items && t.items.length > 0 && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                وزن: {fmt(t.items.reduce((s, it) => s + Number(it.weight || 0), 0))} كجم | لفات: {t.items.reduce((s, it) => s + Number(it.rolls_count || 0), 0)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* الحالة */}
                      <td>
                        {isPending && (
                          <span className="transfer-badge-status pending">
                            <Clock size={13} />
                            في الطريق (معلق)
                          </span>
                        )}
                        {isCompleted && (
                          <span className="transfer-badge-status completed">
                            <CheckCircle size={13} />
                            تم الاستلام
                          </span>
                        )}
                        {isRejected && (
                          <div>
                            <span className="transfer-badge-status rejected">
                              <XCircle size={13} />
                              مرفوض / ملغي
                            </span>
                            {t.rejection_reason && (
                              <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '3px' }}>
                                السبب: {t.rejection_reason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* المسؤول */}
                      <td>
                        <div style={{ fontSize: '0.82rem', fontWeight: '600' }}>
                          المرسل: {t.creator_name || '—'}
                        </div>
                        {t.receiver_name && (
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            المستلم: {t.receiver_name}
                          </div>
                        )}
                      </td>

                      {/* الإجراءات */}
                      <td>
                        <div className="transfer-actions-group" style={{ justifyContent: 'center' }}>
                          {/* طباعة إذن التحويل */}
                          <button
                            className="action-btn print"
                            onClick={() => handleOpenPrint(t)}
                            title="طباعة إذن التحويل الرسمي"
                          >
                            <Printer size={15} />
                            إذن التحويل
                          </button>

                          {/* عرض التفاصيل */}
                          <button
                            className="action-btn details"
                            onClick={() => handleOpenDetails(t)}
                            title="عرض التفاصيل"
                          >
                            <Eye size={15} />
                          </button>

                          {/* إجراءات المستلم المعلقة */}
                          {!isOutgoing && isPending && (
                            <>
                              <button
                                className="action-btn confirm"
                                onClick={() => {
                                  setTransferToConfirm(t);
                                  setIsConfirmOpen(true);
                                }}
                                title="تأكيد استلام التحويل وإضافته للرصيد"
                              >
                                <CheckCircle size={15} />
                                استلام
                              </button>
                              <button
                                className="action-btn reject"
                                onClick={() => {
                                  setTransferToReject(t);
                                  setRejectReason('');
                                  setIsRejectOpen(true);
                                }}
                                title="رفض الاستلام"
                              >
                                <XCircle size={15} />
                                رفض
                              </button>
                            </>
                          )}

                          {/* إجراءات المرسل المعلقة: إلغاء التحويل */}
                          {isOutgoing && isPending && (
                            <button
                              className="action-btn cancel"
                              onClick={() => {
                                setTransferToCancel(t);
                                setIsCancelOpen(true);
                              }}
                              title="إلغاء التحويل واستعادة الرصيد"
                            >
                              إلغاء
                            </button>
                          )}

                          {/* إجراءات الحذف: متاح للمرسل أو الإدارة لأي تحويل غير مكتمل */}
                          {(isOutgoing || user?.role === 'admin') && !isCompleted && (
                            <button
                              className="action-btn delete"
                              onClick={() => {
                                setTransferToDelete(t);
                                setIsDeleteOpen(true);
                              }}
                              title="حذف إذن التحويل نهائياً من السجلات"
                            >
                              <Trash2 size={15} />
                              حذف
                            </button>
                          )}
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

      {/* ─── Full Balance Transfer Modal ─────────────────────────── */}
      {isFullTransferOpen && (
        <div className="modal-transfers-lg-overlay" onClick={() => setIsFullTransferOpen(false)}>
          <div className="modal-transfers-lg-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-transfers-lg-header" style={{ borderBottomColor: '#fef3c7', background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
              <h3 style={{ color: '#b45309' }}>
                <Wallet size={22} color="#b45309" />
                نقل كامل رصيد الخزينة (متعدد القنوات)
              </h3>
              <button className="modal-transfers-lg-close" onClick={() => setIsFullTransferOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleFullTransferSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-transfers-lg-body">
                {/* Info Notice */}
                <div style={{
                  padding: '12px 16px', borderRadius: 10, background: '#eff6ff',
                  border: '1.5px solid #bfdbfe', marginBottom: 18, fontSize: '0.84rem', color: '#1e40af'
                }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>💡 نظام النقل السريع لكامل السيولة:</div>
                  سيتم إنشاء إذن تحويل رسمي لكل قناة مالية محددة بالمبلغ المطلوب وتوجيهها للفرع المختار، ليتم تأكيد استلامها فور وصولها.
                </div>

                {/* Destination Branch */}
                <div className="form-group" style={{ marginBottom: '18px' }}>
                  <label className="form-label" style={{ fontWeight: '700', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={16} color="var(--primary)" />
                    الفرع المحول إليه (المستلم) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="form-select"
                    value={fullTransferData.to_branch_id}
                    onChange={(e) => setFullTransferData(prev => ({ ...prev, to_branch_id: e.target.value }))}
                    required
                  >
                    <option value="">-- اختر الفرع المستلم من القائمة --</option>
                    {availableBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code || 'فرع'}) {b.address ? `— ${b.address}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Channel balances & selection */}
                <div style={{ marginBottom: 18 }}>
                  <label className="form-label" style={{ fontWeight: '700', marginBottom: '8px', display: 'block' }}>
                    القنوات المالية وأرصدتها المتاحة للنقل:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { key: 'cash', label: 'كاش (نقدي بالدرج)', icon: Banknote, color: '#16a34a', bg: '#f0fdf4' },
                      { key: 'wallet', label: 'محفظة إلكترونية (فودافون كاش...)', icon: Wallet, color: '#d97706', bg: '#fffbeb' },
                      { key: 'instapay', label: 'انستاباي (InstaPay)', icon: Smartphone, color: '#2563eb', bg: '#eff6ff' },
                      { key: 'bank', label: 'إيداع بنكي مباشر', icon: Landmark, color: '#7c3aed', bg: '#f5f3ff' },
                    ].map(ch => {
                      const avail = Number(treasuryChannels[ch.key] || 0);
                      const isSelected = !!fullTransferData.selectedChannels[ch.key];
                      const Icon = ch.icon;
                      return (
                        <div
                          key={ch.key}
                          style={{
                            padding: '12px 14px', borderRadius: 10,
                            border: `1.5px solid ${isSelected ? ch.color : '#e2e8f0'}`,
                            background: isSelected ? ch.bg : '#f8fafc',
                            display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 200 }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={avail <= 0}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setFullTransferData(prev => ({
                                  ...prev,
                                  selectedChannels: { ...prev.selectedChannels, [ch.key]: checked },
                                  channelAmounts: {
                                    ...prev.channelAmounts,
                                    [ch.key]: checked ? Math.max(0, avail) : 0
                                  }
                                }));
                              }}
                              style={{ width: 18, height: 18, accentColor: ch.color, cursor: 'pointer' }}
                            />
                            <div style={{
                              width: 34, height: 34, borderRadius: 8, background: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                            }}>
                              <Icon size={18} color={ch.color} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1e293b' }}>{ch.label}</div>
                              <div style={{ fontSize: '0.75rem', color: avail > 0 ? '#16a34a' : '#94a3b8', fontWeight: 600 }}>
                                المتاح بالخزينة: {fmt(avail)} ج.م
                              </div>
                            </div>
                          </label>

                          {isSelected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={avail}
                                className="form-input"
                                value={fullTransferData.channelAmounts[ch.key]}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFullTransferData(prev => ({
                                    ...prev,
                                    channelAmounts: { ...prev.channelAmounts, [ch.key]: val }
                                  }));
                                }}
                                style={{ width: 130, fontWeight: 800, color: ch.color, textAlign: 'left', direction: 'ltr' }}
                                placeholder="0.00"
                              />
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                                onClick={() => {
                                  setFullTransferData(prev => ({
                                    ...prev,
                                    channelAmounts: { ...prev.channelAmounts, [ch.key]: Math.max(0, avail) }
                                  }));
                                }}
                              >
                                كامل الرصيد
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Total Summary */}
                {(() => {
                  const total = ['cash', 'wallet', 'instapay', 'bank'].reduce((s, k) => {
                    return s + (fullTransferData.selectedChannels[k] ? Number(fullTransferData.channelAmounts[k] || 0) : 0);
                  }, 0);
                  const count = ['cash', 'wallet', 'instapay', 'bank'].filter(k => fullTransferData.selectedChannels[k] && Number(fullTransferData.channelAmounts[k] || 0) > 0).length;

                  return (
                    <div style={{
                      padding: '14px 18px', borderRadius: 12, background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18
                    }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>إجمالي السيولة المطلوب نقلها ({count} قنوات):</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38bdf8' }}>{fmt(total)} ج.م</div>
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem',
                          background: count > 0 ? '#10b981' : '#64748b', color: '#fff', fontWeight: 700
                        }}>
                          {count > 0 ? 'جاهز للتنفيذ' : 'لم يتم اختيار مبالغ'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Notes */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: '700', marginBottom: '6px' }}>
                    بيان التحويل وملاحظات إضافية
                  </label>
                  <textarea
                    rows={2}
                    className="form-textarea"
                    placeholder="ملاحظات توضيحية لسبب نقل الرصيد (مثال: تصفية وردية / توريد للخزينة الرئيسية)"
                    value={fullTransferData.notes}
                    onChange={(e) => setFullTransferData(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="modal-transfers-lg-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsFullTransferOpen(false)}
                  disabled={isSubmittingFullTransfer}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none' }}
                  disabled={isSubmittingFullTransfer}
                >
                  {isSubmittingFullTransfer ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      جاري إنشاء التحويلات...
                    </>
                  ) : (
                    <>
                      <Wallet size={16} />
                      تأكيد نقل كامل الرصيد
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Create Transfer Modal ─────────────────────────── */}
      {isCreateOpen && (
        <div className="modal-transfers-lg-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-transfers-lg-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-transfers-lg-header">
              <h3>
                <ArrowLeftRight size={22} />
                إنشاء إذن تحويل فرعي جديد
              </h3>
              <button className="modal-transfers-lg-close" onClick={() => setIsCreateOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-transfers-lg-body">
                {/* 1. Destination Branch */}
                <div className="form-group" style={{ marginBottom: '18px' }}>
                  <label className="form-label" style={{ fontWeight: '700', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={16} color="var(--primary)" />
                    الفرع المحول إليه (المستلم) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <select
                    className="form-select"
                    value={formData.to_branch_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, to_branch_id: e.target.value }))}
                    required
                  >
                    <option value="">-- اختر الفرع المستلم من القائمة --</option>
                    {availableBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code || 'فرع'}) {b.address ? `— ${b.address}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Type Selector Pills */}
                <div className="type-selector-pills">
                  <button
                    type="button"
                    className={`type-pill-btn ${formData.type === 'monetary' ? 'active' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, type: 'monetary' }))}
                  >
                    <div className="type-pill-icon">
                      <Banknote size={24} />
                    </div>
                    <div className="type-pill-texts">
                      <span>تحويل مالي (نقدية)</span>
                      <small>تحويل سيولة نقدية من خزينة الفرع</small>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`type-pill-btn ${formData.type === 'inventory' ? 'active' : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, type: 'inventory' }))}
                  >
                    <div className="type-pill-icon">
                      <Package size={24} />
                    </div>
                    <div className="type-pill-texts">
                      <span>تحويل خامات (مخزن)</span>
                      <small>نقل بضاعة وخامات من مخزن الفرع</small>
                    </div>
                  </button>
                </div>

                {/* 3A. Monetary Transfer Fields */}
                {formData.type === 'monetary' && (
                  <div>
                    <label className="form-label" style={{ fontWeight: '700', marginBottom: '10px', display: 'block' }}>
                      اختر قناة التحويل (السيولة المتوفرة بالخزينة حالياً):
                    </label>
                    <div className="channel-balance-preview-grid">
                      <div
                        className={`channel-card-select ${formData.channel === 'cash' ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, channel: 'cash' }))}
                      >
                        {formData.channel === 'cash' && <span className="channel-badge-top">القناة المحددة</span>}
                        <Banknote size={22} color="var(--primary)" style={{ margin: '0 auto 6px' }} />
                        <div className="channel-name">كاش (نقدي)</div>
                        <div className="channel-amount">{fmt(treasuryChannels.cash)} ج.م</div>
                      </div>

                      <div
                        className={`channel-card-select ${formData.channel === 'wallet' ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, channel: 'wallet' }))}
                      >
                        {formData.channel === 'wallet' && <span className="channel-badge-top">القناة المحددة</span>}
                        <Wallet size={22} color="var(--primary)" style={{ margin: '0 auto 6px' }} />
                        <div className="channel-name">محفظة إلكترونية</div>
                        <div className="channel-amount">{fmt(treasuryChannels.wallet)} ج.م</div>
                      </div>

                      <div
                        className={`channel-card-select ${formData.channel === 'instapay' ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, channel: 'instapay' }))}
                      >
                        {formData.channel === 'instapay' && <span className="channel-badge-top">القناة المحددة</span>}
                        <Smartphone size={22} color="var(--primary)" style={{ margin: '0 auto 6px' }} />
                        <div className="channel-name">انستاباي</div>
                        <div className="channel-amount">{fmt(treasuryChannels.instapay)} ج.م</div>
                      </div>

                      <div
                        className={`channel-card-select ${formData.channel === 'bank' ? 'selected' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, channel: 'bank' }))}
                      >
                        {formData.channel === 'bank' && <span className="channel-badge-top">القناة المحددة</span>}
                        <Landmark size={22} color="var(--primary)" style={{ margin: '0 auto 6px' }} />
                        <div className="channel-name">إيداع بنكي</div>
                        <div className="channel-amount">{fmt(treasuryChannels.bank)} ج.م</div>
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: '700', marginBottom: '6px' }}>
                        مبلغ التحويل المطلوب <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <div className="amount-input-wrapper">
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          placeholder="0.00"
                          value={formData.amount}
                          onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                          required
                        />
                        <div className="amount-currency-tag">ج.م</div>
                      </div>
                      {Number(formData.amount) > Number(treasuryChannels[formData.channel] || 0) && (
                        <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: '6px', fontWeight: '600' }}>
                          ⚠️ تنبيه: المبلغ المطلوب ({fmt(formData.amount)} ج.م) أكبر من السيولة المتوفرة في قناة {formData.channel === 'cash' ? 'الكاش' : formData.channel === 'wallet' ? 'المحفظة' : formData.channel === 'bank' ? 'الإيداع البنكي' : 'انستاباي'} ({fmt(treasuryChannels[formData.channel])} ج.م)!
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3B. Inventory Transfer Fields */}
                {formData.type === 'inventory' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <label className="form-label" style={{ fontWeight: '700', margin: 0, fontSize: '0.95rem' }}>
                        الأصناف والخامات المحولة <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '7px 14px', fontSize: '0.85rem' }}
                        onClick={handleAddInventoryItem}
                      >
                        <Plus size={16} />
                        إضافة صنف للتحويل
                      </button>
                    </div>

                    {formData.items.length === 0 ? (
                      <div style={{ padding: '30px', background: '#f8fafc', border: '2px dashed var(--border)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Package size={36} style={{ margin: '0 auto 8px', color: '#94a3b8' }} />
                        <div style={{ fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>لا توجد أصناف مضافة حتى الآن</div>
                        <div style={{ fontSize: '0.85rem' }}>اضغط على زر "إضافة صنف للتحويل" لاختيار الخامات من مخزن الفرع</div>
                      </div>
                    ) : (
                      <div className="inventory-items-container">
                        {formData.items.map((it, idx) => (
                          <div key={idx} className="inventory-item-card">
                            <div className="inventory-item-card-header">
                              <div className="inventory-item-card-title">
                                <span className="inventory-item-badge-num">{idx + 1}</span>
                                <span>{it.product_name || `الصنف رقم ${idx + 1}`}</span>
                              </div>
                              <button
                                type="button"
                                className="inventory-item-delete-btn"
                                onClick={() => handleRemoveInventoryItem(idx)}
                                title="حذف هذا الصنف من التحويل"
                              >
                                <Trash2 size={14} />
                                حذف الصنف
                              </button>
                            </div>

                            {/* اختيار الصنف من المخزن */}
                            <div className="form-group" style={{ marginBottom: '10px' }}>
                              <label className="form-label" style={{ fontSize: '0.82rem' }}>
                                الصنف المتاح بالمخزن
                              </label>
                              <select
                                className="form-select"
                                value={it.inventory_id}
                                onChange={(e) => handleItemChange(idx, 'inventory_id', e.target.value)}
                              >
                                {availableInventory.map((inv) => {
                                  const w = Math.max(0, Number(inv.available_quantity || 0));
                                  const r = Math.max(0, Number(inv.available_rolls || 0));
                                  return (
                                    <option key={inv.id} value={inv.id}>
                                      {getProductDisplayName(inv)} (المتاح: {fmt(w)} كجم | {r} لفة)
                                    </option>
                                  );
                                })}
                              </select>
                            </div>

                            {/* مدخلات الوزن وعدد اللفات */}
                            <div className="inventory-item-fields-grid">
                              <div className="inventory-item-field-box">
                                <label>
                                  <span>الوزن المحول (كجم)</span>
                                  <span className="max-avail-tag">أقصى متاح: {fmt(it.max_weight)} كجم</span>
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={it.max_weight}
                                  className="form-input"
                                  placeholder="0.00 كجم"
                                  value={it.weight}
                                  onChange={(e) => handleItemChange(idx, 'weight', e.target.value)}
                                  style={{ fontWeight: '700' }}
                                />
                              </div>

                              <div className="inventory-item-field-box">
                                <label>
                                  <span>عدد اللفات المحولة</span>
                                  <span className="max-avail-tag">أقصى متاح: {it.max_rolls} لفة</span>
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max={it.max_rolls}
                                  className="form-input"
                                  placeholder="0 لفة"
                                  value={it.rolls_count}
                                  onChange={(e) => handleItemChange(idx, 'rolls_count', e.target.value)}
                                  style={{ fontWeight: '700' }}
                                />
                              </div>
                            </div>

                            {/* ملاحظات الصنف */}
                            <div className="form-group" style={{ marginTop: '10px', marginBottom: 0 }}>
                              <input
                                type="text"
                                className="form-input"
                                placeholder="ملاحظات خاصة بهذا الصنف (اختياري)..."
                                value={it.notes}
                                onChange={(e) => handleItemChange(idx, 'notes', e.target.value)}
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                          </div>
                        ))}

                        {/* ملخص التحويل المخزني الإجمالي */}
                        <div className="inventory-item-summary">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Package size={20} color="var(--primary)" />
                            <span>إجمالي الخامات المحولة:</span>
                          </div>
                          <div className="inventory-item-summary-chips">
                            <div className="summary-chip" style={{ color: '#047857' }}>
                              <span>الوزن الإجمالي:</span>
                              <span>{fmt(formData.items.reduce((s, it) => s + Number(it.weight || 0), 0))} كجم</span>
                            </div>
                            <div className="summary-chip" style={{ color: '#1e40af' }}>
                              <span>عدد اللفات:</span>
                              <span>{formData.items.reduce((s, it) => s + Number(it.rolls_count || 0), 0)} لفة</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Notes / Transporter Info */}
                <div className="form-group" style={{ marginTop: '18px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: '700', marginBottom: '6px' }}>
                    بيان التحويل، اسم السائق أو المندوب، وملاحظات
                  </label>
                  <textarea
                    rows={3}
                    className="form-textarea"
                    placeholder="اكتب هنا أي تفاصيل تخص النقل (مثال: تم الإرسال مع السائق أحمد، سيارة نقل رقم 1234 ص ع، هاتف: 010...)"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="modal-transfers-lg-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isSubmittingCreate}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingCreate}
                >
                  {isSubmittingCreate ? (
                    <>
                      <RefreshCw className="spin" size={16} />
                      جاري التنفيذ...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      تأكيد وإصدار إذن التحويل
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Confirm Receipt Modal ─────────────────────────── */}
      {isConfirmOpen && transferToConfirm && (
        <div className="modal-transfers-lg-overlay" onClick={() => setIsConfirmOpen(false)}>
          <div className="modal-transfers-lg-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-transfers-lg-header" style={{ background: '#f0fdf4' }}>
              <h3 style={{ color: '#15803d' }}>
                <CheckCircle size={22} />
                تأكيد استلام التحويل
              </h3>
              <button className="modal-transfers-lg-close" onClick={() => setIsConfirmOpen(false)}>✕</button>
            </div>
            <div className="modal-transfers-lg-body">
              <p style={{ fontSize: '1rem', lineHeight: '1.6', marginBottom: '14px' }}>
                هل أنت متأكد من استلام التحويل رقم <strong>{transferToConfirm.transfer_number}</strong> المرسل من فرع <strong>{transferToConfirm.from_branch_name}</strong>؟
              </p>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', fontSize: '0.9rem' }}>
                {transferToConfirm.type === 'monetary' ? (
                  <div>
                    <div style={{ fontWeight: '800', color: '#15803d', fontSize: '1.15rem' }}>
                      المبلغ المستلم: {fmt(transferToConfirm.amount)} ج.م
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
                      سيتم إضافة المبلغ إلى خزينة الفرع فوراً في قناة ({transferToConfirm.channel === 'cash' ? 'نقدي' : transferToConfirm.channel === 'wallet' ? 'محفظة' : transferToConfirm.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي'}).
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem' }}>
                      تحويل خامات: {transferToConfirm.items?.length || 0} صنف
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
                      سيتم تسجيل الخامات والأوزان واللفات كرصيد بضاعة جديد في مخزن فرعك تلقائياً.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-transfers-lg-footer">
              <button className="btn btn-outline" onClick={() => setIsConfirmOpen(false)} disabled={isSubmittingConfirm}>
                تراجع
              </button>
              <button className="btn" style={{ background: '#16a34a', color: '#fff' }} onClick={handleConfirmTransfer} disabled={isSubmittingConfirm}>
                {isSubmittingConfirm ? 'جاري التأكيد...' : 'نعم، أؤكد الاستلام'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Reject Transfer Modal ─────────────────────────── */}
      {isRejectOpen && transferToReject && (
        <div className="modal-transfers-lg-overlay" onClick={() => setIsRejectOpen(false)}>
          <div className="modal-transfers-lg-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-transfers-lg-header" style={{ background: '#fef2f2' }}>
              <h3 style={{ color: '#dc2626' }}>
                <XCircle size={22} />
                رفض استلام التحويل
              </h3>
              <button className="modal-transfers-lg-close" onClick={() => setIsRejectOpen(false)}>✕</button>
            </div>
            <div className="modal-transfers-lg-body">
              <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                عند رفض الاستلام، سيتم رد الرصيد (المالي أو الخامات) تلقائياً إلى الفرع المرسل (<strong>{transferToReject.from_branch_name}</strong>).
              </p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: '700', marginBottom: '6px' }}>
                  سبب الرفض <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  className="form-textarea"
                  placeholder="اكتب سبب رفض الاستلام بدقة (مثال: نقص في الكمية المستلمة، تلف البضاعة، اختلاف المبلغ...)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="modal-transfers-lg-footer">
              <button className="btn btn-outline" onClick={() => setIsRejectOpen(false)} disabled={isSubmittingReject}>
                إلغاء
              </button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleRejectTransfer} disabled={isSubmittingReject}>
                {isSubmittingReject ? 'جاري التنفيذ...' : 'تأكيد الرفض والرد للمرسل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cancel Outgoing Transfer Modal ─────────────────── */}
      {isCancelOpen && transferToCancel && (
        <div className="modal-transfers-lg-overlay" onClick={() => setIsCancelOpen(false)}>
          <div className="modal-transfers-lg-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-transfers-lg-header" style={{ background: '#fef2f2' }}>
              <h3 style={{ color: '#dc2626' }}>
                <Trash2 size={22} />
                إلغاء إذن التحويل الصادر
              </h3>
              <button className="modal-transfers-lg-close" onClick={() => setIsCancelOpen(false)}>✕</button>
            </div>
            <div className="modal-transfers-lg-body">
              <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>
                هل تريد بالتأكيد إلغاء إذن التحويل رقم <strong>{transferToCancel.transfer_number}</strong>؟
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                سيتم تحرير وحفظ الرصيد المالي أو الخامات وإرجاعها لحساب الفرع الحالي.
              </p>
            </div>
            <div className="modal-transfers-lg-footer">
              <button className="btn btn-outline" onClick={() => setIsCancelOpen(false)} disabled={isSubmittingCancel}>
                تراجع
              </button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleCancelTransfer} disabled={isSubmittingCancel}>
                {isSubmittingCancel ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Transfer Modal ──────────────────────────── */}
      {isDeleteOpen && transferToDelete && (
        <div className="modal-transfers-lg-overlay" onClick={() => setIsDeleteOpen(false)}>
          <div className="modal-transfers-lg-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-transfers-lg-header" style={{ background: '#fef2f2' }}>
              <h3 style={{ color: '#dc2626' }}>
                <Trash2 size={22} />
                حذف إذن التحويل نهائياً
              </h3>
              <button className="modal-transfers-lg-close" onClick={() => setIsDeleteOpen(false)}>✕</button>
            </div>
            <div className="modal-transfers-lg-body">
              <p style={{ fontSize: '1rem', lineHeight: '1.6' }}>
                هل تريد بالتأكيد حذف إذن التحويل رقم <strong>{transferToDelete.transfer_number}</strong> نهائياً؟
              </p>
              <div style={{
                marginTop: '12px', padding: '12px 14px', borderRadius: '8px',
                background: '#fff1f2', border: '1px solid #fecaca', fontSize: '0.85rem', color: '#991b1b', lineHeight: '1.5'
              }}>
                ⚠️ <strong>تنبيه:</strong> سيتم مسح إذن التحويل نهائياً من قاعدة البيانات. إذا كان التحويل معلقاً، فسيتم استعادة الخامات أو المبالغ تلقائياً إلى رصيد الفرع المرسل.
              </div>
            </div>
            <div className="modal-transfers-lg-footer">
              <button className="btn btn-outline" onClick={() => setIsDeleteOpen(false)} disabled={isSubmittingDelete}>
                تراجع
              </button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff' }} onClick={handleDeleteTransfer} disabled={isSubmittingDelete}>
                {isSubmittingDelete ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── View Details Modal ────────────────────────────── */}
      {isDetailsOpen && selectedTransfer && (
        <div className="modal-transfers-lg-overlay" onClick={() => setIsDetailsOpen(false)}>
          <div className="modal-transfers-lg-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-transfers-lg-header">
              <h3>
                <Info size={22} />
                تفاصيل إذن التحويل {selectedTransfer.transfer_number}
              </h3>
              <button className="modal-transfers-lg-close" onClick={() => setIsDetailsOpen(false)}>✕</button>
            </div>
            <div className="modal-transfers-lg-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>الفرع المرسل</div>
                  <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--primary)' }}>{selectedTransfer.from_branch_name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>بواسطة: {selectedTransfer.creator_name || '—'}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>الفرع المستلم</div>
                  <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--primary)' }}>{selectedTransfer.to_branch_name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>المستلم: {selectedTransfer.receiver_name || 'لم يُستلم بعد'}</div>
                </div>
              </div>

              {selectedTransfer.type === 'monetary' ? (
                <div style={{ background: '#ecfdf5', padding: '16px 20px', borderRadius: '12px', border: '1.5px solid #a7f3d0', marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#047857', fontWeight: '700' }}>المبلغ المحول</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#047857' }}>{fmt(selectedTransfer.amount)} ج.م</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    قناة الدفع: {selectedTransfer.channel === 'cash' ? 'نقدي (كاش)' : selectedTransfer.channel === 'wallet' ? 'محفظة إلكترونية' : selectedTransfer.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي'}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.95rem', marginBottom: '10px', color: 'var(--primary)', fontWeight: '800' }}>جدول الأصناف المحولة:</h4>
                  <table className="transfers-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>اسم الشركة والصنف</th>
                        <th>الوزن المحول (كجم)</th>
                        <th>عدد اللفات</th>
                        <th>ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransfer.items?.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td>{idx + 1}</td>
                          <td style={{ fontWeight: '700' }}>{it.company} - {it.product}</td>
                          <td style={{ fontWeight: '700' }}>{fmt(it.weight)}</td>
                          <td style={{ fontWeight: '700' }}>{it.rolls_count}</td>
                          <td>{it.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedTransfer.notes && (
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700' }}>ملاحظات وبيان التحويل:</div>
                  <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>{selectedTransfer.notes}</div>
                </div>
              )}

              {selectedTransfer.rejection_reason && (
                <div style={{ background: '#fee2e2', padding: '14px', borderRadius: '12px', border: '1px solid #fecaca', marginTop: '12px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: '800' }}>سبب الرفض:</div>
                  <div style={{ fontSize: '0.9rem', color: '#b91c1c', marginTop: '4px' }}>{selectedTransfer.rejection_reason}</div>
                </div>
              )}
            </div>
            <div className="modal-transfers-lg-footer">
              <button
                className="btn btn-outline"
                onClick={() => {
                  setIsDetailsOpen(false);
                  handleOpenPrint(selectedTransfer);
                }}
              >
                <Printer size={16} />
                طباعة إذن التحويل
              </button>
              {(Number(selectedTransfer.from_branch_id) === Number(currentBranchId) || user?.role === 'admin') && selectedTransfer.status !== 'completed' && (
                <button
                  className="btn"
                  style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
                  onClick={() => {
                    setTransferToDelete(selectedTransfer);
                    setIsDeleteOpen(true);
                  }}
                >
                  <Trash2 size={16} />
                  حذف الإذن
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setIsDetailsOpen(false)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Printable Voucher ─────────────────────────────── */}
      <PrintableTransferVoucher
        isOpen={isPrintOpen}
        onClose={() => {
          setIsPrintOpen(false);
          setTransferToPrint(null);
        }}
        transfer={transferToPrint}
      />
    </div>
  );
};

export default TransfersPage;
