import { useState, useEffect, useCallback } from 'react';
import {
  Edit, Plus, Trash2, AlertTriangle, Banknote, Wallet, Smartphone,
  Printer, Landmark, Eye, X, HandCoins, ArrowUpRight, ArrowDownLeft, ArrowLeftRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { treasuryService } from '../../services/treasury.service';
import { customerService } from '../../services/customer.service';
import custodyService from '../../services/custody.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import PrintableReceiptVoucher from '../../components/treasury/PrintableReceiptVoucher';

const TreasuryPage = () => {
  const [treasury, setTreasury] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [channelBalances, setChannelBalances] = useState({ cash: 0, wallet: 0, instapay: 0, bank: 0 });
  const [loading, setLoading] = useState(true);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [treasuryToDelete, setTreasuryToDelete] = useState(null);

  // Debt Offset Modal (المقاصة)
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtInfo, setDebtInfo] = useState({ invoices: [], total_debt: 0 });
  const [pendingPayload, setPendingPayload] = useState(null);

  // Print Receipt Voucher
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedRecordForPrint, setSelectedRecordForPrint] = useState(null);

  // Bank Receipt Preview Modal
  const [selectedReceiptModal, setSelectedReceiptModal] = useState(null);
  const [selectedChannelTab, setSelectedChannelTab] = useState('');

  // Main Treasury Tab (Treasury vs Custody vs Channel Transfers)
  const [mainTab, setMainTab] = useState('treasury'); // 'treasury' | 'custody' | 'channel_transfers'
  const [custodyRecords, setCustodyRecords] = useState([]);
  const [custodySummary, setCustodySummary] = useState(null);
  const [custodyLoading, setCustodyLoading] = useState(false);

  // Channel Transfers state
  const [isChannelTransferModalOpen, setIsChannelTransferModalOpen] = useState(false);
  const [channelTransferForm, setChannelTransferForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    from_channel: 'cash',
    to_channel: 'instapay',
    amount: '',
    notes: '',
  });
  const [channelTransfers, setChannelTransfers] = useState([]);
  const [loadingChannelTransfers, setLoadingChannelTransfers] = useState(false);
  const [channelTransferToDelete, setChannelTransferToDelete] = useState(null);
  const [isConfirmDeleteChannelTransferOpen, setIsConfirmDeleteChannelTransferOpen] = useState(false);

  const fetchChannelTransfers = useCallback(async (params = {}) => {
    setLoadingChannelTransfers(true);
    try {
      const res = await treasuryService.getChannelTransfers(params);
      setChannelTransfers(res.data?.transfers || []);
    } catch {
      toast.error('حدث خطأ أثناء تحميل سجل التحويلات');
    } finally {
      setLoadingChannelTransfers(false);
    }
  }, []);

  const handleChannelTransferSubmit = async (e) => {
    e.preventDefault();
    if (!channelTransferForm.from_channel || !channelTransferForm.to_channel) {
      return toast.error('يرجى تحديد قناة التحويل (من وإلى)');
    }
    if (channelTransferForm.from_channel === channelTransferForm.to_channel) {
      return toast.error('لا يمكن التحويل لنفس القناة');
    }
    const amt = parseFloat(channelTransferForm.amount);
    if (!amt || amt <= 0) {
      return toast.error('أدخل مبلغ صحيح أكبر من الصفر');
    }
    const available = Number(channelBalances[channelTransferForm.from_channel] || 0);
    if (amt > available) {
      return toast.error(`المبلغ المطلوب (${amt.toFixed(2)} ج.م) أكبر من الرصيد المتاح (${available.toFixed(2)} ج.م)`);
    }

    setIsSubmitting(true);
    try {
      await treasuryService.addChannelTransfer({
        ...channelTransferForm,
        amount: amt,
      });
      toast.success('تم تحويل المبلغ بين القنوات بنجاح');
      setIsChannelTransferModalOpen(false);
      setChannelTransferForm({
        date: format(new Date(), 'yyyy-MM-dd'),
        from_channel: 'cash',
        to_channel: 'instapay',
        amount: '',
        notes: '',
      });
      fetchData();
      fetchChannelTransfers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء التحويل');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteChannelTransfer = async () => {
    if (!channelTransferToDelete) return;
    try {
      await treasuryService.deleteChannelTransfer(channelTransferToDelete.id);
      toast.success('تم حذف حركة التحويل وإعادة ضبط الأرصدة بنجاح');
      setIsConfirmDeleteChannelTransferOpen(false);
      setChannelTransferToDelete(null);
      fetchData();
      fetchChannelTransfers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء الحذف');
    }
  };

  const fetchCustodyData = useCallback(async (params = {}) => {
    setCustodyLoading(true);
    try {
      const res = await custodyService.getCustodies(params);
      setCustodyRecords(res.data?.custodies || []);
      setCustodySummary(res.data?.summary || null);
    } catch {
      toast.error('حدث خطأ أثناء تحميل بيانات العهد');
    } finally {
      setCustodyLoading(false);
    }
  }, []);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    isNewCustomer: false,
    saveNewCustomer: true,
    payment_type_id: '',
    amount: '',
    notes: '',
    receipt_image: null
  });

  const [newTypeName, setNewTypeName] = useState('');

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const mergedParams = { ...params };
      if (selectedChannelTab && !('channel' in mergedParams)) {
        mergedParams.channel = selectedChannelTab;
      }
      const res = await treasuryService.getTreasury(mergedParams);
      setTreasury(res.data.treasury);
      setCurrentBalance(res.data.currentBalance);
      if (res.data.channelBalances) setChannelBalances(res.data.channelBalances);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب الخزينة');
    } finally {
      setLoading(false);
    }
  }, [selectedChannelTab]);

  const handleChannelChange = (ch) => {
    setSelectedChannelTab(ch);
    fetchData(ch ? { channel: ch } : { channel: '' });
  };

  const fetchDropdowns = async () => {
    try {
      const [custRes, typeRes] = await Promise.all([
        customerService.getCustomers({ limit: 1000 }),
        treasuryService.getPaymentTypes()
      ]);
      setCustomers(custRes.data.customers);
      setPaymentTypes(typeRes.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDropdowns();
    fetchChannelTransfers();
  }, [fetchData, fetchChannelTransfers]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        customer_id: item.customer_id || '',
        customer_name: '',
        customer_phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        payment_type_id: item.payment_type_id || '',
        amount: item.amount,
        notes: item.notes || '',
        receipt_image: item.receipt_image || null
      });
    } else {
      setEditingItem(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        customer_id: '',
        customer_name: '',
        customer_phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        payment_type_id: '',
        amount: '',
        notes: '',
        receipt_image: null
      });
    }
    setIsModalOpen(true);
  };

  // ── Execute the actual API call ──────────────────────────────────────────
  const executeSubmit = async (payload) => {
    setIsSubmitting(true);
    try {
      if (editingItem) {
        await treasuryService.updateTreasury(editingItem.id, payload);
        toast.success('تم تحديث الحركة بنجاح');
      } else {
        await treasuryService.addTreasury(payload);
        toast.success('تم إضافة الحركة بنجاح');
        if (formData.isNewCustomer) fetchDropdowns();
      }
      setIsModalOpen(false);
      setDebtModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
      setPendingPayload(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.payment_type_id || !formData.amount) {
      return toast.error('التاريخ ونوع الدفع والمبلغ مطلوبة');
    }

    if (formData.isNewCustomer && !formData.customer_name.trim()) {
      return toast.error('يرجى إدخال اسم العميل الجديد');
    }

    const payload = {
      ...formData,
      amount: Number(formData.amount),
      apply_debt_offset: false,
    };

    if (formData.isNewCustomer) {
      delete payload.customer_id;
    } else {
      delete payload.customer_name;
      delete payload.customer_phone;
    }
    delete payload.isNewCustomer;

    // Check outstanding invoices only for existing customers on new entries
    if (!editingItem && formData.customer_id) {
      try {
        const res = await customerService.getOutstandingInvoices(formData.customer_id);
        const outstanding = res.data;
        if (outstanding.invoices && outstanding.invoices.length > 0 && outstanding.total_debt > 0) {
          setDebtInfo(outstanding);
          setPendingPayload(payload);
          setDebtModalOpen(true);
          return;
        }
      } catch (err) {
        console.error('Failed to check outstanding invoices', err);
      }
    }

    await executeSubmit(payload);
  };

  const handleDeleteClick = (id) => {
    setTreasuryToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!treasuryToDelete) return;
    try {
      await treasuryService.deleteTreasury(treasuryToDelete);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setTreasuryToDelete(null);
    }
  };

  const handleAddPaymentType = async (e) => {
    e.preventDefault();
    if (!newTypeName.trim()) return toast.error('أدخل اسم النوع');
    try {
      await treasuryService.addPaymentType(newTypeName);
      toast.success('تم إضافة نوع الدفع');
      setNewTypeName('');
      setIsTypeModalOpen(false);
      fetchDropdowns();
    } catch (error) {
      toast.error('حدث خطأ أثناء الإضافة');
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'customer_name', label: 'العميل', render: (row) => row.customer_name || '—' },
    { key: 'payment_type', label: 'نوع الدفع' },
    {
      key: 'channel',
      label: 'القناة',
      render: (row) => {
        const ch = row.channel || 'cash';
        const labels = { cash: 'نقدي (كاش)', wallet: 'محفظة', instapay: 'انستاباي', bank: 'إيداع بنكي' };
        const colors = { cash: '#16a34a', wallet: '#9333ea', instapay: '#2563eb', bank: '#d97706' };
        const bgs = { cash: '#dcfce7', wallet: '#f3e8ff', instapay: '#dbeafe', bank: '#fef3c7' };
        return (
          <span style={{
            display: 'inline-block',
            background: bgs[ch] || '#f1f5f9',
            color: colors[ch] || '#334155',
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: '0.78rem',
            fontWeight: 700
          }}>
            {labels[ch] || ch}
          </span>
        );
      }
    },
    {
      key: 'amount',
      label: 'المبلغ (إيداع)',
      sum: true,
      renderSummary: (t) => <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{t.toFixed(2)} ج.م</span>,
      render: (row) => <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>{Number(row.amount).toFixed(2)}</span>
    },
    {
      key: 'receipt_image',
      label: 'إيصال البنك',
      render: (row) => row.receipt_image ? (
        <button
          type="button"
          onClick={() => setSelectedReceiptModal(row.receipt_image)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
            borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 700
          }}
          title="عرض صورة إيصال الإيداع البنكي"
        >
          <Eye size={13} /> عرض الإيصال
        </button>
      ) : '—'
    },
    { key: 'notes', label: 'ملاحظات', render: (row) => row.notes || '—' }
  ];

  const renderActions = (row) => (
    <>
      <button
        className="btn btn-icon btn-ghost"
        onClick={() => { setSelectedRecordForPrint(row); setIsPrintModalOpen(true); }}
        title="طباعة سند القبض"
        style={{ color: '#16a34a' }}
      >
        <Printer size={16} />
      </button>
      <button className="btn btn-icon btn-ghost" onClick={() => handleOpenModal(row)} title="تعديل">
        <Edit size={16} />
      </button>
      <button className="btn btn-icon btn-ghost" onClick={() => handleDeleteClick(row.id)} style={{ color: 'var(--danger)' }} title="حذف">
        <Trash2 size={16} />
      </button>
    </>
  );

  const filterConfig = [
    {
      key: 'channel',
      label: 'قناة الإيداع',
      type: 'select',
      options: [
        { label: 'كل القنوات', value: '' },
        { label: 'نقدي (كاش)', value: 'cash' },
        { label: 'محفظة إلكترونية', value: 'wallet' },
        { label: 'انستاباي', value: 'instapay' },
        { label: 'إيداع بنكي', value: 'bank' }
      ]
    },
    {
      key: 'payment_type_id',
      label: 'نوع الدفع',
      type: 'multi-select',
      options: paymentTypes.map(p => ({ label: p.name, value: p.id }))
    },
    {
      key: 'customer_id',
      label: 'العميل',
      type: 'multi-select',
      options: customers.map(c => ({ label: c.name, value: c.id }))
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range'
    }
  ];

  const channelTransferColumns = [
    {
      key: 'date',
      label: 'التاريخ',
      render: (row) => format(new Date(row.date), 'yyyy/MM/dd'),
    },
    {
      key: 'from_channel',
      label: 'محوّل من (الخصم)',
      render: (row) => {
        const labels = { cash: 'نقدي (كاش)', wallet: 'محفظة إلكترونية', instapay: 'انستاباي', bank: 'إيداع بنكي' };
        return (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: '0.82rem',
              fontWeight: 700,
              background: '#fee2e2',
              color: '#dc2626',
              display: 'inline-block',
            }}
          >
            {labels[row.from_channel] || row.from_channel}
          </span>
        );
      },
    },
    {
      key: 'to_channel',
      label: 'محوّل إلى (الإيداع)',
      render: (row) => {
        const labels = { cash: 'نقدي (كاش)', wallet: 'محفظة إلكترونية', instapay: 'انستاباي', bank: 'إيداع بنكي' };
        return (
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: '0.82rem',
              fontWeight: 700,
              background: '#f0fdf4',
              color: '#16a34a',
              display: 'inline-block',
            }}
          >
            {labels[row.to_channel] || row.to_channel}
          </span>
        );
      },
    },
    {
      key: 'amount',
      label: 'المبلغ المحوّل',
      sum: true,
      renderSummary: (t) => <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{t.toFixed(2)} ج.م</span>,
      render: (row) => (
        <span style={{ fontWeight: 800, color: '#2563eb', fontSize: '0.95rem' }}>
          {Number(row.amount).toFixed(2)} ج.م
        </span>
      ),
    },
    {
      key: 'notes',
      label: 'ملاحظات / بيان التحويل',
      render: (row) => row.notes || '—',
    },
  ];

  const renderChannelTransferActions = (row) => (
    <button
      className="btn btn-icon btn-ghost"
      onClick={() => {
        setChannelTransferToDelete(row);
        setIsConfirmDeleteChannelTransferOpen(true);
      }}
      style={{ color: 'var(--danger)' }}
      title="حذف حركة التحويل وإعادة ضبط الأرصدة"
    >
      <Trash2 size={16} />
    </button>
  );

  return (
    <>
      {/* Balance Summary Cards - Interactive with Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Total Balance */}
        <div
          className="card"
          onClick={() => handleChannelChange('')}
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%)',
            color: 'white', gridColumn: 'span 1', cursor: 'pointer',
            border: selectedChannelTab === '' ? '3px solid #facc15' : '1px solid transparent',
            transform: selectedChannelTab === '' ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s', boxShadow: selectedChannelTab === '' ? '0 8px 24px rgba(79,70,229,0.35)' : 'none'
          }}
          title="عرض جميع حركات الخزينة"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>إجمالي رصيد الخزينة</span>
            {selectedChannelTab === '' && <span style={{ fontSize: '0.7rem', background: '#facc15', color: '#1e1b4b', padding: '1px 6px', borderRadius: 4, fontWeight: 800 }}>محدد</span>}
          </div>
          <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{Number(currentBalance).toFixed(2)}</span>
          <span style={{ fontSize: '0.8rem', opacity: 0.8 }}> ج.م</span>
        </div>

        {/* Cash Channel */}
        <div
          className="card"
          onClick={() => handleChannelChange('cash')}
          style={{
            padding: '20px 24px', cursor: 'pointer',
            border: selectedChannelTab === 'cash' ? '3px solid #22c55e' : '1px solid var(--border-color)',
            transform: selectedChannelTab === 'cash' ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s', background: selectedChannelTab === 'cash' ? 'rgba(34,197,94,0.05)' : undefined
          }}
          title="تصفية حركات الكاش النقدي"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(34,197,94,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#22c55e'
              }}>
                <Banknote size={18} />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>نقدي (كاش)</span>
            </div>
            {selectedChannelTab === 'cash' && <span style={{ fontSize: '0.7rem', background: '#22c55e', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>محدد</span>}
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#22c55e' }}>
            {Number(channelBalances.cash).toFixed(2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
          </div>
        </div>

        {/* Wallet Channel */}
        <div
          className="card"
          onClick={() => handleChannelChange('wallet')}
          style={{
            padding: '20px 24px', cursor: 'pointer',
            border: selectedChannelTab === 'wallet' ? '3px solid #a855f7' : '1px solid var(--border-color)',
            transform: selectedChannelTab === 'wallet' ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s', background: selectedChannelTab === 'wallet' ? 'rgba(168,85,247,0.05)' : undefined
          }}
          title="تصفية حركات المحفظة الإلكترونية"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(168,85,247,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#a855f7'
              }}>
                <Wallet size={18} />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>محفظة إلكترونية</span>
            </div>
            {selectedChannelTab === 'wallet' && <span style={{ fontSize: '0.7rem', background: '#a855f7', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>محدد</span>}
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#a855f7' }}>
            {Number(channelBalances.wallet).toFixed(2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
          </div>
        </div>

        {/* Instapay Channel */}
        <div
          className="card"
          onClick={() => handleChannelChange('instapay')}
          style={{
            padding: '20px 24px', cursor: 'pointer',
            border: selectedChannelTab === 'instapay' ? '3px solid #3b82f6' : '1px solid var(--border-color)',
            transform: selectedChannelTab === 'instapay' ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s', background: selectedChannelTab === 'instapay' ? 'rgba(59,130,246,0.05)' : undefined
          }}
          title="تصفية حركات انستاباي"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(59,130,246,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#3b82f6'
              }}>
                <Smartphone size={18} />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>انستاباي</span>
            </div>
            {selectedChannelTab === 'instapay' && <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>محدد</span>}
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#3b82f6' }}>
            {Number(channelBalances.instapay).toFixed(2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
          </div>
        </div>

        {/* Bank Deposit Channel */}
        <div
          className="card"
          onClick={() => handleChannelChange('bank')}
          style={{
            padding: '20px 24px', cursor: 'pointer',
            border: selectedChannelTab === 'bank' ? '3px solid #d97706' : '1px solid var(--border-color)',
            transform: selectedChannelTab === 'bank' ? 'scale(1.02)' : 'none',
            transition: 'all 0.2s', background: selectedChannelTab === 'bank' ? 'rgba(217,119,6,0.05)' : undefined
          }}
          title="تصفية حركات الإيداع البنكي"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(217,119,6,0.14)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#92400e'
              }}>
                <Landmark size={18} />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>إيداع بنكي</span>
            </div>
            {selectedChannelTab === 'bank' && <span style={{ fontSize: '0.7rem', background: '#d97706', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>محدد</span>}
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#92400e' }}>
            {Number(channelBalances.bank).toFixed(2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
          </div>
        </div>
      </div>

      {/* Main Tab Switcher: Treasury Receipts vs Custodies vs Channel Transfers */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setMainTab('treasury')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            background: mainTab === 'treasury' ? 'var(--primary)' : '#f1f5f9',
            color: mainTab === 'treasury' ? '#fff' : '#475569',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: mainTab === 'treasury' ? '0 4px 12px rgba(26,58,92,0.2)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <Landmark size={18} />
          <span>حركات الخزينة (سندات القبض)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMainTab('channel_transfers');
            fetchChannelTransfers();
          }}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            background: mainTab === 'channel_transfers' ? '#2563eb' : '#f1f5f9',
            color: mainTab === 'channel_transfers' ? '#fff' : '#475569',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: mainTab === 'channel_transfers' ? '0 4px 12px rgba(37,99,235,0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <ArrowLeftRight size={18} />
          <span>سجل التحويل بين الأنواع ({channelTransfers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMainTab('custody');
            fetchCustodyData();
          }}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            background: mainTab === 'custody' ? '#8b5cf6' : '#f1f5f9',
            color: mainTab === 'custody' ? '#fff' : '#475569',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: mainTab === 'custody' ? '0 4px 12px rgba(139,92,246,0.25)' : 'none',
            transition: 'all 0.15s'
          }}
        >
          <HandCoins size={18} />
          <span>حركات العهد المالية ({custodyRecords.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setIsChannelTransferModalOpen(true)}
          style={{
            marginRight: 'auto',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: '0.9rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(37,99,235,0.25)'
          }}
        >
          <ArrowLeftRight size={16} />
          <span>تحويل فلوس بين الأنواع</span>
        </button>
      </div>

      {mainTab === 'treasury' && (
        <>
          {/* Quick Channel Filter Tabs */}
          <div style={{
            display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap',
            background: '#fff', padding: '10px 14px', borderRadius: '12px',
            border: '1px solid var(--border-color)', boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', marginLeft: 8 }}>
              عرض حسب القناة:
            </span>
            {[
              { value: '', label: 'الكل (جميع الحركات)' },
              { value: 'cash', label: 'نقدي (كاش)', icon: Banknote, color: '#16a34a' },
              { value: 'wallet', label: 'محفظة إلكترونية', icon: Wallet, color: '#9333ea' },
              { value: 'instapay', label: 'انستاباي', icon: Smartphone, color: '#2563eb' },
              { value: 'bank', label: 'إيداع بنكي', icon: Landmark, color: '#d97706' },
            ].map(t => {
              const Icon = t.icon;
              const isActive = selectedChannelTab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => handleChannelChange(t.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8,
                    border: isActive ? '2px solid #1A3A5C' : '1px solid #e2e8f0',
                    background: isActive ? '#1A3A5C' : '#f8fafc',
                    color: isActive ? '#fff' : '#334155',
                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {Icon && <Icon size={14} color={isActive ? '#fff' : t.color} />}
                  {t.label}
                </button>
              );
            })}
          </div>

          <DataTable
            title="حركات الخزينة الواردة"
            columns={columns}
            data={treasury}
            loading={loading}
            filterConfig={filterConfig}
            onFilter={fetchData}
            onAdd={() => handleOpenModal()}
            actions={renderActions}
          />
        </>
      )}

      {mainTab === 'custody' && (
        <>
          {/* Custody Mini-Summary */}
          {custodySummary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
              <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowUpRight size={20} color="#ea580c" />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>إجمالي المنصرف كعهد</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ea580c' }}>{Number(custodySummary.total_disbursed || 0).toFixed(2)} ج.م</div>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArrowDownLeft size={20} color="#16a34a" />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>إجمالي المسترد من العهد</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#16a34a' }}>{Number(custodySummary.total_collected || 0).toFixed(2)} ج.م</div>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <HandCoins size={20} color="#8b5cf6" />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>صافي العهد المتبقية طرف الأشخاص</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7c3aed' }}>{Number(custodySummary.net_outstanding || 0).toFixed(2)} ج.م</div>
                </div>
              </div>
            </div>
          )}

          <DataTable
            title="حركات العهد المالية (صرف واسترداد)"
            columns={[
              { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
              { key: 'receipt_number', label: 'رقم السند', render: (row) => <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{row.receipt_number || `#${row.id}`}</span> },
              { key: 'person_name', label: 'اسم الشخص', render: (row) => <div><div style={{ fontWeight: 700 }}>{row.person_name}</div>{row.phone && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.phone}</div>}</div> },
              {
                key: 'type', label: 'نوع الحركة',
                render: (row) => row.type === 'disbursement' ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: 20, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                    <ArrowUpRight size={12} /> صرف عهدة
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                    <ArrowDownLeft size={12} /> استرداد عهدة
                  </span>
                )
              },
              {
                key: 'amount', label: 'المبلغ', sum: true,
                renderSummary: (t) => `${Number(t || 0).toFixed(2)} ج.م`,
                render: (row) => <span style={{ fontWeight: 700, color: row.type === 'disbursement' ? '#ea580c' : '#16a34a' }}>{Number(row.amount).toFixed(2)} ج.م</span>
              },
              {
                key: 'channel', label: 'طريقة الدفع',
                render: (row) => {
                  const ch = row.effective_channel || row.channel || 'cash';
                  const labels = { cash: 'نقدي (كاش)', wallet: 'محفظة', instapay: 'انستاباي', bank: 'بنك' };
                  return labels[ch] || ch;
                }
              },
              { key: 'notes', label: 'ملاحظات', render: (row) => row.notes || '-' },
              {
                key: 'receipt_image', label: 'المرفق',
                render: (row) => row.receipt_image ? (
                  <button type="button" onClick={() => setSelectedReceiptModal(row.receipt_image)} style={{ background: '#e0e7ff', color: '#4338ca', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Eye size={12} /> عرض
                  </button>
                ) : '-'
              }
            ]}
            data={custodyRecords}
            loading={custodyLoading}
            filterConfig={[
              { key: 'search', label: 'بحث', type: 'text', placeholder: 'ابحث باسم الشخص، رقم السند...' },
              { key: 'type', label: 'نوع الحركة', type: 'select', options: [{ label: 'صرف عهدة', value: 'disbursement' }, { label: 'استرداد عهدة', value: 'collection' }] },
              { key: 'channel', label: 'طريقة الدفع', type: 'select', options: [{ label: 'نقدي (كاش)', value: 'cash' }, { label: 'محفظة إلكترونية', value: 'wallet' }, { label: 'انستاباي', value: 'instapay' }, { label: 'إيداع بنكي', value: 'bank' }] },
              { key: 'date', label: 'الفترة الزمنية', type: 'date-range' }
            ]}
            onFilter={fetchCustodyData}
          />
        </>
      )}

      {/* ==================== TAB: CHANNEL TRANSFERS ==================== */}
      {mainTab === 'channel_transfers' && (
        <DataTable
          title="سجل التحويلات بين قنوات الدفع (الأنواع)"
          columns={channelTransferColumns}
          data={channelTransfers}
          loading={loadingChannelTransfers}
          onFilter={fetchChannelTransfers}
          onAdd={() => setIsChannelTransferModalOpen(true)}
          actions={renderChannelTransferActions}
        />
      )}

      {/* Main Treasury Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'تعديل إيداع خزينة' : 'إضافة إيداع للخزينة'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">التاريخ *</label>
            <input type="date" className="form-input" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">العميل (اختياري - في حال سداد المديونية)</label>
            {!editingItem && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  id="treasuryNewCustomer"
                  checked={formData.isNewCustomer}
                  onChange={(e) => setFormData({ ...formData, isNewCustomer: e.target.checked, customer_id: '', customer_name: '', customer_phone: '' })}
                />
                <label htmlFor="treasuryNewCustomer" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>عميل جديد؟</label>
              </div>
            )}

            {formData.isNewCustomer && !editingItem ? (
              <>
                <input
                  type="text"
                  className="form-input"
                  placeholder="أدخل اسم العميل الجديد"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  autoFocus
                />
                <input
                  type="text"
                  className="form-input"
                  placeholder="رقم الهاتف (اختياري)"
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  style={{ marginTop: '8px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="checkbox"
                    id="saveNewCustomerTreasury"
                    checked={formData.saveNewCustomer}
                    onChange={(e) => setFormData({ ...formData, saveNewCustomer: e.target.checked })}
                  />
                  <label htmlFor="saveNewCustomerTreasury" className="form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>حفظ العميل في السجل الدائم</label>
                </div>
              </>
            ) : (
              <select className="form-select" value={formData.customer_id} onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })} disabled={!!editingItem}>
                <option value="">-- بدون عميل محدد --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>نوع الدفع *</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsTypeModalOpen(true)}>
                <Plus size={14} /> إضافة نوع جديد
              </button>
            </div>
            <select className="form-select" value={formData.payment_type_id} onChange={(e) => setFormData({ ...formData, payment_type_id: e.target.value })}>
              <option value="">-- اختر نوع الدفع --</option>
              {paymentTypes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Receipt Image Upload - shown when bank channel selected */}
          {(() => {
            const selectedPT = paymentTypes.find(p => String(p.id) === String(formData.payment_type_id));
            const isBank = selectedPT?.channel === 'bank';
            if (!isBank) return null;
            return (
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Landmark size={14} />
                  صورة إيصال الإيداع البنكي
                </label>
                {formData.receipt_image ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={formData.receipt_image}
                      alt="إيصال الإيداع"
                      style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, border: '2px solid #d97706', objectFit: 'contain', display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(p => ({ ...p, receipt_image: null }))}
                      style={{
                        position: 'absolute', top: 4, left: 4,
                        background: '#dc2626', color: '#fff', border: 'none',
                        borderRadius: '50%', width: 24, height: 24, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    border: '2px dashed #d97706', borderRadius: 10, padding: '20px',
                    cursor: 'pointer', background: 'rgba(217,119,6,0.06)', color: '#92400e',
                    fontWeight: 600, fontSize: '0.88rem'
                  }}>
                    <Landmark size={18} />
                    انقر لرفع صورة إيصال البنك
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setFormData(p => ({ ...p, receipt_image: ev.target.result }));
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })()}

          <div className="form-group">
            <label className="form-label">المبلغ *</label>
            <input type="number" step="0.01" min="0" className="form-input" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea className="form-textarea" rows="2" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}></textarea>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>حفظ</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      {/* Payment Type Modal */}
      <Modal isOpen={isTypeModalOpen} onClose={() => setIsTypeModalOpen(false)} title="إضافة نوع دفع جديد">
        <form onSubmit={handleAddPaymentType}>
          <div className="form-group">
            <label className="form-label">اسم نوع الدفع (مثال: فودافون كاش) *</label>
            <input type="text" className="form-input" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>حفظ</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsTypeModalOpen(false)}>إلغاء</button>
          </div>
        </form>
      </Modal>

      {/* ── Debt Offset Modal (المقاصة) ─────────────────────────────────────── */}
      {debtModalOpen && pendingPayload && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '16px', padding: '28px',
            width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div style={{
                background: 'rgba(245,158,11,0.15)', borderRadius: '50%',
                width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <AlertTriangle size={24} color="#f59e0b" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>تنبيه: يوجد دين غير مسدد</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  هذا العميل لديه فواتير مبيعات غير مسددة
                </p>
              </div>
            </div>

            {/* Summary */}
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '10px', padding: '14px 18px', marginBottom: '20px',
              display: 'flex', gap: '32px', flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>إجمالي الدين</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f59e0b' }}>
                  {Number(debtInfo.total_debt).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>قيمة الإيداع</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                  {Number(pendingPayload?.amount || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ما سيتم مقاصته</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--success)' }}>
                  {Math.min(Number(debtInfo.total_debt), Number(pendingPayload?.amount || 0)).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>رصيد للعميل بعدها</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {Math.max(0, Number(pendingPayload?.amount || 0) - Number(debtInfo.total_debt)).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Invoices Table */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                الفواتير الغير مسددة ({debtInfo.invoices.length} فاتورة)
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {['رقم الفاتورة', 'التاريخ', 'إجمالي الفاتورة', 'المدفوع', 'المتبقي'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {debtInfo.invoices.map((inv, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 12px' }}>#{inv.invoice_number}</td>
                        <td style={{ padding: '8px 12px' }}>{format(new Date(inv.date), 'yyyy/MM/dd')}</td>
                        <td style={{ padding: '8px 12px' }}>{Number(inv.invoice_amount).toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--success)' }}>{Number(inv.paid_amount).toFixed(2)}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--danger)', fontWeight: 'bold' }}>{Number(inv.remaining).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, minWidth: '180px' }}
                disabled={isSubmitting}
                onClick={() => executeSubmit({ ...pendingPayload, apply_debt_offset: true })}
              >
                ✅ تطبيق المقاصة والحفظ
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, minWidth: '180px', border: '1px solid var(--border-color)' }}
                disabled={isSubmitting}
                onClick={() => executeSubmit({ ...pendingPayload, apply_debt_offset: false })}
              >
                متابعة بدون مقاصة
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, minWidth: '120px', color: 'var(--danger)' }}
                disabled={isSubmitting}
                onClick={() => { setDebtModalOpen(false); setPendingPayload(null); }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setTreasuryToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذه الحركة؟"
      />

      {/* Printable Receipt Voucher */}
      <PrintableReceiptVoucher
        isOpen={isPrintModalOpen}
        onClose={() => { setIsPrintModalOpen(false); setSelectedRecordForPrint(null); }}
        record={selectedRecordForPrint}
      />

      {/* Channel Transfer Modal */}
      <Modal
        isOpen={isChannelTransferModalOpen}
        onClose={() => setIsChannelTransferModalOpen(false)}
        title="تحويل رصيد بين طرق الدفع / الخزائن"
      >
        <form onSubmit={handleChannelTransferSubmit}>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#1e40af' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>💡 تنويه التحويل بين القنوات:</div>
            <div>
              سيتم خصم المبلغ من القناة المحوِّل منها وإضافته للقناة المحوَّل إليها مباشرة في أرصدة التابات.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">التاريخ *</label>
              <input
                type="date"
                className="form-input"
                value={channelTransferForm.date}
                onChange={(e) => setChannelTransferForm(prev => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">المبلغ المراد تحويله (ج.م) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="0.00"
                value={channelTransferForm.amount}
                onChange={(e) => setChannelTransferForm(prev => ({ ...prev, amount: e.target.value }))}
                required
                style={{ fontWeight: 700, fontSize: '1.05rem', color: '#2563eb' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label">تحويل من (الخصم) *</label>
              <select
                className="form-input"
                value={channelTransferForm.from_channel}
                onChange={(e) => {
                  const newFrom = e.target.value;
                  setChannelTransferForm(prev => ({
                    ...prev,
                    from_channel: newFrom,
                    to_channel: prev.to_channel === newFrom ? (newFrom === 'cash' ? 'instapay' : 'cash') : prev.to_channel
                  }));
                }}
                required
              >
                <option value="cash">نقدي / كاش (المتاح: {Number(channelBalances.cash || 0).toFixed(2)} ج.م)</option>
                <option value="wallet">محفظة إلكترونية (المتاح: {Number(channelBalances.wallet || 0).toFixed(2)} ج.م)</option>
                <option value="instapay">انستاباي (المتاح: {Number(channelBalances.instapay || 0).toFixed(2)} ج.م)</option>
                <option value="bank">إيداع بنكي (المتاح: {Number(channelBalances.bank || 0).toFixed(2)} ج.م)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">تحويل إلى (الإيداع) *</label>
              <select
                className="form-input"
                value={channelTransferForm.to_channel}
                onChange={(e) => setChannelTransferForm(prev => ({ ...prev, to_channel: e.target.value }))}
                required
              >
                {['cash', 'wallet', 'instapay', 'bank']
                  .filter(ch => ch !== channelTransferForm.from_channel)
                  .map(ch => {
                    const labels = { cash: 'نقدي (كاش)', wallet: 'محفظة إلكترونية', instapay: 'انستاباي', bank: 'إيداع بنكي' };
                    return (
                      <option key={ch} value={ch}>
                        {labels[ch]} (الحالي: {Number(channelBalances[ch] || 0).toFixed(2)} ج.م)
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">ملاحظات / بيان التحويل</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: تحويل من الكاش لتغذية المحفظة أو انستاباي..."
              value={channelTransferForm.notes}
              onChange={(e) => setChannelTransferForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsChannelTransferModalOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ background: '#2563eb', borderColor: '#2563eb' }}
            >
              {isSubmitting ? 'جاري التحويل...' : 'تأكيد تحويل الرصيد'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Channel Transfer */}
      <ConfirmModal
        isOpen={isConfirmDeleteChannelTransferOpen}
        onClose={() => {
          setIsConfirmDeleteChannelTransferOpen(false);
          setChannelTransferToDelete(null);
        }}
        onConfirm={confirmDeleteChannelTransfer}
        title="تأكيد حذف حركة التحويل"
        message={`هل أنت متأكد من حذف حركة تحويل مبلغ ${Number(channelTransferToDelete?.amount || 0).toFixed(2)} ج.م بين القنوات؟ سيتم إعادة الأرصدة تلقائياً.`}
        confirmText="نعم، حذف وإعادة الرصيد"
        cancelText="إلغاء"
        type="danger"
      />

      {/* Receipt Image Preview Modal */}
      {selectedReceiptModal && (
        <Modal isOpen={Boolean(selectedReceiptModal)} onClose={() => setSelectedReceiptModal(null)} title="صورة إيصال الإيداع البنكي">
          <div style={{ textAlign: 'center', padding: '10px' }}>
            <img
              src={selectedReceiptModal}
              alt="إيصال الإيداع البنكي"
              style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }}
            />
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSelectedReceiptModal(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default TreasuryPage;