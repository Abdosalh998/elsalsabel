import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Edit, Trash2, ChevronDown, ChevronUp, Search, X,
  User, TrendingDown, TrendingUp, Phone, Calendar,
  Plus, AlertCircle, CheckCircle, RefreshCw, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { balanceService } from '../../services/balance.service';
import { customerService } from '../../services/customer.service';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

// ── Helper Components ─────────────────────────────────────────────────────────

const StatBadge = ({ value, label, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '1.05rem', fontWeight: 700, color }}>{Number(value).toFixed(2)}</div>
    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const BalancesPage = () => {
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({ grand_total_debt: 0, grand_total_credit: 0, customers_with_transactions: 0 });
  const [customersList, setCustomersList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('debt'); // 'debt' | 'credit' | 'name'
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterRef = useRef(null);

  // Expanded customer (Card drill-down)
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [expandedTransactions, setExpandedTransactions] = useState([]);
  const [expandedCustomerInfo, setExpandedCustomerInfo] = useState(null);
  const [transLoading, setTransLoading] = useState(false);

  // Add/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBalance, setEditingBalance] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [balanceToDelete, setBalanceToDelete] = useState(null);

  // Pre-selected customer for quick add from card
  const [preSelectedCustomerId, setPreSelectedCustomerId] = useState('');

  // Settle Modal state
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedCustomerForSettle, setSelectedCustomerForSettle] = useState(null);
  const [settleForm, setSettleForm] = useState({
    type: 'credit',
    amount: '',
    reason: 'تسوية وتصفير مديونية العميل',
    date: format(new Date(), 'yyyy-MM-dd')
  });
  const [isSubmittingSettle, setIsSubmittingSettle] = useState(false);

  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    isNewCustomer: false,
    invoice_amount: '',
    paid_amount: '',
    notes: ''
  });

  // ── Data Fetching ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (selectedCustomerIds.length > 0) params.customer_ids = selectedCustomerIds.join(',');
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await balanceService.getCustomerSummary(params);
      setCustomers(res.data.customers || []);
      setSummary(res.data.summary || { grand_total_debt: 0, grand_total_credit: 0, customers_with_transactions: 0 });
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب الأرصدة');
    } finally {
      setLoading(false);
    }
  }, [search, selectedCustomerIds, dateFrom, dateTo]);

  const fetchCustomersList = async () => {
    try {
      const res = await customerService.getCustomers({ limit: 1000 });
      setCustomersList(res.data.customers || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); fetchCustomersList(); }, [fetchData]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Card Expand ──────────────────────────────────────────────────────────────

  const reloadCustomerTransactions = async (customerId) => {
    if (!customerId) return;
    setTransLoading(true);
    try {
      const res = await balanceService.getCustomerTransactions(customerId);
      setExpandedTransactions(res.data.transactions || []);
      setExpandedCustomerInfo(res.data.customerInfo || null);
    } catch (e) {
      toast.error('حدث خطأ أثناء جلب الحركات');
    } finally {
      setTransLoading(false);
    }
  };

  const handleExpandCustomer = async (customerId) => {
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
      setExpandedTransactions([]);
      setExpandedCustomerInfo(null);
      return;
    }
    setExpandedCustomerId(customerId);
    await reloadCustomerTransactions(customerId);
  };

  // ── Sorting ───────────────────────────────────────────────────────────────────

  const sortedCustomers = [...customers].sort((a, b) => {
    if (sortBy === 'debt') return Number(b.total_debt) - Number(a.total_debt);
    if (sortBy === 'credit') return Number(b.total_credit) - Number(a.total_credit);
    if (sortBy === 'name') return a.customer_name.localeCompare(b.customer_name, 'ar');
    return 0;
  });

  // ── Multi-select Filter ────────────────────────────────────────────────────────

  const toggleCustomerFilter = (id) => {
    setSelectedCustomerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedCustomerIds([]);
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = search || selectedCustomerIds.length > 0 || dateFrom || dateTo;

  // ── Modal ──────────────────────────────────────────────────────────────────────

  const handleOpenModal = (balance = null, customerId = '') => {
    if (balance) {
      setEditingBalance(balance);
      setFormData({
        date: format(new Date(balance.date), 'yyyy-MM-dd'),
        customer_id: balance.customer_id,
        customer_name: '',
        isNewCustomer: false,
        invoice_amount: balance.invoice_amount,
        paid_amount: balance.paid_amount,
        notes: balance.notes || ''
      });
    } else {
      setEditingBalance(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        customer_id: customerId || '',
        customer_name: '',
        isNewCustomer: false,
        invoice_amount: '',
        paid_amount: '',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date) return toast.error('التاريخ مطلوب');
    if (!formData.isNewCustomer && !formData.customer_id) return toast.error('يرجى اختيار العميل');
    if (formData.isNewCustomer && !formData.customer_name.trim()) return toast.error('يرجى إدخال اسم العميل');
    if (!formData.invoice_amount && !formData.paid_amount) return toast.error('يجب إدخال قيمة الفاتورة أو المدفوع');

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        invoice_amount: Number(formData.invoice_amount || 0),
        paid_amount: Number(formData.paid_amount || 0),
      };

      if (editingBalance) {
        await balanceService.updateBalance(editingBalance.id, payload);
        toast.success('تم تحديث الرصيد بنجاح');
      } else {
        await balanceService.addBalance(payload);
        toast.success('تم إضافة الرصيد بنجاح');
        if (formData.isNewCustomer) fetchCustomersList();
      }
      setIsModalOpen(false);
      fetchData();
      // Refresh expanded customer if it was the affected one
      if (expandedCustomerId) {
        const targetId = editingBalance?.customer_id || formData.customer_id;
        if (Number(targetId) === Number(expandedCustomerId)) {
          reloadCustomerTransactions(expandedCustomerId);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!balanceToDelete) return;
    try {
      await balanceService.deleteBalance(balanceToDelete);
      toast.success('تم الحذف بنجاح');
      fetchData();
      if (expandedCustomerId) {
        reloadCustomerTransactions(expandedCustomerId);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setBalanceToDelete(null);
    }
  };

  const handleOpenSettleModal = (customer) => {
    setSelectedCustomerForSettle(customer);
    const debt = Number(customer.total_debt ?? (customer.customer_debt - customer.customer_credit) ?? 0);
    const credit = Number(customer.total_credit ?? (customer.customer_credit - customer.customer_debt) ?? 0);

    if (debt > 0) {
      setSettleForm({
        type: 'credit',
        amount: debt.toFixed(2),
        reason: 'تسوية وتصفير مديونية العميل',
        date: format(new Date(), 'yyyy-MM-dd')
      });
    } else if (credit > 0) {
      setSettleForm({
        type: 'debit',
        amount: credit.toFixed(2),
        reason: 'تصفية وتسوية رصيد دائن للعميل',
        date: format(new Date(), 'yyyy-MM-dd')
      });
    } else {
      setSettleForm({
        type: 'credit',
        amount: '',
        reason: 'تسوية حساب',
        date: format(new Date(), 'yyyy-MM-dd')
      });
    }
    setIsSettleModalOpen(true);
  };

  const handleSettleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomerForSettle) return;
    const amt = parseFloat(settleForm.amount);
    if (!amt || amt <= 0) {
      return toast.error('أدخل مبلغ صحيح أكبر من الصفر');
    }

    setIsSubmittingSettle(true);
    try {
      const custId = selectedCustomerForSettle.customer_id || selectedCustomerForSettle.id;
      const res = await customerService.adjustBalance(custId, {
        ...settleForm,
        amount: amt
      });
      toast.success(res.message || 'تمت التسوية بنجاح');
      setIsSettleModalOpen(false);
      setSelectedCustomerForSettle(null);
      fetchData();
      if (expandedCustomerId) {
        reloadCustomerTransactions(expandedCustomerId);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'حدث خطأ أثناء التسوية');
    } finally {
      setIsSubmittingSettle(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header & Summary Cards ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>أرصدة العملاء</h2>
            <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '0.85rem' }}>
              {customers.length} عميل — اضغط على البطاقة لعرض الحركات التفصيلية
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => handleOpenModal()}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={16} /> إضافة حركة
          </button>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid var(--danger)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <TrendingDown size={16} color="var(--danger)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>إجمالي الديون (على العملاء)</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>
              {Number(summary.grand_total_debt).toFixed(2)} <span style={{ fontSize: '0.75rem' }}>ج.م</span>
            </div>
          </div>
          <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid var(--success)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <TrendingUp size={16} color="var(--success)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>إجمالي الأرصدة (لصالح العملاء)</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>
              {Number(summary.grand_total_credit).toFixed(2)} <span style={{ fontSize: '0.75rem' }}>ج.م</span>
            </div>
          </div>
          <div className="card" style={{ padding: '16px 20px', borderRight: '4px solid var(--primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <User size={16} color="var(--primary)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>عملاء لديهم حركات</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary)' }}>
              {summary.customers_with_transactions}
            </div>
          </div>
        </div>

        {/* ── Search & Filter Bar ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="بحث باسم العميل..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingRight: 38, paddingTop: 8, paddingBottom: 8 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Multi-select customer filter */}
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button
              className="btn btn-ghost"
              onClick={() => setFilterDropdownOpen(!filterDropdownOpen)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                border: `1.5px solid ${selectedCustomerIds.length > 0 ? 'var(--primary)' : 'var(--border)'}`,
                color: selectedCustomerIds.length > 0 ? 'var(--primary)' : 'var(--text-secondary)'
              }}
            >
              <span>تصفية العملاء</span>
              {selectedCustomerIds.length > 0 && (
                <span style={{
                  background: 'var(--primary)', color: 'white',
                  borderRadius: 10, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700
                }}>
                  {selectedCustomerIds.length}
                </span>
              )}
              <ChevronDown size={14} />
            </button>

            {filterDropdownOpen && (
              <div style={{
                position: 'absolute', top: '110%', right: 0, zIndex: 200,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '8px 0', minWidth: 220,
                boxShadow: '0 8px 30px rgba(0,0,0,0.15)', maxHeight: 300, overflowY: 'auto'
              }}>
                <div style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  اختر عميلاً أو أكثر
                </div>
                {customersList.map(c => (
                  <label key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 14px', cursor: 'pointer',
                    background: selectedCustomerIds.includes(c.id) ? 'var(--primary-10, rgba(99,102,241,0.08))' : 'transparent',
                    transition: 'background 0.15s'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(c.id)}
                      onChange={() => toggleCustomerFilter(c.id)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date Range */}
          <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '8px 12px', width: 'auto', fontSize: '0.82rem' }} title="من تاريخ" />
          <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '8px 12px', width: 'auto', fontSize: '0.82rem' }} title="إلى تاريخ" />

          {/* Sort */}
          <select
            className="form-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{ padding: '8px 12px', width: 'auto', fontSize: '0.82rem' }}
          >
            <option value="debt">ترتيب: الأعلى ديناً</option>
            <option value="credit">ترتيب: الأعلى رصيداً</option>
            <option value="name">ترتيب: الاسم</option>
          </select>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button className="btn btn-ghost" onClick={clearFilters} style={{ color: 'var(--danger)', gap: 4, display: 'flex', alignItems: 'center', padding: '8px 12px' }}>
              <X size={14} /> مسح الفلاتر
            </button>
          )}

          {/* Refresh */}
          <button className="btn btn-ghost" onClick={fetchData} style={{ padding: '8px 10px' }} title="تحديث">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── Customer Cards Grid ──────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
          جاري التحميل...
        </div>
      ) : sortedCustomers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <User size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
          لا يوجد عملاء مطابقون
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sortedCustomers.map(customer => {
            const debt = Number(customer.total_debt);
            const credit = Number(customer.total_credit);
            const rawDebt = Number(customer.customer_debt || 0);
            const rawCredit = Number(customer.customer_credit || 0);
            const hasBoth = rawDebt > 0 && rawCredit > 0;
            const isExpanded = expandedCustomerId === customer.customer_id;
            const hasDebt = debt > 0;
            const hasCredit = credit > 0 && debt === 0;
            const isNeutral = debt === 0 && credit === 0;

            const statusColor = hasDebt ? 'var(--danger)' : hasCredit ? 'var(--success)' : 'var(--text-muted)';
            const statusBg = hasDebt ? 'rgba(239,68,68,0.06)' : hasCredit ? 'rgba(34,197,94,0.06)' : 'var(--bg-secondary)';
            const borderColor = hasDebt ? 'var(--danger)' : hasCredit ? 'var(--success)' : 'var(--border)';

            return (
              <div key={customer.customer_id} style={{
                background: 'var(--bg-card)',
                border: `1.5px solid ${isExpanded ? 'var(--primary)' : borderColor}`,
                borderRadius: 14,
                overflow: 'hidden',
                transition: 'box-shadow 0.2s, border-color 0.2s',
                boxShadow: isExpanded ? '0 4px 20px rgba(99,102,241,0.12)' : '0 1px 4px rgba(0,0,0,0.06)'
              }}>
                {/* Card Header — Click to expand */}
                <div
                  onClick={() => handleExpandCustomer(customer.customer_id)}
                  style={{
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    background: isExpanded ? 'rgba(99,102,241,0.04)' : 'transparent',
                    flexWrap: 'wrap',
                    userSelect: 'none'
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${statusColor}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: statusColor, flexShrink: 0
                  }}>
                    <User size={20} />
                  </div>

                  {/* Name & Phone */}
                  <div style={{ flex: 2, minWidth: 120 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                      {customer.customer_name}
                    </div>
                    {customer.customer_phone && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} /> {customer.customer_phone}
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="customer-stat-group" style={{
                    display: 'flex', gap: 20, flex: 3,
                    justifyContent: 'center', flexWrap: 'wrap', padding: '4px 0'
                  }}>
                    <StatBadge value={customer.total_invoiced} label="إجمالي الفواتير" color="var(--text-primary)" />
                    <StatBadge value={customer.total_paid} label="المدفوع" color="var(--primary)" />
                    <StatBadge
                      value={hasBoth ? rawDebt : customer.total_debt}
                      label={hasBoth ? "فواتير معلقة (عليه)" : "عليه (دين)"}
                      color={(hasBoth ? rawDebt : debt) > 0 ? 'var(--danger)' : 'var(--text-muted)'}
                    />
                    <StatBadge
                      value={hasBoth ? rawCredit : customer.total_credit}
                      label={hasBoth ? "إيداعات ورصيد (له)" : "له (رصيد)"}
                      color={(hasBoth ? rawCredit : credit) > 0 ? 'var(--success)' : 'var(--text-muted)'}
                    />
                  </div>

                  {/* Status Badge + Meta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginRight: 'auto' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20,
                        background: statusBg, color: statusColor, fontWeight: 600, whiteSpace: 'nowrap'
                      }}>
                        {hasBoth
                          ? (debt > 0 ? `صافي دين: ${debt.toFixed(2)}` : `صافي رصيد له: ${credit.toFixed(2)}`)
                          : (hasDebt ? `دين: ${debt.toFixed(2)}` : hasCredit ? `رصيد: ${credit.toFixed(2)}` : 'مسوّى')}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {customer.transactions_count} حركة
                        {customer.last_transaction_date && ` — آخرها ${format(new Date(customer.last_transaction_date), 'yyyy/MM/dd')}`}
                      </div>
                    </div>

                    {/* Quick Settle button */}
                    <button
                      className="btn btn-icon btn-ghost"
                      title="تسوية رصيد العميل"
                      onClick={e => { e.stopPropagation(); handleOpenSettleModal(customer); }}
                      style={{ color: '#d97706', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8 }}
                    >
                      <Zap size={15} />
                    </button>

                    {/* Quick Add button */}
                    <button
                      className="btn btn-icon btn-ghost"
                      title="إضافة حركة لهذا العميل"
                      onClick={e => { e.stopPropagation(); handleOpenModal(null, customer.customer_id); }}
                      style={{ color: 'var(--primary)', border: '1px solid var(--border)', borderRadius: 8 }}
                    >
                      <Plus size={15} />
                    </button>

                    {/* Expand arrow */}
                    <div style={{ color: 'var(--text-muted)' }}>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>
                </div>

                {/* Transactions Drawer (expanded) */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    padding: '16px 20px',
                    animation: 'fadeIn 0.2s ease'
                  }}>
                    {transLoading ? (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        جاري تحميل الحركات...
                      </div>
                    ) : expandedTransactions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        لا توجد حركات مسجلة لهذا العميل
                      </div>
                    ) : (
                      <>
                        {/* Customer totals row */}
                        {expandedCustomerInfo && (() => {
                          const cDebt = Number(expandedCustomerInfo.customer_debt || 0);
                          const cCredit = Number(expandedCustomerInfo.customer_credit || 0);
                          const netD = Number(expandedCustomerInfo.total_debt || 0);
                          const netC = Number(expandedCustomerInfo.total_credit || 0);
                          const hasB = cDebt > 0 && cCredit > 0;
                          return (
                            <div style={{
                              display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
                              background: 'var(--bg-card)', borderRadius: 10, padding: '10px 16px',
                              marginBottom: 14, border: '1px solid var(--border)', fontSize: '0.82rem'
                            }}>
                              <span>إجمالي الفواتير: <strong>{Number(expandedCustomerInfo.total_invoiced).toFixed(2)} ج.م</strong></span>
                              <span>المدفوع: <strong style={{ color: 'var(--primary)' }}>{Number(expandedCustomerInfo.total_paid).toFixed(2)} ج.م</strong></span>
                              {hasB ? (
                                <>
                                  <span>فواتير معلقة (عليه): <strong style={{ color: 'var(--danger)' }}>{cDebt.toFixed(2)} ج.م</strong></span>
                                  <span>إيداعات ورصيد (له): <strong style={{ color: 'var(--success)' }}>{cCredit.toFixed(2)} ج.م</strong></span>
                                  <span style={{
                                    background: netD > 0 ? '#fee2e2' : '#dcfce7',
                                    color: netD > 0 ? '#dc2626' : '#15803d',
                                    padding: '3px 8px', borderRadius: 6, fontWeight: 700
                                  }}>
                                    {netD > 0 ? `صافي المديونية: ${netD.toFixed(2)} ج.م` : `صافي الرصيد لصالحه: ${netC.toFixed(2)} ج.م`}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span>الدين (عليه): <strong style={{ color: 'var(--danger)' }}>{netD.toFixed(2)} ج.م</strong></span>
                                  <span>الرصيد (له): <strong style={{ color: 'var(--success)' }}>{netC.toFixed(2)} ج.م</strong></span>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenSettleModal({ ...expandedCustomerInfo, customer_id: expandedCustomerId })}
                                style={{
                                  marginRight: 'auto',
                                  background: '#fffbeb',
                                  border: '1px solid #f59e0b',
                                  color: '#b45309',
                                  borderRadius: 6,
                                  padding: '4px 10px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <Zap size={13} />
                                ⚡ تسوية رصيد العميل
                              </button>
                            </div>
                          );
                        })()}

                        {/* Transactions Table */}
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-card)' }}>
                                {['التاريخ', 'النوع', 'قيمة الفاتورة', 'المدفوع', 'الدين (عليه)', 'الرصيد (له)', 'ملاحظات', 'إجراءات'].map(h => (
                                  <th key={h} style={{
                                    padding: '8px 12px', textAlign: 'right',
                                    borderBottom: '2px solid var(--border)',
                                    color: 'var(--text-muted)', fontWeight: 600,
                                    whiteSpace: 'nowrap'
                                  }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {expandedTransactions.map((tx, i) => (
                                <tr key={tx.id} style={{
                                  borderBottom: '1px solid var(--border)',
                                  background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)',
                                  transition: 'background 0.1s'
                                }}>
                                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                    {format(new Date(tx.date), 'yyyy/MM/dd')}
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{
                                      fontSize: '0.7rem', padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                                      background: tx.source_type === 'sales' ? 'rgba(99,102,241,0.1)' :
                                        tx.source_type === 'treasury' ? 'rgba(34,197,94,0.1)' :
                                          tx.source_type === 'returns' ? 'rgba(239,68,68,0.12)' :
                                            tx.source_type === 'adjustment' ? 'rgba(245,158,11,0.15)' : 'rgba(156,163,175,0.15)',
                                      color: tx.source_type === 'sales' ? 'var(--primary)' :
                                        tx.source_type === 'treasury' ? 'var(--success)' :
                                          tx.source_type === 'returns' ? '#dc2626' :
                                            tx.source_type === 'adjustment' ? '#b45309' : 'var(--text-muted)'
                                    }}>
                                      {tx.source_type === 'sales' ? 'فاتورة بيع' :
                                        tx.source_type === 'treasury' ? 'إيداع خزينة' :
                                          tx.source_type === 'returns' ? 'مرتجع بضاعة' :
                                            tx.source_type === 'adjustment' ? '⚡ تسوية حساب' : 'يدوي'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>
                                    {Number(tx.invoice_amount) > 0 ? Number(tx.invoice_amount).toFixed(2) : '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--primary)', fontWeight: 600 }}>
                                    {Number(tx.paid_amount) > 0 ? Number(tx.paid_amount).toFixed(2) : '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'left' }}>
                                    {Number(tx.remaining_balance) > 0 ? (
                                      <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{Number(tx.remaining_balance).toFixed(2)}</span>
                                    ) : '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px', textAlign: 'left' }}>
                                    {Number(tx.customer_credit) > 0 ? (
                                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>{Number(tx.customer_credit).toFixed(2)}</span>
                                    ) : '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tx.notes || '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      {tx.source_type === 'manual' && (
                                        <>
                                          <button
                                            className="btn btn-icon btn-ghost"
                                            onClick={() => handleOpenModal(tx)}
                                            title="تعديل"
                                            style={{ padding: 4 }}
                                          >
                                            <Edit size={13} />
                                          </button>
                                          <button
                                            className="btn btn-icon btn-ghost"
                                            onClick={() => { setBalanceToDelete(tx.id); setIsConfirmOpen(true); }}
                                            style={{ color: 'var(--danger)', padding: 4 }}
                                            title="حذف"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </>
                                      )}
                                      {tx.source_type !== 'manual' && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>تلقائي</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Bottom Totals Bar (نهاية الموديول - الإجمالي) ──────────────────────── */}
      {!loading && sortedCustomers.length > 0 && (
        <div className="card" style={{
          marginTop: 20,
          padding: '16px 20px',
          background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
          border: '1.5px solid var(--border)',
          borderRadius: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              إجمالي أرصدة العملاء المعروضة ({sortedCustomers.length} عميل)
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              ملخص إجمالي الفواتير والمدفوعات والمستحقات
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {sortedCustomers.reduce((s, c) => s + Number(c.total_invoiced || 0), 0).toFixed(2)} <span style={{ fontSize: '0.7rem' }}>ج.م</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>إجمالي الفواتير</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--primary)' }}>
                {sortedCustomers.reduce((s, c) => s + Number(c.total_paid || 0), 0).toFixed(2)} <span style={{ fontSize: '0.7rem' }}>ج.م</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>إجمالي المدفوع</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--danger)' }}>
                {sortedCustomers.reduce((s, c) => s + Number(c.total_debt || 0), 0).toFixed(2)} <span style={{ fontSize: '0.7rem' }}>ج.م</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>إجمالي الديون (عليهم)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--success)' }}>
                {sortedCustomers.reduce((s, c) => s + Number(c.total_credit || 0), 0).toFixed(2)} <span style={{ fontSize: '0.7rem' }}>ج.م</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>إجمالي الأرصدة (لهم)</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Modal ─────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBalance ? 'تعديل حركة رصيد' : 'إضافة حركة رصيد'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input
              type="date"
              className="form-input"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>

          {!editingBalance && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                id="newCust2"
                checked={formData.isNewCustomer}
                onChange={(e) => setFormData({ ...formData, isNewCustomer: e.target.checked, customer_id: '', customer_name: '' })}
              />
              <label htmlFor="newCust2" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                عميل جديد؟
              </label>
            </div>
          )}

          {formData.isNewCustomer && !editingBalance ? (
            <div className="form-group">
              <label className="form-label">اسم العميل الجديد *</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل اسم العميل"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                autoFocus
              />
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">العميل *</label>
              <select
                className="form-select"
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                disabled={!!editingBalance}
              >
                <option value="">-- اختر العميل --</option>
                {customersList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">قيمة الفاتورة / المسحوب</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder="0.00"
                value={formData.invoice_amount}
                onChange={(e) => setFormData({ ...formData, invoice_amount: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">المدفوع</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder="0.00"
                value={formData.paid_amount}
                onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
              />
            </div>
          </div>

          {/* Auto-calc hint */}
          {(Number(formData.invoice_amount) > 0 || Number(formData.paid_amount) > 0) && (
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', border: '1px solid var(--border)' }}>
              {Number(formData.paid_amount) < Number(formData.invoice_amount) ? (
                <span style={{ color: 'var(--danger)' }}>
                  🔴 دين على العميل: <strong>{(Number(formData.invoice_amount) - Number(formData.paid_amount)).toFixed(2)} ج.م</strong>
                </span>
              ) : Number(formData.paid_amount) > Number(formData.invoice_amount) ? (
                <span style={{ color: 'var(--success)' }}>
                  🟢 رصيد لصالح العميل: <strong>{(Number(formData.paid_amount) - Number(formData.invoice_amount)).toFixed(2)} ج.م</strong>
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>✅ مسوّى بالكامل</span>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-textarea"
              rows="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            ></textarea>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ الحركة'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Customer Settlement Modal ── */}
      <Modal
        isOpen={isSettleModalOpen}
        onClose={() => { setIsSettleModalOpen(false); setSelectedCustomerForSettle(null); }}
        title="⚡ تسوية رصيد العميل"
      >
        {selectedCustomerForSettle && (
          <form onSubmit={handleSettleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '12px 14px'
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                {selectedCustomerForSettle.customer_name || selectedCustomerForSettle.name}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {(() => {
                  const debt = Number(selectedCustomerForSettle.total_debt ?? (selectedCustomerForSettle.customer_debt - selectedCustomerForSettle.customer_credit) ?? 0);
                  const credit = Number(selectedCustomerForSettle.total_credit ?? (selectedCustomerForSettle.customer_credit - selectedCustomerForSettle.customer_debt) ?? 0);
                  if (debt > 0) {
                    return <span style={{ color: 'var(--danger)', fontWeight: 700 }}>مديونية متبقية على العميل: {debt.toFixed(2)} ج.م</span>;
                  }
                  if (credit > 0) {
                    return <span style={{ color: 'var(--success)', fontWeight: 700 }}>رصيد دائن لصالح العميل: {credit.toFixed(2)} ج.م</span>;
                  }
                  return <span>الحساب مسوّى (0.00 ج.م)</span>;
                })()}
              </div>
            </div>

            {/* Type selector */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              background: '#f1f5f9',
              padding: 4,
              borderRadius: 10
            }}>
              <button
                type="button"
                onClick={() => setSettleForm(prev => ({ ...prev, type: 'credit' }))}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: settleForm.type === 'credit' ? '#16a34a' : 'transparent',
                  color: settleForm.type === 'credit' ? '#fff' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                🟢 تسوية خصم (تصفير مديونية)
              </button>
              <button
                type="button"
                onClick={() => setSettleForm(prev => ({ ...prev, type: 'debit' }))}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: settleForm.type === 'debit' ? '#dc2626' : 'transparent',
                  color: settleForm.type === 'debit' ? '#fff' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                🔴 تسوية إضافة دين على العميل
              </button>
            </div>

            <div style={{
              background: settleForm.type === 'credit' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${settleForm.type === 'credit' ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: '0.78rem',
              color: settleForm.type === 'credit' ? '#166534' : '#991b1b',
              fontWeight: 600
            }}>
              {settleForm.type === 'credit'
                ? '✨ سيتم خصم هذا المبلغ من مديونية العميل وإسقاطه (تخفيض المطلوب منه).'
                : '⚠️ سيتم إضافة هذا المبلغ كمديونية تسوية على العميل.'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">التاريخ *</label>
                <input
                  type="date"
                  className="form-input"
                  value={settleForm.date}
                  onChange={e => setSettleForm(p => ({ ...p, date: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">مبلغ التسوية (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="form-input"
                  placeholder="0.00"
                  value={settleForm.amount}
                  onChange={e => setSettleForm(p => ({ ...p, amount: e.target.value }))}
                  required
                  style={{
                    fontWeight: 800,
                    fontSize: '1rem',
                    color: settleForm.type === 'credit' ? '#16a34a' : '#dc2626'
                  }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">سبب / بيان التسوية</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: تسوية كسور حساب، خصم متفق عليه، تصفير رصيد..."
                value={settleForm.reason}
                onChange={e => setSettleForm(p => ({ ...p, reason: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  background: settleForm.type === 'credit' ? '#16a34a' : '#dc2626',
                  borderColor: settleForm.type === 'credit' ? '#16a34a' : '#dc2626'
                }}
                disabled={isSubmittingSettle}
              >
                {isSubmittingSettle ? 'جاري الحفظ...' : (settleForm.type === 'credit' ? 'تأكيد تسوية المديونية' : 'تأكيد إضافة المديونية')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => { setIsSettleModalOpen(false); setSelectedCustomerForSettle(null); }}
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => { setIsConfirmOpen(false); setBalanceToDelete(null); }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذه الحركة؟"
      />

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .customer-stat-group {
            width: 100% !important;
            justify-content: space-around !important;
            border-top: 1px dashed var(--border);
            padding-top: 10px !important;
            order: 3;
          }
        }
      `}</style>
    </div>
  );
};

export default BalancesPage;
