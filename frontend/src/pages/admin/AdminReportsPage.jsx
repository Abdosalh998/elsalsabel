import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/admin.service';
import ReportsPage from '../branch/ReportsPage';
import { format, startOfWeek, startOfMonth, subMonths, endOfMonth, startOfYear } from 'date-fns';
import {
  FileBarChart2, Building2, Calendar, TrendingUp, ShoppingCart,
  DollarSign, Wallet, Users, Package, RefreshCw, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';

const fmt = (n) =>
  Number(n || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AdminReportsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Selected Branch (all or specific ID)
  const initialBranch = searchParams.get('branchId') || 'all';
  const [selectedBranchId, setSelectedBranchId] = useState(initialBranch);

  // Comparison Date Filters
  const [datePreset, setDatePreset] = useState('month');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [branchSummaries, setBranchSummaries] = useState([]);

  // Fetch Branches List
  useEffect(() => {
    setBranchesLoading(true);
    adminService.getBranches()
      .then((r) => setBranches(r.data?.branches || []))
      .catch(() => toast.error('خطأ في تحميل قائمة الفروع'))
      .finally(() => setBranchesLoading(false));
  }, []);

  // Update URL & State on branch change
  const handleBranchChange = (newBranchId) => {
    setSelectedBranchId(newBranchId);
    if (newBranchId === 'all') {
      searchParams.delete('branchId');
      setSearchParams(searchParams);
    } else {
      searchParams.set('branchId', newBranchId);
      setSearchParams(searchParams);
    }
  };

  // Fetch Comparison data when in "all" mode
  const fetchComparisonData = async () => {
    if (!branches.length) return;
    setLoadingComparison(true);
    try {
      const summaries = await Promise.all(
        branches.map(async (b) => {
          try {
            const res = await adminService.getBranchSummary(b.id, {
              dateFrom: startDate || undefined,
              dateTo: endDate || undefined,
            });
            return { ...res.data, branch: b };
          } catch {
            return { branch: b, sales: {}, purchases: {}, expenses: {}, treasury: {}, customers: {}, net_profit_estimate: 0 };
          }
        })
      );
      setBranchSummaries(summaries);
    } catch (err) {
      console.error('Error fetching branch comparisons:', err);
      toast.error('حدث خطأ في جلب بيانات مقارنة الفروع');
    } finally {
      setLoadingComparison(false);
    }
  };

  useEffect(() => {
    if (selectedBranchId === 'all' && branches.length > 0) {
      fetchComparisonData();
    }
  }, [selectedBranchId, branches.length, startDate, endDate]);

  // Date Preset handler for comparison
  const handleDatePreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const d = format(today, 'yyyy-MM-dd');
      setStartDate(d);
      setEndDate(d);
    } else if (preset === 'week') {
      setStartDate(format(startOfWeek(today, { weekStartsOn: 6 }), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'last_month') {
      const prev = subMonths(today, 1);
      setStartDate(format(startOfMonth(prev), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(prev), 'yyyy-MM-dd'));
    } else if (preset === 'year') {
      setStartDate(format(startOfYear(today), 'yyyy-MM-dd'));
      setEndDate(format(today, 'yyyy-MM-dd'));
    }
  };

  // Comparison Highlights
  const comparisonHighlights = useMemo(() => {
    if (!branchSummaries.length) return null;
    let topSales = branchSummaries[0];
    let topTreasury = branchSummaries[0];
    let topProfit = branchSummaries[0];
    let lowestExpense = branchSummaries[0];

    branchSummaries.forEach((s) => {
      if ((s.sales?.total || 0) > (topSales.sales?.total || 0)) topSales = s;
      if ((s.treasury?.net || 0) > (topTreasury.treasury?.net || 0)) topTreasury = s;
      if ((s.net_profit_estimate || 0) > (topProfit.net_profit_estimate || 0)) topProfit = s;
      if ((s.expenses?.total || 0) < (lowestExpense.expenses?.total || 0)) lowestExpense = s;
    });

    return { topSales, topTreasury, topProfit, lowestExpense };
  }, [branchSummaries]);

  return (
    <div className="page-container admin-reports-wrapper">
      {/* Top Persistent Branch Selector Bar */}
      <div
        className="card no-print"
        style={{
          padding: '16px 20px',
          marginBottom: 20,
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          color: '#fff',
          borderRadius: 14,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Building2 size={22} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>نطاق تقارير الإدارة</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              {selectedBranchId === 'all'
                ? 'مقارنة وتحليل جميع فروع الشركة'
                : `تقرير: ${branches.find((b) => String(b.id) === String(selectedBranchId))?.name || 'فرع محدد'}`}
            </div>
          </div>
        </div>

        {/* Dropdown to switch branch or all */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e2e8f0' }}>اختر الفرع:</label>
          <select
            className="form-input"
            value={selectedBranchId}
            onChange={(e) => handleBranchChange(e.target.value)}
            style={{
              minWidth: 260,
              fontWeight: 700,
              background: '#fff',
              color: '#0f172a',
              border: '2px solid #38bdf8',
              borderRadius: 8,
              padding: '8px 12px',
            }}
          >
            <option value="all">📊 جميع الفروع (مقارنة وتحليل شامل)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                🏢 {b.name} ({b.code}) {!b.is_active ? ' - [موقوف]' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Render Mode: Comparison of all branches OR Single Branch Reports */}
      {selectedBranchId === 'all' ? (
        /* ======================== ALL BRANCHES COMPARISON ======================== */
        <div>
          {/* Filter Bar for Comparison */}
          <div
            className="card no-print"
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
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>فترة المقارنة:</span>
              {[
                { key: 'today', label: 'اليوم' },
                { key: 'week', label: 'هذا الأسبوع' },
                { key: 'month', label: 'هذا الشهر' },
                { key: 'last_month', label: 'الشهر الماضي' },
                { key: 'year', label: 'هذا العام' },
                { key: 'all', label: 'الكل' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDatePreset(key)}
                  style={{
                    background: datePreset === key ? 'var(--primary)' : 'var(--bg-secondary)',
                    color: datePreset === key ? '#fff' : 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    padding: '5px 11px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom Dates */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                className="form-input"
                style={{ width: 'auto', padding: '6px 10px', fontSize: '0.82rem' }}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset('custom');
                }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>إلى</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 'auto', padding: '6px 10px', fontSize: '0.82rem' }}
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset('custom');
                }}
              />
              <button
                type="button"
                onClick={fetchComparisonData}
                className="btn btn-secondary"
                style={{ padding: '6px 10px' }}
                title="تحديث"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-primary"
                style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Printer size={14} /> طباعة
              </button>
            </div>
          </div>

          {/* Printable Header */}
          <div
            className="printable-header"
            style={{
              borderBottom: '2px solid #1e293b',
              paddingBottom: 14,
              marginBottom: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: '#1e293b' }}>
                شركة السلسبيل - تقرير مقارنة أداء جميع الفروع
              </h2>
              <div style={{ fontSize: '0.95rem', color: '#64748b', marginTop: 4 }}>
                تحليل مالي ومخزني شامل لكافة فروع المؤسسة
              </div>
            </div>
            <div style={{ textAlign: 'left', fontSize: '0.82rem', color: '#64748b' }}>
              <div><strong>الفترة:</strong> {startDate || 'من البداية'} إلى {endDate || 'الآن'}</div>
              <div><strong>تاريخ الاستخراج:</strong> {format(new Date(), 'yyyy/MM/dd - hh:mm a')}</div>
            </div>
          </div>

          {loadingComparison ? (
            <div className="loading-overlay" style={{ minHeight: '350px' }}><div className="spinner" /></div>
          ) : (
            <>
              {/* Highlights Cards */}
              {comparisonHighlights && (
                <div
                  className="no-print"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    marginBottom: 20,
                  }}
                >
                  <div className="card stat-card" style={{ padding: '14px 18px', borderRight: '4px solid #16a34a' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>الفرع الأعلى مبيعات 🥇</div>
                    <div style={{ color: '#16a34a', fontWeight: 800, fontSize: '1.2rem', marginTop: 4 }}>
                      {comparisonHighlights.topSales?.branch?.name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmt(comparisonHighlights.topSales?.sales?.total)} ج.م
                    </div>
                  </div>

                  <div className="card stat-card" style={{ padding: '14px 18px', borderRight: '4px solid #2563eb' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>الأعلى رصيد خزينة 💰</div>
                    <div style={{ color: '#2563eb', fontWeight: 800, fontSize: '1.2rem', marginTop: 4 }}>
                      {comparisonHighlights.topTreasury?.branch?.name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmt(comparisonHighlights.topTreasury?.treasury?.net)} ج.م
                    </div>
                  </div>

                  <div className="card stat-card" style={{ padding: '14px 18px', borderRight: '4px solid #7c3aed' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>الأعلى أرباحاً تقديرية 📈</div>
                    <div style={{ color: '#7c3aed', fontWeight: 800, fontSize: '1.2rem', marginTop: 4 }}>
                      {comparisonHighlights.topProfit?.branch?.name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmt(comparisonHighlights.topProfit?.net_profit_estimate)} ج.م
                    </div>
                  </div>

                  <div className="card stat-card" style={{ padding: '14px 18px', borderRight: '4px solid #0891b2' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>الأقل مصروفات تشغيلية 📉</div>
                    <div style={{ color: '#0891b2', fontWeight: 800, fontSize: '1.2rem', marginTop: 4 }}>
                      {comparisonHighlights.lowestExpense?.branch?.name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmt(comparisonHighlights.lowestExpense?.expenses?.total)} ج.م
                    </div>
                  </div>
                </div>
              )}

              {/* Comparison Table */}
              <div className="card table-container datatable-wrapper">
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, padding: '16px 20px 10px', margin: 0 }}>
                  📊 جدول مقارنة الأداء المالي والتشغيلي للفروع
                </h3>
                <table className="datatable">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'right' }}>الفرع</th>
                      <th style={{ textAlign: 'right' }}>كود الفرع</th>
                      <th style={{ textAlign: 'center' }}>الحالة</th>
                      <th style={{ textAlign: 'left' }}>المبيعات</th>
                      <th style={{ textAlign: 'left' }}>المحصل</th>
                      <th style={{ textAlign: 'left' }}>المشتريات</th>
                      <th style={{ textAlign: 'left' }}>المصروفات</th>
                      <th style={{ textAlign: 'left' }}>رصيد الخزينة</th>
                      <th style={{ textAlign: 'left' }}>صافي الربح التقديري</th>
                      <th style={{ textAlign: 'left' }}>مديونيات العملاء</th>
                      <th className="no-print" style={{ textAlign: 'center' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchSummaries.map(({ branch, sales, purchases, expenses, treasury, customers, net_profit_estimate }) => (
                      <tr key={branch.id}>
                        <td><strong>{branch.name}</strong></td>
                        <td>{branch.code}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            style={{
                              background: branch.is_active ? '#dcfce7' : '#fee2e2',
                              color: branch.is_active ? '#166534' : '#dc2626',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                            }}
                          >
                            {branch.is_active ? 'نشط' : 'موقوف'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'left', fontWeight: 750, color: '#16a34a' }}>
                          {fmt(sales?.total)} ج.م
                        </td>
                        <td style={{ textAlign: 'left' }}>{fmt(sales?.paid)} ج.م</td>
                        <td style={{ textAlign: 'left', color: '#d97706' }}>{fmt(purchases?.total)} ج.م</td>
                        <td style={{ textAlign: 'left', color: '#dc2626' }}>{fmt(expenses?.total)} ج.م</td>
                        <td style={{ textAlign: 'left', fontWeight: 750, color: '#2563eb' }}>
                          {fmt(treasury?.net)} ج.م
                        </td>
                        <td style={{ textAlign: 'left', fontWeight: 800, color: net_profit_estimate >= 0 ? '#16a34a' : '#dc2626' }}>
                          {fmt(net_profit_estimate)} ج.م
                        </td>
                        <td style={{ textAlign: 'left', color: customers?.total_debt > 0 ? '#dc2626' : '#64748b' }}>
                          {fmt(customers?.total_debt)} ج.م
                        </td>
                        <td className="no-print" style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleBranchChange(branch.id)}
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                          >
                            فتح التقارير الكاملة
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ======================== SINGLE BRANCH REPORTS DASHBOARD ======================== */
        <ReportsPage branchIdOverride={selectedBranchId} key={selectedBranchId} />
      )}
    </div>
  );
};

export default AdminReportsPage;
