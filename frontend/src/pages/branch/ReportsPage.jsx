import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import {
  FileText, ShoppingCart, Truck, Package, Landmark,
  Receipt, Users, Filter, Printer,
  RefreshCw, AlertCircle, ArrowUpRight, Award, BarChart2, TrendingDown,
  LayoutGrid, Table as TableIcon, PieChart as PieChartIcon,
  Palette, HandCoins, ArrowLeftRight
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import toast from 'react-hot-toast';
import { reportsService } from '../../services/reports.service';
import { customerService } from '../../services/customer.service';
import { inventoryService } from '../../services/inventory.service';
import { useAuth } from '../../context/AuthContext';
import PrintableReport from '../../components/reports/PrintableReport';

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const CHART_COLORS = ['#1A3A5C', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#db2777', '#ea580c'];

const fmtShort = (n) => {
  const num = Number(n || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}م`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}ك`;
  return num.toFixed(0);
};

const CustomTooltip = ({ active, payload, label, suffix = ' ج.م' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 24px rgba(15,35,64,0.15)',
      fontSize: '0.82rem', fontFamily: 'inherit', direction: 'rtl'
    }}>
      {label && <div style={{ fontWeight: 800, color: '#1A3A5C', marginBottom: 6 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#1A3A5C', fontWeight: 700 }}>
          {p.name}: {typeof p.value === 'number' ? fmt(p.value) : p.value}{suffix}
        </div>
      ))}
    </div>
  );
};

const ChartCard = ({ title, children, height = 280 }) => (
  <div style={{
    background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0',
    boxShadow: '0 2px 10px rgba(15,35,64,0.05)', overflow: 'hidden'
  }}>
    <div style={{
      padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
      display: 'flex', alignItems: 'center', gap: 8,
      fontWeight: 800, color: '#1A3A5C', fontSize: '0.9rem'
    }}>
      <BarChart2 size={15} color="#2563eb" />
      {title}
    </div>
    <div style={{ padding: '16px 12px 12px', height }}>
      {children}
    </div>
  </div>
);

const MODULES = [
  { key: 'comprehensive', label: 'التقرير الشامل', icon: Award, color: '#1A3A5C', gradient: 'linear-gradient(135deg,#1A3A5C,#2563eb)' },
  { key: 'sales', label: 'تقرير المبيعات', icon: ShoppingCart, color: '#16a34a', gradient: 'linear-gradient(135deg,#16a34a,#4ade80)' },
  { key: 'purchases', label: 'تقرير المشتريات', icon: Truck, color: '#2563eb', gradient: 'linear-gradient(135deg,#2563eb,#60a5fa)' },
  { key: 'inventory', label: 'المخازن والجرد', icon: Package, color: '#7c3aed', gradient: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
  { key: 'treasury', label: 'الخزينة والسيولة', icon: Landmark, color: '#0891b2', gradient: 'linear-gradient(135deg,#0891b2,#38bdf8)' },
  { key: 'expenses', label: 'تقرير المصروفات', icon: Receipt, color: '#d97706', gradient: 'linear-gradient(135deg,#d97706,#fbbf24)' },
  { key: 'customers', label: 'العملاء والمديونيات', icon: Users, color: '#dc2626', gradient: 'linear-gradient(135deg,#dc2626,#f87171)' },
  { key: 'coloring', label: 'تقرير التلوين', icon: Palette, color: '#6366f1', gradient: 'linear-gradient(135deg,#6366f1,#a5b4fc)' },
  { key: 'custody', label: 'تقرير العهد', icon: HandCoins, color: '#8b5cf6', gradient: 'linear-gradient(135deg,#8b5cf6,#c4b5fd)' },
  { key: 'custody_transfers', label: 'تحويلات العهد', icon: HandCoins, color: '#db2777', gradient: 'linear-gradient(135deg,#db2777,#f9a8d4)' },
  { key: 'branch_transfers', label: 'تحويلات الفروع', icon: ArrowLeftRight, color: '#0d9488', gradient: 'linear-gradient(135deg,#0d9488,#2dd4bf)' },
];

const DATE_SHORTCUTS = [
  { label: 'اليوم', getValue: () => ({ start: format(new Date(), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'أمس', getValue: () => ({ start: format(subDays(new Date(), 1), 'yyyy-MM-dd'), end: format(subDays(new Date(), 1), 'yyyy-MM-dd') }) },
  { label: 'آخر 7 أيام', getValue: () => ({ start: format(subDays(new Date(), 7), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'هذا الشهر', getValue: () => ({ start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'الكل', getValue: () => ({ start: '', end: '' }) },
];

const ReportsPage = ({ branchIdOverride = null }) => {
  const { user } = useAuth();
  const [activeModule, setActiveModule] = useState('comprehensive');
  const [isLoading, setIsLoading] = useState(false);
  const [activeView, setActiveView] = useState('both'); // 'both' | 'charts' | 'table'

  // Date Filters
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Module Specific Filters
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [customerStatus, setCustomerStatus] = useState('all');
  const [coloringStatus, setColoringStatus] = useState('');
  const [custodyType, setCustodyType] = useState('');
  const [transferTypeFilter, setTransferTypeFilter] = useState('all');
  const [transferStatusFilter, setTransferStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown reference lists
  const [customersList, setCustomersList] = useState([]);
  const [companiesList, setCompaniesList] = useState([]);

  // Report Data States
  const [reportData, setReportData] = useState(null);

  // Print Modal State
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  // Load Customers & Companies lists for filters
  useEffect(() => {
    const custParams = { limit: 1000 };
    if (branchIdOverride) custParams.branch_id = branchIdOverride;
    customerService.getCustomers(custParams)
      .then(res => {
        const list = res.data?.customers || res.data || res.customers || [];
        setCustomersList(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        console.error('Error fetching customers in reports:', err);
      });

    const invParams = {};
    if (branchIdOverride) invParams.branch_id = branchIdOverride;
    inventoryService.getUniqueValues(invParams)
      .then(res => {
        const comp = res.data?.companies || res.companies || [];
        setCompaniesList(Array.isArray(comp) ? comp : []);
      })
      .catch((err) => {
        console.error('Error fetching companies in reports:', err);
      });
  }, [branchIdOverride]);

  // Fetch Report Data based on active module and filters
  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const baseParams = {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branch_id: branchIdOverride || undefined,
      };

      let res = null;
      switch (activeModule) {
        case 'comprehensive':
          res = await reportsService.getComprehensiveReport(baseParams);
          break;
        case 'sales':
          res = await reportsService.getSalesReport({
            ...baseParams,
            customerId: selectedCustomerId || undefined
          });
          break;
        case 'purchases':
          res = await reportsService.getPurchasesReport({
            ...baseParams,
            supplierId: selectedCustomerId || undefined,
            product: searchQuery || undefined
          });
          break;
        case 'inventory':
          res = await reportsService.getInventoryReport({
            ...baseParams,
            company: selectedCompany || undefined,
            product: searchQuery || undefined
          });
          break;
        case 'treasury':
          res = await reportsService.getTreasuryReport({
            ...baseParams,
            channel: selectedChannel || undefined
          });
          break;
        case 'expenses':
          res = await reportsService.getExpensesReport({
            ...baseParams,
            channel: selectedChannel || undefined,
            description: searchQuery || undefined
          });
          break;
        case 'customers':
          res = await reportsService.getCustomersReport({
            ...baseParams,
            status: customerStatus !== 'all' ? customerStatus : undefined,
            customerId: selectedCustomerId || undefined
          });
          break;
        case 'coloring':
          res = await reportsService.getColoringReport({
            ...baseParams,
            status: coloringStatus || undefined,
            company: searchQuery || undefined
          });
          break;
        case 'custody':
          res = await reportsService.getCustodyReport({
            ...baseParams,
            type: custodyType || undefined,
            personName: searchQuery || undefined
          });
          break;
        case 'custody_transfers':
          res = await reportsService.getCustodyTransfersReport({
            ...baseParams,
            search: searchQuery || undefined
          });
          break;
        case 'branch_transfers':
          res = await reportsService.getBranchTransfersReport({
            ...baseParams,
            type: transferTypeFilter !== 'all' ? transferTypeFilter : undefined,
            status: transferStatusFilter !== 'all' ? transferStatusFilter : undefined,
            search: searchQuery || undefined
          });
          break;
        default:
          break;
      }

      setReportData(res?.data || null);
    } catch (err) {
      toast.error('تعذر جلب بيانات التقرير');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [activeModule, startDate, endDate, selectedCustomerId, selectedChannel, selectedCompany, customerStatus, coloringStatus, custodyType, transferTypeFilter, transferStatusFilter, searchQuery, branchIdOverride]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleShortcutClick = (shortcut) => {
    const { start, end } = shortcut.getValue();
    setStartDate(start);
    setEndDate(end);
  };

  // ─── Format Data for Printable View ──────────────────────────────
  const getPrintConfig = () => {
    const periodLabel = startDate && endDate
      ? `الفترة من ${startDate} إلى ${endDate}`
      : startDate
        ? `منذ تاريخ ${startDate}`
        : 'كافة الفترات المسجلة';

    switch (activeModule) {
      case 'comprehensive': {
        const p = reportData?.profitability || {};
        const s = reportData?.sales || {};
        const pur = reportData?.purchases || {};
        const exp = reportData?.expenses || {};
        const tb = reportData?.treasuryBalance || {};

        return {
          title: 'التقرير المالي والتشغيلي الشامل',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'إجمالي المبيعات', value: `${fmt(p.totalSales)} ج.م`, color: '#16a34a' },
            { label: 'إجمالي المشتريات', value: `${fmt(p.totalPurchases)} ج.م`, color: '#2563eb' },
            { label: 'إجمالي المصروفات', value: `${fmt(p.totalExpenses)} ج.م`, color: '#d97706' },
            { label: 'رصيد الخزينة الحالي', value: `${fmt(tb.total)} ج.م`, color: '#1A3A5C' },
          ],
          columns: [
            { header: 'البيان / القسم', key: 'section' },
            { header: 'عدد العمليات / اللفات', key: 'count', align: 'center' },
            { header: 'المبلغ / الوزن المتاح', key: 'amount', align: 'left', render: r => typeof r.amount === 'number' ? `${fmt(r.amount)} ج.م` : (r.amount || '-') },
            { header: 'ملاحظات وتفاصيل إضافية', key: 'notes' }
          ],
          data: [
            { section: 'إجمالي المبيعات', count: s.total_invoices || 0, amount: s.total_sales, notes: `مسدد: ${fmt(s.total_sales_paid)} | متبقي: ${fmt(s.total_sales_remaining)} ج.م | وزن مباع: ${fmt(s.total_weight_sold)} كجم` },
            { section: 'إجمالي المشتريات والتوريدات', count: pur.total_purchases_count || 0, amount: pur.total_purchases, notes: `صافي كمية: ${fmt(pur.total_net_qty_purchased)} طن | مسدد: ${fmt(pur.total_purchases_paid)} ج.م` },
            { section: 'المصروفات التشغيلية', count: exp.total_expenses_count || 0, amount: exp.total_expenses, notes: 'كافة بنود المصروفات خلال الفترة' },
            { section: 'إيداعات الخزينة المباشرة', count: '-', amount: reportData?.treasuryDeposits || 0, notes: 'إيداعات ومقاصات نقدية بالخزينة' },
            { section: 'صافي التدفق المالي للفترة', count: '-', amount: reportData?.netPeriodCashFlow || 0, notes: 'المقبوضات مطروحاً منها المدفوعات' },
            { section: 'المديونيات المستحقة لدى العملاء', count: reportData?.customers?.debtors_count || 0, amount: reportData?.customers?.total_outstanding_debt || 0, notes: `لصالح ${reportData?.customers?.debtors_count || 0} عميل مدين` },
            { section: 'أرصدة العملاء الدائنة (المقدمات)', count: reportData?.customers?.creditors_count || 0, amount: reportData?.customers?.total_customer_credit || 0, notes: 'أرصدة مدفوعة مقدماً من العملاء' },
            { section: 'بضاعة المخزن المتاحة', count: `${reportData?.inventory?.total_available_rolls || 0} لفة`, amount: `${fmt(reportData?.inventory?.total_available_weight)} كجم`, notes: `عدد الأصناف: ${reportData?.inventory?.total_items || 0} صنف (حسب الوزن واللفات بدون تقييم سعري)` },
            { section: 'أوامر التلوين والدهان', count: reportData?.coloring?.total_coloring_orders || 0, amount: reportData?.coloring?.total_coloring_cost || 0, notes: `منصرف: ${fmt(reportData?.coloring?.total_coloring_issued_weight)} كجم | مرتجع: ${fmt(reportData?.coloring?.total_coloring_returned_weight)} كجم` },
            { section: 'حركة العهد والسلف للفترة', count: '-', amount: reportData?.custody?.net_custody_period || 0, notes: `منصرف: ${fmt(reportData?.custody?.total_custody_disbursed)} ج.م | محصل: ${fmt(reportData?.custody?.total_custody_collected)} ج.م` }
          ]
        };
      }

      case 'sales': {
        const sum = reportData?.summary || {};
        return {
          title: 'تقرير فواتير المبيعات التفصيلي',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'عدد الفواتير', value: sum.invoices_count || 0, color: '#1A3A5C' },
            { label: 'إجمالي المبيعات', value: `${fmt(sum.total_amount)} ج.م`, color: '#16a34a' },
            { label: 'المبالغ المسددة', value: `${fmt(sum.total_paid)} ج.م`, color: '#0891b2' },
            { label: 'المديونية المتبقية', value: `${fmt(sum.total_remaining)} ج.م`, color: '#dc2626' },
            { label: 'إجمالي الوزن المباع', value: `${fmt(sum.total_weight)} كجم`, color: '#7c3aed' },
          ],
          columns: [
            { header: 'رقم الفاتورة', key: 'invoice_number', render: r => `#${r.invoice_number}` },
            { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
            { header: 'العميل', key: 'customer_name', render: r => r.customer_name || 'عميل نقدي' },
            {
              header: 'الشركة',
              key: 'company',
              render: r => {
                const comps = [...new Set(r.items?.map(it => it.company).filter(Boolean))];
                return comps.length > 0 ? comps.join('، ') : '-';
              }
            },
            {
              header: 'الصنف',
              key: 'product',
              render: r => {
                const prods = [...new Set(r.items?.map(it => it.product).filter(Boolean))];
                return prods.length > 0 ? prods.join('، ') : '-';
              }
            },
            {
              header: 'عدد اللفات',
              key: 'rolls_count',
              align: 'center',
              render: r => {
                const totalRolls = r.items?.reduce((acc, it) => acc + Number(it.rolls_count || 0), 0);
                return totalRolls > 0 ? `${totalRolls} لفة` : '-';
              }
            },
            { header: 'الوزن (كجم)', key: 'quantity', align: 'center', render: r => fmt(r.quantity) },
            { header: 'الإجمالي', key: 'total', align: 'left', render: r => `${fmt(r.total)} ج.م` },
            { header: 'المدفوع', key: 'paid_amount', align: 'left', render: r => `${fmt(r.paid_amount)} ج.م` },
            { header: 'المتبقي', key: 'remaining_balance', align: 'left', render: r => `${fmt(r.remaining_balance)} ج.م` },
            { header: 'ملاحظات', key: 'notes' }
          ],
          data: reportData?.invoices || []
        };
      }

      case 'purchases': {
        const sum = reportData?.summary || {};
        return {
          title: 'تقرير المشتريات والتوريدات التفصيلي',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'عدد التوريدات', value: sum.purchases_count || 0, color: '#1A3A5C' },
            { label: 'إجمالي القيمة', value: `${fmt(sum.total_amount)} ج.م`, color: '#2563eb' },
            { label: 'صافي الكمية', value: `${fmt(sum.total_net_qty)} طن`, color: '#7c3aed' },
            { label: 'المسدد للموردين', value: `${fmt(sum.total_paid)} ج.م`, color: '#16a34a' },
            { label: 'المتبقي للموردين', value: `${fmt(sum.total_remaining)} ج.م`, color: '#dc2626' },
          ],
          columns: [
            { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
            { header: 'المورد', key: 'supplier_name', render: r => r.supplier_name || 'مورد عام' },
            { header: 'الصنف / المنتج', key: 'product' },
            { header: 'الوزن الإجمالي', key: 'quantity', align: 'center', render: r => `${fmt(r.quantity)} طن` },
            { header: 'الخصم', key: 'discount', align: 'center', render: r => `${fmt(r.discount)} طن` },
            { header: 'صافي الكمية', key: 'net_quantity', align: 'center', render: r => `${fmt(r.net_quantity)} طن` },
            { header: 'إجمالي التوريد', key: 'total', align: 'left', render: r => `${fmt(r.total)} ج.م` },
            { header: 'المدفوع', key: 'paid_amount', align: 'left', render: r => `${fmt(r.paid_amount)} ج.م` },
            { header: 'المتبقي', key: 'remaining_balance', align: 'left', render: r => `${fmt(r.remaining_balance)} ج.م` }
          ],
          data: reportData?.purchases || []
        };
      }

      case 'inventory': {
        const sum = reportData?.summary || {};
        return {
          title: 'كشف جرد وتقييم المخازن',
          subtitle: `تاريخ الجرد: ${format(new Date(), 'yyyy/MM/dd')}`,
          summaryCards: [
            { label: 'عدد الأصناف', value: sum.total_items || 0, color: '#1A3A5C' },
            { label: 'اللفات الأصلية', value: `${sum.total_initial_rolls || 0} لفة`, color: '#7c3aed' },
            { label: 'اللفات المنصرفة', value: `${sum.total_issued_rolls || 0} لفة`, color: '#d97706' },
            { label: 'اللفات المتاحة', value: `${sum.total_available_rolls || 0} لفة`, color: '#0891b2' },
            { label: 'الوزن المتاح', value: `${fmt(sum.total_available_weight)} كجم`, color: '#16a34a' },
          ],
          columns: [
            { header: 'الشركة', key: 'company' },
            { header: 'الصنف', key: 'product' },
            { header: 'الوزن الأصلي', key: 'weight_quantity', align: 'center', render: r => `${fmt(r.weight_quantity)} كجم` },
            { header: 'عدد اللفات الأصلي', key: 'count', align: 'center', render: r => `${r.count || 0} لفة` },
            { header: 'الوزن المنصرف', key: 'issued_quantity', align: 'center', render: r => `${fmt(r.issued_quantity)} كجم` },
            { header: 'عدد اللفات المنصرف', key: 'issued_rolls', align: 'center', render: r => `${r.issued_rolls || 0} لفة` },
            { header: 'الوزن المتاح', key: 'available_quantity', align: 'center', render: r => `${fmt(r.available_quantity)} كجم` },
            { header: 'عدد اللفات المتاح', key: 'available_rolls', align: 'center', render: r => `${r.available_rolls} لفة` },
          ],
          data: reportData?.inventory || []
        };
      }

      case 'treasury': {
        const sum = reportData?.summary || {};
        return {
          title: 'تقرير حركة الخزينة والمقبوضات',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'إجمالي المقبوضات', value: `${fmt(sum.total_amount)} ج.م`, color: '#16a34a' },
            { label: 'نقدي (كاش)', value: `${fmt(sum.cash_in)} ج.م`, color: '#0891b2' },
            { label: 'محافظ إلكترونية', value: `${fmt(sum.wallet_in)} ج.م`, color: '#d97706' },
            { label: 'انستاباي', value: `${fmt(sum.instapay_in)} ج.م`, color: '#2563eb' },
            { label: 'إيداع بنكي', value: `${fmt(sum.bank_in)} ج.م`, color: '#92400e' },
          ],
          columns: [
            { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
            { header: 'العميل / المصدر', key: 'customer_name', render: r => r.customer_name || 'إيداع نقدي' },
            { header: 'وسيلة الدفع', key: 'payment_type_name', render: r => r.payment_type_name || '-' },
            { header: 'القناة', key: 'channel', render: r => r.channel === 'cash' ? 'نقدي' : r.channel === 'wallet' ? 'محفظة' : r.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي' },
            { header: 'المبلغ', key: 'amount', align: 'left', render: r => `${fmt(r.amount)} ج.م` },
            { header: 'ملاحظات الإيداع', key: 'notes' }
          ],
          data: reportData?.transactions || []
        };
      }

      case 'expenses': {
        const sum = reportData?.summary || {};
        return {
          title: 'تقرير المصروفات التشغيلية',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'عدد المصروفات', value: sum.total_count || 0, color: '#1A3A5C' },
            { label: 'إجمالي المصروفات', value: `${fmt(sum.total_amount)} ج.م`, color: '#dc2626' },
            { label: 'نقدي (كاش)', value: `${fmt(sum.cash_out)} ج.م`, color: '#0891b2' },
            { label: 'محافظ', value: `${fmt(sum.wallet_out)} ج.م`, color: '#d97706' },
            { label: 'انستاباي', value: `${fmt(sum.instapay_out)} ج.م`, color: '#2563eb' },
            { label: 'إيداع بنكي', value: `${fmt(sum.bank_out)} ج.م`, color: '#92400e' },
          ],
          columns: [
            { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
            { header: 'بند المصروف', key: 'description' },
            { header: 'المستلم', key: 'recipient_name', render: r => r.recipient_name || '-' },
            { header: 'القناة', key: 'channel', render: r => r.channel === 'cash' ? 'نقدي' : r.channel === 'wallet' ? 'محفظة' : r.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي' },
            { header: 'المبلغ', key: 'amount', align: 'left', render: r => `${fmt(r.amount)} ج.م` },
            { header: 'ملاحظات', key: 'notes' }
          ],
          data: reportData?.expenses || []
        };
      }

      case 'customers': {
        if (reportData?.customer) {
          const c = reportData.customer;
          const bal = Number(c.remaining_balance || 0);
          const balText = bal === 0
            ? '0.00 ج.م (خالص)'
            : `${fmt(Math.abs(bal))} ج.م ${bal > 0 ? '(مدين / عليه)' : '(دائن / له)'}`;
          const balColor = bal > 0 ? '#dc2626' : bal < 0 ? '#16a34a' : '#64748b';

          return {
            title: `كشف حساب تفصيلي للعميل: ${c.name}`,
            subtitle: `الهاتف: ${c.phone || '-'} | الرصيد الدائن: ${fmt(c.current_credit)} ج.م | المديونية: ${fmt(c.customer_total)} ج.م`,
            summaryCards: [
              { label: 'الرصيد الدائن الحالي', value: `${fmt(c.current_credit)} ج.م`, color: '#16a34a' },
              { label: 'المديونية المستحقة', value: `${fmt(c.customer_total)} ج.م`, color: Number(c.customer_total) > 0 ? '#dc2626' : '#64748b' },
              { label: 'صافي الحساب', value: balText, color: balColor },
            ],
            columns: [
              { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
              { header: 'نوع العملية', key: 'source_type', render: r => r.source_type === 'sales' ? `فاتورة مبيعات ${r.invoice_number ? '#' + r.invoice_number : ''}` : 'إيداع خزينة' },
              { header: 'قيمة الفاتورة', key: 'invoice_amount', align: 'left', render: r => Number(r.invoice_amount) > 0 ? `${fmt(r.invoice_amount)} ج.م` : '-' },
              { header: 'المسدد', key: 'paid_amount', align: 'left', render: r => Number(r.paid_amount) > 0 ? `${fmt(r.paid_amount)} ج.م` : '-' },
              {
                header: 'المتبقي', key: 'remaining_balance', align: 'left', render: r => {
                  const b = Number(r.remaining_balance || 0);
                  if (b === 0) return '0.00 ج.م';
                  return `${fmt(Math.abs(b))} ج.م ${b > 0 ? '(عليه)' : '(له)'}`;
                }
              },
              { header: 'البيان والملاحظات', key: 'notes' }
            ],
            data: reportData?.ledger || []
          };
        }

        const sum = reportData?.summary || {};
        return {
          title: 'تقرير أرصدة ومديونيات العملاء',
          subtitle: `تاريخ التقرير: ${format(new Date(), 'yyyy/MM/dd')}`,
          summaryCards: [
            { label: 'إجمالي العملاء', value: sum.total_customers || 0, color: '#1A3A5C' },
            { label: 'عملاء عليهم ديون', value: sum.debtor_count || 0, color: '#dc2626' },
            { label: 'إجمالي الديون المستحقة', value: `${fmt(sum.total_debt_due)} ج.م`, color: '#dc2626' },
            { label: 'عملاء لهم رصيد دائن', value: sum.creditor_count || 0, color: '#16a34a' },
            { label: 'إجمالي الأرصدة الدائنة', value: `${fmt(sum.total_credit_owed)} ج.م`, color: '#16a34a' },
          ],
          columns: [
            { header: 'اسم العميل', key: 'name' },
            { header: 'الهاتف', key: 'phone', render: r => r.phone || '-' },
            { header: 'الرصيد الدائن', key: 'current_credit', align: 'left', render: r => `${fmt(r.current_credit)} ج.م` },
            { header: 'المديونية المستحقة', key: 'customer_total', align: 'left', render: r => Number(r.customer_total) > 0 ? `${fmt(r.customer_total)} ج.م` : '-' },
            {
              header: 'صافي الحساب', key: 'net_balance', align: 'left', render: r => {
                const b = Number(r.net_balance || 0);
                if (b === 0) return '0.00 ج.م (خالص)';
                return `${fmt(Math.abs(b))} ج.م ${b > 0 ? '(مدين / عليه)' : '(دائن / له)'}`;
              }
            },
            { header: 'فواتير معلقة', key: 'unpaid_invoices_count', align: 'center', render: r => Number(r.unpaid_invoices_count) > 0 ? `${r.unpaid_invoices_count} فاتورة` : 'لا يوجد' }
          ],
          data: reportData?.customers || []
        };
      }

      case 'coloring': {
        const sum = reportData?.summary || {};
        return {
          title: 'تقرير أوامر التلوين التفصيلي',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'إجمالي الأوامر', value: sum.total_orders || 0, color: '#6366f1' },
            { label: 'الوزن المنصرف', value: `${fmt(sum.total_issued_weight)} كجم`, color: '#2563eb' },
            { label: 'الوزن الداخل', value: `${fmt(sum.total_returned_weight)} كجم`, color: '#16a34a' },
            { label: 'فرق الزيادة', value: `+${fmt(sum.total_weight_gain)} كجم`, color: '#d97706' },
            { label: 'تكلفة التلوين الإجمالية', value: `${fmt(sum.total_coloring_cost)} ج.م`, color: '#dc2626' },
          ],
          columns: [
            { header: 'رقم الأمر', key: 'order_number' },
            { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
            {
              header: 'الصنف المنصرف',
              key: 'product',
              render: r => r.color ? `${r.product || '-'} (اللون: ${r.color})` : (r.product || '-')
            },
            {
              header: 'الصنف الملون',
              key: 'colored_product',
              render: r => r.colored_product || (r.status === 'pending' ? 'قيد التلوين' : '-')
            },
            { header: 'شركة التلوين', key: 'coloring_company', render: r => r.coloring_company || '-' },
            { header: 'الوزن المنصرف', key: 'issued_weight', align: 'left', render: r => `${fmt(r.issued_weight)} كجم` },
            { header: 'الوزن الداخل', key: 'returned_weight', align: 'left', render: r => r.returned_weight ? `${fmt(r.returned_weight)} كجم` : '-' },
            { header: 'فرق الزيادة', key: 'weight_gain', align: 'left', render: r => r.weight_gain ? `+${fmt(r.weight_gain)} كجم` : '-' },
            { header: 'تكلفة التلوين', key: 'coloring_cost', align: 'left', render: r => `${fmt(r.coloring_cost)} ج.م` },
            { header: 'الحالة', key: 'status', render: r => r.status === 'pending' ? 'قيد التلوين' : r.status === 'returned' ? 'مرتجع للمخزن' : r.status === 'stocked' ? 'مرحل للمخزن' : r.status || '-' }
          ],
          data: reportData?.orders || []
        };
      }

      case 'custody': {
        const sum = reportData?.summary || {};
        return {
          title: 'تقرير حركة العهد والسلف التفصيلي',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'إجمالي الحركات', value: sum.total_transactions || 0, color: '#8b5cf6' },
            { label: 'إجمالي المنصرف', value: `${fmt(sum.total_disbursed)} ج.م`, color: '#dc2626' },
            { label: 'إجمالي المحصل', value: `${fmt(sum.total_collected)} ج.م`, color: '#16a34a' },
            { label: 'صافي حركة الفترة', value: `${fmt(sum.net_period_change)} ج.م`, color: '#d97706' },
            { label: 'العهد القائمة حالياً', value: `${fmt(sum.total_outstanding_custody)} ج.م`, color: '#1A3A5C' },
          ],
          columns: [
            { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
            { header: 'رقم السند', key: 'voucher_number' },
            { header: 'اسم الشخص', key: 'person_name' },
            { header: 'الهاتف', key: 'phone', render: r => r.phone || '-' },
            { header: 'نوع الحركة', key: 'type', render: r => r.type === 'disbursement' ? 'صرف عهدة' : 'استلام عهدة' },
            { header: 'المبلغ', key: 'amount', align: 'left', render: r => `${fmt(r.amount)} ج.م` },
            { header: 'طريقة الدفع', key: 'effective_channel', render: r => r.payment_type_name || (r.effective_channel === 'cash' ? 'نقدي' : r.effective_channel === 'wallet' ? 'محفظة' : r.effective_channel === 'instapay' ? 'انستاباي' : r.effective_channel === 'bank' ? 'بنك' : r.effective_channel || '-') },
            { header: 'ملاحظات', key: 'notes', render: r => r.notes || '-' }
          ],
          data: reportData?.transactions || []
        };
      }

      case 'custody_transfers': {
        const tsum = reportData?.summary || {};
        return {
          title: 'تقرير تحويلات العهد بين الأفراد',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'عدد التحويلات', value: tsum.transfers_count || 0, color: '#db2777' },
            { label: 'إجمالي المبالغ المحولة', value: `${fmt(tsum.total_amount)} ج.م`, color: '#1A3A5C' },
            { label: 'متوسط التحويل', value: `${fmt(tsum.avg_transfer)} ج.م`, color: '#7c3aed' },
            { label: 'أعلى محوّل', value: tsum.top_sender ? `${tsum.top_sender.from_person} (${fmt(tsum.top_sender.total)} ج.م)` : '—', color: '#dc2626' },
            { label: 'أعلى مستلم', value: tsum.top_receiver ? `${tsum.top_receiver.to_person} (${fmt(tsum.top_receiver.total)} ج.م)` : '—', color: '#16a34a' },
          ],
          columns: [
            { header: 'التاريخ', key: 'date', render: r => r.date ? format(new Date(r.date), 'yyyy/MM/dd') : '-' },
            { header: 'رقم السند', key: 'receipt_number', render: r => r.receipt_number || `#${r.id}` },
            { header: 'المحوَّل منه', key: 'from_person' },
            { header: 'المحوَّل إليه', key: 'to_person' },
            { header: 'المبلغ المحوَّل', key: 'amount', align: 'left', render: r => `${fmt(r.amount)} ج.م` },
            { header: 'ملاحظات', key: 'notes', render: r => r.notes || '-' },
          ],
          data: reportData?.transfers || []
        };
      }

      case 'branch_transfers': {
        const bsum = reportData?.summary || {};
        return {
          title: 'تقرير التحويلات بين الفروع (نقدية ومخزنية)',
          subtitle: periodLabel,
          summaryCards: [
            { label: 'إجمالي التحويلات', value: bsum.transfers_count || 0, color: '#0d9488' },
            { label: 'صادر مالي (مكتمل)', value: `${fmt(bsum.total_monetary_outgoing)} ج.م`, color: '#dc2626' },
            { label: 'وارد مالي (مستلم)', value: `${fmt(bsum.total_monetary_incoming)} ج.م`, color: '#16a34a' },
            { label: 'تحويلات مخزنية', value: bsum.inventory_transfers_count || 0, color: '#7c3aed' },
            { label: 'قيد الانتظار', value: bsum.total_pending || 0, color: '#d97706' },
            { label: 'مكتملة ومعتمدة', value: bsum.total_completed || 0, color: '#2563eb' }
          ],
          columns: [
            { header: 'رقم الإذن', key: 'transfer_number', render: r => r.transfer_number || `#${r.id}` },
            { header: 'التاريخ', key: 'created_at', render: r => r.created_at ? format(new Date(r.created_at), 'yyyy/MM/dd HH:mm') : '-' },
            { header: 'الفرع المرسل', key: 'from_branch_name' },
            { header: 'الفرع المستلم', key: 'to_branch_name' },
            { header: 'النوع', key: 'type', render: r => r.type === 'monetary' ? 'مالي (نقدية)' : 'مخزني (بضاعة)' },
            {
              header: 'التفاصيل / القيمة',
              key: 'amount',
              align: 'left',
              render: r => {
                if (r.type === 'monetary') {
                  const chName = r.channel === 'cash' ? 'نقدي' : r.channel === 'wallet' ? 'محفظة' : r.channel === 'instapay' ? 'انستاباي' : 'إيداع بنكي';
                  return `${fmt(r.amount)} ج.م (${chName})`;
                }
                const itemsCount = (r.items || []).length;
                const totalWeight = (r.items || []).reduce((acc, it) => acc + Number(it.weight || 0), 0);
                const totalRolls = (r.items || []).reduce((acc, it) => acc + Number(it.rolls_count || 0), 0);
                return `${itemsCount} صنف - ${fmt(totalWeight)} كجم (${totalRolls} لفة)`;
              }
            },
            {
              header: 'الحالة',
              key: 'status',
              render: r => {
                const map = {
                  completed: { text: 'مكتمل ومستلم', color: '#16a34a', bg: '#dcfce7' },
                  pending: { text: 'قيد الانتظار', color: '#d97706', bg: '#fef3c7' },
                  rejected: { text: 'مرفوض', color: '#dc2626', bg: '#fee2e2' },
                  cancelled: { text: 'ملغي', color: '#64748b', bg: '#f1f5f9' }
                };
                const st = map[r.status] || { text: r.status, color: '#334155', bg: '#f1f5f9' };
                return (
                  <span style={{
                    display: 'inline-block', padding: '3px 9px', borderRadius: 20,
                    fontSize: '0.78rem', fontWeight: 700, color: st.color, background: st.bg
                  }}>
                    {st.text}
                  </span>
                );
              }
            },
            { header: 'ملاحظات', key: 'notes', render: r => r.notes || '-' }
          ],
          data: reportData?.transfers || []
        };
      }

      default:
        return { title: 'تقرير عام', summaryCards: [], columns: [], data: [] };
    }
  };

  // ─── Visual Charts Builders ──────────────────────────────────
  const renderComprehensiveCharts = () => {
    const p = reportData?.profitability || {};
    const tb = reportData?.treasuryBalance || {};
    const cust = reportData?.customers || {};

    const finData = [
      { name: 'المبيعات', amount: Number(p.totalSales || 0), fill: '#16a34a' },
      { name: 'المشتريات', amount: Number(p.totalPurchases || 0), fill: '#2563eb' },
      { name: 'المصروفات', amount: Number(p.totalExpenses || 0), fill: '#d97706' },
    ];

    const channelData = [
      { name: 'كاش نقدي', value: Math.max(0, Number(tb.channels?.cash || 0)), color: '#16a34a' },
      { name: 'محفظة إلكترونية', value: Math.max(0, Number(tb.channels?.wallet || 0)), color: '#d97706' },
      { name: 'انستاباي', value: Math.max(0, Number(tb.channels?.instapay || 0)), color: '#2563eb' },
      { name: 'إيداع بنكي', value: Math.max(0, Number(tb.channels?.bank || 0)), color: '#92400e' },
    ].filter(c => c.value > 0);

    const custData = [
      { name: 'ديون العملاء', value: Number(cust.total_outstanding_debt || 0), fill: '#dc2626' },
      { name: 'أرصدة دائنة للعملاء', value: Number(cust.total_customer_credit || 0), fill: '#16a34a' },
    ];

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="المؤشرات المالية الرئيسية (ج.م)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={finData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" name="المبلغ" radius={[6, 6, 0, 0]}>
                {finData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="توزيع سيولة الخزينة حسب القناة">
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد بيانات سيولة متاحة</div>
          )}
        </ChartCard>

        <ChartCard title="أرصدة العملاء والمديونيات (ج.م)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={custData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="المبلغ" radius={[6, 6, 0, 0]}>
                {custData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    );
  };

  const renderSalesCharts = () => {
    const sum = reportData?.summary || {};
    const topProds = (reportData?.topProducts || []).slice(0, 6).map(p => ({
      name: p.product || 'صنف',
      weight: Number(p.total_weight_sold || 0),
      revenue: Number(p.total_revenue || 0)
    }));

    const settleData = [
      { name: 'مدفوع نقدي / قناة', value: Number(sum.total_paid || 0), color: '#16a34a' },
      { name: 'متبقي مديونية', value: Number(sum.total_remaining || 0), color: '#dc2626' },
      { name: 'مخصوم من الرصيد', value: Number(sum.total_credit_used || 0), color: '#7c3aed' }
    ].filter(d => d.value > 0);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="أعلى المنتجات مبيعاً بالوزن (كجم)">
          {topProds.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProds} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" كجم" />} />
                <Bar dataKey="weight" name="الوزن المباع" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد مبيعات في الفترة المحددة</div>
          )}
        </ChartCard>

        <ChartCard title="توزيع تحصيل المبيعات (مسدد vs متبقي)">
          {settleData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={settleData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {settleData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد بيانات تحصيل</div>
          )}
        </ChartCard>
      </div>
    );
  };

  const renderPurchasesCharts = () => {
    const sum = reportData?.summary || {};
    const purList = reportData?.purchases || [];

    const byProduct = {};
    purList.forEach(p => {
      const prod = p.product || 'صنف توريد';
      if (!byProduct[prod]) byProduct[prod] = { name: prod, netQty: 0, total: 0 };
      byProduct[prod].netQty += Number(p.net_quantity || 0);
      byProduct[prod].total += Number(p.total || 0);
    });
    const prodData = Object.values(byProduct).slice(0, 6);

    const settleData = [
      { name: 'مسدد للموردين', value: Number(sum.total_paid || 0), color: '#16a34a' },
      { name: 'متبقي آجل', value: Number(sum.total_remaining || 0), color: '#dc2626' }
    ].filter(d => d.value > 0);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="صافي كميات التوريد حسب الصنف (طن)">
          {prodData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={prodData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" طن" />} />
                <Bar dataKey="netQty" name="صافي الكمية" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد توريدات في الفترة</div>
          )}
        </ChartCard>

        <ChartCard title="حالة سداد التوريدات للموردين">
          {settleData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={settleData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {settleData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد بيانات سداد</div>
          )}
        </ChartCard>
      </div>
    );
  };

  const renderInventoryCharts = () => {
    const invList = reportData?.inventory || [];

    const byCompany = {};
    invList.forEach(item => {
      const comp = item.company || 'غير محدد';
      if (!byCompany[comp]) byCompany[comp] = { name: comp, weight: 0, val: 0, rolls: 0 };
      byCompany[comp].weight += Number(item.available_quantity || 0);
      byCompany[comp].val += Number(item.item_stock_value || 0);
      byCompany[comp].rolls += Number(item.available_rolls || 0);
    });
    const compData = Object.values(byCompany);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="الأوزان المتاحة بالمخزن حسب الشركة (كجم)">
          {compData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" كجم" />} />
                <Bar dataKey="weight" name="الوزن المتاح" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>المخزن فارغ حالياً</div>
          )}
        </ChartCard>

        <ChartCard title="توزيع اللفات المتاحة حسب الشركة (لفة)">
          {compData.filter(c => c.rolls > 0).length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={compData.filter(c => c.rolls > 0)} dataKey="rolls" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {compData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" لفة" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد لفات متاحة</div>
          )}
        </ChartCard>
      </div>
    );
  };

  const renderTreasuryCharts = () => {
    const sum = reportData?.summary || {};
    const channelData = [
      { name: 'نقدي (كاش)', value: Number(sum.cash_in || 0), color: '#16a34a' },
      { name: 'محفظة إلكترونية', value: Number(sum.wallet_in || 0), color: '#d97706' },
      { name: 'انستاباي', value: Number(sum.instapay_in || 0), color: '#2563eb' },
      { name: 'إيداع بنكي', value: Number(sum.bank_in || 0), color: '#92400e' },
    ].filter(d => d.value > 0);

    const txs = reportData?.transactions || [];
    const byCust = {};
    txs.forEach(t => {
      const name = t.customer_name || 'إيداع نقدي مباشر';
      byCust[name] = (byCust[name] || 0) + Number(t.amount || 0);
    });
    const topCustDeposits = Object.entries(byCust)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="توزيع المقبوضات حسب قناة التحصيل">
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد إيداعات في الفترة</div>
          )}
        </ChartCard>

        <ChartCard title="أعلى مصادر الإيداعات والتحصيلات (ج.م)">
          {topCustDeposits.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustDeposits} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="amount" name="المبلغ المحصل" fill="#0891b2" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد إيداعات مسجلة</div>
          )}
        </ChartCard>
      </div>
    );
  };

  const renderExpensesCharts = () => {
    const sum = reportData?.summary || {};
    const catList = (reportData?.categories || []).slice(0, 6).map(c => ({
      name: c.description || 'مصروف عام',
      amount: Number(c.category_total || 0),
      count: Number(c.item_count || 0)
    }));

    const channelData = [
      { name: 'كاش نقدي', value: Number(sum.cash_out || 0), color: '#16a34a' },
      { name: 'محفظة إلكترونية', value: Number(sum.wallet_out || 0), color: '#d97706' },
      { name: 'انستاباي', value: Number(sum.instapay_out || 0), color: '#2563eb' },
      { name: 'إيداع بنكي', value: Number(sum.bank_out || 0), color: '#92400e' },
    ].filter(d => d.value > 0);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="المصروفات حسب البند / التصنيف (ج.م)">
          {catList.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catList} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="amount" name="المبلغ" fill="#d97706" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد مصروفات مسجلة</div>
          )}
        </ChartCard>

        <ChartCard title="قنوات سداد وصرف النفقات">
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد مدفوعات</div>
          )}
        </ChartCard>
      </div>
    );
  };

  const renderCustomersCharts = () => {
    if (reportData?.customer) {
      const c = reportData.customer;
      const statementBal = [
        { name: 'المديونية', amount: Number(c.customer_total || 0), fill: '#dc2626' },
        { name: 'الرصيد الدائن', amount: Number(c.current_credit || 0), fill: '#16a34a' },
        { name: 'صافي الحساب', amount: Math.abs(Number(c.remaining_balance || 0)), fill: '#1A3A5C' }
      ];

      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
          <ChartCard title={`موقف الحساب المالي للعميل: ${c.name}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statementBal} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {statementBal.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      );
    }

    const sum = reportData?.summary || {};
    const statusData = [
      { name: 'عملاء مدينون', value: Number(sum.debtor_count || 0), color: '#dc2626' },
      { name: 'عملاء دائنون (أرصدة)', value: Number(sum.creditor_count || 0), color: '#16a34a' },
      {
        name: 'عملاء خالصون',
        value: Math.max(0, Number(sum.total_customers || 0) - Number(sum.debtor_count || 0) - Number(sum.creditor_count || 0)),
        color: '#94a3b8'
      }
    ].filter(d => d.value > 0);

    const custList = reportData?.customers || [];
    const topDebtors = custList
      .filter(c => Number(c.customer_total) > 0)
      .sort((a, b) => Number(b.customer_total) - Number(a.customer_total))
      .slice(0, 5)
      .map(c => ({
        name: c.name,
        debt: Number(c.customer_total)
      }));

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="توزيع قاعدة العملاء حسب حالة الحساب">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" عميل" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد بيانات عملاء</div>
          )}
        </ChartCard>

        <ChartCard title="أعلى العملاء مديونية (ج.م)">
          {topDebtors.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDebtors} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="debt" name="المديونية" fill="#dc2626" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontSize: '0.9rem', fontWeight: 700 }}>ممتاز! لا توجد مديونيات مستحقة على العملاء</div>
          )}
        </ChartCard>
      </div>
    );
  };

  const renderColoringCharts = () => {
    const sum = reportData?.summary || {};
    const companyData = (reportData?.companyBreakdown || []).map(c => ({
      name: c.company_name,
      weight: Number(c.total_weight || 0),
      cost: Number(c.total_cost || 0),
      orders: Number(c.orders_count || 0)
    }));

    const statusData = [
      { name: 'قيد التلوين', value: Number(sum.pending_orders || 0), color: '#d97706' },
      { name: 'مرتجع للمخزن', value: Number(sum.returned_orders || 0), color: '#2563eb' },
      { name: 'مرحل للمخزن', value: Number(sum.stocked_orders || 0), color: '#16a34a' }
    ].filter(d => d.value > 0);

    const monthly = (reportData?.monthlyBreakdown || []).map(m => ({
      month: m.month,
      issued: Number(m.issued_weight || 0),
      returned: Number(m.returned_weight || 0),
      gain: Number(m.weight_gain || 0)
    }));

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="حالة أوامر التلوين (عدد الأوامر)">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" أمر" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد أوامر تلوين في الفترة</div>
          )}
        </ChartCard>

        <ChartCard title="الوزن المنصرف حسب شركة التلوين (كجم)">
          {companyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={companyData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" كجم" />} />
                <Bar dataKey="weight" name="الوزن المنصرف" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد بيانات شركات</div>
          )}
        </ChartCard>

        {monthly.length > 0 && (
          <ChartCard title="حركة أوزان التلوين شهرياً (منصرف vs مرتجع)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" كجم" />} />
                <Bar dataKey="issued" name="المنصرف" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="returned" name="المرتجع" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    );
  };

  const renderCustodyTransfersCharts = () => {
    const monthly = (reportData?.monthlyBreakdown || []).map(m => ({
      month: m.month,
      count: Number(m.count || 0),
      total_amount: Number(m.total_amount || 0),
    }));

    const topSenders = (reportData?.topSenders || []).map(s => ({
      name: s.name,
      total: Number(s.total || 0),
    }));

    const topReceivers = (reportData?.topReceivers || []).map(r => ({
      name: r.name,
      total: Number(r.total || 0),
    }));

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        {monthly.length > 0 && (
          <ChartCard title="حجم التحويلات شهرياً (ج.م)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="total_amount" name="إجمالي التحويلات" fill="#db2777" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {topSenders.length > 0 && (
          <ChartCard title="أعلى الأشخاص تحويلاً (ج.م)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSenders} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={80} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="total" name="المبلغ المحوَّل" fill="#dc2626" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {topReceivers.length > 0 && (
          <ChartCard title="أعلى الأشخاص استلاماً (ج.م)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topReceivers} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={80} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="total" name="المبلغ المستلم" fill="#16a34a" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {monthly.length === 0 && topSenders.length === 0 && topReceivers.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: '40px 20px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0' }}>
            <AlertCircle size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div style={{ fontWeight: 700 }}>لا توجد تحويلات عهد في الفترة المحددة</div>
          </div>
        )}
      </div>
    );
  };

  const renderCustodyCharts = () => {
    const sum = reportData?.summary || {};
    const flowData = [
      { name: 'إجمالي المنصرف', value: Number(sum.total_disbursed || 0), color: '#dc2626' },
      { name: 'إجمالي المُحصَّل', value: Number(sum.total_collected || 0), color: '#16a34a' }
    ].filter(d => d.value > 0);

    const topCustodians = (reportData?.persons || [])
      .filter(p => Number(p.balance) > 0)
      .slice(0, 6)
      .map(p => ({
        name: p.person_name,
        balance: Number(p.balance)
      }));

    const monthly = (reportData?.monthlyBreakdown || []).map(m => ({
      month: m.month,
      disbursed: Number(m.disbursed || 0),
      collected: Number(m.collected || 0)
    }));

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        <ChartCard title="توزيع حركة العهد (منصرف vs مُحصَّل)">
          {flowData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={flowData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} paddingAngle={4}>
                  {flowData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>لا توجد حركات عهد في الفترة</div>
          )}
        </ChartCard>

        <ChartCard title="أعلى أرصدة العهد القائمة حسب الشخص (ج.م)">
          {topCustodians.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustodians} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="balance" name="العهدة القائمة" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontSize: '0.85rem' }}>ممتاز! لا توجد عهد قائمة</div>
          )}
        </ChartCard>

        {monthly.length > 0 && (
          <ChartCard title="حركة العهد شهرياً (صرف vs تحصيل)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="disbursed" name="منصرف" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="مُحصَّل" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>
    );
  };

  const renderBranchTransfersCharts = () => {
    const monthly = (reportData?.monthlyBreakdown || []).map(m => ({
      month: m.month,
      count: Number(m.count || 0),
      total_monetary: Number(m.total_monetary || 0),
      inventory_count: Number(m.inventory_count || 0),
    }));

    const byChannel = (reportData?.byChannel || []).map(c => {
      const names = { cash: 'نقدي (كاش)', wallet: 'محفظة إلكترونية', instapay: 'انستاباي', bank: 'إيداع بنكي' };
      return {
        name: names[c.channel] || c.channel,
        total: Number(c.total_amount || 0),
        count: Number(c.count || 0)
      };
    }).filter(c => c.total > 0);

    const byBranch = (reportData?.byBranch || []).map(b => ({
      name: b.branch_name,
      total: Number(b.total_monetary || 0),
      count: Number(b.count || 0)
    }));

    const sum = reportData?.summary || {};
    const statusData = [
      { name: 'مكتمل ومستلم', value: Number(sum.total_completed || 0), color: '#16a34a' },
      { name: 'قيد الانتظار', value: Number(sum.total_pending || 0), color: '#d97706' },
      { name: 'مرفوض', value: Number(sum.total_rejected || 0), color: '#dc2626' },
      { name: 'ملغي', value: Number(sum.total_cancelled || 0), color: '#64748b' },
    ].filter(s => s.value > 0);

    const typeData = [
      { name: 'تحويلات مالية', value: Number(sum.monetary_transfers_count || 0), color: '#0d9488' },
      { name: 'تحويلات مخزنية', value: Number(sum.inventory_transfers_count || 0), color: '#7c3aed' },
    ].filter(t => t.value > 0);

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        {monthly.length > 0 && (
          <ChartCard title="حجم التحويلات المالية شهرياً (ج.م)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="total_monetary" name="إجمالي المبالغ" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {byBranch.length > 0 && (
          <ChartCard title="أعلى الفروع تعاملاً في التحويلات">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byBranch} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} width={100} />
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Bar dataKey="total" name="المبالغ المالية" fill="#2563eb" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {byChannel.length > 0 && (
          <ChartCard title="توزيع التحويلات المالية حسب القناة">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byChannel} cx="50%" cy="50%" outerRadius={80} dataKey="total" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                  {byChannel.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip suffix=" ج.م" />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {statusData.length > 0 && (
          <ChartCard title="حالة التحويلات">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {monthly.length === 0 && byBranch.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: '40px 20px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0' }}>
            <AlertCircle size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <div style={{ fontWeight: 700 }}>لا توجد تحويلات بين الفروع في الفترة المحددة</div>
          </div>
        )}
      </div>
    );
  };

  const renderCharts = () => {
    if (!reportData) return null;
    switch (activeModule) {
      case 'comprehensive': return renderComprehensiveCharts();
      case 'sales': return renderSalesCharts();
      case 'purchases': return renderPurchasesCharts();
      case 'inventory': return renderInventoryCharts();
      case 'treasury': return renderTreasuryCharts();
      case 'expenses': return renderExpensesCharts();
      case 'customers': return renderCustomersCharts();
      case 'coloring': return renderColoringCharts();
      case 'custody': return renderCustodyCharts();
      case 'custody_transfers': return renderCustodyTransfersCharts();
      case 'branch_transfers': return renderBranchTransfersCharts();
      default: return null;
    }
  };

  const printConfig = getPrintConfig();

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 50 }}>
      {/* ─── Header & Top Actions ───────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 16, padding: '20px 24px',
        marginBottom: 20, boxShadow: '0 2px 14px rgba(15,35,64,0.06)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
        justifyContent: 'space-between', gap: 16, border: '1.5px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #1A3A5C, #2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: '0 4px 14px rgba(26,58,92,0.25)'
          }}>
            <FileText size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#1A3A5C', margin: 0 }}>
              مركز التقارير المتكاملة
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0' }}>
              تقارير تفصيلية شاملة لكافة الأنشطة والعمليات المالية والمخزنية مع إمكانية التصدير والطباعة
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'flex', background: '#f1f5f9', borderRadius: 10,
            padding: 3, gap: 3, border: '1.5px solid #e2e8f0'
          }}>
            <button
              type="button"
              onClick={() => setActiveView('both')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7, border: 'none',
                background: activeView === 'both' ? '#1A3A5C' : 'transparent',
                color: activeView === 'both' ? '#fff' : '#64748b',
                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <LayoutGrid size={14} />
              شامل (رسوم وجداول)
            </button>
            <button
              type="button"
              onClick={() => setActiveView('charts')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7, border: 'none',
                background: activeView === 'charts' ? '#1A3A5C' : 'transparent',
                color: activeView === 'charts' ? '#fff' : '#64748b',
                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <PieChartIcon size={14} />
              تحليلات بيانية
            </button>
            <button
              type="button"
              onClick={() => setActiveView('table')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 7, border: 'none',
                background: activeView === 'table' ? '#1A3A5C' : 'transparent',
                color: activeView === 'table' ? '#fff' : '#64748b',
                fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <TableIcon size={14} />
              جدول البيانات
            </button>
          </div>

          <button
            type="button"
            onClick={fetchReport}
            disabled={isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#f8fafc', border: '1.5px solid #cbd5e1',
              borderRadius: 10, padding: '9px 14px', fontSize: '0.84rem',
              fontWeight: 700, color: '#475569', cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            تحديث
          </button>

          <button
            type="button"
            onClick={() => setIsPrintOpen(true)}
            disabled={isLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #1A3A5C, #0f172a)',
              border: 'none', borderRadius: 10, padding: '10px 20px',
              color: '#fff', fontSize: '0.9rem', fontWeight: 800,
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(26,58,92,0.25)',
              transition: 'all 0.2s'
            }}
          >
            <Printer size={17} />
            معاينة وطباعة التقرير (A4 / PDF)
          </button>
        </div>
      </div>

      {/* ─── Module Selector Tabs ───────────────────────────────────── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20
      }}>
        {MODULES.map(m => {
          const isActive = activeModule === m.key;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                setActiveModule(m.key);
                setSelectedCustomerId('');
                setSelectedChannel('');
                setColoringStatus('');
                setCustodyType('');
                setSearchQuery('');
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 18px', borderRadius: 12,
                border: `2px solid ${isActive ? m.color : '#e2e8f0'}`,
                background: isActive ? m.color : '#fff',
                color: isActive ? '#fff' : '#475569',
                fontSize: '0.86rem', fontWeight: isActive ? 800 : 600,
                cursor: 'pointer', boxShadow: isActive ? `0 4px 14px ${m.color}35` : '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.18s ease'
              }}
            >
              <Icon size={16} color={isActive ? '#fff' : m.color} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Filters Bar ────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', borderRadius: 14, padding: '16px 20px',
        marginBottom: 20, boxShadow: '0 2px 10px rgba(15,35,64,0.05)',
        border: '1.5px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 14
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700, color: '#1A3A5C' }}>
            <Filter size={15} />
            فلاتر التقرير:
          </div>

          {/* Quick Date Shortcuts (for modules with date filter) */}
          {activeModule !== 'inventory' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DATE_SHORTCUTS.map(sc => (
                <button
                  key={sc.label}
                  type="button"
                  onClick={() => handleShortcutClick(sc)}
                  style={{
                    background: '#f1f5f9', border: '1px solid #cbd5e1',
                    borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem',
                    fontWeight: 700, color: '#475569', cursor: 'pointer',
                    transition: 'all 0.12s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                >
                  {sc.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {/* Date from */}
          {activeModule !== 'inventory' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                  من تاريخ:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                    borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                  إلى تاريخ:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                    borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none'
                  }}
                />
              </div>
            </>
          )}

          {/* Customer / Supplier Select */}
          {['sales', 'purchases', 'customers'].includes(activeModule) && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                {activeModule === 'purchases' ? 'المورد:' : 'العميل (كشف حساب محدد):'}
              </label>
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="">{activeModule === 'purchases' ? '-- كل الموردين --' : '-- كل العملاء --'}</option>
                {customersList.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Channel Select */}
          {['treasury', 'expenses', 'purchases'].includes(activeModule) && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                قناة الدفع / الخزينة:
              </label>
              <select
                value={selectedChannel}
                onChange={e => setSelectedChannel(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="">-- كل القنوات --</option>
                <option value="cash">نقدي (كاش)</option>
                <option value="wallet">محفظة إلكترونية</option>
                <option value="instapay">انستاباي</option>
                <option value="bank">إيداع بنكي</option>
              </select>
            </div>
          )}

          {/* Company Filter (Inventory) */}
          {activeModule === 'inventory' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                الشركة المصنعة / الموردة:
              </label>
              <select
                value={selectedCompany}
                onChange={e => setSelectedCompany(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="">-- كل الشركات --</option>
                {companiesList.map(co => <option key={co} value={co}>{co}</option>)}
              </select>
            </div>
          )}

          {/* Customer Status Filter */}
          {activeModule === 'customers' && !selectedCustomerId && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                حالة الرصيد:
              </label>
              <select
                value={customerStatus}
                onChange={e => setCustomerStatus(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="all">كل الحالات</option>
                <option value="debtor">عليهم مديونية (مدينون)</option>
                <option value="creditor">لهم رصيد دائن</option>
                <option value="zero">رصيد خالص (صفر)</option>
              </select>
            </div>
          )}

          {/* Coloring Status Filter */}
          {activeModule === 'coloring' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                حالة أمر التلوين:
              </label>
              <select
                value={coloringStatus}
                onChange={e => setColoringStatus(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="">-- كل الحالات --</option>
                <option value="pending">قيد التلوين</option>
                <option value="returned">مرتجع للمخزن</option>
                <option value="stocked">مرحل للمخزن</option>
              </select>
            </div>
          )}

          {/* Custody Type Filter */}
          {activeModule === 'custody' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                نوع حركة العهدة:
              </label>
              <select
                value={custodyType}
                onChange={e => setCustodyType(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="">-- كل الحركات --</option>
                <option value="disbursement">تسليم عهدة (صرف)</option>
                <option value="collection">استلام عهدة (تحصيل)</option>
              </select>
            </div>
          )}

          {/* Branch Transfers Type Filter */}
          {activeModule === 'branch_transfers' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                نوع التحويل:
              </label>
              <select
                value={transferTypeFilter}
                onChange={e => setTransferTypeFilter(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="all">-- كل أنواع التحويلات --</option>
                <option value="monetary">تحويلات مالية (نقدية)</option>
                <option value="inventory">تحويلات مخزنية (بضاعة)</option>
              </select>
            </div>
          )}

          {/* Branch Transfers Status Filter */}
          {activeModule === 'branch_transfers' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                حالة التحويل:
              </label>
              <select
                value={transferStatusFilter}
                onChange={e => setTransferStatusFilter(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none', background: '#fff'
                }}
              >
                <option value="all">-- كل الحالات --</option>
                <option value="pending">قيد الانتظار</option>
                <option value="completed">مكتمل ومستلم</option>
                <option value="rejected">مرفوض</option>
                <option value="cancelled">ملغي</option>
              </select>
            </div>
          )}

          {/* Search Query Filter */}
          {['purchases', 'inventory', 'expenses', 'coloring', 'custody', 'custody_transfers', 'branch_transfers'].includes(activeModule) && (
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                {activeModule === 'coloring' ? 'بحث بشركة التلوين:' : activeModule === 'custody' ? 'بحث باسم الشخص:' : activeModule === 'custody_transfers' ? 'بحث (محوِّل / مستلم / سند):' : activeModule === 'branch_transfers' ? 'بحث (رقم الإذن / اسم الفرع):' : 'بحث بالاسم / البند:'}
              </label>
              <input
                type="text"
                placeholder={activeModule === 'coloring' ? 'اسم شركة التلوين...' : activeModule === 'custody' ? 'اسم الشخص...' : activeModule === 'custody_transfers' ? 'اسم الشخص أو رقم السند...' : activeModule === 'branch_transfers' ? 'رقم الإذن أو اسم الفرع...' : 'ابحث هنا...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1',
                  borderRadius: 8, fontSize: '0.84rem', fontFamily: 'inherit', outline: 'none'
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Loading State ──────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{
          background: '#fff', borderRadius: 16, padding: '60px 20px',
          textAlign: 'center', boxShadow: '0 2px 12px rgba(15,35,64,0.06)'
        }}>
          <RefreshCw size={36} className="animate-spin" color="#1A3A5C" style={{ margin: '0 auto 14px' }} />
          <div style={{ fontWeight: 800, color: '#1A3A5C', fontSize: '1.05rem' }}>جاري استخراج وتحليل بيانات التقرير...</div>
        </div>
      ) : (
        <>
          {/* ─── KPI Summary Cards ───────────────────────────────────── */}
          {printConfig.summaryCards?.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(210px, 1fr))`,
              gap: 14, marginBottom: 20
            }}>
              {printConfig.summaryCards.map((card, i) => (
                <div key={i} style={{
                  background: '#fff', borderRadius: 14, padding: '16px 20px',
                  border: '1.5px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,35,64,0.04)',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: card.color || '#1A3A5C' }}>
                    {card.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── Visual Charts & Analytics ───────────────────────────── */}
          {(activeView === 'both' || activeView === 'charts') && renderCharts()}

          {/* ─── Custody Persons Summary Table (if activeModule === 'custody') ─── */}
          {(activeView === 'both' || activeView === 'table') && activeModule === 'custody' && reportData?.persons?.length > 0 && (
            <div style={{
              background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0',
              boxShadow: '0 2px 14px rgba(15,35,64,0.06)', overflow: 'hidden', marginBottom: 20
            }}>
              <div style={{
                padding: '14px 20px', background: '#f5f3ff', borderBottom: '1.5px solid #ede9fe',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HandCoins size={18} color="#8b5cf6" />
                  <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#5b21b6' }}>
                    أرصدة العهد القائمة حسب الأشخاص
                  </h4>
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6d28d9' }}>
                  عدد الأشخاص: <strong>{reportData.persons.length}</strong>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#faf5ff' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#6d28d9', borderBottom: '1.5px solid #ede9fe' }}>الشخص</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: '#6d28d9', borderBottom: '1.5px solid #ede9fe' }}>الهاتف</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6d28d9', borderBottom: '1.5px solid #ede9fe' }}>إجمالي المنصرف</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6d28d9', borderBottom: '1.5px solid #ede9fe' }}>إجمالي المُحصَّل</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#6d28d9', borderBottom: '1.5px solid #ede9fe' }}>العهدة القائمة (المتبقية)</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 700, color: '#6d28d9', borderBottom: '1.5px solid #ede9fe' }}>الحركات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.persons.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3e8ff' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: '#1e1b4b' }}>{p.person_name}</td>
                        <td style={{ padding: '10px 16px', color: '#64748b' }}>{p.phone || '-'}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#dc2626', fontWeight: 600 }}>{fmt(p.total_disbursed)} ج.م</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#16a34a', fontWeight: 600 }}>{fmt(p.total_collected)} ج.م</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 800, color: Number(p.balance) > 0 ? '#8b5cf6' : '#16a34a' }}>
                          {fmt(p.balance)} ج.م
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b' }}>{p.transactions_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Main Report Table Card ──────────────────────────────── */}
          {(activeView === 'both' || activeView === 'table') && (
            <div style={{
              background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0',
              boxShadow: '0 2px 14px rgba(15,35,64,0.06)', overflow: 'hidden'
            }}>
              {/* Table Header */}
              <div style={{
                padding: '16px 22px', background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10
              }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1A3A5C' }}>
                    {printConfig.title}
                  </h3>
                  {printConfig.subtitle && (
                    <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                      {printConfig.subtitle}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                  عدد السجلات: <strong>{printConfig.data?.length || 0}</strong>
                </div>
              </div>

              {/* Table Content */}
              {(!printConfig.data || printConfig.data.length === 0) ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  <AlertCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>لا توجد سجلات متطابقة مع خيارات الفلترة المحددة</div>
                  <div style={{ fontSize: '0.8rem', marginTop: 4 }}>جرب توسيع نطاق الفترة الزمنية أو إزالة الفلاتر الإضافية</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {printConfig.columns.map((col, idx) => (
                          <th key={idx} style={{
                            padding: '11px 16px', textAlign: col.align || 'right',
                            fontWeight: 700, color: '#475569', borderBottom: '1.5px solid #e2e8f0',
                            whiteSpace: 'nowrap'
                          }}>
                            {col.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {printConfig.data.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'background 0.12s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {printConfig.columns.map((col, cIdx) => {
                            const val = typeof col.render === 'function' ? col.render(row) : row[col.key];
                            return (
                              <td key={cIdx} style={{
                                padding: '11px 16px', textAlign: col.align || 'right',
                                color: '#0f172a', fontWeight: cIdx === 0 ? 700 : 500
                              }}>
                                {val ?? '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── Printable Document Modal ───────────────────────────────── */}
      <PrintableReport
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        reportTitle={printConfig.title}
        subtitle={printConfig.subtitle}
        summaryCards={printConfig.summaryCards}
        columns={printConfig.columns}
        data={printConfig.data}
        branchName={user?.branch_name || 'فرع السلسبيل'}
        userName={user?.name || 'مسؤول الفرع'}
      />
    </div>
  );
};

export default ReportsPage;
