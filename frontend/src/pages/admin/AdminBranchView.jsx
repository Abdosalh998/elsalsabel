import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import { format, startOfWeek, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import {
  ArrowRight, TrendingUp, ShoppingCart, DollarSign, Users, Package, Wallet,
  Calendar, Search, Filter, Palette, HandCoins, ArrowLeftRight, Printer,
  RefreshCw, CheckCircle2, Clock, RotateCcw, AlertTriangle, ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import '../../components/common/DataTable.css';

const tabs = [
  { key: 'summary', label: 'التحليل المالي والملخص', icon: TrendingUp },
  { key: 'sales', label: 'المبيعات', icon: ShoppingCart },
  { key: 'purchases', label: 'المشتريات', icon: Package },
  { key: 'treasury', label: 'الخزينة والسيولة', icon: Wallet },
  { key: 'customers', label: 'العملاء والمديونيات', icon: Users },
  { key: 'expenses', label: 'المصروفات', icon: DollarSign },
  { key: 'inventory', label: 'المخازن والجرد', icon: Package },
  { key: 'coloring', label: 'أوامر التلوين', icon: Palette },
  { key: 'custody', label: 'العهد المالية', icon: HandCoins },
  { key: 'transfers', label: 'التحويلات', icon: ArrowLeftRight },
];

const SUMMARY_LABELS = {
  total_amount: 'إجمالي القيمة:',
  total_paid: 'المحصل:',
  total_remaining: 'المتبقي:',
  total_settlements: 'إجمالي التسويات:',
  total_items: 'عدد الأصناف:',
  total_weight: 'إجمالي الوزن:',
  total_available_weight: 'المتاح للبيع:',
  total_inventory_value: 'إجمالي قيمة المخزون:',
  total_in: 'إجمالي الوارد:',
  total_out: 'إجمالي الصادر:',
  net: 'الصافي:',
  count: 'العدد:',
  total_issued_weight: 'الوزن المنصرف للتلوين:',
  total_returned_weight: 'الوزن المرتجع:',
  total_gain: 'فرق الوزن:',
  total_cost: 'تكلفة التلوين:',
  total_disbursed: 'إجمالي العهد المنصرفة:',
  total_collected: 'إجمالي العهد المسواة:',
  total_debt: 'إجمالي المديونيات:',
};

const fmt = (n) =>
  Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  try {
    return format(new Date(d), 'yyyy/MM/dd');
  } catch {
    return d || '-';
  }
};

const AdminBranchView = () => {
  const { branchId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('summary');
  const [branch, setBranch] = useState(null);
  const [branchSummary, setBranchSummary] = useState(null);
  const [data, setData] = useState([]);
  const [tabSummary, setTabSummary] = useState(null);
  const [treasury, setTreasury] = useState(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [dateFilter, setDateFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Handle Preset Date Filters
  const handleDatePreset = (preset) => {
    setDateFilter(preset);
    const today = new Date();
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'today') {
      const d = format(today, 'yyyy-MM-dd');
      setDateFrom(d);
      setDateTo(d);
    } else if (preset === 'week') {
      setDateFrom(format(startOfWeek(today, { weekStartsOn: 6 }), 'yyyy-MM-dd'));
      setDateTo(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      setDateFrom(format(startOfMonth(today), 'yyyy-MM-dd'));
      setDateTo(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'last_month') {
      const prev = subMonths(today, 1);
      setDateFrom(format(startOfMonth(prev), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(prev), 'yyyy-MM-dd'));
    }
  };

  // Fetch Branch Info
  useEffect(() => {
    adminService.getBranches().then((r) => {
      const b = (r.data?.branches || []).find((b) => b.id === parseInt(branchId, 10));
      setBranch(b);
    });
  }, [branchId]);

  // Fetch Branch Financial Summary (for top KPIs)
  const fetchSummary = useCallback(() => {
    const params = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;

    adminService.getBranchSummary(branchId, params)
      .then((r) => setBranchSummary(r.data))
      .catch((err) => console.error('Error fetching branch summary:', err));
  }, [branchId, dateFrom, dateTo]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Fetch Tab Data
  const fetchData = useCallback(() => {
    setLoading(true);
    const params = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    if (search) params.search = search;

    const fetchFns = {
      summary: () => adminService.getBranchSummary(branchId, params),
      sales: () => adminService.getBranchSales(branchId, params),
      purchases: () => adminService.getBranchPurchases(branchId, params),
      customers: () => adminService.getBranchCustomers(branchId, params),
      expenses: () => adminService.getBranchExpenses(branchId, params),
      inventory: () => adminService.getBranchInventory(branchId, params),
      treasury: () => adminService.getBranchTreasury(branchId, params),
      coloring: () => adminService.getBranchColoring(branchId, params),
      custody: () => adminService.getBranchCustody(branchId, params),
      transfers: () => adminService.getBranchTransfers(branchId, params),
    };

    const fn = fetchFns[activeTab];
    if (!fn) {
      setLoading(false);
      return;
    }

    fn()
      .then((r) => {
        if (activeTab === 'treasury') {
          setTreasury(r.data);
          const allT = [
            ...(r.data.records || []),
            ...(r.data.expenses || []),
            ...(r.data.purchases || []),
            ...(r.data.transfers_out || []),
            ...(r.data.transfers_in || []),
          ].sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
          setData(allT);
          setTabSummary(r.data.totals);
        } else if (activeTab === 'summary') {
          setData(r.data);
        } else {
          const key = activeTab === 'sales' ? 'sales'
            : activeTab === 'purchases' ? 'purchases'
            : activeTab === 'customers' ? 'customers'
            : activeTab === 'expenses' ? 'expenses'
            : activeTab === 'coloring' ? 'coloring'
            : activeTab === 'custody' ? 'custody'
            : activeTab === 'transfers' ? 'transfers'
            : 'inventory';

          setData(r.data[key] || []);
          setTabSummary(r.data.summary || null);
        }
      })
      .catch(() => toast.error('حدث خطأ في تحميل بيانات الفرع'))
      .finally(() => setLoading(false));
  }, [activeTab, branchId, dateFrom, dateTo, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Render Summary Tab
  const renderSummaryTab = () => {
    if (!branchSummary) return null;
    const { sales, purchases, expenses, treasury, customers, inventory, net_profit_estimate } = branchSummary;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
          <div className="card" style={{ padding: 18, borderRight: '4px solid #16a34a' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>إجمالي المبيعات ({sales?.count} فاتورة)</div>
            <div style={{ color: '#16a34a', fontWeight: 800, fontSize: '1.35rem', marginTop: 4 }}>{fmt(sales?.total)} ج.م</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              المحصل: {fmt(sales?.paid)} | المتبقي: {fmt(sales?.remaining)}
            </div>
          </div>

          <div className="card" style={{ padding: 18, borderRight: '4px solid #2563eb' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>رصيد الخزينة الحالي</div>
            <div style={{ color: '#2563eb', fontWeight: 800, fontSize: '1.35rem', marginTop: 4 }}>{fmt(treasury?.net)} ج.م</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>السيولة الصافية المتاحة بالفرع</div>
          </div>

          <div className="card" style={{ padding: 18, borderRight: '4px solid #d97706' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>المشتريات والتوريدات ({purchases?.count})</div>
            <div style={{ color: '#d97706', fontWeight: 800, fontSize: '1.35rem', marginTop: 4 }}>{fmt(purchases?.total)} ج.م</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>إجمالي المشتريات المسجلة</div>
          </div>

          <div className="card" style={{ padding: 18, borderRight: '4px solid #dc2626' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>المصروفات التشغيلية ({expenses?.count})</div>
            <div style={{ color: '#dc2626', fontWeight: 800, fontSize: '1.35rem', marginTop: 4 }}>{fmt(expenses?.total)} ج.م</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>المصاريف والرسوم</div>
          </div>

          <div className="card" style={{ padding: 18, borderRight: '4px solid #7c3aed' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>صافي الربح التقديري للفترة</div>
            <div style={{ color: net_profit_estimate >= 0 ? '#16a34a' : '#dc2626', fontWeight: 800, fontSize: '1.35rem', marginTop: 4 }}>
              {fmt(net_profit_estimate)} ج.م
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>المبيعات - (المشتريات + المصروفات)</div>
          </div>

          <div className="card" style={{ padding: 18, borderRight: '4px solid #0891b2' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>مديونيات العملاء للفرع</div>
            <div style={{ color: customers?.total_debt > 0 ? '#dc2626' : '#16a34a', fontWeight: 800, fontSize: '1.35rem', marginTop: 4 }}>
              {fmt(customers?.total_debt)} ج.م
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>ديون على {customers?.count} عميل</div>
          </div>
        </div>

        {/* Operational Status Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* Inventory Overview */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={18} color="#7c3aed" /> حالة المخزون بالفرع
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>عدد أصناف المخزون:</span>
                <strong>{inventory?.items_count || 0} صنف</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>إجمالي الوزن المتاح بالمخزن:</span>
                <strong style={{ color: '#16a34a' }}>{fmt(inventory?.total_avail_weight)} كجم</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>القيمة التقديرية للبضاعة:</span>
                <strong style={{ color: '#2563eb' }}>{fmt(inventory?.total_value)} ج.م</strong>
              </div>
            </div>
          </div>

          {/* Quick Actions & Navigation */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} color="#16a34a" /> اختصارات المراقبة المباشرة
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setActiveTab('sales')}
                className="btn btn-secondary"
                style={{ padding: '12px 10px', fontSize: '0.82rem', justifyContent: 'center' }}
              >
                🛒 مبيعات الفرع ({sales?.count})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('treasury')}
                className="btn btn-secondary"
                style={{ padding: '12px 10px', fontSize: '0.82rem', justifyContent: 'center' }}
              >
                💰 حركة الخزينة
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('coloring')}
                className="btn btn-secondary"
                style={{ padding: '12px 10px', fontSize: '0.82rem', justifyContent: 'center' }}
              >
                🎨 أوامر التلوين
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('custody')}
                className="btn btn-secondary"
                style={{ padding: '12px 10px', fontSize: '0.82rem', justifyContent: 'center' }}
              >
                💼 عهد الموظفين
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('transfers')}
                className="btn btn-secondary"
                style={{ padding: '12px 10px', fontSize: '0.82rem', justifyContent: 'center' }}
              >
                🔄 التحويلات
              </button>
              <button
                type="button"
                onClick={() => navigate(`/admin/reports?branchId=${branchId}`)}
                className="btn btn-primary"
                style={{ padding: '12px 10px', fontSize: '0.82rem', justifyContent: 'center' }}
              >
                📊 التقرير الشامل A4
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Tables for other tabs
  const renderTable = () => {
    if (loading) return <div className="loading-overlay" style={{ minHeight: '300px' }}><div className="spinner" /></div>;
    if (activeTab === 'summary') return renderSummaryTab();
    if (!data.length) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>لا توجد سجلات مطابقة للفلترة المحددة</div>;

    const configs = {
      sales: [
        { h: 'الفاتورة', r: (r) => `#${r.invoice_number || r.id}` },
        { h: 'التاريخ', r: (r) => fmtDate(r.date) },
        { h: 'العميل', r: (r) => r.customer_name || 'عميل نقدي' },
        { h: 'المنتج', r: (r) => r.product || '-' },
        { h: 'الوزن (كجم)', r: (r) => fmt(r.weight_quantity || r.quantity) },
        { h: 'الإجمالي', r: (r) => <span style={{ color: 'var(--success)', fontWeight: 700 }}>{fmt(r.total)} ج.م</span> },
        { h: 'المدفوع', r: (r) => fmt(r.paid_amount) },
        { h: 'التسوية', r: (r) => Number(r.settlement_amount) > 0 ? <span style={{ color: '#d97706', fontWeight: 700 }}>⚡ {fmt(r.settlement_amount)}</span> : '-' },
        { h: 'المتبقي', r: (r) => Number(r.remaining_balance) > 0 ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(r.remaining_balance)}</span> : '0.00' },
      ],
      purchases: [
        { h: 'التاريخ', r: (r) => fmtDate(r.date) },
        { h: 'المورد', r: (r) => r.supplier_name || '-' },
        { h: 'المنتج', r: (r) => r.product },
        { h: 'الوزن / الكمية', r: (r) => `${fmt(r.weight_quantity || r.quantity)} كجم` },
        { h: 'الإجمالي', r: (r) => <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{fmt(r.total)} ج.م</span> },
        { h: 'الخصم من الخزينة', r: (r) => fmt(r.treasury_balance) },
      ],
      treasury: [
        { h: 'التاريخ', r: (r) => fmtDate(r.date) },
        {
          h: 'النوع',
          r: (r) => {
            const isEntryIn = r.source === 'treasury' || r.source === 'transfer_in';
            return (
              <span
                style={{
                  color: isEntryIn ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 700,
                  background: isEntryIn ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.78rem',
                }}
              >
                {isEntryIn ? 'وارد (+)' : 'صادر (-)'}
              </span>
            );
          },
        },
        { h: 'القناة', r: (r) => r.channel || 'كاش' },
        {
          h: 'المبلغ',
          r: (r) => {
            const isEntryIn = r.source === 'treasury' || r.source === 'transfer_in';
            return (
              <span style={{ color: isEntryIn ? 'var(--success)' : 'var(--danger)', fontWeight: 750 }}>
                {fmt(r.amount)} ج.م
              </span>
            );
          },
        },
        { h: 'البيان والتفاصيل', r: (r) => r.notes || '-' },
      ],
      customers: [
        { h: 'الاسم', r: (r) => r.name },
        { h: 'الهاتف', r: (r) => r.phone || '-' },
        { h: 'إجمالي الفواتير', r: (r) => `${fmt(r.customer_total)} ج.م` },
        { h: 'المدفوع', r: (r) => `${fmt(r.total_payments)} ج.م` },
        {
          h: 'الرصيد المتبقي',
          r: (r) => (
            <span style={{ color: Number(r.remaining_balance) > 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 800 }}>
              {fmt(r.remaining_balance)} ج.م
            </span>
          ),
        },
      ],
      expenses: [
        { h: 'التاريخ', r: (r) => fmtDate(r.date) },
        { h: 'البيان', r: (r) => r.description },
        { h: 'القناة', r: (r) => r.channel || 'كاش' },
        { h: 'المبلغ', r: (r) => <span style={{ color: 'var(--danger)', fontWeight: 750 }}>{fmt(r.amount)} ج.م</span> },
        { h: 'ملاحظات', r: (r) => r.notes || '-' },
      ],
      inventory: [
        { h: 'التاريخ', r: (r) => fmtDate(r.date) },
        { h: 'الشركة', r: (r) => r.company || '-' },
        { h: 'المنتج', r: (r) => r.product },
        { h: 'إجمالي الوزن', r: (r) => `${fmt(r.weight_quantity)} كجم` },
        { h: 'العدد (لفات)', r: (r) => r.count || 0 },
        { h: 'المباع / المنصرف', r: (r) => <span style={{ color: 'var(--warning)' }}>{fmt(r.issued_quantity)} كجم</span> },
        { h: 'المتاح للبيع', r: (r) => <span style={{ color: 'var(--success)', fontWeight: 800 }}>{fmt(r.available_weight)} كجم</span> },
        { h: 'القيمة', r: (r) => `${fmt(r.total)} ج.م` },
      ],
      coloring: [
        { h: 'رقم الأمر', r: (r) => r.order_number || `#${r.id}` },
        { h: 'التاريخ', r: (r) => fmtDate(r.date) },
        { h: 'الخامة الأصلية', r: (r) => r.product },
        { h: 'اللون المطلوب', r: (r) => r.color || '-' },
        { h: 'المنتج الملون', r: (r) => r.colored_product || '-' },
        { h: 'الوزن المنصرف', r: (r) => `${fmt(r.issued_weight)} كجم` },
        { h: 'الوزن الراجع', r: (r) => r.returned_weight ? `${fmt(r.returned_weight)} كجم` : '-' },
        {
          h: 'فرق الوزن',
          r: (r) => {
            const gain = Number(r.weight_gain || 0);
            if (gain === 0) return '-';
            return <span style={{ color: gain > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{gain > 0 ? `+${gain}` : gain} كجم</span>;
          },
        },
        { h: 'تكلفة التلوين', r: (r) => `${fmt(r.coloring_cost)} ج.م` },
        {
          h: 'الحالة',
          r: (r) => {
            if (r.status === 'stocked') return <span style={{ color: '#16a34a', fontWeight: 700 }}>مرحّل للمخزن</span>;
            if (r.initial_stocked) return <span style={{ color: '#d97706', fontWeight: 700 }}>⚡ مرحل مبدئياً</span>;
            return <span style={{ color: '#ea580c' }}>قيد التنفيذ</span>;
          },
        },
      ],
      custody: [
        { h: 'التاريخ', r: (r) => fmtDate(r.date) },
        { h: 'اسم الشخص / الموظف', r: (r) => <strong>{r.person_name}</strong> },
        {
          h: 'نوع الحركة',
          r: (r) => (
            <span
              style={{
                color: r.type === 'disbursement' ? '#dc2626' : '#16a34a',
                fontWeight: 700,
                background: r.type === 'disbursement' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                padding: '3px 8px',
                borderRadius: 4,
                fontSize: '0.78rem',
              }}
            >
              {r.type === 'disbursement' ? 'صرف عهدة (-)' : 'توريد / تصفية (+)'}
            </span>
          ),
        },
        {
          h: 'المبلغ',
          r: (r) => (
            <span style={{ fontWeight: 800, color: r.type === 'disbursement' ? '#dc2626' : '#16a34a' }}>
              {fmt(r.amount)} ج.م
            </span>
          ),
        },
        { h: 'القناة / طريقة الدفع', r: (r) => r.payment_type_name || r.channel || 'كاش' },
        { h: 'رقم الإيصال', r: (r) => r.receipt_number || '-' },
        { h: 'ملاحظات وتفاصيل', r: (r) => r.notes || '-' },
      ],
      transfers: [
        { h: 'رقم التحويل', r: (r) => r.transfer_number },
        { h: 'التاريخ', r: (r) => fmtDate(r.created_at) },
        { h: 'من فرع', r: (r) => r.from_branch_name },
        { h: 'إلى فرع', r: (r) => r.to_branch_name },
        { h: 'النوع', r: (r) => r.type === 'monetary' ? 'أموال' : 'بضاعة' },
        { h: 'المبلغ / التفاصيل', r: (r) => r.type === 'monetary' ? `${fmt(r.amount)} ج.م` : r.notes },
        {
          h: 'الحالة',
          r: (r) => (
            <span style={{ color: r.status === 'completed' ? '#16a34a' : '#ea580c', fontWeight: 700 }}>
              {r.status === 'completed' ? 'مكتمل' : 'معلق'}
            </span>
          ),
        },
      ],
    };

    const cols = configs[activeTab] || [];

    return (
      <div className="table-container datatable-wrapper">
        <table className="datatable">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.h} style={{ textAlign: 'right' }}>
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {cols.map((c, j) => (
                  <td key={j}>{c.r(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => navigate('/admin/branches')}
            className="btn btn-secondary"
            title="الرجوع إلى قائمة الفروع"
            style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowRight size={18} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="page-title">{branch?.name || 'جاري التحميل...'}</h1>
              {branch?.is_active && (
                <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 700 }}>
                  فرع نشط
                </span>
              )}
            </div>
            <p className="page-subtitle">كود الفرع: {branch?.code} · العنوان: {branch?.address || 'غير محدد'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => navigate(`/admin/reports?branchId=${branchId}`)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={16} /> طباعة تقرير الفرع A4
          </button>
        </div>
      </div>

      {/* Date & Search Filter Controls Bar */}
      <div
        className="card"
        style={{
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Date Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Calendar size={16} color="var(--text-muted)" />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>الفترة:</span>
          {[
            { key: 'all', label: 'الكل' },
            { key: 'today', label: 'اليوم' },
            { key: 'week', label: 'هذا الأسبوع' },
            { key: 'month', label: 'هذا الشهر' },
            { key: 'last_month', label: 'الشهر الماضي' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleDatePreset(key)}
              style={{
                background: dateFilter === key ? 'var(--primary)' : 'var(--bg-secondary)',
                color: dateFilter === key ? '#fff' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Custom Date Range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto', padding: '6px 10px', fontSize: '0.82rem' }}
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setDateFilter('custom');
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>إلى</span>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto', padding: '6px 10px', fontSize: '0.82rem' }}
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setDateFilter('custom');
            }}
          />
        </div>

        {/* Quick Search inside Tab */}
        {activeTab !== 'summary' && (
          <div style={{ position: 'relative', minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingRight: 32, padding: '6px 32px 6px 10px', fontSize: '0.82rem' }}
              placeholder="بحث في الجدول المعروض..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Tabs Bar */}
      <div
        className="card"
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 20,
          padding: '8px',
          overflowX: 'auto',
          background: 'var(--bg-card)',
        }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`btn ${activeTab === key ? 'btn-primary' : ''}`}
            style={{
              background: activeTab === key ? 'var(--primary)' : 'transparent',
              color: activeTab === key ? '#fff' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              boxShadow: 'none',
              padding: '8px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Tab Specific Summary Bar (if available) */}
      {tabSummary && activeTab !== 'summary' && (
        <div
          className="card"
          style={{
            padding: '12px 18px',
            marginBottom: 16,
            display: 'flex',
            gap: 20,
            flexWrap: 'wrap',
            alignItems: 'center',
            background: 'var(--bg-secondary)',
          }}
        >
          {Object.entries(tabSummary).map(([k, v]) => {
            const label = SUMMARY_LABELS[k] || `${k}:`;
            const isCount = k === 'total_items' || k === 'count';
            const isWeight = k.includes('weight') || k.includes('gain');
            let formattedVal = v;
            if (typeof v === 'number') {
              if (isCount) {
                formattedVal = Math.round(v).toLocaleString('ar-EG');
              } else if (isWeight) {
                formattedVal = `${fmt(v)} كجم`;
              } else {
                formattedVal = `${fmt(v)} ج.م`;
              }
            }

            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                  {label}
                </span>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  {formattedVal}
                </strong>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Table / View */}
      <div className="card" style={{ padding: activeTab === 'summary' ? 0 : 0 }}>
        {renderTable()}
      </div>
    </div>
  );
};

export default AdminBranchView;
