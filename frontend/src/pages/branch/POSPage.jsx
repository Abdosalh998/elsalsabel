import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart, Truck, Receipt, X, Plus, Trash2,
  Search, User, Package, DollarSign, CreditCard, Wallet,
  Smartphone, Banknote, ChevronDown, CheckCircle, AlertCircle,
  Zap, Clock, TrendingUp, Star, Hash, CalendarDays, Printer, AlertTriangle,
  Layers, Weight, Image as ImageIcon, Upload, Users, ArrowDownCircle,
  RotateCcw, Landmark, HandCoins, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { salesService } from '../../services/sales.service';
import { purchasesService } from '../../services/purchases.service';
import { expensesService } from '../../services/expenses.service';
import { customerService } from '../../services/customer.service';
import { inventoryService } from '../../services/inventory.service';
import { treasuryService } from '../../services/treasury.service';
import { jardService } from '../../services/jard.service';
import custodyService from '../../services/custody.service';
import { useAuth } from '../../context/AuthContext';
import PrintableInvoice from '../../components/sales/PrintableInvoice';
import PrintablePurchaseInvoice from '../../components/purchases/PrintablePurchaseInvoice';
import PrintableExpenseVoucher from '../../components/expenses/PrintableExpenseVoucher';
import PartyPicker from '../../components/common/PartyPicker';
import './POSPage.css';

// ─── Constants ──────────────────────────────────────────────────
const TABS = [
  { key: 'sale', label: 'فاتورة مبيعات', icon: ShoppingCart, color: '#16a34a', bg: '#dcfce7', border: '#bbf7d0' },
  { key: 'store', label: 'فاتورة مشتريات', icon: Truck, color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe' },
  { key: 'expense', label: 'سند مصروفات', icon: Receipt, color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
  { key: 'customer', label: 'إيداع عميل / تسوية', icon: Users, color: '#0891b2', bg: '#e0f2fe', border: '#bae6fd' },
  { key: 'custody', label: 'تسليم / استلام عهدة', icon: HandCoins, color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe' },
];

const CHANNEL_OPTIONS = [
  { value: 'cash', label: 'نقدي', icon: Banknote },
  { value: 'wallet', label: 'محفظة إلكترونية', icon: Wallet },
  { value: 'instapay', label: 'انستاباي', icon: Smartphone },
  { value: 'bank', label: 'إيداع بنكي', icon: Landmark },
];

const EMPTY_SALE_ITEM = { section_id: '', inventory_id: '', weight: '', rolls_count: '', price: '', is_issue_only: false };
const EMPTY_RETURN_ITEM = { inventory_id: '', product: '', company: '', weight: '', rolls_count: '', price_per_ton: '', total: '', notes: '' };
const EMPTY_EXPENSE_ITEM = { description: '', amount: '', notes: '' };

// ─── Small Helpers ───────────────────────────────────────────────
const fmt = (n, d = 2) => Number(n || 0).toFixed(d);

const ChannelBtn = ({ value, selected, onChange }) => {
  const opt = CHANNEL_OPTIONS.find(o => o.value === value);
  if (!opt) return null;
  const Icon = opt.icon;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: '8px 4px', borderRadius: 8, border: '2px solid',
        cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
        transition: 'all 0.18s',
        borderColor: selected ? '#1A3A5C' : '#e2e8f0',
        background: selected ? '#1A3A5C' : '#f8fafc',
        color: selected ? '#fff' : '#475569',
      }}
    >
      <Icon size={14} /> {opt.label}
    </button>
  );
};

const BankReceiptUploader = ({ value, onChange, label = 'صورة إيصال الإيداع البنكي' }) => {
  return (
    <div style={{
      marginBottom: 14, padding: '10px 14px', borderRadius: 10,
      background: 'rgba(217, 119, 6, 0.05)', border: '1.5px dashed #d97706'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Landmark size={14} color="#d97706" />
          {label} *
        </span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
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
      {value ? (
        <div style={{ textAlign: 'center', position: 'relative' }}>
          <img
            src={value}
            alt="إيصال البنك"
            style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 8, border: '1px solid #fed7aa', objectFit: 'contain' }}
          />
        </div>
      ) : (
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '12px', borderRadius: 8, background: '#fff', border: '1px dashed #cbd5e1',
          cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#b45309'
        }}>
          <Upload size={16} />
          انقر هنا لاختيار صورة إيصال البنك
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => onChange(ev.target.result);
              reader.readAsDataURL(file);
            }}
          />
        </label>
      )}
    </div>
  );
};

// (CustomerSearch replaced with reusable PartyPicker component)

// ═══════════════════════════════════════════════════════════════
// POS Page Component
// ═══════════════════════════════════════════════════════════════
const POSPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('sale');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRecords, setLastRecords] = useState([]); // recent submitted
  const [printData, setPrintData] = useState({ isOpen: false, type: null, data: null });

  // Shared dropdown data
  const [customers, setCustomers] = useState([]);
  const [inventoryList, setInventoryList] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [jardList, setJardList] = useState([]);
  const [deductionSource, setDeductionSource] = useState('general'); // 'general' (المخزن العام) | 'jard' (رصيد الجرد)
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [expenseDescs, setExpenseDescs] = useState([]);
  const [purchaseProds, setPurchaseProds] = useState([]);

  const handleDeductionSourceChange = (src) => {
    setDeductionSource(src);
    // لا نحذف الأصناف السابقة، وإذا كان هناك بند واحد فارغ لم يُحدد بعد نحدث مصدره
    setSaleItems(prev => {
      if (prev.length === 1 && !prev[0].inventory_id) {
        return [{ ...prev[0], deduction_source: src }];
      }
      return prev;
    });
  };

  // ── SALE Form ──────────────────────────────────────────────────
  const [saleForm, setSaleForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    customer: null,
    paid_amount: '',
    settlement_amount: '',
    payment_type_id: '',
    notes: '',
    use_customer_credit: true,
    receipt_image: null,
  });
  const [saleItems, setSaleItems] = useState([{ ...EMPTY_SALE_ITEM }]);
  const [saleReturns, setSaleReturns] = useState([]);
  const [addRemainingReturnToBalance, setAddRemainingReturnToBalance] = useState(true);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [isMultiPayment, setIsMultiPayment] = useState(false);
  const [salePayments, setSalePayments] = useState([{ payment_type_id: '', amount: '', notes: '' }]);

  // ── UNIFIED STORE / PURCHASE Form ──────────────────────────────
  const [purchaseForm, setPurchaseForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    customer: null,
    product: '',
    company: '',
    quantity: '',       // وزن إجمالي (كجم)
    count: '',          // عدد اللفات
    discount: '0',      // الخصم / العجز (كجم)
    price_per_ton: '',  // سعر الوزن (ج.م)
    price_per_kg: '',   // سعر الكيلو (ج.م)
    roll_price: '',     // سعر اللفة (ج.م)
    total: '',          // إجمالي الفاتورة
    notes: '',
    channel: 'cash',
    receipt_image: null,
    scale_ticket_image: null,  // كارتة الميزان
    material_type: 'section',  // نوع الخامة: section / scrap / other
    image_url: null,           // صورة البضاعة / الشراء
  });

  const updatePurchaseField = (field, val) => {
    setPurchaseForm(prev => {
      const next = { ...prev, [field]: val };
      const qty = parseFloat(field === 'quantity' ? val : next.quantity) || 0;
      const disc = parseFloat(field === 'discount' ? val : next.discount) || 0;
      const netWeight = Math.max(0, qty - disc);
      const tonPrice = parseFloat(field === 'price_per_ton' ? val : next.price_per_ton) || 0;

      if (field === 'price_per_ton') {
        if (tonPrice > 0 && netWeight > 0) {
          next.total = (netWeight * tonPrice).toFixed(2);
        }
      } else if (field === 'quantity' || field === 'discount') {
        if (tonPrice > 0 && netWeight > 0) {
          next.total = (netWeight * tonPrice).toFixed(2);
        }
      } else if (field === 'total') {
        const tot = parseFloat(val) || 0;
        if (tot > 0 && netWeight > 0) {
          next.price_per_ton = (tot / netWeight).toFixed(2);
        }
      }
      return next;
    });
  };

  // ── Debt Offset Modal for Purchases ─────────────────────────────
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtInfo, setDebtInfo] = useState({ invoices: [], total_debt: 0 });
  const [pendingPurchasePayload, setPendingPurchasePayload] = useState(null);

  // ── EXPENSE Form ───────────────────────────────────────────────
  const [expenseForm, setExpenseForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    amount: '',
    recipient_name: '',
    channel: 'cash',
    notes: '',
    receipt_image: null,
  });
  const [expenseItems, setExpenseItems] = useState([{ ...EMPTY_EXPENSE_ITEM }]);
  const [isMultiExpense, setIsMultiExpense] = useState(false);

  const [invCompanies, setInvCompanies] = useState([]);
  const [invProducts, setInvProducts] = useState([]);

  // ── CUSTOMER DEPOSIT Form ──────────────────────────────────────
  const [depositForm, setDepositForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    payment_type_id: '',
    amount: '',
    notes: '',
    apply_debt_offset: false,
    receipt_image: null,
  });
  const [depositCustomer, setDepositCustomer] = useState(null);
  const [depositOutstanding, setDepositOutstanding] = useState(null);
  const [depositMode, setDepositMode] = useState('list'); // 'list' | 'new' | 'instant'

  // ── CUSTODY Form ────────────────────────────────────────────────
  const [custodyForm, setCustodyForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    person_name: '',
    phone: '',
    type: 'disbursement', // 'disbursement' (صرف) or 'collection' (استلام)
    amount: '',
    payment_type_id: '',
    channel: 'cash',
    receipt_number: '',
    receipt_image: null,
    notes: '',
  });
  const [custodyPersons, setCustodyPersons] = useState([]);
  const [custodyPersonInfo, setCustodyPersonInfo] = useState(null);
  const [isCheckingCustody, setIsCheckingCustody] = useState(false);

  const fetchCustodyPersons = async () => {
    try {
      const res = await custodyService.getPersonsSummary();
      setCustodyPersons(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const checkCustodyPerson = async (name) => {
    if (!name || name.trim().length < 2) {
      setCustodyPersonInfo(null);
      return;
    }
    setIsCheckingCustody(true);
    try {
      const res = await custodyService.getPersonBalance(name.trim());
      setCustodyPersonInfo(res.data);
      if (res.data?.phone && !custodyForm.phone) {
        setCustodyForm((prev) => ({ ...prev, phone: res.data.phone }));
      }
    } catch {
      setCustodyPersonInfo(null);
    } finally {
      setIsCheckingCustody(false);
    }
  };

  // ─── Load dropdown data ─────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [custRes, invRes, ptRes, expDesc, purchProds, invUnique, secRes, jardRes] = await Promise.all([
          customerService.getCustomers({ limit: 1000 }),
          inventoryService.getGroupedInventory(),
          treasuryService.getPaymentTypes(),
          expensesService.getUniqueValues(),
          purchasesService.getUniqueValues(),
          inventoryService.getUniqueValues(),
          inventoryService.getSectionsWithItems().catch(() => ({ data: [] })),
          jardService.getJardForPOS().catch(() => ({ data: [] })),
        ]);
        setCustomers(custRes.data.customers || []);
        setInventoryList(invRes.data || []);
        setPaymentTypes(ptRes.data || []);
        setExpenseDescs(expDesc.data?.descriptions || []);
        setPurchaseProds(purchProds.data?.products || []);
        setInvCompanies(invUnique.data?.companies || []);
        setInvProducts(invUnique.data?.products || []);
        setSectionsList(secRes?.data || []);
        setJardList(jardRes?.data || []);
        fetchCustodyPersons();
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, []);

  const refreshCustomers = async () => {
    try {
      const custRes = await customerService.getCustomers({ limit: 1000 });
      setCustomers(custRes.data.customers || []);
    } catch (e) {
      console.error(e);
    }
  };

  // ─── Customer detail fetch for sale ────────────────────────────
  useEffect(() => {
    const custId = saleForm.customer_id || saleForm.customer?.id;
    if (custId) {
      customerService.getOutstandingInvoices(custId)
        .then(res => setCustomerDetails(res.data))
        .catch(() => setCustomerDetails(null));
    } else {
      setCustomerDetails(null);
    }
  }, [saleForm.customer_id, saleForm.customer]);

  // ─── Sale Calculations ──────────────────────────────────────────
  const saleGrossTotal = saleItems.reduce((sum, it) => {
    const w = parseFloat(it.weight) || 0;
    const p = parseFloat(it.price) || 0;
    return sum + w * p;
  }, 0);

  const saleReturnsTotal = saleReturns.reduce((sum, r) => {
    const w = parseFloat(r.weight) || 0;
    const p = parseFloat(r.price_per_ton) || 0;
    return sum + (w * p);
  }, 0);

  const saleTotal = Math.max(0, saleGrossTotal - saleReturnsTotal);
  const returnExcess = Math.max(0, saleReturnsTotal - saleGrossTotal);

  const creditAvailable = saleForm.use_customer_credit
    ? Math.max(0, Number(saleForm.customer?.total_payments ?? customerDetails?.current_credit ?? saleForm.customer?.current_credit ?? 0))
    : 0;
  const creditUsed = Math.min(creditAvailable, saleTotal);
  const afterCredit = saleTotal - creditUsed;
  const salePaid = isMultiPayment
    ? salePayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    : (parseFloat(saleForm.paid_amount) || 0);
  const saleRemainingBeforeSettlement = afterCredit - salePaid;
  const saleSettlement = parseFloat(saleForm.settlement_amount) || 0;
  const effectiveSaleSettlement = Math.min(saleSettlement, Math.max(0, saleRemainingBeforeSettlement));
  const saleRemaining = Math.max(0, saleRemainingBeforeSettlement - effectiveSaleSettlement);

  // ─── Purchase Calculations ──────────────────────────────────────
  const purQty = parseFloat(purchaseForm.quantity) || 0;
  const purDisc = parseFloat(purchaseForm.discount) || 0;
  const purNetQty = Math.max(0, purQty - purDisc);
  const purTotal = parseFloat(purchaseForm.total) || 0;

  // ─── Expense Calculations ───────────────────────────────────────
  const expTotal = isMultiExpense
    ? expenseItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
    : parseFloat(expenseForm.amount) || 0;

  // ═══════════════════════════════════════════════════════════════
  // SUBMIT HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const handleSaleSubmit = async (e) => {
    e.preventDefault();
    const hasCustomer = saleForm.isNewCustomer ? saleForm.customer_name?.trim() : (saleForm.customer_id || saleForm.customer?.id);
    if (!hasCustomer) {
      toast.error('يرجى اختيار عميل أو إدخال بيانات عميل جديد');
      return;
    }
    const validItems = saleItems.filter(i => {
      if (!i.inventory_id) return false;
      const itSrc = i.deduction_source || deductionSource;
      const isIssue = Boolean(i.is_issue_only || itSrc === 'jard');
      if (isIssue) {
        return (parseInt(i.rolls_count) > 0 || parseFloat(i.weight) > 0);
      }
      return (parseFloat(i.weight) > 0 || parseInt(i.rolls_count) > 0);
    });
    const validReturns = saleReturns.filter(r => (r.inventory_id || r.product) && parseFloat(r.weight) > 0 && parseFloat(r.price_per_ton) > 0);

    if (!validItems.length && !validReturns.length) {
      toast.error('يرجى إضافة بند مبيعات واحد على الأقل أو صنف مرتجع');
      return;
    }

    // Validate Jard items
    for (const it of validItems) {
      const itSrc = it.deduction_source || deductionSource;
      if (itSrc === 'jard') {
        const jItem = jardList.find(x => String(x.id) === String(it.inventory_id));
        const reqR = parseInt(it.rolls_count) || 0;
        if (jItem && reqR > 0 && reqR > Number(jItem.available_rolls || 0)) {
          toast.error(`عدد اللفات المطلوب للصنف "${jItem.product}" (${reqR} لفة) يتجاوز رصيد الجرد المتاح (${jItem.available_rolls} لفة)`);
          return;
        }
      }
    }

    // Validate Warehouse section weights
    const secUsage = {};
    for (const it of validItems) {
      const itSrc = it.deduction_source || deductionSource;
      if (itSrc === 'general') {
        const sId = it.section_id;
        if (sId && parseFloat(it.weight) > 0) {
          secUsage[sId] = (secUsage[sId] || 0) + (parseFloat(it.weight) || 0);
        }
      }
    }
    for (const [sId, neededW] of Object.entries(secUsage)) {
      const sec = sectionsList.find(s => String(s.id) === String(sId));
      if (sec) {
        const avail = Number(sec.available_weight ?? (sec.total_weight - sec.issued_weight));
        if (neededW > avail) {
          toast.error(`وزن القسم "${sec.name}" غير كافٍ. المطلوب: ${neededW} كجم، والمتاح: ${avail.toFixed(2)} كجم`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const hasJard = validItems.some(i => (i.deduction_source || deductionSource) === 'jard');
      const hasGeneral = validItems.some(i => (i.deduction_source || deductionSource) === 'general');
      const invoiceDeductionSource = (hasJard && hasGeneral) ? 'mixed' : (hasJard ? 'jard' : 'general');

      const payload = {
        date: saleForm.date,
        deduction_source: invoiceDeductionSource,
        customer_id: saleForm.isNewCustomer ? null : (saleForm.customer_id || saleForm.customer?.id),
        customer_name: saleForm.isNewCustomer ? saleForm.customer_name : undefined,
        phone: saleForm.isNewCustomer ? saleForm.phone : undefined,
        saveNewCustomer: saleForm.isNewCustomer ? saleForm.saveNewCustomer : undefined,
        save_new_customer: saleForm.isNewCustomer ? saleForm.saveNewCustomer : undefined,
        items: validItems.map(i => {
          const itemSrc = i.deduction_source || deductionSource;
          const isIssue = Boolean(i.is_issue_only || (itemSrc === 'jard' && (!parseFloat(i.price) || !parseFloat(i.weight))));
          return {
            inventory_id: itemSrc === 'general' ? i.inventory_id : null,
            jard_id: itemSrc === 'jard' ? i.inventory_id : null,
            deduction_source: itemSrc,
            section_id: i.section_id ? parseInt(i.section_id) : undefined,
            weight: parseFloat(i.weight) || 0,
            rolls_count: parseInt(i.rolls_count) || 0,
            price: parseFloat(i.price) || 0,
            is_issue_only: isIssue,
          };
        }),
        returns: validReturns.map(r => ({
          inventory_id: r.inventory_id ? parseInt(r.inventory_id) : null,
          product: r.product,
          company: r.company || '',
          weight: parseFloat(r.weight),
          rolls_count: parseInt(r.rolls_count) || 0,
          price_per_ton: parseFloat(r.price_per_ton),
          total: (parseFloat(r.weight) * parseFloat(r.price_per_ton)),
          notes: r.notes || '',
        })),
        add_remaining_to_balance: addRemainingReturnToBalance,
        paid_amount: salePaid,
        settlement_amount: effectiveSaleSettlement,
        payment_type_id: isMultiPayment
          ? (salePayments.find(p => p.payment_type_id && parseFloat(p.amount) > 0)?.payment_type_id || null)
          : (saleForm.payment_type_id || null),
        payments: isMultiPayment
          ? salePayments.filter(p => p.payment_type_id && parseFloat(p.amount) > 0).map(p => ({
            payment_type_id: parseInt(p.payment_type_id),
            amount: parseFloat(p.amount),
            notes: p.notes || ''
          }))
          : (salePaid > 0 && saleForm.payment_type_id ? [{
            payment_type_id: parseInt(saleForm.payment_type_id),
            amount: salePaid,
            notes: ''
          }] : []),
        notes: saleForm.notes,
        use_customer_credit: saleForm.use_customer_credit,
        receipt_image: saleForm.receipt_image || null,
      };
      const res = await salesService.addSale(payload);
      toast.success(validItems.length === 0 ? '✅ تم تسجيل فاتورة المرتجع وتسوية الحساب بنجاح' : '✅ تم تسجيل فاتورة المبيعات بنجاح');
      setLastRecords(prev => [{ type: 'sale', id: res.data?.id || res.id, label: `فاتورة مبيعات #${res.data?.id || res.id}`, time: new Date(), data: res.data || res }, ...prev].slice(0, 5));
      // Open print
      const saleId = res.data?.id || res.id;
      if (saleId) {
        const printRes = await salesService.getSaleById(saleId);
        setPrintData({ isOpen: true, type: 'sale', data: printRes.data });
      }
      refreshCustomers();
      try {
        const [invRes, secRes, jRes] = await Promise.all([
          inventoryService.getGroupedInventory(),
          inventoryService.getSectionsWithItems().catch(() => ({ data: [] })),
          jardService.getJardForPOS().catch(() => ({ data: [] }))
        ]);
        setInventoryList(invRes.data || []);
        setSectionsList(secRes?.data || []);
        setJardList(jRes?.data || []);
      } catch (e) {
        console.error('Failed to reload inventory', e);
      }
      resetSaleForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تسجيل المبيعات');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executePurchaseSubmit = async (payload) => {
    setIsSubmitting(true);
    try {
      const res = await purchasesService.addPurchase(payload);
      toast.success(payload.add_to_inventory ? '✅ تم تسجيل فاتورة المشتريات وتوريد البضاعة للمخزن بنجاح 📦' : '✅ تم تسجيل فاتورة المشتريات بنجاح');
      const purchaseId = res.data?.id || res.id;
      const purchaseData = res.data || res;
      setLastRecords(prev => [{
        type: 'purchase',
        id: purchaseId,
        label: `مشتريات وتوريد #${purchaseId} - ${payload.product}`,
        time: new Date(),
        data: purchaseData
      }, ...prev].slice(0, 5));
      setPrintData({ isOpen: true, type: 'purchase', data: purchaseData });
      setDebtModalOpen(false);
      setPendingPurchasePayload(null);
      if (purchaseForm.isNewCustomer && purchaseForm.saveNewCustomer) {
        refreshCustomers();
      }
      try {
        const invRes = await inventoryService.getGroupedInventory();
        setInventoryList(invRes.data || []);
      } catch (err) {
        console.error('Failed to reload inventory', err);
      }
      resetPurchaseForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تسجيل المشتريات والتوريد');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    if (!purchaseForm.product || !purchaseForm.total) {
      toast.error('يرجى ملء جميع الحقول المطلوبة (اسم المنتج والمبلغ الإجمالي)');
      return;
    }

    const purCustId = purchaseForm.isNewCustomer ? null : (purchaseForm.customer_id || purchaseForm.customer?.id);

    const payload = {
      date: purchaseForm.date,
      customer_id: purCustId || null,
      customer_name: purchaseForm.isNewCustomer ? purchaseForm.customer_name : undefined,
      phone: purchaseForm.isNewCustomer ? purchaseForm.phone : undefined,
      saveNewCustomer: purchaseForm.isNewCustomer ? purchaseForm.saveNewCustomer : undefined,
      save_new_customer: purchaseForm.isNewCustomer ? purchaseForm.saveNewCustomer : undefined,
      product: (purchaseForm.product || '').trim(),
      company: (purchaseForm.company || '').trim(),
      weight_quantity: parseFloat(purchaseForm.quantity) || 0,
      count: parseInt(purchaseForm.count) || 0,
      price_per_ton: parseFloat(purchaseForm.price_per_ton) || 0,
      price_per_kg: parseFloat(purchaseForm.price_per_kg) || 0,
      roll_price: parseFloat(purchaseForm.roll_price) || 0,
      discount: parseFloat(purchaseForm.discount) || 0,
      total: parseFloat(purchaseForm.total) || 0,
      notes: purchaseForm.notes || '',
      channel: purchaseForm.channel || 'cash',
      receipt_image: purchaseForm.receipt_image || null,
      scale_ticket_image: purchaseForm.scale_ticket_image || null,
      material_type: purchaseForm.material_type || 'section',
      image_url: purchaseForm.image_url || null,
      add_to_inventory: purchaseForm.add_to_inventory || false,
      apply_debt_offset: false
    };

    // Check outstanding debt if supplier is selected from existing list
    if (!purchaseForm.isNewCustomer && purCustId) {
      try {
        const res = await customerService.getOutstandingInvoices(purCustId);
        const outstanding = res.data;
        if (outstanding.invoices && outstanding.invoices.length > 0 && outstanding.total_debt > 0) {
          setDebtInfo(outstanding);
          setPendingPurchasePayload(payload);
          setDebtModalOpen(true);
          return;
        }
      } catch (err) {
        console.error('Failed to check outstanding invoices', err);
      }
    }

    await executePurchaseSubmit(payload);
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expenseForm.description && !isMultiExpense) {
      toast.error('يرجى إدخال وصف المصروف');
      return;
    }
    if (expTotal <= 0) { toast.error('يرجى إدخال مبلغ صحيح'); return; }
    setIsSubmitting(true);
    try {
      const payload = {
        date: expenseForm.date,
        description: isMultiExpense
          ? expenseItems.map(i => i.description).join(' + ')
          : expenseForm.description,
        amount: expTotal,
        recipient_name: expenseForm.recipient_name,
        channel: expenseForm.channel,
        notes: expenseForm.notes,
        items: isMultiExpense ? expenseItems : undefined,
        receipt_image: expenseForm.receipt_image || null,
      };
      const res = await expensesService.addExpense(payload);
      toast.success('✅ تم تسجيل سند المصروفات بنجاح');
      const expId = res.data?.id || res.id;
      setLastRecords(prev => [{ type: 'expense', id: expId, label: `سند مصروفات #${expId}`, time: new Date(), data: res.data || res }, ...prev].slice(0, 5));
      setPrintData({ isOpen: true, type: 'expense', data: res.data || res });
      resetExpenseForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تسجيل المصروفات');
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    const hasCustomer = depositForm.isNewCustomer ? depositForm.customer_name?.trim() : depositForm.customer_id;
    if (!hasCustomer) { toast.error('يرجى اختيار عميل أو إدخال بياناته'); return; }
    if (!depositForm.amount || Number(depositForm.amount) <= 0) { toast.error('يرجى إدخال مبلغ صحيح'); return; }
    if (!depositForm.payment_type_id) { toast.error('يرجى اختيار طريقة الدفع'); return; }
    setIsSubmitting(true);
    try {
      const payload = {
        date: depositForm.date,
        customer_id: depositForm.isNewCustomer ? null : depositForm.customer_id,
        customer_name: depositForm.isNewCustomer ? depositForm.customer_name : undefined,
        customer_phone: depositForm.isNewCustomer ? depositForm.phone : undefined,
        saveNewCustomer: depositForm.isNewCustomer ? depositForm.saveNewCustomer : undefined,
        payment_type_id: depositForm.payment_type_id,
        amount: Number(depositForm.amount),
        notes: depositForm.notes,
        apply_debt_offset: depositForm.apply_debt_offset,
        receipt_image: depositForm.receipt_image || null,
      };
      const res = await treasuryService.addTreasury(payload);
      const saved = res.data || res;
      const offsetAmt = saved.debt_offset || 0;
      const custLabel = depositForm.isNewCustomer ? depositForm.customer_name : (depositCustomer?.name || 'عميل');
      toast.success(`✅ تم تسجيل الإيداع بنجاح${offsetAmt > 0 ? ` (مقاصة ${Number(offsetAmt).toFixed(2)} ج.م)` : ''}`);
      setLastRecords(prev => [{
        type: 'customer',
        id: saved.id,
        label: `إيداع: ${custLabel} — ${fmt(depositForm.amount)} ج.م`,
        time: new Date(),
        data: saved
      }, ...prev].slice(0, 5));
      if (depositForm.isNewCustomer && depositForm.saveNewCustomer) refreshCustomers();
      if (depositForm.customer_id) {
        const outstRes = await customerService.getOutstandingInvoices(depositForm.customer_id);
        setDepositOutstanding(outstRes.data);
      }
      await refreshCustomers();
      resetDepositForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تسجيل الإيداع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCustodyForm = () => {
    setCustodyForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      person_name: '',
      phone: '',
      type: 'disbursement',
      amount: '',
      payment_type_id: '',
      channel: 'cash',
      receipt_number: '',
      receipt_image: null,
      notes: '',
    });
    setCustodyPersonInfo(null);
  };

  const handleCustodySubmit = async (e) => {
    e.preventDefault();
    if (!custodyForm.person_name?.trim()) {
      toast.error('يرجى إدخال اسم الشخص المستلم / المسلم للعهدة');
      return;
    }
    if (!custodyForm.amount || Number(custodyForm.amount) <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        date: custodyForm.date,
        person_name: custodyForm.person_name.trim(),
        phone: custodyForm.phone,
        type: custodyForm.type,
        amount: Number(custodyForm.amount),
        payment_type_id: custodyForm.payment_type_id || null,
        channel: custodyForm.channel || 'cash',
        receipt_number: custodyForm.receipt_number || undefined,
        receipt_image: custodyForm.receipt_image || null,
        notes: custodyForm.notes,
      };

      const res = await custodyService.addCustody(payload);
      const saved = res.data || res;
      const isDisb = custodyForm.type === 'disbursement';
      toast.success(isDisb ? '✅ تم تسجيل تسليم العهدة بنجاح' : '✅ تم تسجيل استلام العهدة بنجاح');

      setLastRecords(prev => [{
        type: 'custody',
        id: saved.id,
        label: `${isDisb ? 'تسليم عهدة' : 'استلام عهدة'}: ${custodyForm.person_name} — ${fmt(custodyForm.amount)} ج.م`,
        time: new Date(),
        data: saved
      }, ...prev].slice(0, 5));

      resetCustodyForm();
      fetchCustodyPersons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تسجيل العهدة');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Reset Forms ────────────────────────────────────────────────
  const resetSaleForm = () => {
    setSaleForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      customer_id: '',
      customer_name: '',
      phone: '',
      isNewCustomer: false,
      saveNewCustomer: true,
      customer: null,
      paid_amount: '',
      settlement_amount: '',
      payment_type_id: '',
      notes: '',
      use_customer_credit: true,
      receipt_image: null,
    });
    setSaleItems([{ ...EMPTY_SALE_ITEM }]);
    setSaleReturns([]);
    setAddRemainingReturnToBalance(true);
    setCustomerDetails(null);
    setIsMultiPayment(false);
    setSalePayments([{ payment_type_id: '', amount: '', notes: '' }]);
  };

  const resetPurchaseForm = () => {
    setPurchaseForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      customer_id: '',
      customer_name: '',
      phone: '',
      isNewCustomer: false,
      saveNewCustomer: true,
      customer: null,
      product: '',
      company: '',
      quantity: '',
      count: '',
      discount: '0',
      price_per_ton: '',
      price_per_kg: '',
      roll_price: '',
      total: '',
      notes: '',
      channel: 'cash',
      receipt_image: null,
      scale_ticket_image: null,
      material_type: 'section',
      image_url: null,
    });
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      description: '', amount: '', recipient_name: '', channel: 'cash', notes: '', receipt_image: null,
    });
    setExpenseItems([{ ...EMPTY_EXPENSE_ITEM }]);
    setIsMultiExpense(false);
  };


  const resetDepositForm = () => {
    setDepositForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      customer_id: '',
      customer_name: '',
      phone: '',
      isNewCustomer: false,
      saveNewCustomer: true,
      payment_type_id: '',
      amount: '',
      notes: '',
      apply_debt_offset: false,
      receipt_image: null,
    });
    setDepositCustomer(null);
    setDepositOutstanding(null);
    setDepositMode('list');
  };

  // ─── Sale Items Helpers ─────────────────────────────────────────
  const addSaleItem = (src) => setSaleItems(prev => [
    ...prev,
    { ...EMPTY_SALE_ITEM, deduction_source: (typeof src === 'string' ? src : deductionSource) }
  ]);
  const removeSaleItem = (i) => setSaleItems(prev => prev.filter((_, idx) => idx !== i));
  const updateSaleItem = (i, field, val) =>
    setSaleItems(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const updated = { ...it, [field]: val };
      if (field === 'inventory_id' && val) {
        const itSrc = updated.deduction_source || deductionSource;
        if (itSrc === 'jard') {
          const jItem = jardList.find(x => String(x.id) === String(val));
          if (jItem && !updated.section_id && jItem.section_id) {
            updated.section_id = String(jItem.section_id);
          }
        } else {
          // inventoryList is now grouped: match by sample_id or product name
          const inv = inventoryList.find(x => String(x.sample_id) === String(val) || String(x.id) === String(val));
          if (inv && !updated.price && (inv.avg_price_per_kg || inv.avg_roll_price || inv.price_per_kg || inv.roll_price)) {
            updated.price = String(inv.avg_price_per_kg || inv.avg_roll_price || inv.price_per_kg || inv.roll_price || '');
          }
        }
      }
      return updated;
    }));

  // ─── Sale Returns Helpers ────────────────────────────────────────
  const addSaleReturn = () => setSaleReturns(prev => [...prev, { ...EMPTY_RETURN_ITEM }]);
  const removeSaleReturn = (i) => setSaleReturns(prev => prev.filter((_, idx) => idx !== i));
  const updateSaleReturn = (i, field, val) =>
    setSaleReturns(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: val };
      if (field === 'inventory_id' && val) {
        const inv = inventoryList.find(x => String(x.sample_id) === String(val) || String(x.id) === String(val));
        if (inv) {
          if (!updated.product) {
            updated.product = inv.product;
          }
          updated.company = inv.company || (inv.company_items ? inv.company_items.map(c => c.company).join(' / ') : '');
        }
      }
      const w = parseFloat(field === 'weight' ? val : updated.weight) || 0;
      const p = parseFloat(field === 'price_per_ton' ? val : updated.price_per_ton) || 0;
      if (field === 'weight' || field === 'price_per_ton') {
        updated.total = (w * p).toFixed(2);
      } else if (field === 'total') {
        const tot = parseFloat(val) || 0;
        if (tot > 0 && w > 0) updated.price_per_ton = (tot / w).toFixed(2);
      }
      return updated;
    }));

  // ─── Sale Payments Helpers (Multi-payment) ───────────────────────
  const addSalePayment = () => setSalePayments(prev => [...prev, { payment_type_id: '', amount: '', notes: '' }]);
  const removeSalePayment = (idx) =>
    setSalePayments(prev => {
      if (prev.length <= 1) return [{ payment_type_id: '', amount: '', notes: '' }];
      return prev.filter((_, i) => i !== idx);
    });
  const updateSalePayment = (idx, field, val) =>
    setSalePayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));

  // ─── Expense Items Helpers ──────────────────────────────────────
  const addExpenseItem = () => setExpenseItems(prev => [...prev, { ...EMPTY_EXPENSE_ITEM }]);
  const removeExpenseItem = (i) => setExpenseItems(prev => prev.filter((_, idx) => idx !== i));
  const updateExpenseItem = (i, field, val) =>
    setExpenseItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const activeTabData = TABS.find(t => t.key === activeTab);

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="pos-root">

      {/* Print Modals */}
      {printData.isOpen && printData.type === 'sale' && (
        <PrintableInvoice
          isOpen={true}
          onClose={() => setPrintData({ isOpen: false, type: null, data: null })}
          sale={printData.data}
        />
      )}
      {printData.isOpen && printData.type === 'purchase' && (
        <PrintablePurchaseInvoice
          isOpen={true}
          onClose={() => setPrintData({ isOpen: false, type: null, data: null })}
          purchase={printData.data}
        />
      )}
      {printData.isOpen && printData.type === 'expense' && (
        <PrintableExpenseVoucher
          isOpen={true}
          onClose={() => setPrintData({ isOpen: false, type: null, data: null })}
          expense={printData.data}
        />
      )}

      {/* ─── Debt Offset Confirmation Modal for POS Purchases ─────────── */}
      {debtModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '16px',
            padding: '28px', maxWidth: '700px', width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            border: '1px solid rgba(245,158,11,0.3)',
            maxHeight: '85vh', overflowY: 'auto', direction: 'rtl'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                background: 'rgba(245,158,11,0.15)', borderRadius: '50%',
                width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <AlertTriangle size={24} color="#f59e0b" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>تنبيه: يوجد دين غير مسدد على المورد</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  هذا المورد لديه فواتير مبيعات سابقة غير مسددة في حسابه
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '10px', padding: '14px 18px', marginBottom: '20px',
              display: 'flex', gap: '24px', flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>إجمالي الدين السابق</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  {fmt(debtInfo.total_debt)} ج.م
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>قيمة الشراء الحالي</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#1A3A5C' }}>
                  {fmt(pendingPurchasePayload?.total || 0)} ج.م
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>ما سيتم مقاصته وتسويته</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#16a34a' }}>
                  {fmt(Math.min(Number(debtInfo.total_debt), Number(pendingPurchasePayload?.total || 0)))} ج.م
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>ما سيُدفع من الخزينة فعلياً</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#dc2626' }}>
                  {fmt(Math.max(0, Number(pendingPurchasePayload?.total || 0) - Number(debtInfo.total_debt)))} ج.م
                </div>
              </div>
            </div>

            {/* Invoices list */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.92rem', color: '#0f172a' }}>
                فواتير المبيعات غير المسددة ({debtInfo.invoices.length} فاتورة):
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['رقم الفاتورة', 'التاريخ', 'إجمالي الفاتورة', 'المدفوع', 'المتبقي'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {debtInfo.invoices.map((inv, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>#{inv.invoice_number}</td>
                        <td style={{ padding: '8px 10px' }}>{format(new Date(inv.date), 'yyyy/MM/dd')}</td>
                        <td style={{ padding: '8px 10px' }}>{fmt(inv.invoice_amount)}</td>
                        <td style={{ padding: '8px 10px', color: '#16a34a' }}>{fmt(inv.paid_amount)}</td>
                        <td style={{ padding: '8px 10px', color: '#dc2626', fontWeight: 700 }}>{fmt(inv.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{
                  flex: 1, minWidth: '170px', padding: '10px 16px', borderRadius: '8px', border: 'none',
                  background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer'
                }}
                disabled={isSubmitting}
                onClick={() => executePurchaseSubmit({ ...pendingPurchasePayload, apply_debt_offset: true })}
              >
                ✅ تطبيق المقاصة والحفظ
              </button>
              <button
                type="button"
                style={{
                  flex: 1, minWidth: '150px', padding: '10px 16px', borderRadius: '8px',
                  border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
                }}
                disabled={isSubmitting}
                onClick={() => executePurchaseSubmit({ ...pendingPurchasePayload, apply_debt_offset: false })}
              >
                متابعة بدون مقاصة
              </button>
              <button
                type="button"
                style={{
                  minWidth: '90px', padding: '10px 16px', borderRadius: '8px',
                  border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer'
                }}
                disabled={isSubmitting}
                onClick={() => { setDebtModalOpen(false); setPendingPurchasePayload(null); }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="pos-header">
        <div className="pos-header-inner">
          <div className="pos-header-top">
            <div className="pos-header-title-box">
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'linear-gradient(135deg, #C9A84C, #DFC07A)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Zap size={20} color="#fff" />
              </div>
              <div>
                <h1 style={{ margin: 0, color: '#fff', fontSize: '1.35rem', fontWeight: 800 }}>
                  المتحكم الرئيسي
                </h1>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem' }}>
                  تسجيل سريع — مبيعات · مشتريات · مصروفات
                </p>
              </div>
            </div>
            <div className="pos-header-date-box">
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>التاريخ الحالي</div>
              <div style={{ color: '#C9A84C', fontSize: '0.9rem', fontWeight: 700 }}>
                {format(new Date(), 'yyyy/MM/dd')}
              </div>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="pos-tabs-bar">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className="pos-tab-button"
                  style={{
                    background: isActive ? '#fff' : 'rgba(255,255,255,0.08)',
                    color: isActive ? tab.color : 'rgba(255,255,255,0.7)',
                    boxShadow: isActive ? '0 -2px 0 ' + tab.color + ' inset' : 'none',
                  }}
                >
                  <Icon size={17} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <div className="pos-content-grid">

        {/* ── Form Panel ───────────────────────────────────── */}
        <div className="pos-form-container" style={{
          border: `2px solid ${activeTabData.border}`
        }}>
          {/* Panel header */}
          <div className="pos-form-header" style={{
            background: activeTabData.bg,
            borderBottom: `1.5px solid ${activeTabData.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(() => { const Icon = activeTabData.icon; return <Icon size={18} color={activeTabData.color} />; })()}
              <span style={{ fontWeight: 800, color: activeTabData.color, fontSize: '1rem' }}>
                {activeTabData.label}
              </span>
            </div>

            {/* Purchases indicator */}
            {activeTab === 'store' && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', background: 'rgba(37,99,235,0.1)',
                color: '#2563eb', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700
              }}>
                <Truck size={14} /> مشتريات بضاعة وخامات
              </div>
            )}
          </div>

          <div className="pos-form-content">
            {activeTab === 'sale' && (
              <SaleForm {...{
                saleForm, setSaleForm, saleItems, setSaleItems, saleTotal,
                saleGrossTotal, saleReturnsTotal, returnExcess,
                saleReturns, addSaleReturn, removeSaleReturn, updateSaleReturn,
                addRemainingReturnToBalance, setAddRemainingReturnToBalance,
                creditAvailable, creditUsed, afterCredit, salePaid, saleRemaining,
                saleRemainingBeforeSettlement, effectiveSaleSettlement,
                customers, inventoryList, sectionsList, paymentTypes, customerDetails,
                addSaleItem, removeSaleItem, updateSaleItem,
                isMultiPayment, setIsMultiPayment, salePayments, setSalePayments,
                addSalePayment, removeSalePayment, updateSalePayment,
                deductionSource, setDeductionSource, jardList,
                onDeductionSourceChange: handleDeductionSourceChange,
                isSubmitting, onSubmit: handleSaleSubmit
              }} />
            )}
            {activeTab === 'store' && (
              <UnifiedStoreForm
                purchaseForm={purchaseForm}
                updatePurchaseField={updatePurchaseField}
                setPurchaseForm={setPurchaseForm}
                customers={customers}
                purchaseProds={purchaseProds}
                invCompanies={invCompanies}
                inventoryList={inventoryList}
                isSubmitting={isSubmitting}
                onSubmit={handlePurchaseSubmit}
              />
            )}
            {activeTab === 'expense' && <ExpenseForm {...{ expenseForm, setExpenseForm, expenseItems, expTotal, expenseDescs, isMultiExpense, setIsMultiExpense, addExpenseItem, removeExpenseItem, updateExpenseItem, isSubmitting, onSubmit: handleExpenseSubmit }} />}
            {activeTab === 'customer' && <CustomerDepositForm {...{ depositForm, setDepositForm, depositCustomer, setDepositCustomer, depositOutstanding, setDepositOutstanding, depositMode, setDepositMode, customers, paymentTypes, isSubmitting, onSubmit: handleDepositSubmit, refreshOutstanding: async (id) => { const r = await customerService.getOutstandingInvoices(id); setDepositOutstanding(r.data); } }} />}
            {activeTab === 'custody' && (
              <CustodyForm
                custodyForm={custodyForm}
                setCustodyForm={setCustodyForm}
                custodyPersons={custodyPersons}
                custodyPersonInfo={custodyPersonInfo}
                isCheckingCustody={isCheckingCustody}
                checkCustodyPerson={checkCustodyPerson}
                paymentTypes={paymentTypes}
                isSubmitting={isSubmitting}
                onSubmit={handleCustodySubmit}
              />
            )}
          </div>
        </div>

        {/* ── Activity Panel ──────────────────────────────── */}
        <div className="pos-sidebar-panel">
          {/* Stats */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 12px rgba(15,35,64,0.07)', border: '1.5px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} /> آخر العمليات
            </div>
            {lastRecords.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', padding: '16px 0' }}>
                لا توجد عمليات بعد
              </div>
            ) : lastRecords.map((rec, i) => {
              const tab = TABS.find(t => t.key === rec.type) || (
                rec.type === 'purchase' ? { bg: '#dbeafe', color: '#2563eb', icon: Truck } :
                  rec.type === 'inventory' ? { bg: '#ede9fe', color: '#7c3aed', icon: Package } :
                    null
              );
              const Icon = tab?.icon;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: i < lastRecords.length - 1 ? '1px solid #f1f5f9' : 'none'
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: tab?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {Icon && <Icon size={15} color={tab?.color} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rec.label}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {format(rec.time, 'HH:mm')}
                    </div>
                  </div>
                  {['sale', 'purchase', 'expense'].includes(rec.type) && (
                    <button
                      type="button"
                      onClick={() => setPrintData({ isOpen: true, type: rec.type, data: rec.data })}
                      title="طباعة"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#94a3b8', padding: 4, borderRadius: 6,
                        display: 'flex', alignItems: 'center', transition: 'color 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#1A3A5C'}
                      onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                    >
                      <Printer size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick links */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 2px 12px rgba(15,35,64,0.07)', border: '1.5px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={14} /> روابط سريعة
            </div>
            {[
              { label: 'سجل المبيعات', href: '/branch/sales', color: '#16a34a' },
              { label: 'سجل المشتريات', href: '/branch/purchases', color: '#2563eb' },
              { label: 'سجل المصروفات', href: '/branch/expenses', color: '#d97706' },
              { label: 'المخازن', href: '/branch/inventory', color: '#7c3aed' },
              { label: 'الخزينة', href: '/branch/treasury', color: '#c084fc' },
              { label: 'العملاء', href: '/branch/customers', color: '#0891b2' },
              { label: 'التقارير المتكاملة', href: '/branch/reports', color: '#1A3A5C' },
            ].map(link => (
              <a key={link.href} href={link.href} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 0', borderBottom: '1px solid #f1f5f9',
                textDecoration: 'none', color: link.color, fontSize: '0.83rem', fontWeight: 600,
                transition: 'opacity 0.15s'
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <ChevronDown size={13} style={{ transform: 'rotate(90deg)' }} /> {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Sub-form: Sale
// ═══════════════════════════════════════════════════════════════
const SaleForm = ({
  saleForm, setSaleForm, saleItems, setSaleItems, saleTotal,
  saleGrossTotal = 0, saleReturnsTotal = 0, returnExcess = 0,
  saleReturns = [], addSaleReturn, removeSaleReturn, updateSaleReturn,
  addRemainingReturnToBalance, setAddRemainingReturnToBalance,
  creditAvailable, creditUsed, afterCredit, salePaid, saleRemaining,
  saleRemainingBeforeSettlement = 0, effectiveSaleSettlement = 0,
  customers, inventoryList, sectionsList = [], paymentTypes, customerDetails,
  addSaleItem, removeSaleItem, updateSaleItem,
  isMultiPayment = false, setIsMultiPayment, salePayments = [], setSalePayments,
  addSalePayment, removeSalePayment, updateSalePayment,
  deductionSource = 'general', setDeductionSource, jardList = [],
  onDeductionSourceChange,
  isSubmitting, onSubmit
}) => {
  const fieldStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontFamily: 'inherit', fontSize: '0.88rem',
    background: '#f8fafc', color: '#0f172a', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

  return (
    <form onSubmit={onSubmit}>
      {/* Date and Customer with PartyPicker */}
      <div className="pos-grid-date-customer">
        <div>
          <label style={labelStyle}><CalendarDays size={12} style={{ marginLeft: 4 }} />التاريخ</label>
          <input type="date" value={saleForm.date}
            onChange={e => setSaleForm(p => ({ ...p, date: e.target.value }))}
            style={fieldStyle} />
        </div>
        <div>
          <PartyPicker
            type="customer"
            customers={customers}
            value={{
              customer_id: saleForm.customer_id,
              customer_name: saleForm.customer_name,
              phone: saleForm.phone,
              isNewCustomer: saleForm.isNewCustomer,
              saveNewCustomer: saleForm.saveNewCustomer
            }}
            onChange={partyData => {
              setSaleForm(p => ({
                ...p,
                customer_id: partyData.customer_id,
                customer_name: partyData.customer_name,
                phone: partyData.phone,
                isNewCustomer: partyData.isNewCustomer,
                saveNewCustomer: partyData.saveNewCustomer,
                customer: partyData.selectedCustomer
              }));
            }}
            required={true}
          />
        </div>
      </div>

      {/* Customer balance info */}
      {customerDetails && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 10, display: 'flex', gap: 20, fontSize: '0.84rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>💰 رصيد دائن (له): <strong style={{ color: '#0891b2' }}>{fmt(customerDetails.current_credit || 0)} ج.م</strong></span>
          <span>⚠️ مديونية مستحقة (عليه): <strong style={{ color: '#dc2626' }}>{fmt(customerDetails.current_debt ?? customerDetails.total_debt ?? 0)} ج.م</strong></span>
          {Number(customerDetails.unpaid_invoices_count || 0) > 0 && (
            <span>📄 فواتير مفتوحة: <strong style={{ color: '#d97706' }}>{customerDetails.unpaid_invoices_count} فاتورة</strong></span>
          )}
        </div>
      )}

      {/* Items */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}><Package size={12} style={{ marginLeft: 4 }} />البنود المباعة</label>
            {/* خيار جهة الخصم الافتراضية */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '2px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={() => {
                  if (onDeductionSourceChange) {
                    onDeductionSourceChange('general');
                  } else {
                    setDeductionSource?.('general');
                    if (typeof setSaleItems === 'function') {
                      setSaleItems(prev => (prev.length === 1 && !prev[0].inventory_id ? [{ ...prev[0], deduction_source: 'general' }] : prev));
                    }
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
                  fontSize: '0.74rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: deductionSource === 'general' ? '#1e293b' : 'transparent',
                  color: deductionSource === 'general' ? '#ffffff' : '#64748b',
                  transition: 'all 0.15s'
                }}
                title="تحديد المخزن العام كمصدر افتراضي للبنود الجديدة"
              >
                <Package size={12} />
                الخصم من المخزن العام
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeductionSourceChange) {
                    onDeductionSourceChange('jard');
                  } else {
                    setDeductionSource?.('jard');
                    if (typeof setSaleItems === 'function') {
                      setSaleItems(prev => (prev.length === 1 && !prev[0].inventory_id ? [{ ...prev[0], deduction_source: 'jard' }] : prev));
                    }
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
                  fontSize: '0.74rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: deductionSource === 'jard' ? '#0284c7' : 'transparent',
                  color: deductionSource === 'jard' ? '#ffffff' : '#64748b',
                  transition: 'all 0.15s'
                }}
                title="تحديد رصيد الجرد كمصدر افتراضي للبنود الجديدة"
              >
                <Layers size={12} />
                الخصم من رصيد الجرد
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => addSaleItem('general')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', fontWeight: 700,
                color: '#1e293b', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6,
                padding: '4px 9px', cursor: 'pointer'
              }}
              title="إضافة بند مبيعات من المخزن العام"
            >
              <Plus size={12} /> بند مخزن
            </button>
            <button
              type="button"
              onClick={() => addSaleItem('jard')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', fontWeight: 700,
                color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 6,
                padding: '4px 9px', cursor: 'pointer'
              }}
              title="إضافة بند مبيعات من رصيد الجرد"
            >
              <Plus size={12} /> بند جرد
            </button>
          </div>
        </div>
        <div className="pos-table-scroll">
          <div className="pos-sale-items-table">
            {/* Header row */}
            <div className="pos-sale-items-row" style={{
              background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 10px', fontSize: '0.74rem', fontWeight: 700, color: '#64748b'
            }}>
              <span>المصدر</span><span>القسم</span><span>الصنف / المنتج</span><span>الوزن (كجم)</span><span>اللفات</span><span>السعر</span><span></span>
            </div>

            {saleItems.length === 0 ? (
              <div style={{ padding: '18px 20px', textAlign: 'center', background: '#f8fafc', color: '#64748b', fontSize: '0.84rem' }}>
                <div style={{ marginBottom: 8, fontWeight: 700, color: '#475569' }}>
                  لا توجد أصناف مبيعات مضافة {saleReturns.length > 0 ? '(فاتورة مرتجع بضاعة فقط)' : ''}
                </div>
                <div style={{ display: 'inline-flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => addSaleItem('general')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 700,
                      color: '#1e293b', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6,
                      padding: '5px 14px', cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} /> إضافة بند مخزن
                  </button>
                  <button
                    type="button"
                    onClick={() => addSaleItem('jard')}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 700,
                      color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 6,
                      padding: '5px 14px', cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} /> إضافة بند جرد
                  </button>
                </div>
              </div>
            ) : (
              saleItems.map((item, i) => {
                const itemSource = item.deduction_source || deductionSource;
                const selectedInv = itemSource === 'general'
                  ? inventoryList.find(inv => String(inv.sample_id) === String(item.inventory_id) || String(inv.id) === String(item.inventory_id))
                  : null;
                const selectedJard = itemSource === 'jard'
                  ? jardList.find(j => String(j.id) === String(item.inventory_id))
                  : null;

                const availW = selectedInv ? Number(selectedInv.total_available_weight ?? selectedInv.available_quantity ?? selectedInv.remaining_weight ?? 0) : null;
                const availR = selectedInv ? Number(selectedInv.total_available_rolls ?? 0) : null;

                const selectedSec = sectionsList.find(s => String(s.id) === String(item.section_id));
                const secAvail = selectedSec ? Number(selectedSec.available_weight ?? (selectedSec.total_weight - selectedSec.issued_weight)) : null;
                const isOverSecWeight = (itemSource === 'general') && selectedSec && Number(item.weight || 0) > secAvail;
                const isOverWeight = (itemSource === 'general') && !selectedSec && selectedInv && Number(item.weight || 0) > availW;
                const isOverJardRolls = (itemSource === 'jard') && selectedJard && Number(item.rolls_count || 0) > 0 && Number(item.rolls_count) > Number(selectedJard.available_rolls || 0);

                // Filter products based on selected section and itemSource
                let productsForSection = [];
                if (itemSource === 'jard') {
                  productsForSection = item.section_id
                    ? jardList.filter(j => String(j.section_id) === String(item.section_id))
                    : jardList;
                } else if (item.section_id) {
                  const currentSec = sectionsList.find(s => String(s.id) === String(item.section_id));
                  if (currentSec) {
                    const secItems = currentSec.items || [];
                    const mapped = secItems.map(si => {
                      const matched = inventoryList.find(inv =>
                        String(inv.sample_id) === String(si.id) || String(inv.id) === String(si.id)
                      );
                      return matched || {
                        id: si.id,
                        sample_id: si.id,
                        product: si.product,
                        company: si.company,
                        section_id: currentSec.id,
                        section_name: currentSec.name,
                        price_per_kg: si.price_per_kg || 0,
                        roll_price: si.roll_price || 0,
                        total_available_weight: 0,
                        available_quantity: 0,
                        total_available_rolls: 0,
                        available_rolls: 0,
                      };
                    });
                    productsForSection = mapped;
                  }
                } else {
                  productsForSection = inventoryList;
                }

                return (
                  <div key={i} style={{ borderBottom: i < saleItems.length - 1 ? '1px solid #f1f5f9' : 'none', padding: '8px 10px' }}>
                    <div className="pos-sale-items-row" style={{ alignItems: 'center' }}>
                      {/* Item Source Selector (المخزن العام / رصيد الجرد) */}
                      <select
                        value={itemSource}
                        onChange={e => {
                          const newSrc = e.target.value;
                          updateSaleItem(i, 'deduction_source', newSrc);
                          updateSaleItem(i, 'inventory_id', '');
                        }}
                        style={{
                          ...fieldStyle,
                          padding: '7px 4px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: itemSource === 'jard' ? '#0369a1' : '#1e293b',
                          background: itemSource === 'jard' ? '#f0f9ff' : '#f8fafc',
                          borderColor: itemSource === 'jard' ? '#bae6fd' : '#cbd5e1',
                        }}
                        title="جهة خصم هذا البند"
                      >
                        <option value="general">📦 المخزن</option>
                        <option value="jard">📋 الجرد</option>
                      </select>

                      {/* Section Selector */}
                      <select
                        value={item.section_id || ''}
                        onChange={e => {
                          const secId = e.target.value;
                          updateSaleItem(i, 'section_id', secId);
                          if (secId) {
                            if (itemSource === 'general') {
                              const sec = sectionsList.find(s => String(s.id) === String(secId));
                              const inSec = sec?.items?.some(it => String(it.id) === String(item.inventory_id));
                              if (!inSec) updateSaleItem(i, 'inventory_id', '');
                            } else {
                              const inJardSec = jardList.some(j => String(j.id) === String(item.inventory_id) && String(j.section_id) === String(secId));
                              if (!inJardSec) updateSaleItem(i, 'inventory_id', '');
                            }
                          }
                        }}
                        style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                      >
                        <option value="">-- كل الأقسام --</option>
                        {sectionsList.map(sec => {
                          const sAvail = Number(sec.available_weight ?? (sec.total_weight - sec.issued_weight));
                          return (
                            <option key={sec.id} value={sec.id} disabled={itemSource === 'general' && sAvail <= 0}>
                              {sec.name} {sAvail <= 0 ? '(نفذ)' : `— متاح: ${sAvail.toFixed(2)} كجم`}
                            </option>
                          );
                        })}
                      </select>

                      {/* Product Selector */}
                      <select value={item.inventory_id}
                        onChange={e => {
                          const val = e.target.value;
                          updateSaleItem(i, 'inventory_id', val);
                          if (itemSource === 'jard') {
                            const jItem = jardList.find(x => String(x.id) === String(val));
                            if (jItem && !item.section_id && jItem.section_id) {
                              updateSaleItem(i, 'section_id', String(jItem.section_id));
                            }
                          } else {
                            const inv = productsForSection.find(x => String(x.sample_id) === String(val) || String(x.id) === String(val))
                              || inventoryList.find(x => String(x.sample_id) === String(val) || String(x.id) === String(val));
                            if (inv) {
                              if (inv.price_per_kg && !item.price) {
                                updateSaleItem(i, 'price', inv.price_per_kg);
                              }
                              if (!item.section_id && inv.section_id) {
                                updateSaleItem(i, 'section_id', String(inv.section_id));
                              }
                            }
                          }
                        }}
                        style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}>
                        <option value="">
                          {itemSource === 'jard'
                            ? (productsForSection.length === 0 ? '-- لا توجد أصناف متاحة بالجرد لهذا القسم --' : '-- اختر صنف الجرد --')
                            : (item.section_id && productsForSection.length === 0
                              ? '-- لا توجد أصناف مربوطة بهذا القسم --'
                              : '-- اختر الصنف / المنتج --')}
                        </option>
                        {itemSource === 'jard' ? (
                          productsForSection.map(j => (
                            <option key={j.id} value={j.id}>
                              [قسم: {j.section_name || 'عام'}] {j.product} ({j.company || 'عام'}) — المتاح: {j.available_rolls} لفة{Number(j.available_weight) > 0 ? ` | ${fmt(j.available_weight)} كجم` : ''}
                            </option>
                          ))
                        ) : (
                          productsForSection.map(inv => {
                            const w = Number(inv.total_available_weight ?? inv.available_quantity ?? inv.remaining_weight ?? 0);
                            const r = Number(inv.total_available_rolls ?? Math.max(0, Number(inv.available_rolls ?? (Number(inv.count || 0) - Number(inv.issued_rolls || 0)))));
                            const key = inv.sample_id ?? inv.id;
                            const displayLabel = item.section_id
                              ? (r > 0 ? `${inv.product} — (${r} لفة)` : inv.product)
                              : (w > 0 ? `${inv.product} — متاح: ${w.toFixed(2)} كجم | ${r} لفة` : inv.product);
                            return (
                              <option key={key} value={key}>
                                {displayLabel}
                              </option>
                            );
                          })
                        )}
                      </select>

                      <input
                        type="number"
                        placeholder={item.is_issue_only || itemSource === 'jard' ? 'الوزن (اختياري)' : 'الوزن كجم'}
                        value={item.weight}
                        min="0"
                        step="0.001"
                        onChange={e => updateSaleItem(i, 'weight', e.target.value)}
                        style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem', borderColor: (isOverWeight || isOverSecWeight) ? '#ef4444' : '#e2e8f0' }}
                      />
                      <input
                        type="number"
                        placeholder="اللفات (اختياري)"
                        value={item.rolls_count}
                        min="0"
                        onChange={e => updateSaleItem(i, 'rolls_count', e.target.value)}
                        style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem', borderColor: isOverJardRolls ? '#ef4444' : '#e2e8f0' }}
                      />
                      <input
                        type="number"
                        placeholder={item.is_issue_only || itemSource === 'jard' ? 'السعر (اختياري)' : 'السعر'}
                        value={item.price}
                        min="0"
                        step="0.01"
                        onChange={e => updateSaleItem(i, 'price', e.target.value)}
                        style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                      />
                      <button type="button" onClick={() => removeSaleItem(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                        title="حذف هذا البند">
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Issue line item toggle & option */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4, padding: '2px 4px' }}>
                      <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        color: item.is_issue_only ? '#0369a1' : '#64748b',
                        fontWeight: item.is_issue_only ? 700 : 500,
                        background: item.is_issue_only ? '#f0f9ff' : 'transparent',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: item.is_issue_only ? '1px solid #bae6fd' : '1px solid transparent',
                        transition: 'all 0.15s ease'
                      }}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.is_issue_only)}
                          onChange={e => updateSaleItem(i, 'is_issue_only', e.target.checked)}
                        />
                        <span>تسجيل كبند صرف (خروج كمية بدون سعر/وزن)</span>
                      </label>

                      {(item.is_issue_only || (itemSource === 'jard' && (!parseFloat(item.price) || !parseFloat(item.weight)))) && (
                        <span style={{ fontSize: '0.74rem', color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                          🏷️ بند صرف: إخراج {item.rolls_count > 0 ? `${item.rolls_count} لفة` : ''}{item.rolls_count > 0 && parseFloat(item.weight) > 0 ? ' و ' : ''}{parseFloat(item.weight) > 0 ? `${fmt(item.weight)} كجم` : ''}{!item.rolls_count && !parseFloat(item.weight) ? 'كمية' : ''} بدون تكلفة مالية
                        </span>
                      )}
                    </div>

                    {/* Stock & Section / Jard availability indicator & warnings */}
                    {itemSource === 'jard' && selectedJard ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4, paddingRight: 4, fontSize: '0.74rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ color: '#0284c7', fontWeight: 700 }}>
                            📋 رصيد الجرد المتاح: <strong>{selectedJard.available_rolls} لفة</strong> ({fmt(selectedJard.available_weight)} كجم)
                          </span>
                          {selectedJard.company && (
                            <span style={{ color: '#64748b' }}>[{selectedJard.company}]</span>
                          )}
                        </div>
                        {isOverJardRolls && (
                          <div style={{ color: '#dc2626', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={13} /> تحذير: عدد اللفات المطلوب ({item.rolls_count} لفة) يتجاوز رصيد الجرد المتاح ({selectedJard.available_rolls} لفة)!
                          </div>
                        )}
                      </div>
                    ) : (selectedInv || selectedSec) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4, paddingRight: 4, fontSize: '0.74rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                          {selectedSec ? (
                            <span style={{ color: '#7c3aed', fontWeight: 700 }}>
                              🏷️ رصيد قسم ({selectedSec.name}): <strong>{secAvail.toFixed(2)} كجم متاح</strong>
                            </span>
                          ) : selectedInv && (
                            <span style={{ color: '#0369a1', fontWeight: 600 }}>
                              📦 المتاح بالصنف بالمخزن: <strong>{availW.toFixed(2)} كجم</strong> ({availR} لفة)
                            </span>
                          )}
                        </div>
                        {isOverSecWeight && (
                          <div style={{ color: '#dc2626', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={13} /> خطأ: الوزن المطلوب ({item.weight} كجم) يتجاوز وزن القسم المتاح ({secAvail.toFixed(2)} كجم)! سيتم إيقاف العملية.
                          </div>
                        )}
                        {!selectedSec && isOverWeight && (
                          <span style={{ color: '#dc2626', fontWeight: 700 }}>
                            ⚠️ الوزن المدخل ({item.weight} كجم) يتجاوز المتاح بالصنف بالمخزن ({availW.toFixed(2)} كجم)!
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Returns Section (مرتجع بضاعة مع الفاتورة) ── */}
      <div style={{
        marginBottom: 16, border: '1.5px solid #fecaca', borderRadius: 10,
        background: '#fff', padding: '12px 14px',
        boxShadow: saleReturns.length > 0 ? '0 2px 8px rgba(220,38,38,0.06)' : 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: saleReturns.length > 0 ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RotateCcw size={15} color="#dc2626" />
            <span style={{ fontWeight: 800, color: '#dc2626', fontSize: '0.86rem' }}>
              مرتجع بضاعة مع الفاتورة (يُخصم من الإجمالي ويضاف للمخزن)
            </span>
            {saleReturnsTotal > 0 && (
              <span style={{
                background: '#fee2e2', color: '#dc2626',
                padding: '2px 8px', borderRadius: 6, fontSize: '0.76rem', fontWeight: 800
              }}>
                خصم: -{fmt(saleReturnsTotal)} ج.م
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={addSaleReturn}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700,
              color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6,
              padding: '4px 10px', cursor: 'pointer'
            }}
          >
            <Plus size={13} /> {saleReturns.length === 0 ? 'إضافة مرتجع بضاعة' : 'إضافة صنف مرتجع آخر'}
          </button>
        </div>

        {saleReturns.length > 0 && (
          <div className="pos-table-scroll" style={{ border: '1px solid #fed7aa', borderRadius: 8 }}>
            <div className="pos-returns-table">
              <div className="pos-returns-row" style={{
                background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '7px 10px',
                fontSize: '0.74rem', fontWeight: 700, color: '#9a3412'
              }}>
                <span>اسم الصنف المرتجع *</span>
                <span>المخزون المراد الإضافة إليه</span>
                <span>الوزن (كجم)</span>
                <span>اللفات</span>
                <span>سعر الكجم (ج)</span>
                <span>إجمالي المرتجع</span>
                <span></span>
              </div>

              {saleReturns.map((ret, idx) => (
                <div key={idx} className="pos-returns-row" style={{
                  padding: '8px 10px',
                  borderBottom: idx < saleReturns.length - 1 ? '1px solid #ffedd5' : 'none',
                  background: '#fff'
                }}>
                  <input
                    type="text"
                    placeholder="اسم الصنف المرتجع"
                    value={ret.product || ''}
                    onChange={e => updateSaleReturn(idx, 'product', e.target.value)}
                    style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                  />

                  <select
                    value={ret.inventory_id}
                    onChange={e => updateSaleReturn(idx, 'inventory_id', e.target.value)}
                    style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                  >
                    <option value="">-- اختر مخزون الإضافة --</option>
                    {inventoryList.map((inv, invIdx) => {
                      const w = Number(inv.total_available_weight ?? inv.available_quantity ?? inv.remaining_weight ?? 0);
                      const companyLabel = inv.company ? ` (${inv.company})` : '';
                      return (
                        <option key={inv.sample_id || inv.id || invIdx} value={inv.sample_id || inv.id}>
                          {inv.product}{companyLabel} {w > 0 ? `— رصيد حالي: ${w.toFixed(2)} كجم` : '— (إضافة وزيادة للمخزن)'}
                        </option>
                      );
                    })}
                  </select>

                  <input
                    type="number"
                    placeholder="الوزن"
                    step="0.001"
                    min="0"
                    value={ret.weight}
                    onChange={e => updateSaleReturn(idx, 'weight', e.target.value)}
                    style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                  />

                  <input
                    type="number"
                    placeholder="اللفات"
                    step="1"
                    min="0"
                    value={ret.rolls_count || ''}
                    onChange={e => updateSaleReturn(idx, 'rolls_count', e.target.value)}
                    style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                  />

                  <input
                    type="number"
                    placeholder="سعر الوزن"
                    step="0.01"
                    min="0"
                    value={ret.price_per_ton}
                    onChange={e => updateSaleReturn(idx, 'price_per_ton', e.target.value)}
                    style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                  />

                  <div style={{ fontWeight: 800, color: '#dc2626', fontSize: '0.84rem', textAlign: 'center' }}>
                    {fmt(ret.total)} ج
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSaleReturn(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, display: 'flex', alignItems: 'center' }}
                    title="حذف هذا المرتجع"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Excess Return Warning & Balance Option */}
        {returnExcess > 0 && (
          <div style={{
            marginTop: 10, padding: '10px 12px', background: '#fef2f2',
            border: '1.5px solid #fecaca', borderRadius: 8,
            display: 'flex', flexDirection: 'column', gap: 6
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontWeight: 800, fontSize: '0.82rem' }}>
              <AlertTriangle size={15} />
              تنبيه: قيمة المرتجع ({fmt(saleReturnsTotal)} ج.م) تتجاوز إجمالي المبيعات ({fmt(saleGrossTotal)} ج.م) بمقدار {fmt(returnExcess)} ج.م
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#1A3A5C' }}>
              <input
                type="checkbox"
                checked={addRemainingReturnToBalance}
                onChange={e => setAddRemainingReturnToBalance(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              إضافة الفارق المتبقي ({fmt(returnExcess)} ج.م) إلى رصيد العميل الدائن
            </label>
          </div>
        )}
      </div>

      {/* Payment section */}
      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b' }}>
            💳 تفاصيل السداد وطرق الدفع
          </span>
          <button
            type="button"
            onClick={() => {
              setIsMultiPayment(prev => {
                if (!prev && saleForm.paid_amount) {
                  setSalePayments([{ payment_type_id: saleForm.payment_type_id || '', amount: saleForm.paid_amount, notes: '' }]);
                }
                return !prev;
              });
            }}
            style={{
              background: isMultiPayment ? '#eff6ff' : '#fff',
              color: isMultiPayment ? '#2563eb' : '#475569',
              border: `1.5px solid ${isMultiPayment ? '#93c5fd' : '#cbd5e1'}`,
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <CreditCard size={14} />
            {isMultiPayment ? 'إلغاء التعدد (دفع موحد)' : '⚡ تعدد بنود الدفع (كاش + انستاباي + محافظ...)'}
          </button>
        </div>

        {!isMultiPayment ? (
          <div className="pos-grid-2-col">
            <div>
              <label style={labelStyle}>المبلغ المدفوع</label>
              <input type="number" placeholder="0.00" value={saleForm.paid_amount} min="0" step="0.01"
                onChange={e => setSaleForm(p => ({ ...p, paid_amount: e.target.value }))}
                style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>طريقة الدفع</label>
              <select value={saleForm.payment_type_id}
                onChange={e => setSaleForm(p => ({ ...p, payment_type_id: e.target.value }))}
                style={fieldStyle}>
                <option value="">بدون</option>
                {paymentTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 36px', gap: 8,
              background: '#f1f5f9', padding: '6px 10px', borderRadius: 6,
              fontSize: '0.75rem', fontWeight: 700, color: '#475569'
            }}>
              <span>طريقة الدفع *</span>
              <span>المبلغ (ج.م) *</span>
              <span>ملاحظات / رقم الحوالة</span>
              <span></span>
            </div>

            {salePayments.map((pRow, pIdx) => (
              <div key={pIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 2fr 36px', gap: 8, alignItems: 'center' }}>
                <select
                  value={pRow.payment_type_id}
                  onChange={e => updateSalePayment(pIdx, 'payment_type_id', e.target.value)}
                  style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                >
                  <option value="">-- اختر طريقة الدفع --</option>
                  {paymentTypes.map(pt => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>

                <input
                  type="number"
                  placeholder="المبلغ"
                  step="0.01"
                  min="0"
                  value={pRow.amount}
                  onChange={e => updateSalePayment(pIdx, 'amount', e.target.value)}
                  style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                />

                <input
                  type="text"
                  placeholder="ملاحظات الحوالة"
                  value={pRow.notes}
                  onChange={e => updateSalePayment(pIdx, 'notes', e.target.value)}
                  style={{ ...fieldStyle, padding: '7px 8px', fontSize: '0.82rem' }}
                />

                <button
                  type="button"
                  onClick={() => removeSalePayment(pIdx)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#dc2626', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="حذف هذا البند"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button
                type="button"
                onClick={addSalePayment}
                style={{
                  background: '#f8fafc', border: '1px dashed #0284c7', color: '#0284c7',
                  borderRadius: 6, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                }}
              >
                <Plus size={14} /> إضافة طريقة دفع أخرى
              </button>

              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a' }}>
                إجمالي المدفوع الموزع: <span style={{ fontSize: '0.95rem' }}>{fmt(salePaid)} ج.م</span>
              </div>
            </div>
          </div>
        )}

        {/* Bank Receipt Upload for Sales */}
        {(() => {
          const hasBank = isMultiPayment
            ? salePayments.some(p => {
              const pt = paymentTypes.find(x => String(x.id) === String(p.payment_type_id));
              return pt?.channel === 'bank';
            })
            : paymentTypes.find(p => String(p.id) === String(saleForm.payment_type_id))?.channel === 'bank';

          if (!hasBank || salePaid <= 0) return null;
          return (
            <BankReceiptUploader
              value={saleForm.receipt_image}
              onChange={(img) => setSaleForm(p => ({ ...p, receipt_image: img }))}
              label="صورة إيصال التحويل / الإيداع البنكي للمبيعات"
            />
          );
        })()}
        {/* Credit toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#475569', marginBottom: creditAvailable > 0 ? 10 : 0 }}>
          <input type="checkbox" checked={saleForm.use_customer_credit}
            onChange={e => setSaleForm(p => ({ ...p, use_customer_credit: e.target.checked }))}
            style={{ cursor: 'pointer' }} />
          استخدام رصيد العميل {creditAvailable > 0 && <span style={{ color: '#0891b2', fontWeight: 700 }}>({fmt(creditAvailable)} ج.م متاح)</span>}
        </label>
        {/* Totals Breakdown */}
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569' }}>
            <span>إجمالي المبيعات:</span><strong>{fmt(saleGrossTotal)} ج.م</strong>
          </div>

          {saleReturnsTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#dc2626', fontWeight: 700 }}>
              <span>خصم المرتجع (حاصل ضرب الوزن × سعر الوزن):</span>
              <strong>- {fmt(saleReturnsTotal)} ج.م</strong>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#0f172a', fontWeight: 700, borderTop: '1px dashed #e2e8f0', paddingTop: 4 }}>
            <span>الصافي المطلوب:</span><strong>{fmt(saleTotal)} ج.م</strong>
          </div>

          {creditUsed > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#0891b2' }}>
              <span>خصم رصيد العميل:</span><strong>- {fmt(creditUsed)} ج.م</strong>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569' }}>
            <span>المدفوع:</span><strong style={{ color: '#16a34a' }}>{fmt(salePaid)} ج.م</strong>
          </div>

          {effectiveSaleSettlement > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#b45309', fontWeight: 700 }}>
              <span>⚡ تسوية باقي الفاتورة:</span><strong style={{ color: '#b45309' }}>- {fmt(effectiveSaleSettlement)} ج.م</strong>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 800, borderTop: '1px dashed #cbd5e1', paddingTop: 6, marginTop: 2 }}>
            <span style={{ color: saleRemaining > 0 ? '#dc2626' : '#16a34a' }}>
              {saleRemaining > 0 ? 'المتبقي بعد التسوية:' : (effectiveSaleSettlement > 0 ? 'حالة الفاتورة:' : (saleRemainingBeforeSettlement < 0 ? 'زيادة:' : 'المتبقي:'))}
            </span>
            <span style={{ color: saleRemaining > 0 ? '#dc2626' : '#16a34a' }}>
              {saleRemaining > 0 ? `${fmt(saleRemaining)} ج.م` : (effectiveSaleSettlement > 0 ? '✓ تم تسوية المتبقي بالكامل (خالص)' : `${fmt(Math.abs(saleRemaining))} ج.م`)}
            </span>
          </div>

          {/* Quick Settlement Box */}
          {saleRemainingBeforeSettlement > 0 && (
            <div style={{
              background: '#fffbeb',
              border: '1.5px dashed #f59e0b',
              borderRadius: 8,
              padding: '10px 12px',
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 4 }}>
                  ⚡ تسوية المتبقي (إسقاط الكسور / الفكة):
                </span>
                <button
                  type="button"
                  onClick={() => setSaleForm(p => ({
                    ...p,
                    settlement_amount: (Number(p.settlement_amount) === Number(saleRemainingBeforeSettlement.toFixed(2)))
                      ? ''
                      : saleRemainingBeforeSettlement.toFixed(2)
                  }))}
                  style={{
                    background: (Number(saleForm.settlement_amount) === Number(saleRemainingBeforeSettlement.toFixed(2))) ? '#f59e0b' : '#fff',
                    border: '1px solid #f59e0b',
                    color: (Number(saleForm.settlement_amount) === Number(saleRemainingBeforeSettlement.toFixed(2))) ? '#fff' : '#b45309',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                >
                  {(Number(saleForm.settlement_amount) === Number(saleRemainingBeforeSettlement.toFixed(2)))
                    ? `✓ تم تسوية كامل المتبقي (${fmt(saleRemainingBeforeSettlement)} ج.م)`
                    : `تسوية كامل المتبقي (${fmt(saleRemainingBeforeSettlement)} ج.م)`}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.76rem', color: '#78350f', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  أو حدد مبلغ التسوية:
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={saleForm.settlement_amount}
                  min="0"
                  max={saleRemainingBeforeSettlement}
                  step="0.01"
                  onChange={e => setSaleForm(p => ({ ...p, settlement_amount: e.target.value }))}
                  style={{
                    flex: 1,
                    maxWidth: 140,
                    padding: '4px 8px',
                    border: '1px solid #fcd34d',
                    borderRadius: 6,
                    background: '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#92400e'
                  }}
                />
                <span style={{ fontSize: '0.76rem', color: '#92400e' }}>ج.م</span>
                {effectiveSaleSettlement > 0 && (
                  <button
                    type="button"
                    onClick={() => setSaleForm(p => ({ ...p, settlement_amount: '' }))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      marginRight: 'auto'
                    }}
                    title="إلغاء التسوية"
                  >
                    إلغاء التسوية
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>ملاحظات</label>
        <input type="text" placeholder="ملاحظات اختيارية..." value={saleForm.notes}
          onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))}
          style={fieldStyle} />
      </div>

      <button type="submit" disabled={isSubmitting}
        style={{
          width: '100%', padding: '12px', borderRadius: 10, border: 'none',
          background: isSubmitting ? '#86efac' : 'linear-gradient(135deg, #16a34a, #15803d)',
          color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: isSubmitting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.2s'
        }}>
        <ShoppingCart size={18} />
        {isSubmitting ? 'جاري التسجيل...' : 'تسجيل فاتورة المبيعات'}
      </button>
    </form>
  );
};

// ═══════════════════════════════════════════════════════════════
// Sub-form: Unified Store (المخزن: شراء وتوريد مباشر)
// ═══════════════════════════════════════════════════════════════
const UnifiedStoreForm = ({
  purchaseForm, updatePurchaseField, setPurchaseForm,
  customers, purchaseProds, invCompanies, inventoryList,
  isSubmitting, onSubmit
}) => {
  const fieldStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontFamily: 'inherit', fontSize: '0.88rem',
    background: '#f8fafc', color: '#0f172a', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

  const qty = parseFloat(purchaseForm.quantity) || 0;
  const disc = parseFloat(purchaseForm.discount) || 0;
  const netQty = Math.max(0, qty - disc);
  const count = parseInt(purchaseForm.count) || 0;
  const avgRollWeight = count > 0 && netQty > 0 ? (netQty / count).toFixed(2) : null;
  const total = parseFloat(purchaseForm.total) || 0;

  const handleSelectExisting = (e) => {
    const invId = e.target.value;
    if (!invId) return;
    const inv = inventoryList.find(x => String(x.id) === String(invId));
    if (inv) {
      setPurchaseForm(p => ({
        ...p,
        product: inv.product || '',
        company: inv.company || '',
        price_per_ton: inv.price_per_ton ? String(inv.price_per_ton) : p.price_per_ton,
        price_per_kg: inv.price_per_kg ? String(inv.price_per_kg) : p.price_per_kg,
      }));
    }
  };

  return (
    <form onSubmit={onSubmit}>
      {/* Existing item quick selector */}
      <div style={{ marginBottom: 14, padding: '10px 12px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
        <label style={{ ...labelStyle, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={14} color="#2563eb" /> توريد لصنف مسجل مسبقاً بالمخزن (اختياري لتعبئة بيانات الصنف والشركة تلقائياً):
        </label>
        <select onChange={handleSelectExisting} defaultValue="" style={{ ...fieldStyle, background: '#fff' }}>
          <option value="">-- أو أدخل صنفاً جديداً بالأسفل --</option>
          {inventoryList.map(inv => (
            <option key={inv.id} value={inv.id}>
              {inv.product} {inv.company ? `[${inv.company}]` : ''} (متاح حالياً: {Number(inv.available_quantity || inv.weight_quantity || 0).toFixed(2)} كجم)
            </option>
          ))}
        </select>
      </div>

      {/* Date & Supplier */}
      <div className="pos-grid-date-customer">
        <div>
          <label style={labelStyle}><CalendarDays size={12} style={{ marginLeft: 4 }} />التاريخ *</label>
          <input type="date" value={purchaseForm.date}
            onChange={e => updatePurchaseField('date', e.target.value)}
            style={fieldStyle} required />
        </div>
        <div>
          <PartyPicker
            type="supplier"
            customers={customers}
            value={{
              customer_id: purchaseForm.customer_id,
              customer_name: purchaseForm.customer_name,
              phone: purchaseForm.phone,
              isNewCustomer: purchaseForm.isNewCustomer,
              saveNewCustomer: purchaseForm.saveNewCustomer
            }}
            onChange={partyData => {
              setPurchaseForm(p => ({
                ...p,
                customer_id: partyData.customer_id,
                customer_name: partyData.customer_name,
                phone: partyData.phone,
                isNewCustomer: partyData.isNewCustomer,
                saveNewCustomer: partyData.saveNewCustomer,
                customer: partyData.selectedCustomer
              }));
            }}
            required={false}
            allowNone={true}
          />
        </div>
      </div>

      {/* Product, Material Type & Company */}
      <div className="pos-grid-3-col">
        <div>
          <label style={labelStyle}><Package size={12} style={{ marginLeft: 4 }} />اسم الصنف / المنتج *</label>
          <input type="text" placeholder="مثال: قطاع فضي، سكراب خردة..." value={purchaseForm.product}
            onChange={e => updatePurchaseField('product', e.target.value)}
            list="pur-products-list" style={fieldStyle} required />
          <datalist id="pur-products-list">
            {purchaseProds.map((p, i) => <option key={i} value={p} />)}
          </datalist>
        </div>
        <div>
          <label style={labelStyle}>نوع الخامة</label>
          <select
            value={purchaseForm.material_type || 'section'}
            onChange={e => updatePurchaseField('material_type', e.target.value)}
            style={{ ...fieldStyle, background: '#fff' }}
          >
            <option value="section">قطاع (ألومنيوم)</option>
            <option value="scrap">سكراب (خردة)</option>
            <option value="other">أخرى</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}><Truck size={12} style={{ marginLeft: 4 }} />الشركة / المصنع</label>
          <input type="text" placeholder="اسم الشركة أو المصنع..." value={purchaseForm.company}
            onChange={e => updatePurchaseField('company', e.target.value)}
            list="inv-companies-list" style={fieldStyle} />
          <datalist id="inv-companies-list">
            {invCompanies.map((c, i) => <option key={i} value={c} />)}
          </datalist>
        </div>
      </div>

      {/* Weight, Rolls Count, Discount */}
      <div className="pos-grid-3-equal">
        <div>
          <label style={labelStyle}>
            <Weight size={12} style={{ marginLeft: 4 }} />
            الوزن {purchaseForm.material_type === 'scrap' ? '(كجم - اختياري)' : '(كجم/طن)'}
          </label>
          <input type="number" placeholder="مثال: 250" value={purchaseForm.quantity} min="0" step="0.001"
            onChange={e => updatePurchaseField('quantity', e.target.value)}
            style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>
            <Layers size={12} style={{ marginLeft: 4 }} />
            عدد اللفات {purchaseForm.material_type === 'scrap' ? '(اختياري)' : ''}
          </label>
          <input type="number" placeholder="0" value={purchaseForm.count} min="0" step="1"
            onChange={e => updatePurchaseField('count', e.target.value)}
            style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>الخصم / العجز</label>
          <input type="number" placeholder="0" value={purchaseForm.discount} min="0" step="0.001"
            onChange={e => updatePurchaseField('discount', e.target.value)}
            style={fieldStyle} />
        </div>
      </div>

      {/* Pricing: Price Per Ton and Total */}
      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1e3a5f', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <DollarSign size={14} color="#2563eb" /> التسعير وحساب الفاتورة
        </div>
        <div className="pos-grid-2-col" style={{ marginBottom: 8 }}>
          <div>
            <label style={{ ...labelStyle, color: '#2563eb', fontWeight: 800 }}>سعر الوزن (ج.م) - اختياري</label>
            <input type="number" placeholder="مثال: 45000" value={purchaseForm.price_per_ton} min="0" step="0.01"
              onChange={e => updatePurchaseField('price_per_ton', e.target.value)}
              style={{ ...fieldStyle, borderColor: '#93c5fd', background: '#eff6ff', fontWeight: 700, fontSize: '0.95rem' }} />
          </div>
          <div>
            <label style={{ ...labelStyle, color: '#0f4c81', fontWeight: 800 }}>إجمالي الفاتورة (سعر الوزن × الوزن) *</label>
            <input type="number" placeholder="0.00" value={purchaseForm.total} min="0" step="0.01"
              onChange={e => updatePurchaseField('total', e.target.value)}
              style={{ ...fieldStyle, borderColor: '#0f4c81', background: '#f0f9ff', fontWeight: 800, fontSize: '0.95rem', color: '#0f4c81' }} required />
          </div>
        </div>

        {/* Dynamic calculation summary badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 8, borderTop: '1px dashed #cbd5e1', fontSize: '0.82rem', color: '#475569' }}>
          <div>
            صافي الوزن: <strong style={{ color: '#2563eb' }}>{fmt(netQty, 3)} طن</strong>
          </div>
          {count > 0 && (
            <div>
              عدد اللفات: <strong style={{ color: '#7c3aed' }}>{count} لفة</strong>
            </div>
          )}
          <div>
            إجمالي الفاتورة: <strong style={{ color: '#16a34a', fontSize: '0.95rem' }}>{fmt(total)} ج.م</strong>
          </div>
        </div>
      </div>

      {/* Payment Channel */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}><CreditCard size={12} style={{ marginLeft: 4 }} />طريقة الدفع (خصم من الخزينة)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {CHANNEL_OPTIONS.map(opt => (
            <ChannelBtn key={opt.value} value={opt.value}
              selected={purchaseForm.channel === opt.value}
              onChange={v => setPurchaseForm(p => ({ ...p, channel: v }))} />
          ))}
        </div>
      </div>

      {/* Bank Receipt Upload for Purchases */}
      {purchaseForm.channel === 'bank' && (
        <BankReceiptUploader
          value={purchaseForm.receipt_image}
          onChange={(img) => setPurchaseForm(p => ({ ...p, receipt_image: img }))}
          label="صورة إيصال التحويل / السداد البنكي للمشتريات"
        />
      )}

      {/* Scale Ticket Image (كارتة الميزان) */}
      <div style={{
        marginBottom: 14, padding: '10px 14px', borderRadius: 10,
        background: 'rgba(22,163,74,0.05)', border: '1.5px dashed #16a34a'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#14532d', display: 'flex', alignItems: 'center', gap: 6 }}>
            🏷️ كارتة الميزان (اختياري)
          </span>
          {purchaseForm.scale_ticket_image && (
            <button
              type="button"
              onClick={() => setPurchaseForm(p => ({ ...p, scale_ticket_image: null }))}
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
        {purchaseForm.scale_ticket_image ? (
          <div style={{ textAlign: 'center' }}>
            <img
              src={purchaseForm.scale_ticket_image}
              alt="كارتة الميزان"
              style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 8, border: '1px solid #bbf7d0', objectFit: 'contain' }}
            />
          </div>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px', borderRadius: 8, background: '#fff', border: '1px dashed #cbd5e1',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#15803d'
          }}>
            <Upload size={16} />
            انقر هنا لرفع صورة كارتة الميزان
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setPurchaseForm(p => ({ ...p, scale_ticket_image: ev.target.result }));
                reader.readAsDataURL(file);
              }}
            />
          </label>
        )}
      </div>

      {/* Purchase / Material Image (صورة البضاعة أو الفاتورة) */}
      <div style={{
        marginBottom: 14, padding: '10px 14px', borderRadius: 10,
        background: 'rgba(37,99,235,0.05)', border: '1.5px dashed #3b82f6'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
            📷 صورة البضاعة / الفاتورة عند الشراء (اختياري)
          </span>
          {purchaseForm.image_url && (
            <button
              type="button"
              onClick={() => setPurchaseForm(p => ({ ...p, image_url: null }))}
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
        {purchaseForm.image_url ? (
          <div style={{ textAlign: 'center' }}>
            <img
              src={purchaseForm.image_url}
              alt="صورة البضاعة"
              style={{ maxHeight: 140, maxWidth: '100%', borderRadius: 8, border: '1px solid #bfdbfe', objectFit: 'contain' }}
            />
          </div>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px', borderRadius: 8, background: '#fff', border: '1px dashed #cbd5e1',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#2563eb'
          }}>
            <Upload size={16} />
            انقر هنا لاختيار أو التقاط صورة البضاعة أو الفاتورة
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => setPurchaseForm(p => ({ ...p, image_url: ev.target.result }));
                reader.readAsDataURL(file);
              }}
            />
          </label>
        )}
      </div>

      {/* Add to Inventory Now */}
      <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(37,99,235,0.05)', borderRadius: 10, border: '1px solid rgba(37,99,235,0.15)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', color: '#1e40af' }}>
          <input
            type="checkbox"
            checked={purchaseForm.add_to_inventory || false}
            onChange={e => updatePurchaseField('add_to_inventory', e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          📦 إضافة هذا الصنف للمخزن الآن (أو يمكن ترحيله لاحقاً)
        </label>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>ملاحظات</label>
        <input type="text" placeholder="ملاحظات اختيارية..." value={purchaseForm.notes}
          onChange={e => updatePurchaseField('notes', e.target.value)}
          style={fieldStyle} />
      </div>

      <button type="submit" disabled={isSubmitting}
        style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none',
          background: isSubmitting ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: isSubmitting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s'
        }}>
        <Package size={18} />
        {isSubmitting ? 'جاري تسجيل الفاتورة...' : (purchaseForm.add_to_inventory ? 'تسجيل المشتريات وتوريد البضاعة للمخزن 📦' : 'تسجيل فاتورة المشتريات')}
      </button>
    </form>
  );
};

// ═══════════════════════════════════════════════════════════════
// Sub-form: Expense
// ═══════════════════════════════════════════════════════════════
const ExpenseForm = ({
  expenseForm, setExpenseForm, expenseItems, expTotal, expenseDescs,
  isMultiExpense, setIsMultiExpense, addExpenseItem, removeExpenseItem, updateExpenseItem,
  isSubmitting, onSubmit
}) => {
  const fieldStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontFamily: 'inherit', fontSize: '0.88rem',
    background: '#f8fafc', color: '#0f172a', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

  return (
    <form onSubmit={onSubmit}>
      {/* Date + Recipient */}
      <div className="pos-grid-date-customer">
        <div>
          <label style={labelStyle}><CalendarDays size={12} style={{ marginLeft: 4 }} />التاريخ</label>
          <input type="date" value={expenseForm.date}
            onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))}
            style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}><User size={12} style={{ marginLeft: 4 }} />المستلم / الجهة</label>
          <input type="text" placeholder="اسم المستلم أو الجهة..." value={expenseForm.recipient_name}
            onChange={e => setExpenseForm(p => ({ ...p, recipient_name: e.target.value }))}
            style={fieldStyle} />
        </div>
      </div>

      {/* Multi toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>البنود</label>
        <button type="button" onClick={() => setIsMultiExpense(v => !v)}
          style={{
            fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid',
            cursor: 'pointer', transition: 'all 0.18s',
            borderColor: isMultiExpense ? '#d97706' : '#e2e8f0',
            background: isMultiExpense ? '#fef3c7' : '#f8fafc',
            color: isMultiExpense ? '#d97706' : '#64748b',
            fontFamily: 'inherit'
          }}>
          {isMultiExpense ? '✓ متعدد البنود' : 'تحويل لمتعدد'}
        </button>
      </div>

      {!isMultiExpense ? (
        <div className="pos-grid-exp-desc">
          <div>
            <input type="text" placeholder="وصف المصروف..." value={expenseForm.description}
              onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))}
              list="exp-desc-list" style={fieldStyle} />
            <datalist id="exp-desc-list">
              {expenseDescs.map((d, i) => <option key={i} value={d} />)}
            </datalist>
          </div>
          <div>
            <input type="number" placeholder="المبلغ" value={expenseForm.amount} min="0" step="0.01"
              onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))}
              style={fieldStyle} />
          </div>
        </div>
      ) : (
        <div className="pos-table-scroll" style={{ border: '1.5px solid #fde68a', borderRadius: 10, marginBottom: 14 }}>
          <div className="pos-expense-items-table">
            <div className="pos-expense-items-row" style={{
              background: '#fffbeb', padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#92400e', borderBottom: '1px solid #fde68a'
            }}>
              <span>الوصف</span><span>المبلغ</span><span></span>
            </div>
            {expenseItems.map((item, i) => (
              <div key={i} className="pos-expense-items-row" style={{
                borderBottom: i < expenseItems.length - 1 ? '1px solid #fef9c3' : 'none', padding: '6px 10px'
              }}>
                <input type="text" placeholder="وصف البند..." value={item.description}
                  onChange={e => updateExpenseItem(i, 'description', e.target.value)}
                  list="exp-desc-list" style={{ ...fieldStyle, padding: '6px 8px', fontSize: '0.82rem' }} />
                <input type="number" placeholder="المبلغ" value={item.amount} min="0" step="0.01"
                  onChange={e => updateExpenseItem(i, 'amount', e.target.value)}
                  style={{ ...fieldStyle, padding: '6px 8px', fontSize: '0.82rem' }} />
                <button type="button" onClick={() => removeExpenseItem(i)}
                  disabled={expenseItems.length === 1}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div style={{ padding: '8px 10px', background: '#fffbeb', borderTop: '1px solid #fde68a' }}>
              <button type="button" onClick={addExpenseItem}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700,
                  color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit'
                }}>
                <Plus size={13} /> إضافة بند
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Total + channel */}
      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 800, color: '#92400e', marginBottom: 10 }}>
          <span>الإجمالي:</span><span>{fmt(expTotal)} ج.م</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {CHANNEL_OPTIONS.map(opt => (
            <ChannelBtn key={opt.value} value={opt.value}
              selected={expenseForm.channel === opt.value}
              onChange={v => setExpenseForm(p => ({ ...p, channel: v }))} />
          ))}
        </div>
      </div>

      {/* Bank Receipt Upload for Expenses */}
      {expenseForm.channel === 'bank' && (
        <BankReceiptUploader
          value={expenseForm.receipt_image}
          onChange={(img) => setExpenseForm(p => ({ ...p, receipt_image: img }))}
          label="صورة إيصال السداد البنكي للمصروف"
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>ملاحظات</label>
        <input type="text" placeholder="ملاحظات اختيارية..." value={expenseForm.notes}
          onChange={e => setExpenseForm(p => ({ ...p, notes: e.target.value }))}
          style={fieldStyle} />
      </div>

      <button type="submit" disabled={isSubmitting}
        style={{
          width: '100%', padding: '12px', borderRadius: 10, border: 'none',
          background: isSubmitting ? '#fcd34d' : 'linear-gradient(135deg, #d97706, #b45309)',
          color: '#fff', fontWeight: 800, fontSize: '1rem', cursor: isSubmitting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(217,119,6,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s'
        }}>
        <Receipt size={18} />
        {isSubmitting ? 'جاري التسجيل...' : 'تسجيل سند المصروفات'}
      </button>
    </form>
  );
};



// ═══════════════════════════════════════════════════════════════
// Sub-form: Customer Deposit / Settlement (إيداع عميل / تسوية)
// ═══════════════════════════════════════════════════════════════
const CustomerDepositForm = ({
  depositForm, setDepositForm,
  depositCustomer, setDepositCustomer,
  depositOutstanding, setDepositOutstanding,
  customers, paymentTypes,
  isSubmitting, onSubmit, refreshOutstanding
}) => {
  const fieldStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontFamily: 'inherit', fontSize: '0.88rem',
    background: '#f8fafc', color: '#0f172a', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

  const currentParty = depositCustomer || customers.find(c => String(c.id) === String(depositForm.customer_id));
  const debt = depositOutstanding?.total_debt !== undefined
    ? Number(depositOutstanding.total_debt)
    : Math.max(0, Number(currentParty?.customer_total ?? currentParty?.remaining_balance ?? 0));
  const currentCredit = Number(currentParty?.total_payments ?? currentParty?.current_credit ?? 0);

  const depositAmt = parseFloat(depositForm.amount) || 0;
  const offsetAmt = depositForm.apply_debt_offset ? Math.min(debt, depositAmt) : 0;
  const creditAmt = depositAmt - offsetAmt;
  const remainingDebt = Math.max(0, debt - offsetAmt);

  const hasCustomer = depositForm.isNewCustomer
    ? Boolean(depositForm.customer_name?.trim())
    : Boolean(depositForm.customer_id);

  const isValid = hasCustomer && depositAmt > 0 && Boolean(depositForm.payment_type_id);

  const handleQuickAmount = (val) => {
    setDepositForm(p => ({ ...p, amount: String(val) }));
  };

  const handlePayFullDebt = () => {
    if (debt > 0) {
      setDepositForm(p => ({
        ...p,
        amount: String(debt),
        apply_debt_offset: true,
      }));
    }
  };

  return (
    <form onSubmit={onSubmit}>
      {/* ── 1. Customer Selection using PartyPicker (List + New + Instant) ── */}
      <div style={{ marginBottom: 16 }}>
        <PartyPicker
          type="customer"
          customers={customers}
          value={{
            customer_id: depositForm.customer_id,
            customer_name: depositForm.customer_name,
            phone: depositForm.phone,
            isNewCustomer: depositForm.isNewCustomer,
            saveNewCustomer: depositForm.saveNewCustomer
          }}
          onChange={async (partyData) => {
            setDepositForm(p => ({
              ...p,
              customer_id: partyData.customer_id,
              customer_name: partyData.customer_name,
              phone: partyData.phone,
              isNewCustomer: partyData.isNewCustomer,
              saveNewCustomer: partyData.saveNewCustomer,
            }));
            setDepositCustomer(partyData.selectedCustomer || null);
            if (partyData.customer_id) {
              try {
                await refreshOutstanding(partyData.customer_id);
              } catch (err) {
                console.error(err);
              }
            } else {
              setDepositOutstanding(null);
            }
          }}
          required={true}
        />
      </div>

      {/* ── 2. Customer Financial Status Card (when existing customer selected) ── */}
      {currentParty && !depositForm.isNewCustomer && (
        <div style={{
          marginBottom: 16,
          padding: '12px 14px',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          border: '1.5px solid #bae6fd',
          borderRadius: 12,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#0891b2', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '0.95rem'
            }}>
              {currentParty.name?.charAt(0) || 'ع'}
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                {currentParty.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {currentParty.phone ? `📞 ${currentParty.phone}` : 'عميل مسجل'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'center', background: '#fff', padding: '6px 12px', borderRadius: 8, border: '1px solid #bae6fd' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>الرصيد الدائن الحالي</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0891b2' }}>
                {fmt(currentCredit)} ج.م
              </div>
            </div>

            <div style={{ textAlign: 'center', background: '#fff', padding: '6px 12px', borderRadius: 8, border: `1px solid ${debt > 0 ? '#fecaca' : '#bbf7d0'}` }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>المديونية المستحقة</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: debt > 0 ? '#dc2626' : '#16a34a' }}>
                {debt > 0 ? `${fmt(debt)} ج.م` : 'لا توجد'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Info for New / Instant Customer ── */}
      {depositForm.isNewCustomer && depositForm.customer_name && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          background: depositForm.saveNewCustomer ? '#f0fdf4' : '#fffbeb',
          border: `1.5px solid ${depositForm.saveNewCustomer ? '#bbf7d0' : '#fde68a'}`,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '0.82rem'
        }}>
          {depositForm.saveNewCustomer ? (
            <>
              <CheckCircle size={16} color="#16a34a" />
              <span style={{ color: '#166534', fontWeight: 600 }}>
                سيتم إضافة العميل <strong>"{depositForm.customer_name}"</strong> إلى قاعدة البيانات وإيداع المبلغ المالي في رصيده.
              </span>
            </>
          ) : (
            <>
              <Zap size={16} color="#d97706" />
              <span style={{ color: '#92400e', fontWeight: 600 }}>
                إيداع لحظي/نقدي باسم <strong>"{depositForm.customer_name}"</strong> دون حفظ في سجل العملاء الدائمين.
              </span>
            </>
          )}
        </div>
      )}

      {/* ── 3. Outstanding Unpaid Invoices Table (if customer has debt) ── */}
      {depositOutstanding && depositOutstanding.invoices?.length > 0 && (
        <div style={{
          marginBottom: 16,
          background: '#fff7ed',
          border: '1.5px solid #fed7aa',
          borderRadius: 10,
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '9px 14px',
            background: '#ffedd5',
            borderBottom: '1px solid #fed7aa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c2410c' }}>
              ⚠️ فواتير مبيعات معلقة لم تسدد ({depositOutstanding.invoices.length})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#dc2626' }}>
                إجمالي الدين: {fmt(debt)} ج.م
              </span>
              <button
                type="button"
                onClick={handlePayFullDebt}
                style={{
                  background: '#ea580c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '3px 9px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
              >
                سداد كامل الدين بالمقاصة
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 180 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fff7ed' }}>
                <tr>
                  {['رقم الفاتورة', 'التاريخ', 'إجمالي الفاتورة', 'المسدد سابقاً', 'المتبقي'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'right', color: '#9a3412', fontWeight: 700, borderBottom: '1px solid #fed7aa' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depositOutstanding.invoices.map((inv, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #fed7aa', background: i % 2 === 0 ? '#fff' : '#fffaf5' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0f172a' }}>#{inv.invoice_number}</td>
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>{inv.date ? format(new Date(inv.date), 'yyyy/MM/dd') : '-'}</td>
                    <td style={{ padding: '6px 10px' }}>{fmt(inv.invoice_amount)} ج.م</td>
                    <td style={{ padding: '6px 10px', color: '#16a34a' }}>{fmt(inv.paid_amount)} ج.م</td>
                    <td style={{ padding: '6px 10px', color: '#dc2626', fontWeight: 800 }}>{fmt(inv.remaining)} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. Date & Amount Row ── */}
      <div className="pos-grid-date-customer">
        <div>
          <label style={labelStyle}><CalendarDays size={12} style={{ marginLeft: 4 }} />تاريخ الإيداع *</label>
          <input
            type="date"
            value={depositForm.date}
            onChange={e => setDepositForm(p => ({ ...p, date: e.target.value }))}
            style={fieldStyle}
            required
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              <DollarSign size={12} style={{ marginLeft: 4 }} />المبلغ المودع (ج.م) *
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[500, 1000, 2000, 5000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  style={{
                    background: '#f1f5f9', border: '1px solid #cbd5e1',
                    borderRadius: 4, padding: '1px 6px', fontSize: '0.72rem',
                    color: '#475569', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            placeholder="0.00"
            value={depositForm.amount}
            min="0.01"
            step="0.01"
            onChange={e => setDepositForm(p => ({ ...p, amount: e.target.value }))}
            style={{ ...fieldStyle, fontSize: '1.15rem', fontWeight: 800, color: '#0891b2' }}
            required
          />
        </div>
      </div>

      {/* ── 5. Payment Type / Method ── */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}><CreditCard size={12} style={{ marginLeft: 4 }} />طريقة الإيداع / الخزينة *</label>
        <select
          value={depositForm.payment_type_id}
          onChange={e => setDepositForm(p => ({ ...p, payment_type_id: e.target.value }))}
          style={fieldStyle}
          required
        >
          <option value="">-- اختر وسيلة الدفع / الإيداع --</option>
          {paymentTypes.map(pt => (
            <option key={pt.id} value={pt.id}>
              {pt.name} {pt.channel ? `(${pt.channel === 'cash' ? 'نقدي' : pt.channel === 'wallet' ? 'محفظة' : pt.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي'})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Bank Receipt Upload for Customer Deposit */}
      {(() => {
        const selectedPT = paymentTypes.find(p => String(p.id) === String(depositForm.payment_type_id));
        const isBank = selectedPT?.channel === 'bank';
        if (!isBank) return null;
        return (
          <BankReceiptUploader
            value={depositForm.receipt_image}
            onChange={(img) => setDepositForm(p => ({ ...p, receipt_image: img }))}
            label="صورة إيصال الإيداع البنكي في حساب العميل"
          />
        );
      })()}

      {/* ── 6. Debt Clearing Toggle (only when customer has debt) ── */}
      {debt > 0 && (
        <div style={{
          marginBottom: 14,
          padding: '12px 14px',
          background: depositForm.apply_debt_offset ? '#fef3c7' : '#f8fafc',
          border: `1.5px solid ${depositForm.apply_debt_offset ? '#f59e0b' : '#e2e8f0'}`,
          borderRadius: 10,
          transition: 'all 0.2s'
        }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={depositForm.apply_debt_offset}
              onChange={e => setDepositForm(p => ({ ...p, apply_debt_offset: e.target.checked }))}
              style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer', accentColor: '#ea580c' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: depositForm.apply_debt_offset ? '#92400e' : '#1e293b' }}>
                تطبيق المقاصة لتسوية الفواتير المستحقة ({fmt(debt)} ج.م)
              </div>
              <div style={{ fontSize: '0.78rem', color: depositForm.apply_debt_offset ? '#b45309' : '#64748b', marginTop: 2 }}>
                {depositForm.apply_debt_offset ? (
                  <>
                    سيتم سداد <strong>{fmt(offsetAmt)} ج.م</strong> من الفواتير المعلقة،
                    {creditAmt > 0 && <> وسيُضاف المتبقي <strong>{fmt(creditAmt)} ج.م</strong> كرصيد دائن لحساب العميل.</>}
                    {creditAmt === 0 && remainingDebt > 0 && <> والمتبقي من المديونية: <strong>{fmt(remainingDebt)} ج.م</strong>.</>}
                  </>
                ) : (
                  <>
                    غير مفعل: سيُضاف كامل المبلغ (<strong>{fmt(depositAmt)} ج.م</strong>) كرصيد دائن في حساب العميل مباشرة دون تسوية الفواتير المعلقة.
                  </>
                )}
              </div>
            </div>
          </label>
        </div>
      )}

      {/* ── 7. Operation Summary Card ── */}
      {depositAmt > 0 && (
        <div style={{
          marginBottom: 14,
          background: '#f8fafc',
          border: '1.5px solid #e2e8f0',
          borderRadius: 10,
          padding: '12px 14px'
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={14} color="#0891b2" /> ملخص أثر الإيداع
          </div>
          <div style={{ display: 'grid', gap: 6, fontSize: '0.84rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>إجمالي المبلغ المودع للخزينة:</span>
              <strong style={{ color: '#0891b2' }}>{fmt(depositAmt)} ج.م</strong>
            </div>

            {depositForm.apply_debt_offset && offsetAmt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d97706' }}>
                <span>تسوية الفواتير المعلقة (مقاصة):</span>
                <strong>- {fmt(offsetAmt)} ج.م</strong>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: 6, marginTop: 2 }}>
              <span style={{ color: '#16a34a', fontWeight: 700 }}>الرصيد الدائن المضاف لحساب العميل:</span>
              <strong style={{ color: '#16a34a', fontSize: '0.95rem' }}>+ {fmt(creditAmt)} ج.م</strong>
            </div>

            {debt > 0 && depositForm.apply_debt_offset && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ color: '#64748b' }}>المديونية المتبقية بعد المقاصة:</span>
                <strong style={{ color: remainingDebt > 0 ? '#dc2626' : '#16a34a' }}>
                  {remainingDebt > 0 ? `${fmt(remainingDebt)} ج.م` : '✅ تم سداد كامل المديونية'}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 8. Notes ── */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>ملاحظات الإيداع (اختياري)</label>
        <input
          type="text"
          placeholder="مثال: إيداع دفعة تحت الحساب، تحويل بنكي، الخ..."
          value={depositForm.notes}
          onChange={e => setDepositForm(p => ({ ...p, notes: e.target.value }))}
          style={fieldStyle}
        />
      </div>

      {/* ── 9. Submit Button ── */}
      <button
        type="submit"
        disabled={isSubmitting || !isValid}
        style={{
          width: '100%',
          padding: '13px',
          borderRadius: 10,
          border: 'none',
          background: !isValid || isSubmitting
            ? '#cbd5e1'
            : 'linear-gradient(135deg, #0891b2, #0e7490)',
          color: '#fff',
          fontWeight: 800,
          fontSize: '0.98rem',
          cursor: !isValid || isSubmitting ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: !isValid || isSubmitting ? 'none' : '0 4px 16px rgba(8,145,178,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'all 0.2s ease',
        }}
      >
        <ArrowDownCircle size={18} />
        {isSubmitting ? 'جاري تسجيل الإيداع...' : 'تسجيل الإيداع في رصيد العميل'}
      </button>
    </form>
  );
};

// ── Custody Form Component in POS ────────────────────────────────
const CustodyForm = ({
  custodyForm, setCustodyForm,
  custodyPersons, custodyPersonInfo,
  isCheckingCustody, checkCustodyPerson,
  paymentTypes, isSubmitting, onSubmit
}) => {
  const fieldStyle = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontFamily: 'inherit', fontSize: '0.88rem',
    background: '#f8fafc', color: '#0f172a', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

  const isDisb = custodyForm.type === 'disbursement';
  const amountNum = parseFloat(custodyForm.amount) || 0;

  const handleQuickAmount = (val) => {
    setCustodyForm(p => ({ ...p, amount: String((parseFloat(p.amount) || 0) + val) }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustodyForm(p => ({ ...p, receipt_image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      {/* ── 1. Type Switcher: تسليم عهدة (صرف) vs استلام عهدة (سداد) ── */}
      <div className="pos-grid-2-col" style={{
        background: '#f1f5f9', padding: 4, borderRadius: 10, marginBottom: 16
      }}>
        <button
          type="button"
          onClick={() => setCustodyForm(p => ({ ...p, type: 'disbursement' }))}
          style={{
            padding: '10px 14px', borderRadius: 8, border: 'none',
            background: isDisb ? '#ea580c' : 'transparent',
            color: isDisb ? '#fff' : '#475569',
            fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.15s'
          }}
        >
          <ArrowUpRight size={16} /> تسليم عهدة (صرف للشخص)
        </button>
        <button
          type="button"
          onClick={() => setCustodyForm(p => ({ ...p, type: 'collection' }))}
          style={{
            padding: '10px 14px', borderRadius: 8, border: 'none',
            background: !isDisb ? '#16a34a' : 'transparent',
            color: !isDisb ? '#fff' : '#475569',
            fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.15s'
          }}
        >
          <ArrowDownLeft size={16} /> استلام عهدة (سداد / توريد)
        </button>
      </div>

      {/* ── 2. Person Name & Balance Indicator ── */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>
          <User size={12} style={{ marginLeft: 4 }} /> اسم الشخص المستلم / المسلم للعهدة *
        </label>
        <input
          type="text"
          list="pos-custody-persons"
          placeholder="اكتب أو اختر اسم الشخص..."
          value={custodyForm.person_name}
          onChange={(e) => {
            const val = e.target.value;
            setCustodyForm(p => ({ ...p, person_name: val }));
            checkCustodyPerson(val);
          }}
          style={fieldStyle}
          required
        />
        <datalist id="pos-custody-persons">
          {custodyPersons.map(p => (
            <option key={p.person_name} value={p.person_name}>
              {p.person_name} ({p.balance > 0 ? `عليه: ${fmt(p.balance)} ج.م` : p.balance === 0 ? 'خالص' : `له: ${fmt(Math.abs(p.balance))} ج.م`})
            </option>
          ))}
        </datalist>

        {/* Real-time Person Balance Indicator */}
        {isCheckingCustody ? (
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>جاري التحقق من رصيد الشخص...</div>
        ) : custodyPersonInfo ? (
          <div style={{ marginTop: 8 }}>
            {custodyPersonInfo.status === 'owing' && (
              <div style={{
                background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca',
                padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={16} />
                  <span>الشخص معه عهدة سابقة:</span>
                </div>
                <span style={{ fontSize: '1rem', fontWeight: 800 }}>{fmt(custodyPersonInfo.balance)} ج.م</span>
              </div>
            )}

            {custodyPersonInfo.status === 'settled' && (
              <div style={{
                background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0',
                padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <CheckCircle size={16} />
                <span>خالص الرصيد (لا توجد عليه أي مبالغ عهد متبقية)</span>
              </div>
            )}

            {custodyPersonInfo.status === 'credit' && (
              <div style={{
                background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe',
                padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={16} />
                  <span>الشخص دائن (له رصيد سابق):</span>
                </div>
                <span style={{ fontSize: '1rem', fontWeight: 800 }}>{fmt(Math.abs(custodyPersonInfo.balance))} ج.م</span>
              </div>
            )}

            {custodyPersonInfo.status === 'new' && (
              <div style={{
                background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe',
                padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <Star size={16} />
                <span>✨ شخص جديد (سيتم فتح حساب عهدة جديد ومتابعته بالنظام)</span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── 3. Date & Amount ── */}
      <div className="pos-grid-date-customer">
        <div>
          <label style={labelStyle}><CalendarDays size={12} style={{ marginLeft: 4 }} />التاريخ *</label>
          <input
            type="date"
            value={custodyForm.date}
            onChange={e => setCustodyForm(p => ({ ...p, date: e.target.value }))}
            style={fieldStyle}
            required
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              <DollarSign size={12} style={{ marginLeft: 4 }} />مبلغ العهدة (ج.م) *
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[500, 1000, 2000, 5000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  style={{
                    background: '#f1f5f9', border: '1px solid #cbd5e1',
                    borderRadius: 4, padding: '1px 6px', fontSize: '0.72rem',
                    color: '#475569', cursor: 'pointer', fontWeight: 600
                  }}
                >
                  +{val}
                </button>
              ))}
            </div>
          </div>
          <input
            type="number"
            placeholder="0.00"
            value={custodyForm.amount}
            min="0.01"
            step="0.01"
            onChange={e => setCustodyForm(p => ({ ...p, amount: e.target.value }))}
            style={{ ...fieldStyle, fontSize: '1.15rem', fontWeight: 800, color: isDisb ? '#ea580c' : '#16a34a' }}
            required
          />
        </div>
      </div>

      {/* ── 4. Phone & Receipt Number ── */}
      <div className="pos-grid-2-col">
        <div>
          <label style={labelStyle}>رقم هاتف الشخص (اختياري)</label>
          <input
            type="text"
            placeholder="01xxxxxxxxx"
            value={custodyForm.phone}
            onChange={e => setCustodyForm(p => ({ ...p, phone: e.target.value }))}
            style={fieldStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>رقم السند (تلقائي إن ترك فارغاً)</label>
          <input
            type="text"
            placeholder={isDisb ? 'CSD-0001' : 'CSC-0001'}
            value={custodyForm.receipt_number}
            onChange={e => setCustodyForm(p => ({ ...p, receipt_number: e.target.value }))}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* ── 5. Payment Type / Channel ── */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}><CreditCard size={12} style={{ marginLeft: 4 }} />طريقة الدفع / الصرف للخزينة *</label>
        <select
          value={custodyForm.payment_type_id}
          onChange={e => {
            const pt = paymentTypes.find(p => String(p.id) === e.target.value);
            setCustodyForm(p => ({
              ...p,
              payment_type_id: e.target.value,
              channel: pt?.channel || 'cash'
            }));
          }}
          style={fieldStyle}
        >
          <option value="">-- نقدي (كاش - افتراضي) --</option>
          {paymentTypes.map(pt => (
            <option key={pt.id} value={pt.id}>
              {pt.name} {pt.channel ? `(${pt.channel === 'cash' ? 'نقدي' : pt.channel === 'wallet' ? 'محفظة' : pt.channel === 'bank' ? 'إيداع بنكي' : 'انستاباي'})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* ── 6. Receipt Image Upload ── */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}><Upload size={12} style={{ marginLeft: 4 }} />صورة إيصال / سند العهدة (اختياري)</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          style={fieldStyle}
        />
      </div>

      {/* ── 7. Notes ── */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>ملاحظات / الغرض من العهدة</label>
        <input
          type="text"
          placeholder="مثال: عهدة شراء بضاعة، عهدة مصاريف سفر، رد باقي عهدة..."
          value={custodyForm.notes}
          onChange={e => setCustodyForm(p => ({ ...p, notes: e.target.value }))}
          style={fieldStyle}
        />
      </div>

      {/* ── 8. Submit Button ── */}
      <button
        type="submit"
        disabled={isSubmitting || !custodyForm.person_name || amountNum <= 0}
        style={{
          width: '100%',
          padding: '13px',
          borderRadius: 10,
          border: 'none',
          background: isSubmitting || !custodyForm.person_name || amountNum <= 0
            ? '#cbd5e1'
            : (isDisb ? 'linear-gradient(135deg, #ea580c, #c2410c)' : 'linear-gradient(135deg, #16a34a, #15803d)'),
          color: '#fff',
          fontWeight: 800,
          fontSize: '0.98rem',
          cursor: isSubmitting || !custodyForm.person_name || amountNum <= 0 ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: isSubmitting || !custodyForm.person_name || amountNum <= 0
            ? 'none'
            : (isDisb ? '0 4px 16px rgba(234,88,12,0.3)' : '0 4px 16px rgba(22,163,74,0.3)'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'all 0.2s ease',
        }}
      >
        {isDisb ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
        {isSubmitting
          ? 'جاري الحفظ...'
          : isDisb
            ? `تسليم عهدة بمبلغ ${fmt(amountNum)} ج.م`
            : `استلام عهدة بمبلغ ${fmt(amountNum)} ج.م`}
      </button>
    </form>
  );
};

export default POSPage;


