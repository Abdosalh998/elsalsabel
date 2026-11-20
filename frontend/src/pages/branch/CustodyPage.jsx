import { useState, useEffect, useCallback } from 'react';
import {
  HandCoins, Plus, ArrowUpRight, ArrowDownLeft, Eye, X,
  Trash2, Edit, Printer, Search, Users, Wallet, CheckCircle2,
  AlertCircle, Clock, Calendar, Smartphone, Banknote, Landmark,
  FileText, ArrowLeftRight, MinusCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import custodyService from '../../services/custody.service';
import { treasuryService } from '../../services/treasury.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import PrintableCustodyVoucher from '../../components/custody/PrintableCustodyVoucher';
import PrintableCustodyStatement from '../../components/custody/PrintableCustodyStatement';
import PrintableCustodyTransfers from '../../components/custody/PrintableCustodyTransfers';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const EMPTY_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  person_name: '',
  phone: '',
  type: 'disbursement', // 'disbursement' (تسليم/صرف) or 'collection' (استلام/رد)
  amount: '',
  payment_type_id: '',
  channel: 'cash',
  receipt_number: '',
  receipt_image: null,
  notes: '',
};

const CustodyPage = () => {
  const [activeTab, setActiveTab] = useState('persons'); // 'persons', 'records', 'transfers'
  const [custodies, setCustodies] = useState([]);
  const [persons, setPersons] = useState([]);
  const [summary, setSummary] = useState(null);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Transfers state
  const [transfers, setTransfers] = useState([]);
  const [transfersSummary, setTransfersSummary] = useState({});
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [isTransfersPrintOpen, setIsTransfersPrintOpen] = useState(false);
  const [transferToDelete, setTransferToDelete] = useState(null);
  const [isConfirmDeleteTransferOpen, setIsConfirmDeleteTransferOpen] = useState(false);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isConfirmDeletePersonOpen, setIsConfirmDeletePersonOpen] = useState(false);
  const [personToDelete, setPersonToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deduction Modal State
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false);
  const [deductionForm, setDeductionForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    person_name: '',
    phone: '',
    amount: '',
    item_description: '',
    receipt_number: '',
    notes: '',
  });

  // Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState(null);
  const [transferForm, setTransferForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    from_person: '',
    to_person: '',
    amount: '',
    receipt_number: '',
    notes: '',
  });

  // Statement Modal
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Print Modals
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [isStatementPrintOpen, setIsStatementPrintOpen] = useState(false);

  // Image Preview Modal
  const [previewImage, setPreviewImage] = useState(null);

  // Form State
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [personBalanceInfo, setPersonBalanceInfo] = useState(null);

  // Fetch custody list and summary
  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await custodyService.getCustodies(params);
      setCustodies(res.data?.custodies || []);
      setSummary(res.data?.summary || null);
    } catch {
      toast.error('حدث خطأ أثناء تحميل بيانات العهد');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch persons summary
  const fetchPersons = useCallback(async (search = '') => {
    try {
      const res = await custodyService.getPersonsSummary({ search });
      setPersons(res.data || []);
    } catch (err) {
      console.error('Error fetching persons summary:', err);
    }
  }, []);

  // Fetch custody transfers
  const fetchTransfers = useCallback(async (params = {}) => {
    setLoadingTransfers(true);
    try {
      const res = await custodyService.getCustodyTransfers(params);
      setTransfers(res.data?.transfers || []);
      setTransfersSummary(res.data?.summary || {});
    } catch {
      toast.error('حدث خطأ أثناء تحميل تحويلات العهد');
    } finally {
      setLoadingTransfers(false);
    }
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchData();
    fetchPersons();
    fetchTransfers();
    treasuryService.getPaymentTypes().then((res) => {
      setPaymentTypes(res.data || []);
    }).catch(console.error);
  }, [fetchData, fetchPersons, fetchTransfers]);

  // Check balance when person_name changes in modal form
  const handlePersonNameChange = async (name) => {
    setFormData((prev) => ({ ...prev, person_name: name }));
    if (!name || name.trim().length < 2) {
      setPersonBalanceInfo(null);
      return;
    }
    try {
      const res = await custodyService.getPersonBalance(name.trim());
      setPersonBalanceInfo(res.data);
      if (res.data?.phone && !formData.phone) {
        setFormData((prev) => ({ ...prev, phone: res.data.phone }));
      }
    } catch {
      setPersonBalanceInfo(null);
    }
  };

  // Handle image upload
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, receipt_image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Open Add Modal
  const handleOpenAddModal = (defaultType = 'disbursement', personName = '') => {
    setEditingItem(null);
    setFormData({
      ...EMPTY_FORM,
      type: defaultType,
      person_name: personName,
    });
    setPersonBalanceInfo(null);
    setIsModalOpen(true);
    if (personName) {
      handlePersonNameChange(personName);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      date: format(new Date(item.date), 'yyyy-MM-dd'),
      person_name: item.person_name,
      phone: item.phone || '',
      type: item.type,
      amount: item.amount,
      payment_type_id: item.payment_type_id || '',
      channel: item.channel || 'cash',
      receipt_number: item.receipt_number || '',
      receipt_image: item.receipt_image || null,
      notes: item.notes || '',
    });
    handlePersonNameChange(item.person_name);
    setIsModalOpen(true);
  };

  // Submit Modal Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.person_name.trim()) {
      toast.error('يرجى إدخال اسم الشخص');
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        await custodyService.updateCustody(editingItem.id, formData);
        toast.success('تم تحديث حركة العهدة بنجاح');
      } else {
        const res = await custodyService.addCustody(formData);
        toast.success(
          formData.type === 'disbursement'
            ? 'تم تسجيل صرف/تسليم العهدة بنجاح'
            : 'تم تسجيل استلام/سداد العهدة بنجاح'
        );
        // Automatically open printable voucher/invoice for the new custody movement
        if (res?.data) {
          const pt = paymentTypes.find((p) => String(p.id) === String(formData.payment_type_id));
          setSelectedVoucher({
            ...res.data,
            payment_type_name: pt?.name || (formData.channel === 'wallet' ? 'محفظة إلكترونية' : formData.channel === 'instapay' ? 'انستاباي' : 'نقدي'),
          });
          setIsVoucherModalOpen(true);
        }
      }
      setIsModalOpen(false);
      fetchData();
      fetchPersons();
      fetchTransfers();
      if (statementModalOpen && selectedStatement?.person_name) {
        handleOpenStatement(selectedStatement.person_name);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ الحركة');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Action
  const handleDelete = async () => {
    if (!itemToDelete) return;
    setIsSubmitting(true);
    try {
      await custodyService.deleteCustody(itemToDelete.id);
      toast.success('تم حذف حركة العهدة بنجاح');
      setIsConfirmDeleteOpen(false);
      setItemToDelete(null);
      fetchData();
      fetchPersons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Person and his entire account statement
  const handleDeletePerson = async () => {
    if (!personToDelete) return;
    setIsSubmitting(true);
    try {
      await custodyService.deletePerson(personToDelete.person_name);
      toast.success(`تم حذف الشخص "${personToDelete.person_name}" وكافة حركات كشف حسابه بنجاح`);
      setIsConfirmDeletePersonOpen(false);
      setPersonToDelete(null);
      fetchPersons();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حذف الشخص');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Deduction Modal
  const handleOpenDeductionModal = (personName = '', phone = '') => {
    setDeductionForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      person_name: personName,
      phone: phone || '',
      amount: '',
      item_description: '',
      receipt_number: '',
      notes: '',
    });
    setIsDeductionModalOpen(true);
  };

  // Submit Deduction
  const handleDeductionSubmit = async (e) => {
    e.preventDefault();
    if (!deductionForm.person_name.trim()) return toast.error('اسم الشخص مطلوب');
    if (!deductionForm.item_description.trim()) return toast.error('بند الصرف (بيان التطريح) مطلوب');
    if (!deductionForm.amount || parseFloat(deductionForm.amount) <= 0) {
      return toast.error('أدخل مبلغ صحيح أكبر من الصفر');
    }

    setIsSubmitting(true);
    try {
      await custodyService.addDeduction({
        ...deductionForm,
        amount: parseFloat(deductionForm.amount),
      });
      toast.success('تم تسجيل التطريح من العهدة بنجاح');
      setIsDeductionModalOpen(false);
      fetchData();
      fetchPersons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تسجيل التطريح');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Transfer Modal
  const handleOpenTransferModal = (transferItem = null, fromPerson = '') => {
    if (transferItem && transferItem.id) {
      setEditingTransfer(transferItem);
      setTransferForm({
        date: transferItem.date ? format(new Date(transferItem.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        from_person: transferItem.from_person || '',
        to_person: transferItem.to_person || '',
        amount: transferItem.amount || '',
        receipt_number: transferItem.receipt_number || '',
        notes: transferItem.notes || '',
      });
    } else {
      setEditingTransfer(null);
      setTransferForm({
        date: format(new Date(), 'yyyy-MM-dd'),
        from_person: fromPerson || '',
        to_person: '',
        amount: '',
        receipt_number: '',
        notes: '',
      });
    }
    setIsTransferModalOpen(true);
  };

  // Submit Custody Transfer
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferForm.from_person.trim()) return toast.error('حدد الطرف المحول منه');
    if (!transferForm.to_person.trim()) return toast.error('حدد الطرف المستلم');
    if (transferForm.from_person.trim().toLowerCase() === transferForm.to_person.trim().toLowerCase()) {
      return toast.error('لا يمكن التحويل لنفس الشخص');
    }
    if (!transferForm.amount || parseFloat(transferForm.amount) <= 0) {
      return toast.error('أدخل مبلغ صحيح أكبر من الصفر');
    }

    setIsSubmitting(true);
    try {
      if (editingTransfer) {
        await custodyService.updateCustodyTransfer(editingTransfer.id, {
          ...transferForm,
          amount: parseFloat(transferForm.amount),
        });
        toast.success('تم تحديث حركة التحويل والمبلغ بنجاح');
      } else {
        await custodyService.addCustodyTransfer({
          ...transferForm,
          amount: parseFloat(transferForm.amount),
        });
        toast.success('تم تحويل العهدة بنجاح');
      }
      setIsTransferModalOpen(false);
      setEditingTransfer(null);
      fetchData();
      fetchPersons();
      fetchTransfers();
      if (statementModalOpen && selectedStatement?.person_name) {
        handleOpenStatement(selectedStatement.person_name);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ التحويل');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Custody Transfer
  const handleDeleteTransfer = (row) => {
    setTransferToDelete(row);
    setIsConfirmDeleteTransferOpen(true);
  };

  const confirmDeleteTransfer = async () => {
    if (!transferToDelete) return;
    setIsSubmitting(true);
    try {
      await custodyService.deleteCustodyTransfer(transferToDelete.id);
      toast.success('تم حذف حركة التحويل وإعادة الأرصدة بنجاح');
      setIsConfirmDeleteTransferOpen(false);
      setTransferToDelete(null);
      fetchTransfers();
      fetchData();
      fetchPersons();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Person Statement Modal
  const handleOpenStatement = async (personName) => {
    setLoadingStatement(true);
    setStatementModalOpen(true);
    try {
      const res = await custodyService.getPersonStatement(personName);
      setSelectedStatement(res.data);
    } catch {
      toast.error('حدث خطأ أثناء تحميل كشف الحساب');
      setStatementModalOpen(false);
    } finally {
      setLoadingStatement(false);
    }
  };

  // Print Person Statement
  const handlePrintStatement = (statementData = null) => {
    if (statementData) {
      setSelectedStatement(statementData);
    }
    setIsStatementPrintOpen(true);
  };

  // Open Printable Voucher
  const handlePrintVoucher = (record) => {
    setSelectedVoucher(record);
    setIsVoucherModalOpen(true);
  };

  // Filter Config for DataTable
  const filterConfig = [
    {
      key: 'search',
      label: 'بحث',
      type: 'text',
      placeholder: 'ابحث باسم الشخص، رقم الهاتف، رقم الإيصال...',
    },
    {
      key: 'type',
      label: 'نوع الحركة',
      type: 'select',
      options: [
        { label: 'تسليم عهدة (صرف للشخص)', value: 'disbursement' },
        { label: 'استلام عهدة (سداد من الشخص)', value: 'collection' },
      ],
    },
    {
      key: 'channel',
      label: 'طريقة الدفع',
      type: 'select',
      options: [
        { label: 'نقدي (كاش)', value: 'cash' },
        { label: 'محفظة إلكترونية', value: 'wallet' },
        { label: 'انستاباي (InstaPay)', value: 'instapay' },
        { label: 'تحويل / إيداع بنكي', value: 'bank' },
      ],
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range',
    },
  ];

  // Columns for All Records Table
  const columns = [
    {
      key: 'date',
      label: 'التاريخ',
      render: (row) => format(new Date(row.date), 'yyyy/MM/dd'),
    },
    {
      key: 'receipt_number',
      label: 'رقم السند',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
          {row.receipt_number || `#${row.id}`}
        </span>
      ),
    },
    {
      key: 'person_name',
      label: 'اسم الشخص',
      render: (row) => (
        <div>
          <button
            type="button"
            onClick={() => handleOpenStatement(row.person_name)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontWeight: 700,
              color: '#2563eb',
              cursor: 'pointer',
              textAlign: 'right',
              fontSize: '0.9rem',
              textDecoration: 'underline',
            }}
          >
            {row.person_name}
          </button>
          {row.phone && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{row.phone}</div>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      label: 'نوع الحركة',
      render: (row) => {
        if (row.sub_type === 'deduction') {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#fef3c7',
                color: '#d97706',
                border: '1px solid #fde68a',
                borderRadius: 20,
                padding: '3px 9px',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <MinusCircle size={13} /> تطريح ({row.item_description || 'صرف'})
            </span>
          );
        }
        if (row.sub_type === 'transfer_out') {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#fee2e2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                borderRadius: 20,
                padding: '3px 9px',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <ArrowLeftRight size={13} /> تحويل عهدة صادر
            </span>
          );
        }
        if (row.sub_type === 'transfer_in') {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                borderRadius: 20,
                padding: '3px 9px',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <ArrowLeftRight size={13} /> تحويل عهدة وارد
            </span>
          );
        }
        return row.type === 'disbursement' ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: '#fff7ed',
              color: '#ea580c',
              border: '1px solid #fed7aa',
              borderRadius: 20,
              padding: '3px 9px',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            <ArrowUpRight size={13} /> تسليم عهدة (صرف)
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: '#f0fdf4',
              color: '#16a34a',
              border: '1px solid #bbf7d0',
              borderRadius: 20,
              padding: '3px 9px',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}
          >
            <ArrowDownLeft size={13} /> استلام عهدة (رد)
          </span>
        );
      },
    },
    {
      key: 'amount',
      label: 'المبلغ',
      sum: true,
      renderSummary: (t) => `${fmt(t, 2)} ج.م`,
      render: (row) => (
        <span
          style={{
            fontWeight: 700,
            color: row.type === 'disbursement' ? '#ea580c' : '#16a34a',
            fontSize: '0.95rem',
          }}
        >
          {fmt(row.amount, 2)} ج.م
        </span>
      ),
    },
    {
      key: 'channel',
      label: 'طريقة الدفع',
      render: (row) => {
        const ch = row.effective_channel || row.channel || 'cash';
        const labels = {
          cash: 'نقدي (كاش)',
          wallet: 'محفظة إلكترونية',
          instapay: 'انستاباي',
          bank: 'إيداع بنكي',
        };
        return (
          <span style={{ fontSize: '0.85rem' }}>
            {row.payment_type_name || labels[ch] || ch}
          </span>
        );
      },
    },
    {
      key: 'notes',
      label: 'ملاحظات',
      render: (row) => row.notes || '-',
    },
    {
      key: 'receipt_image',
      label: 'المرفق',
      render: (row) =>
        row.receipt_image ? (
          <button
            type="button"
            onClick={() =>
              setPreviewImage({ url: row.receipt_image, title: `إيصال سند ${row.receipt_number}` })
            }
            style={{
              background: '#e0e7ff',
              color: '#4338ca',
              border: 'none',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Eye size={13} /> عرض
          </button>
        ) : (
          '-'
        ),
    },
  ];

  // Actions for All Records Table
  const renderActions = (row) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {/* Print Voucher / Invoice Button */}
      <button
        type="button"
        onClick={() => handlePrintVoucher(row)}
        title={row.type === 'disbursement' ? 'طباعة سند صرف العهدة' : 'طباعة سند استلام العهدة'}
        style={{
          background: row.type === 'disbursement' ? '#fff7ed' : '#f0fdf4',
          color: row.type === 'disbursement' ? '#ea580c' : '#16a34a',
          border: `1px solid ${row.type === 'disbursement' ? '#fed7aa' : '#bbf7d0'}`,
          borderRadius: 6,
          padding: '5px 9px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: '0.78rem',
          fontWeight: 600,
        }}
      >
        <Printer size={13} /> طباعة السند
      </button>

      <button
        type="button"
        onClick={() => handleOpenStatement(row.person_name)}
        title="كشف حساب الشخص"
        style={{
          background: '#eff6ff',
          color: '#2563eb',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          padding: '5px 8px',
          cursor: 'pointer',
        }}
      >
        <FileText size={14} />
      </button>
      <button
        type="button"
        onClick={() => handleOpenEditModal(row)}
        title="تعديل"
        style={{
          background: '#f8fafc',
          color: '#475569',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          padding: '5px 8px',
          cursor: 'pointer',
        }}
      >
        <Edit size={14} />
      </button>
      <button
        type="button"
        onClick={() => {
          setItemToDelete(row);
          setIsConfirmDeleteOpen(true);
        }}
        title="حذف"
        style={{
          background: '#fee2e2',
          color: '#dc2626',
          border: 'none',
          borderRadius: 6,
          padding: '5px 8px',
          cursor: 'pointer',
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  // Transfer Filter Config
  const transferFilterConfig = [
    {
      key: 'search',
      label: 'بحث',
      type: 'text',
      placeholder: 'ابحث باسم المحول، المستلم، رقم الإيصال...',
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range',
    },
  ];

  // Transfer Columns
  const transferColumns = [
    {
      key: 'date',
      label: 'التاريخ',
      render: (row) => format(new Date(row.date), 'yyyy/MM/dd'),
    },
    {
      key: 'receipt_number',
      label: 'رقم الإيصال',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#7c3aed' }}>
          {row.receipt_number || `CTR-${row.id}`}
        </span>
      ),
    },
    {
      key: 'from_person',
      label: 'محوّل من (الطرف الأول)',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#dc2626' }}>
          {row.from_person}
        </span>
      ),
    },
    {
      key: 'to_person',
      label: 'محوّل إلى (الطرف الثاني)',
      render: (row) => (
        <span style={{ fontWeight: 700, color: '#16a34a' }}>
          {row.to_person}
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'المبلغ المحوّل',
      sum: true,
      renderSummary: (t) => `${fmt(t, 2)} ج.م`,
      render: (row) => (
        <span style={{ fontWeight: 800, color: '#7c3aed', fontSize: '0.95rem' }}>
          {fmt(row.amount, 2)} ج.م
        </span>
      ),
    },
    {
      key: 'notes',
      label: 'ملاحظات',
      render: (row) => row.notes || '-',
    },
  ];

  const renderTransferActions = (row) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => handleOpenTransferModal(row)}
        title="تعديل حركة التحويل والمبلغ"
        style={{
          background: '#eff6ff',
          color: '#2563eb',
          border: '1px solid #bfdbfe',
          borderRadius: 6,
          padding: '5px 8px',
          cursor: 'pointer',
        }}
      >
        <Edit size={14} />
      </button>
      <button
        type="button"
        onClick={() => handleDeleteTransfer(row)}
        title="حذف حركة التحويل وإعادة الأرصدة"
        style={{
          background: '#fee2e2',
          color: '#dc2626',
          border: 'none',
          borderRadius: 6,
          padding: '5px 8px',
          cursor: 'pointer',
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  return (
    <div style={{ padding: '24px 30px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
            }}
          >
            <HandCoins size={26} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>إدارة العهد المالية</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              تسليم واستلام العهد، متابعة كشوف حسابات الأشخاص، وأرصدة العهد القائمة
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => handleOpenTransferModal()}
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
            }}
          >
            <ArrowLeftRight size={18} />
            <span>تحويل عهدة</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal('disbursement')}
            style={{
              background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(234, 88, 12, 0.25)',
            }}
          >
            <ArrowUpRight size={18} />
            <span>تسليم عهدة (صرف)</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModal('collection')}
            style={{
              background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
            }}
          >
            <ArrowDownLeft size={18} />
            <span>استلام عهدة (رد)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Total Disbursed */}
          <div
            style={{
              background: 'var(--bg-card)',
              padding: '16px 20px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#fff7ed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowUpRight size={22} color="#ea580c" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي العهد المنصرفة</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c' }}>
                {fmt(summary.total_disbursed, 2)} ج.م
              </div>
            </div>
          </div>

          {/* Total Collected */}
          <div
            style={{
              background: 'var(--bg-card)',
              padding: '16px 20px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#f0fdf4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowDownLeft size={22} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي العهد المستردة</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                {fmt(summary.total_collected, 2)} ج.م
              </div>
            </div>
          </div>

          {/* Net Outstanding Balance */}
          <div
            style={{
              background: 'var(--bg-card)',
              padding: '16px 20px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#f5f3ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Wallet size={22} color="#8b5cf6" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                صافي العهد القائمة (المتبقية)
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>
                {fmt(summary.net_outstanding, 2)} ج.م
              </div>
            </div>
          </div>

          {/* Persons Count */}
          <div
            style={{
              background: 'var(--bg-card)',
              padding: '16px 20px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={22} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>عدد أصحاب العهد</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {summary.persons_count || persons.length || 0} شخص
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs navigation */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          borderBottom: '2px solid #e2e8f0',
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('persons')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'persons' ? '3px solid #8b5cf6' : '3px solid transparent',
            color: activeTab === 'persons' ? '#7c3aed' : '#64748b',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Users size={18} />
          <span>كشف حسابات الأشخاص ({persons.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('records')}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'records' ? '3px solid #8b5cf6' : '3px solid transparent',
            color: activeTab === 'records' ? '#7c3aed' : '#64748b',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FileText size={18} />
          <span>سجل حركات العهد كاملة ({custodies.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('transfers');
            fetchTransfers();
          }}
          style={{
            padding: '12px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'transfers' ? '3px solid #8b5cf6' : '3px solid transparent',
            color: activeTab === 'transfers' ? '#7c3aed' : '#64748b',
            fontWeight: 800,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <ArrowLeftRight size={18} />
          <span>كشف تحويلات العهد ({transfers.length})</span>
        </button>
      </div>

      {/* ==================== TAB 1: PERSONS SUMMARY & STATEMENTS ==================== */}
      {activeTab === 'persons' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {persons.map((p) => {
              const bal = parseFloat(p.balance) || 0;
              const isOwing = bal > 0;
              const isCredit = bal < 0;
              const isSettled = bal === 0;

              return (
                <div
                  key={p.person_name}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    border: isOwing ? '1.5px solid #fecaca' : '1px solid #e2e8f0',
                    padding: 18,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 14,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                          {p.person_name}
                        </h3>
                        {p.phone && (
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                            {p.phone}
                          </div>
                        )}
                      </div>

                      {/* Status Badge */}
                      {isOwing && (
                        <span
                          style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            padding: '3px 9px',
                            borderRadius: 12,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                          }}
                        >
                          معه عهدة
                        </span>
                      )}
                      {isSettled && (
                        <span
                          style={{
                            background: '#f0fdf4',
                            color: '#16a34a',
                            padding: '3px 9px',
                            borderRadius: 12,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                          }}
                        >
                          خالص الرصيد
                        </span>
                      )}
                      {isCredit && (
                        <span
                          style={{
                            background: '#eff6ff',
                            color: '#2563eb',
                            padding: '3px 9px',
                            borderRadius: 12,
                            fontSize: '0.78rem',
                            fontWeight: 700,
                          }}
                        >
                          له رصيد
                        </span>
                      )}
                    </div>

                    {/* Breakdown */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 10,
                        background: '#f8fafc',
                        padding: 12,
                        borderRadius: 10,
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>إجمالي المنصرف</div>
                        <div style={{ fontWeight: 700, color: '#ea580c' }}>
                          {fmt(p.total_disbursed, 2)} ج.م
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>إجمالي المسدد</div>
                        <div style={{ fontWeight: 700, color: '#16a34a' }}>
                          {fmt(p.total_collected, 2)} ج.م
                        </div>
                      </div>
                    </div>

                    {/* Balance */}
                    <div
                      style={{
                        marginTop: 12,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>
                        الرصيد المتبقي:
                      </span>
                      <span
                        style={{
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          color: isOwing ? '#dc2626' : (isSettled ? '#16a34a' : '#2563eb'),
                        }}
                      >
                        {fmt(Math.abs(bal), 2)} ج.م
                        {isOwing ? ' (عليه)' : (isCredit ? ' (له)' : '')}
                      </span>
                    </div>
                  </div>

                  {/* Actions for this person */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenStatement(p.person_name)}
                      style={{
                        flex: 1,
                        background: '#f1f5f9',
                        color: '#334155',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                      }}
                    >
                      <FileText size={14} /> كشف الحساب
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await custodyService.getPersonStatement(p.person_name);
                          setSelectedStatement(res.data);
                          setIsStatementPrintOpen(true);
                        } catch {
                          toast.error('حدث خطأ أثناء تحميل كشف الحساب');
                        }
                      }}
                      title="طباعة كشف حساب رسمي للشخص"
                      style={{
                        background: '#f5f3ff',
                        color: '#7c3aed',
                        border: '1px solid #ddd6fe',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      <Printer size={14} /> طباعة
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDeductionModal(p.person_name, p.phone)}
                      title="تطريح / صرف بند من العهدة"
                      style={{
                        background: '#fef3c7',
                        color: '#d97706',
                        border: '1px solid #fde68a',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <MinusCircle size={14} /> تطريح
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenTransferModal(p.person_name)}
                      title="تحويل عهدة من هذا الشخص إلى شخص آخر"
                      style={{
                        background: '#f5f3ff',
                        color: '#7c3aed',
                        border: '1px solid #ddd6fe',
                        borderRadius: 8,
                        padding: '8px 10px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <ArrowLeftRight size={14} /> تحويل
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAddModal('disbursement', p.person_name)}
                      title="صرف عهدة جديدة له"
                      style={{
                        background: '#fff7ed',
                        color: '#ea580c',
                        border: '1px solid #fed7aa',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <ArrowUpRight size={14} /> صرف
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAddModal('collection', p.person_name)}
                      title="سداد/استلام عهدة منه"
                      style={{
                        background: '#f0fdf4',
                        color: '#16a34a',
                        border: '1px solid #bbf7d0',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <ArrowDownLeft size={14} /> سداد
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPersonToDelete(p);
                        setIsConfirmDeletePersonOpen(true);
                      }}
                      title="حذف الشخص وكافة حركات كشف حسابه"
                      style={{
                        background: '#fee2e2',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}

            {persons.length === 0 && !loading && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  textAlign: 'center',
                  padding: 40,
                  background: '#f8fafc',
                  borderRadius: 14,
                  color: '#64748b',
                }}
              >
                لا توجد عهد مسجلة حتى الآن. اضغط على أزرار "تسليم عهدة" بالأعلى لبدء التسجيل.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: ALL CUSTODY TRANSACTIONS ==================== */}
      {activeTab === 'records' && (
        <DataTable
          columns={columns}
          data={custodies}
          loading={loading}
          filterConfig={filterConfig}
          onFilter={fetchData}
          onAdd={() => handleOpenAddModal('disbursement')}
          actions={renderActions}
        />
      )}

      {/* ==================== TAB 3: CUSTODY TRANSFERS ==================== */}
      {activeTab === 'transfers' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              background: '#f8fafc',
              padding: '12px 18px',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: '#ede9fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#7c3aed',
                }}
              >
                <ArrowLeftRight size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>كشف تحويلات العهد بين الأفراد</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  إجمالي المبالغ المحولة: {fmt(transfersSummary.total_amount || 0, 2)} ج.م ({transfers.length} تحويل)
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setIsTransfersPrintOpen(true)}
                style={{
                  background: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
                }}
              >
                <Printer size={15} />
                <span>طباعة كشف التحويلات</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenTransferModal()}
                style={{
                  background: '#0f172a',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Plus size={15} />
                <span>تحويل عهدة جديد</span>
              </button>
            </div>
          </div>

          <DataTable
            columns={transferColumns}
            data={transfers}
            loading={loadingTransfers}
            filterConfig={transferFilterConfig}
            onFilter={fetchTransfers}
            onAdd={() => handleOpenTransferModal()}
            actions={renderTransferActions}
          />
        </div>
      )}

      {/* ===================== MODAL: ADD / EDIT CUSTODY ===================== */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingItem
            ? 'تعديل حركة عهدة'
            : formData.type === 'disbursement'
              ? 'تسليم عهدة (صرف للشخص)'
              : 'استلام عهدة (توريد / سداد)'
        }
      >
        <form onSubmit={handleSubmit}>
          {/* Transfer Notice if editing a transfer leg */}
          {editingItem?.transfer_id && (
            <div
              style={{
                background: '#eff6ff',
                color: '#1e40af',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '0.82rem',
                fontWeight: 700,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ArrowLeftRight size={15} />
              <span>تنبيه: هذه الحركة جزء من تحويل عهدة بين شخصين. تعديل المبلغ هنا سيحدّث طرفي التحويل وسجل التحويلات تلقائياً.</span>
            </div>
          )}

          {/* Movement Type Toggle (if adding) */}
          {!editingItem && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                background: '#f1f5f9',
                padding: 4,
                borderRadius: 10,
                marginBottom: 16,
              }}
            >
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, type: 'disbursement' }))}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: formData.type === 'disbursement' ? '#ea580c' : 'transparent',
                  color: formData.type === 'disbursement' ? '#fff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <ArrowUpRight size={15} /> تسليم عهدة (صرف)
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, type: 'collection' }))}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: formData.type === 'collection' ? '#16a34a' : 'transparent',
                  color: formData.type === 'collection' ? '#fff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <ArrowDownLeft size={15} /> استلام عهدة (سداد)
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
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
            <div className="form-group">
              <label className="form-label">رقم السند (تلقائي إن ترك فارغاً)</label>
              <input
                type="text"
                className="form-input"
                placeholder={formData.type === 'disbursement' ? 'CSD-0001' : 'CSC-0001'}
                value={formData.receipt_number}
                onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
              />
            </div>
          </div>

          {/* Person Name & Autocomplete */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">اسم الشخص المستلم / المسلم للعهدة *</label>
            <input
              type="text"
              list="existing-persons-list"
              className="form-input"
              placeholder="اكتب اسم الشخص..."
              value={formData.person_name}
              onChange={(e) => handlePersonNameChange(e.target.value)}
              required
            />
            <datalist id="existing-persons-list">
              {persons.map((p) => (
                <option key={p.person_name} value={p.person_name} />
              ))}
            </datalist>

            {/* Real-time Person Balance Indicator */}
            {personBalanceInfo && (
              <div style={{ marginTop: 8 }}>
                {personBalanceInfo.status === 'owing' && (
                  <div
                    style={{
                      background: '#fee2e2',
                      color: '#dc2626',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <AlertCircle size={15} />
                    <span>
                      الشخص معه عهدة سابقة: {fmt(personBalanceInfo.balance, 2)} ج.م
                    </span>
                  </div>
                )}
                {personBalanceInfo.status === 'settled' && (
                  <div
                    style={{
                      background: '#f0fdf4',
                      color: '#16a34a',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>خالص الرصيد (لا توجد عليه عهد متبقية)</span>
                  </div>
                )}
                {personBalanceInfo.status === 'new' && (
                  <div
                    style={{
                      background: '#eff6ff',
                      color: '#2563eb',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>✨ شخص جديد (سيتم فتح كشف عهد جديد له)</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">رقم الهاتف (اختياري)</label>
              <input
                type="text"
                className="form-input"
                placeholder="01xxxxxxxxx"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">المبلغ (ج.م) *</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Payment Type / Channel */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">نوع وطريقة الدفع</label>
              <select
                className="form-input"
                value={formData.payment_type_id}
                onChange={(e) => {
                  const pt = paymentTypes.find((p) => String(p.id) === e.target.value);
                  setFormData({
                    ...formData,
                    payment_type_id: e.target.value,
                    channel: pt?.channel || 'cash',
                  });
                }}
              >
                <option value="">-- نقدي (افتراضي) --</option>
                {paymentTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">صورة الإيصال / المستند</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">ملاحظات / الغرض من العهدة</label>
            <textarea
              className="form-input"
              rows="2"
              placeholder="الغرض من العهدة أو أي تفاصيل إضافية..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
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
              style={{
                background: formData.type === 'disbursement' ? '#ea580c' : '#16a34a',
                borderColor: formData.type === 'disbursement' ? '#ea580c' : '#16a34a',
              }}
            >
              {isSubmitting
                ? 'جاري الحفظ...'
                : formData.type === 'disbursement'
                  ? 'تأكيد تسليم العهدة'
                  : 'تأكيد استلام العهدة'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== MODAL: PERSON DETAILED STATEMENT ===================== */}
      <Modal
        isOpen={statementModalOpen}
        onClose={() => setStatementModalOpen(false)}
        title={`كشف حساب عهدة: ${selectedStatement?.person_name || ''}`}
        size="lg"
      >
        {loadingStatement ? (
          <div style={{ textAlign: 'center', padding: 30 }}>جاري تحميل كشف الحساب...</div>
        ) : selectedStatement ? (
          <div>
            {/* Statement Header Card */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: 20,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 14,
              }}
            >
              <div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>اسم الشخص</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                  {selectedStatement.person_name}
                </div>
                {selectedStatement.phone && (
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    {selectedStatement.phone}
                  </div>
                )}
              </div>

              <div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>إجمالي المنصرف</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ea580c' }}>
                  {fmt(selectedStatement.total_disbursed, 2)} ج.م
                </div>
              </div>

              <div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>إجمالي المسدد</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a' }}>
                  {fmt(selectedStatement.total_collected, 2)} ج.م
                </div>
              </div>

              <div>
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>الرصيد النهائي المتبقي</div>
                <div
                  style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: selectedStatement.balance > 0 ? '#dc2626' : '#16a34a',
                  }}
                >
                  {fmt(Math.abs(selectedStatement.balance), 2)} ج.م
                  {selectedStatement.balance > 0 ? ' (عليه)' : ' (خالص)'}
                </div>
              </div>
            </div>

            {/* Transactions Table */}
            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.88rem',
                  textAlign: 'right',
                }}
              >
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '10px 12px' }}>التاريخ</th>
                    <th style={{ padding: '10px 12px' }}>رقم السند</th>
                    <th style={{ padding: '10px 12px' }}>نوع الحركة</th>
                    <th style={{ padding: '10px 12px' }}>صرف (+)</th>
                    <th style={{ padding: '10px 12px' }}>سداد (-)</th>
                    <th style={{ padding: '10px 12px' }}>الرصيد التراكمي</th>
                    <th style={{ padding: '10px 12px' }}>طريقة الدفع</th>
                    <th style={{ padding: '10px 12px' }}>ملاحظات</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStatement.transactions.map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px' }}>
                        {format(new Date(tx.date), 'yyyy/MM/dd')}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>
                        {tx.receipt_number || `#${tx.id}`}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {tx.type === 'disbursement' ? (
                          <span style={{ color: '#ea580c', fontWeight: 700 }}>تسليم عهدة</span>
                        ) : (
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>استلام عهدة</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#ea580c', fontWeight: 700 }}>
                        {tx.type === 'disbursement' ? `${fmt(tx.amount, 2)} ج.م` : '-'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#16a34a', fontWeight: 700 }}>
                        {tx.type === 'collection' ? `${fmt(tx.amount, 2)} ج.م` : '-'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontWeight: 800,
                          color: tx.running_balance > 0 ? '#dc2626' : '#16a34a',
                        }}
                      >
                        {fmt(tx.running_balance, 2)} ج.م
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {tx.payment_type_name || tx.effective_channel || 'نقدي'}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>
                        {tx.notes || '-'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal({ ...tx, person_name: selectedStatement.person_name, phone: selectedStatement.phone || tx.phone })}
                            title="تعديل حركة العهدة والمبلغ"
                            style={{
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              borderRadius: 6,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.74rem',
                              fontWeight: 700,
                            }}
                          >
                            <Edit size={12} /> تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintVoucher({ ...tx, person_name: selectedStatement.person_name, phone: selectedStatement.phone })}
                            title="طباعة سند هذه الحركة"
                            style={{
                              background: tx.type === 'disbursement' ? '#fff7ed' : '#f0fdf4',
                              color: tx.type === 'disbursement' ? '#ea580c' : '#16a34a',
                              border: `1px solid ${tx.type === 'disbursement' ? '#fed7aa' : '#bbf7d0'}`,
                              borderRadius: 6,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.74rem',
                              fontWeight: 700,
                            }}
                          >
                            <Printer size={12} /> سند
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handlePrintStatement(selectedStatement)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                }}
              >
                <Printer size={16} /> طباعة كشف الحساب الرسمي
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStatementModalOpen(false)}
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ===================== CONFIRM DELETE MODAL ===================== */}
      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="تأكيد حذف حركة العهدة"
        message={`هل أنت متأكد من حذف حركة العهدة للشخص "${itemToDelete?.person_name}" بمبلغ ${fmt(itemToDelete?.amount, 2)} ج.م؟ سيتم تحديث رصيد الشخص والخزينة تلقائياً.`}
        confirmText="نعم، حذف"
        cancelText="إلغاء"
        type="danger"
      />

      {/* ===================== CONFIRM DELETE PERSON MODAL ===================== */}
      <ConfirmModal
        isOpen={isConfirmDeletePersonOpen}
        onClose={() => setIsConfirmDeletePersonOpen(false)}
        onConfirm={handleDeletePerson}
        title="تأكيد حذف الشخص وكشف حسابه"
        message={`تحذير هام: هل أنت متأكد تماماً من حذف صاحب العهدة "${personToDelete?.person_name}"؟ سيتم حذف كشف حسابه بالكامل وجميع حركات الصرف والتوريد المرتبطة به نهائياً.`}
        confirmText="نعم، حذف الشخص بالكامل"
        cancelText="إلغاء"
        type="danger"
      />

      {/* ===================== IMAGE PREVIEW MODAL ===================== */}
      {previewImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#fff',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{previewImage.title}</h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: '#64748b',
                }}
              >
                <X size={20} />
              </button>
            </div>
            <img
              src={previewImage.url}
              alt="معاينة"
              style={{
                maxWidth: '100%',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: 8,
              }}
            />
          </div>
        </div>
      )}

      {/* ===================== MODAL: CUSTODY DEDUCTION (تطريح) ===================== */}
      <Modal
        isOpen={isDeductionModalOpen}
        onClose={() => setIsDeductionModalOpen(false)}
        title="تطريح من العهدة (صرف بيان داخلي)"
      >
        {(() => {
          const currentDeductionPerson = persons.find(
            (p) => p.person_name?.trim().toLowerCase() === deductionForm.person_name?.trim().toLowerCase()
          );
          const currentBal = currentDeductionPerson ? parseFloat(currentDeductionPerson.balance || 0) : null;
          const amt = parseFloat(deductionForm.amount || 0);
          const afterBal = currentBal !== null ? currentBal - amt : null;

          return (
            <form onSubmit={handleDeductionSubmit}>
              {/* Notice Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: '1.5px solid #fcd34d',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 18,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  boxShadow: '0 2px 6px rgba(217, 119, 6, 0.06)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#fde68a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#b45309',
                    flexShrink: 0,
                  }}
                >
                  <MinusCircle size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#92400e', marginBottom: 2 }}>
                    تتبع داخلي لمصروفات العهدة (تطريح)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#b45309', lineHeight: 1.5 }}>
                    التطريح يُسجل بنود الصرف التفصيلية ويُخصم من رصيد عهدة الشخص الأساسية فقط، <strong>ولا يؤثر إطلاقاً على الخزينة العامة</strong>.
                  </div>
                </div>
              </div>

              {/* Real-time Balance Card if person is selected */}
              {currentDeductionPerson && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '12px 16px',
                    marginBottom: 18,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>الرصيد القائم الحالي</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                      {fmt(currentBal, 2)} <span style={{ fontSize: '0.75rem' }}>ج.م</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>المبلغ المطلوب تطريحه</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#d97706', marginTop: 2 }}>
                      {amt > 0 ? fmt(amt, 2) : '0.00'} <span style={{ fontSize: '0.75rem' }}>ج.م</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>الرصيد المتبقي بعد الصرف</div>
                    <div
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 900,
                        color: afterBal < 0 ? '#2563eb' : (afterBal === 0 ? '#16a34a' : '#ea580c'),
                        marginTop: 2,
                      }}
                    >
                      {fmt(Math.abs(afterBal), 2)} <span style={{ fontSize: '0.75rem' }}>ج.م</span>
                      <span style={{ fontSize: '0.72rem', marginRight: 4 }}>
                        {afterBal > 0 ? '(عليه)' : (afterBal < 0 ? '(له)' : '(خالص)')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Form Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">التاريخ *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={deductionForm.date}
                    onChange={(e) => setDeductionForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">المبلغ المصروف (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={deductionForm.amount}
                    onChange={(e) => setDeductionForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                    style={{ fontWeight: 800, fontSize: '1.05rem', color: '#d97706' }}
                  />
                </div>
              </div>

              {/* Person Select */}
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">صاحب العهدة *</label>
                <select
                  className="form-input"
                  value={deductionForm.person_name}
                  onChange={(e) => setDeductionForm((prev) => ({ ...prev, person_name: e.target.value }))}
                  required
                >
                  <option value="">-- اختر صاحب العهدة --</option>
                  {persons.map((p) => (
                    <option key={p.person_name} value={p.person_name}>
                      {p.person_name} (عهدة قائمة: {fmt(p.balance, 2)} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              {/* Item Description (Required) */}
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">بند الصرف (بيان التطريح) *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: شراء مسامير ومفصلات / وقود سيارة نقل / وجبات موقع..."
                  value={deductionForm.item_description}
                  onChange={(e) => setDeductionForm((prev) => ({ ...prev, item_description: e.target.value }))}
                  required
                />
              </div>

              {/* Notes */}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">ملاحظات إضافية (اختياري)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="أي تفاصيل أو ملاحظات إضافية عن بند الصرف..."
                  value={deductionForm.notes}
                  onChange={(e) => setDeductionForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsDeductionModalOpen(false)}
                  style={{ border: '1px solid #cbd5e1', padding: '9px 18px' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    borderColor: '#d97706',
                    padding: '9px 22px',
                    fontWeight: 800,
                    boxShadow: '0 4px 12px rgba(217,119,6,0.25)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <MinusCircle size={16} />
                  <span>{isSubmitting ? 'جاري التسجيل...' : 'تأكيد التطريح وحفظ الحركة'}</span>
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* ===================== MODAL: CUSTODY TRANSFER (تحويل عهدة) ===================== */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setEditingTransfer(null);
        }}
        title={editingTransfer ? 'تعديل حركة تحويل عهدة' : 'تحويل عهدة بين الأفراد'}
      >
        {(() => {
          const currentFromPerson = persons.find(
            (p) => p.person_name?.trim().toLowerCase() === transferForm.from_person?.trim().toLowerCase()
          );
          const currentToPerson = persons.find(
            (p) => p.person_name?.trim().toLowerCase() === transferForm.to_person?.trim().toLowerCase()
          );
          const fromBal = currentFromPerson ? parseFloat(currentFromPerson.balance || 0) : null;
          const toBal = currentToPerson ? parseFloat(currentToPerson.balance || 0) : null;
          const trfAmt = parseFloat(transferForm.amount || 0);

          return (
            <form onSubmit={handleTransferSubmit}>
              {/* Notice Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                  border: '1.5px solid #d8b4fe',
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 18,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  boxShadow: '0 2px 6px rgba(124, 58, 237, 0.06)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#ede9fe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#7c3aed',
                    flexShrink: 0,
                  }}
                >
                  <ArrowLeftRight size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#5b21b6', marginBottom: 2 }}>
                    تحويل مباشر بين ذمم أصحاب العهد
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6d28d9', lineHeight: 1.5 }}>
                    يتم خصم المبلغ من رصيد الطرف الأول وإضافته لرصيد الطرف الثاني داخلياً، <strong>دون أي تأثير على الخزينة</strong>.
                  </div>
                </div>
              </div>

              {/* Visual Transfer Pathway Banner */}
              {(currentFromPerson || currentToPerson) && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '12px 14px',
                    marginBottom: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  {/* Sender side */}
                  <div style={{ flex: 1, textAlign: 'center', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 700 }}>الطرف المحوّل منه (يُخصم منه)</div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginTop: 2 }}>
                      {transferForm.from_person || '—'}
                    </div>
                    {fromBal !== null && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                        الرصيد: {fmt(fromBal, 2)} ج.م
                        {trfAmt > 0 && (
                          <span style={{ color: '#ea580c', fontWeight: 700, marginRight: 4 }}>
                            → {fmt(fromBal - trfAmt, 2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Arrow in middle */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#7c3aed' }}>
                      {trfAmt > 0 ? `${fmt(trfAmt, 2)} ج.م` : 'مبلغ التحويل'}
                    </div>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#ede9fe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#7c3aed',
                      }}
                    >
                      <ArrowLeftRight size={16} />
                    </div>
                  </div>

                  {/* Recipient side */}
                  <div style={{ flex: 1, textAlign: 'center', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>الطرف المستلم (يُضاف إليه)</div>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginTop: 2 }}>
                      {transferForm.to_person || '—'}
                    </div>
                    {toBal !== null && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                        الرصيد: {fmt(toBal, 2)} ج.م
                        {trfAmt > 0 && (
                          <span style={{ color: '#16a34a', fontWeight: 700, marginRight: 4 }}>
                            → {fmt(toBal + trfAmt, 2)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Date & Amount */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">التاريخ *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={transferForm.date}
                    onChange={(e) => setTransferForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">المبلغ المراد تحويله (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input"
                    placeholder="0.00"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                    style={{ fontWeight: 800, fontSize: '1.05rem', color: '#7c3aed' }}
                  />
                </div>
              </div>

              {/* From & To Person Selects */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">محوّل من (الطرف الأول) *</label>
                  <select
                    className="form-input"
                    value={transferForm.from_person}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTransferForm((prev) => ({
                        ...prev,
                        from_person: val,
                        to_person: prev.to_person === val ? '' : prev.to_person,
                      }));
                    }}
                    required
                  >
                    <option value="">-- اختر الطرف المحول منه --</option>
                    {persons.map((p) => (
                      <option key={p.person_name} value={p.person_name}>
                        {p.person_name} (عهدة قائمة: {fmt(p.balance, 2)} ج.م)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">محوّل إلى (الطرف الثاني) *</label>
                  <select
                    className="form-input"
                    value={transferForm.to_person}
                    onChange={(e) => setTransferForm((prev) => ({ ...prev, to_person: e.target.value }))}
                    required
                  >
                    <option value="">-- اختر الطرف المستلم --</option>
                    {persons
                      .filter((p) => p.person_name !== transferForm.from_person)
                      .map((p) => (
                        <option key={p.person_name} value={p.person_name}>
                          {p.person_name} (عهدة قائمة: {fmt(p.balance, 2)} ج.م)
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">ملاحظات / سبب التحويل (اختياري)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="مثال: استكمال مصاريف موقع / تصفية حساب عهدة..."
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsTransferModalOpen(false)}
                  style={{ border: '1px solid #cbd5e1', padding: '9px 18px' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                    borderColor: '#7c3aed',
                    padding: '9px 22px',
                    fontWeight: 800,
                    boxShadow: '0 4px 12px rgba(124,58,237,0.25)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <ArrowLeftRight size={16} />
                  <span>
                    {isSubmitting
                      ? 'جاري الحفظ...'
                      : editingTransfer
                        ? 'تأكيد تعديل التحويل'
                        : 'تأكيد تحويل العهدة'}
                  </span>
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* ===================== CONFIRM DELETE TRANSFER MODAL ===================== */}
      <ConfirmModal
        isOpen={isConfirmDeleteTransferOpen}
        onClose={() => setIsConfirmDeleteTransferOpen(false)}
        onConfirm={confirmDeleteTransfer}
        title="تأكيد حذف حركة تحويل العهدة"
        message={`هل أنت متأكد من حذف حركة التحويل بمبلغ ${fmt(transferToDelete?.amount, 2)} ج.م من "${transferToDelete?.from_person}" إلى "${transferToDelete?.to_person}"؟ سيتم إعادة الأرصدة تلقائياً لكلا الطرفين.`}
        confirmText="نعم، حذف التحويل"
        cancelText="إلغاء"
        type="danger"
      />

      {/* ===================== PRINTABLE CUSTODY TRANSFERS ===================== */}
      <PrintableCustodyTransfers
        isOpen={isTransfersPrintOpen}
        onClose={() => setIsTransfersPrintOpen(false)}
        transfers={transfers}
        summary={transfersSummary}
      />

      {/* ===================== PRINTABLE CUSTODY VOUCHER ===================== */}
      <PrintableCustodyVoucher
        isOpen={isVoucherModalOpen}
        onClose={() => setIsVoucherModalOpen(false)}
        voucher={selectedVoucher}
      />

      {/* ===================== PRINTABLE CUSTODY STATEMENT ===================== */}
      <PrintableCustodyStatement
        isOpen={isStatementPrintOpen}
        onClose={() => setIsStatementPrintOpen(false)}
        statement={selectedStatement}
      />
    </div>
  );
};

export default CustodyPage;

