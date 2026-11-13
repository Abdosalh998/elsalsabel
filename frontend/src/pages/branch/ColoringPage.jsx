import { useState, useEffect, useCallback } from 'react';
import {
  Palette, Plus, RotateCcw, CheckCircle2, Clock, Scale,
  Layers, DollarSign, Eye, X, Upload, Trash2, ArrowUpRight,
  TrendingUp, FileText, Check, Warehouse, Printer, Edit2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import coloringService from '../../services/coloring.service';
import treasuryService from '../../services/treasury.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';
import PrintableColoringInvoice from '../../components/coloring/PrintableColoringInvoice';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const EMPTY_ORDER_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  order_number: '',
  inventory_id: '',
  issued_weight: '',
  issued_rolls: '',
  color: '',
  colored_product: '',
  coloring_company: '',
  coloring_cost: '',
  payment_type_id: '',
  channel: 'cash',
  notes: '',
  image_url: null,
  scale_ticket_image: null,
  // Direct stock option
  auto_stock: false,
  returned_weight: '',
  returned_rolls: '',
  weight_gain: '',
  roll_price: '',
  price_per_kg: '',
};

const ColoringPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);

  // Forms
  const [formData, setFormData] = useState(EMPTY_ORDER_FORM);
  const [returnFormData, setReturnFormData] = useState({
    returned_weight: '',
    returned_rolls: '',
    weight_gain: '',
    coloring_company: '',
    coloring_cost: '',
    payment_type_id: '',
    channel: 'cash',
    notes: '',
    auto_stock: false,
    roll_price: '',
    price_per_kg: '',
    colored_product: '',
  });
  const [editFormData, setEditFormData] = useState({
    id: '',
    date: '',
    order_number: '',
    color: '',
    colored_product: '',
    coloring_company: '',
    coloring_cost: '',
    payment_type_id: '',
    channel: 'cash',
    notes: '',
  });
  const [stockFormData, setStockFormData] = useState({
    colored_product: '',
    roll_price: '',
    price_per_kg: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch orders and inventory
  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await coloringService.getOrders(params);
      setOrders(res.data?.orders || []);
      setSummary(res.data?.summary || null);
    } catch {
      toast.error('حدث خطأ أثناء تحميل بيانات التلوين');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await coloringService.getInventoryItems();
      setInventoryItems(res.data || []);
    } catch (err) {
      console.error('Error fetching inventory for coloring:', err);
    }
  }, []);

  const fetchPaymentTypes = useCallback(async () => {
    try {
      const res = await treasuryService.getPaymentTypes();
      setPaymentTypes(res.data || []);
    } catch (err) {
      console.error('Error fetching payment types:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchInventory();
    fetchPaymentTypes();
  }, [fetchData, fetchInventory, fetchPaymentTypes]);

  // Handle Inventory Selection in Add Form
  const handleInventorySelect = (id) => {
    const selected = inventoryItems.find((item) => String(item.id) === String(id));
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        inventory_id: id,
        colored_product: `${selected.product} ملون`,
        issued_rolls: selected.available_rolls || '',
      }));
    } else {
      setFormData((prev) => ({ ...prev, inventory_id: id }));
    }
  };

  // Convert image to base64
  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('حجم الصورة يجب ألا يتجاوز 5 ميجابايت');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, [field]: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Add Order Submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.inventory_id) {
      toast.error('يرجى اختيار الصنف المنصرف من المخزن');
      return;
    }
    if (!formData.issued_weight || Number(formData.issued_weight) <= 0) {
      toast.error('يرجى إدخال وزن منصرف صحيح');
      return;
    }

    setIsSubmitting(true);
    try {
      await coloringService.addOrder(formData);
      toast.success(
        formData.auto_stock
          ? 'تم إنشاء أمر التلوين وترحيله للمخزن بنجاح'
          : 'تم إنشاء أمر التلوين وخصم الكمية من المخزن بنجاح'
      );
      setIsAddModalOpen(false);
      setFormData(EMPTY_ORDER_FORM);
      fetchData();
      fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ أمر التلوين');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Return Modal
  const handleOpenReturnModal = (order) => {
    setSelectedOrder(order);
    const cost = parseFloat(order.coloring_cost) || 0;
    setReturnFormData({
      returned_weight: '',
      returned_rolls: order.issued_rolls || '',
      weight_gain: '',
      coloring_company: order.coloring_company || '',
      coloring_cost: cost > 0 ? order.coloring_cost : '',
      payment_type_id: order.payment_type_id || '',
      channel: order.channel || 'cash',
      notes: '',
      auto_stock: false,
      roll_price: '',
      price_per_kg: '',
      colored_product: order.colored_product || `${order.product} ملون`,
    });
    setIsReturnModalOpen(true);
  };

  // Return weight change: calculate gain
  const handleReturnWeightChange = (val) => {
    const retW = parseFloat(val) || 0;
    const issuedW = parseFloat(selectedOrder?.issued_weight) || 0;
    const gain = retW > 0 ? (retW - issuedW).toFixed(3) : '';
    setReturnFormData((prev) => ({
      ...prev,
      returned_weight: val,
      weight_gain: gain,
    }));
  };

  // Return gain change: calculate returned weight
  const handleReturnGainChange = (val) => {
    const gain = parseFloat(val) || 0;
    const issuedW = parseFloat(selectedOrder?.issued_weight) || 0;
    const retW = (issuedW + gain).toFixed(3);
    setReturnFormData((prev) => ({
      ...prev,
      weight_gain: val,
      returned_weight: retW,
    }));
  };

  // Open Edit Modal
  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setEditFormData({
      id: order.id,
      date: order.date ? format(new Date(order.date), 'yyyy-MM-dd') : '',
      order_number: order.order_number || '',
      color: order.color || '',
      colored_product: order.colored_product || '',
      coloring_company: order.coloring_company || '',
      coloring_cost: order.coloring_cost || '',
      payment_type_id: order.payment_type_id || '',
      channel: order.channel || 'cash',
      notes: order.notes || '',
    });
    setIsEditModalOpen(true);
  };

  // Submit Edit Modal
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await coloringService.updateOrder(selectedOrder.id, editFormData);
      toast.success('تم تحديث بيانات أمر التلوين والتكلفة بنجاح');
      setIsEditModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Return Modal
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!returnFormData.returned_weight || Number(returnFormData.returned_weight) <= 0) {
      toast.error('يرجى إدخال الوزن الداخل');
      return;
    }

    setIsSubmitting(true);
    try {
      await coloringService.returnFromColoring(selectedOrder.id, returnFormData);
      toast.success(
        returnFormData.auto_stock
          ? 'تم تسجيل العودة وترحيل البضاعة للمخزن بنجاح'
          : 'تم تسجيل عودة البضاعة بنجاح، يمكنك ترحيلها للمخزن لاحقاً'
      );
      setIsReturnModalOpen(false);
      fetchData();
      fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء تسجيل العودة');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Stock Modal
  const handleOpenStockModal = (order) => {
    setSelectedOrder(order);
    setStockFormData({
      colored_product: order.colored_product || `${order.product} ملون`,
      roll_price: '',
      price_per_kg: '',
      notes: '',
    });
    setIsStockModalOpen(true);
  };

  // Submit Stock Modal
  const handleStockSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await coloringService.stockColoredProduct(selectedOrder.id, stockFormData);
      toast.success('تم ترحيل البضاعة الملونة إلى المخزن بنجاح وتوفيرها للبيع');
      setIsStockModalOpen(false);
      fetchData();
      fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء الترحيل للمخزن');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Order
  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      await coloringService.deleteOrder(selectedOrder.id);
      toast.success('تم حذف أمر التلوين واسترجاع الرصيد للمخزن');
      setIsConfirmDeleteOpen(false);
      setSelectedOrder(null);
      fetchData();
      fetchInventory();
    } catch (err) {
      toast.error(err.response?.data?.message || 'حدث خطأ أثناء حذف أمر التلوين');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter Configuration
  const filterConfig = [
    {
      key: 'search',
      label: 'بحث بالأمر أو الصنف',
      type: 'text',
      placeholder: 'ابحث برقم الأمر، الصنف، اللون...',
    },
    {
      key: 'status',
      label: 'الحالة',
      type: 'select',
      options: [
        { label: 'قيد التنفيذ (في التلوين)', value: 'pending' },
        { label: 'تم الاستلام (جاهز للترحيل)', value: 'returned' },
        { label: 'مرحّل للمخزن (متاح للبيع)', value: 'stocked' },
      ],
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range',
    },
  ];

  // Table Columns
  const columns = [
    {
      key: 'order_number',
      label: 'رقم الأمر',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
          {row.order_number || `#${row.id}`}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'التاريخ',
      render: (row) => format(new Date(row.date), 'yyyy/MM/dd'),
    },
    {
      key: 'product',
      label: 'الصنف المنصرف',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.product}</div>
          {row.color && (
            <div style={{ fontSize: '0.8rem', color: '#6366f1', marginTop: 2 }}>
              اللون المطلوب: {row.color}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'coloring_company',
      label: 'شركة التلوين',
      render: (row) => row.coloring_company ? (
        <span style={{
          display: 'inline-block',
          fontWeight: 600,
          color: '#0f766e',
          background: '#f0fdfa',
          padding: '2px 8px',
          borderRadius: 6,
          border: '1px solid #ccfbf1',
          fontSize: '0.82rem'
        }}>
          {row.coloring_company}
        </span>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>-</span>
      ),
    },
    {
      key: 'issued_weight',
      label: 'الوزن المنصرف',
      sum: true,
      renderSummary: (t) => `${fmt(t, 2)} كجم`,
      render: (row) => (
        <div>
          <span style={{ fontWeight: 600 }}>{fmt(row.issued_weight, 2)} كجم</span>
          {Number(row.issued_rolls) > 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              ({row.issued_rolls} لفة)
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'returned_weight',
      label: 'الوزن الداخل',
      sum: true,
      renderSummary: (t) => `${fmt(t, 2)} كجم`,
      render: (row) =>
        Number(row.returned_weight) > 0 ? (
          <div>
            <span style={{ fontWeight: 600, color: '#0d9488' }}>
              {fmt(row.returned_weight, 2)} كجم
            </span>
            {Number(row.returned_rolls) > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                ({row.returned_rolls} لفة)
              </div>
            )}
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>قيد التلوين</span>
        ),
    },
    {
      key: 'weight_gain',
      label: 'فرق الزيادة',
      sum: true,
      renderSummary: (t) => (
        <span style={{ color: '#16a34a', fontWeight: 'bold' }}>+{fmt(t, 2)} كجم</span>
      ),
      render: (row) => {
        const gain = parseFloat(row.weight_gain) || 0;
        if (row.status === 'pending') return '-';
        return (
          <span
            style={{
              fontWeight: 700,
              color: gain >= 0 ? '#16a34a' : '#dc2626',
              direction: 'ltr',
              display: 'inline-block',
            }}
          >
            {gain >= 0 ? `+${fmt(gain, 2)}` : fmt(gain, 2)} كجم
          </span>
        );
      },
    },
    {
      key: 'colored_product',
      label: 'الصنف الملون',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: '#4338ca' }}>
            {row.colored_product || `${row.product} ملون`}
          </div>
        </div>
      ),
    },
    {
      key: 'coloring_cost',
      label: 'تكلفة التلوين',
      sum: true,
      renderSummary: (t) => `${fmt(t, 2)} ج.م`,
      render: (row) => {
        const cost = Number(row.coloring_cost) || 0;
        const ptName =
          row.payment_type_name ||
          (row.channel === 'wallet'
            ? 'محفظة'
            : row.channel === 'bank'
              ? 'بنك'
              : row.channel === 'instapay'
                ? 'انستاباي'
                : 'كاش');
        return (
          <div>
            <div style={{ fontWeight: 700, color: cost > 0 ? '#1e293b' : '#64748b' }}>
              {fmt(cost, 2)} ج.م
            </div>
            {cost > 0 && (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: '#f1f5f9',
                  color: '#475569',
                  marginTop: 2,
                  border: '1px solid #e2e8f0',
                }}
              >
                {ptName}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'الحالة',
      render: (row) => {
        if (row.status === 'pending') {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#fff7ed',
                color: '#ea580c',
                border: '1px solid #fed7aa',
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <Clock size={13} />
              قيد التنفيذ
            </span>
          );
        }
        if (row.status === 'returned') {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#eff6ff',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                borderRadius: 20,
                padding: '4px 10px',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <RotateCcw size={13} />
              تم الاستلام
            </span>
          );
        }
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: '#f0fdf4',
              color: '#16a34a',
              border: '1px solid #bbf7d0',
              borderRadius: 20,
              padding: '4px 10px',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={13} />
            مرحّل للمخزن
          </span>
        );
      },
    },
    {
      key: 'images',
      label: 'المرفقات',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {row.image_url && (
            <button
              type="button"
              title="عرض صورة البضاعة"
              onClick={() => setPreviewImage({ url: row.image_url, title: 'صورة البضاعة للتلوين' })}
              style={{
                background: '#e0e7ff',
                color: '#4338ca',
                border: 'none',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.75rem',
              }}
            >
              <Eye size={13} /> صورة
            </button>
          )}
          {row.scale_ticket_image && (
            <button
              type="button"
              title="عرض كارتة الميزان"
              onClick={() =>
                setPreviewImage({ url: row.scale_ticket_image, title: 'كارتة ميزان التلوين' })
              }
              style={{
                background: '#dcfce7',
                color: '#15803d',
                border: 'none',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.75rem',
              }}
            >
              <Scale size={13} /> كارتة
            </button>
          )}
          {!row.image_url && !row.scale_ticket_image && '-'}
        </div>
      ),
    },
  ];

  // Action Buttons per Row
  const renderActions = (row) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Print Button - Available for all orders */}
      <button
        type="button"
        onClick={() => {
          setSelectedOrder(row);
          setIsPrintModalOpen(true);
        }}
        title="طباعة أمر / فاتورة التلوين"
        style={{
          background: '#f8fafc',
          color: '#1e293b',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          padding: '5px 9px',
          fontSize: '0.78rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontWeight: 600,
        }}
      >
        <Printer size={13} color="#2563eb" /> طباعة
      </button>

      {/* Edit Order & Cost Button - Available for all orders */}
      <button
        type="button"
        onClick={() => handleOpenEditModal(row)}
        title="تعديل أمر التلوين / تكلفة التلوين"
        style={{
          background: '#f1f5f9',
          color: '#475569',
          border: '1px solid #cbd5e1',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: '0.78rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontWeight: 600,
        }}
      >
        <Edit2 size={13} /> تعديل
      </button>

      {row.status === 'pending' && (
        <button
          type="button"
          onClick={() => handleOpenReturnModal(row)}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: '0.78rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 600,
          }}
        >
          <RotateCcw size={13} /> تسجيل عودة
        </button>
      )}

      {row.status === 'returned' && (
        <button
          type="button"
          onClick={() => handleOpenStockModal(row)}
          style={{
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '5px 10px',
            fontSize: '0.78rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontWeight: 600,
          }}
        >
          <Warehouse size={13} /> ترحيل للمخزن
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setSelectedOrder(row);
          setIsConfirmDeleteOpen(true);
        }}
        title="حذف واسترجاع للمخزن"
        style={{
          background: '#fee2e2',
          color: '#dc2626',
          border: 'none',
          borderRadius: 6,
          padding: '5px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  return (
    <div style={{ padding: '24px 30px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Page Header */}
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
              background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
            }}
          >
            <Palette size={26} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800 }}>أوامر التلوين</h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              صرف بضاعة للتلوين، حساب فروق الزيادة، وترحيل المنتجات الملونة للمخزن
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormData(EMPTY_ORDER_FORM);
            setIsAddModalOpen(true);
          }}
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 10,
            fontSize: '0.92rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
          }}
        >
          <Plus size={18} />
          <span>أمر تلوين جديد</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* Total Issued */}
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
              <Scale size={22} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>المنصرف للتلوين</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {fmt(summary.total_issued_weight, 2)} كجم
              </div>
            </div>
          </div>

          {/* Total Returned */}
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
                background: '#f0fdfa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RotateCcw size={22} color="#0d9488" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>المرتجع بعد التلوين</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0d9488' }}>
                {fmt(summary.total_returned_weight, 2)} كجم
              </div>
            </div>
          </div>

          {/* Weight Gain */}
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
              <TrendingUp size={22} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>إجمالي فرق الزيادة</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
                +{fmt(summary.total_weight_gain, 2)} كجم
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
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
              <Clock size={22} color="#ea580c" />
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>قيد التلوين حالياً</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c' }}>
                {summary.pending_count || 0} أمر
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={orders}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => {
          setFormData(EMPTY_ORDER_FORM);
          setIsAddModalOpen(true);
        }}
        actions={renderActions}
      />

      {/* ===================== MODAL: ADD COLORING ORDER ===================== */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="إنشاء أمر تلوين جديد (صرف من المخزن)"
      >
        <form onSubmit={handleAddSubmit}>
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
              <label className="form-label">رقم الأمر (تلقائي إن ترك فارغاً)</label>
              <input
                type="text"
                className="form-input"
                placeholder="CLR-0001"
                value={formData.order_number}
                onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
              />
            </div>
          </div>

          {/* Select from Inventory */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">اختر الصنف المنصرف من المخزن للتلوين *</label>
            <select
              className="form-input"
              value={formData.inventory_id}
              onChange={(e) => handleInventorySelect(e.target.value)}
              required
            >
              <option value="">-- اضغط لاختيار الصنف المتاح بالمخزن --</option>
              {inventoryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.product} (متاح: {fmt(item.available_quantity, 2)} كجم | {item.available_rolls || 0} لفة)
                </option>
              ))}
            </select>
          </div>

          {/* Issued Quantities */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">الوزن المنصرف للتلوين (كجم) *</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="مثال: 150"
                value={formData.issued_weight}
                onChange={(e) => setFormData({ ...formData, issued_weight: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">عدد اللفات المنصرفة (اختياري)</label>
              <input
                type="number"
                className="form-input"
                placeholder="مثال: 10"
                value={formData.issued_rolls}
                onChange={(e) => setFormData({ ...formData, issued_rolls: e.target.value })}
              />
            </div>
          </div>

          {/* Color & Output Product Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">اللون المطلوب للتلوين</label>
              <input
                type="text"
                className="form-input"
                placeholder="أبيض / أسود / خشابي / شامبين..."
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">اسم الصنف بعد التلوين (للمخزن)</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: قطاع ملون"
                value={formData.colored_product}
                onChange={(e) => setFormData({ ...formData, colored_product: e.target.value })}
              />
            </div>
          </div>

          {/* Coloring Company */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">الشركة أو الورشة القائمة بالتلوين</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: الشركة الدولية للألومنيوم / ورشة السلام..."
              value={formData.coloring_company}
              onChange={(e) => setFormData({ ...formData, coloring_company: e.target.value })}
            />
          </div>

          {/* Coloring Cost & Payment Method */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">تكلفة التلوين (ج.م)</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="0.00"
                value={formData.coloring_cost}
                onChange={(e) => setFormData({ ...formData, coloring_cost: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">طريقة الدفع (الخصم من الخزينة)</label>
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
                <option value="">-- كاش (الخزينة الرئيسية) --</option>
                {paymentTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Direct Return & Stock Option */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                fontWeight: 700,
                color: '#334155',
              }}
            >
              <input
                type="checkbox"
                checked={formData.auto_stock}
                onChange={(e) => setFormData({ ...formData, auto_stock: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--primary-color)' }}
              />
              <span>البضاعة عادت بالفعل وأريد ترحيلها للمخزن مباشرة الآن</span>
            </label>

            {formData.auto_stock && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group">
                    <label className="form-label">الوزن بعد العودة (كجم) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="مثال: 160"
                      value={formData.returned_weight}
                      onChange={(e) => {
                        const retW = parseFloat(e.target.value) || 0;
                        const issW = parseFloat(formData.issued_weight) || 0;
                        setFormData({
                          ...formData,
                          returned_weight: e.target.value,
                          weight_gain: retW > 0 ? (retW - issW).toFixed(3) : '',
                        });
                      }}
                      required={formData.auto_stock}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">فرق الزيادة (كجم)</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="+10"
                      value={formData.weight_gain}
                      onChange={(e) => {
                        const gain = parseFloat(e.target.value) || 0;
                        const issW = parseFloat(formData.issued_weight) || 0;
                        setFormData({
                          ...formData,
                          weight_gain: e.target.value,
                          returned_weight: (issW + gain).toFixed(3),
                        });
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">سعر اللفة للصنف الجديد بالمخزن</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="0.00"
                      value={formData.roll_price}
                      onChange={(e) => setFormData({ ...formData, roll_price: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">سعر الكيلو للصنف الجديد بالمخزن</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="0.00"
                      value={formData.price_per_kg}
                      onChange={(e) => setFormData({ ...formData, price_per_kg: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">صورة البضاعة (اختياري)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'image_url')}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">كارتة ميزان البضاعة (اختياري)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'scale_ticket_image')}
                className="form-input"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-input"
              rows="2"
              placeholder="أي ملاحظات إضافية عن أمر التلوين..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsAddModalOpen(false)}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ وصرف من المخزن'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== MODAL: RECORD RETURN ===================== */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title={`تسجيل عودة بضاعة من التلوين (${selectedOrder?.order_number || ''})`}
      >
        <form onSubmit={handleReturnSubmit}>
          <div
            style={{
              background: '#eff6ff',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 16,
              fontSize: '0.9rem',
            }}
          >
            <div>
              <strong>الصنف:</strong> {selectedOrder?.product}
            </div>
            <div>
              <strong>الوزن المنصرف:</strong> {fmt(selectedOrder?.issued_weight, 2)} كجم (
              {selectedOrder?.issued_rolls || 0} لفة)
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">الوزن الداخل الفعلي (كجم) *</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="مثال: 160"
                value={returnFormData.returned_weight}
                onChange={(e) => handleReturnWeightChange(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">فرق الزيادة المحسوب (كجم)</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="+10"
                value={returnFormData.weight_gain}
                onChange={(e) => handleReturnGainChange(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">عدد اللفات المرتجعة</label>
              <input
                type="number"
                className="form-input"
                placeholder="مثال: 10"
                value={returnFormData.returned_rolls}
                onChange={(e) =>
                  setReturnFormData({ ...returnFormData, returned_rolls: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">اسم الصنف الملون</label>
              <input
                type="text"
                className="form-input"
                value={returnFormData.colored_product}
                onChange={(e) =>
                  setReturnFormData({ ...returnFormData, colored_product: e.target.value })
                }
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">الشركة أو الورشة القائمة بالتلوين</label>
            <input
              type="text"
              className="form-input"
              placeholder="اسم شركة / ورشة التلوين..."
              value={returnFormData.coloring_company}
              onChange={(e) =>
                setReturnFormData({ ...returnFormData, coloring_company: e.target.value })
              }
            />
          </div>

          {/* Coloring Cost & Payment Method in Return */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">تكلفة التلوين (ج.م)</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="0.00"
                value={returnFormData.coloring_cost}
                onChange={(e) =>
                  setReturnFormData({ ...returnFormData, coloring_cost: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">طريقة الدفع (الخصم من الخزينة)</label>
              <select
                className="form-input"
                value={returnFormData.payment_type_id}
                onChange={(e) => {
                  const pt = paymentTypes.find((p) => String(p.id) === e.target.value);
                  setReturnFormData({
                    ...returnFormData,
                    payment_type_id: e.target.value,
                    channel: pt?.channel || 'cash',
                  });
                }}
              >
                <option value="">-- كاش (الخزينة الرئيسية) --</option>
                {paymentTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Auto Stock Option in Return */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                fontWeight: 700,
                color: '#334155',
              }}
            >
              <input
                type="checkbox"
                checked={returnFormData.auto_stock}
                onChange={(e) =>
                  setReturnFormData({ ...returnFormData, auto_stock: e.target.checked })
                }
                style={{ width: 18, height: 18, accentColor: 'var(--primary-color)' }}
              />
              <span>ترحيل البضاعة للمخزن مباشرة الآن (متاحة للبيع)</span>
            </label>

            {returnFormData.auto_stock && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: '1px dashed #cbd5e1',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <div className="form-group">
                  <label className="form-label">سعر اللفة للصنف الجديد</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    placeholder="0.00"
                    value={returnFormData.roll_price}
                    onChange={(e) =>
                      setReturnFormData({ ...returnFormData, roll_price: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">سعر الكيلو للصنف الجديد</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    placeholder="0.00"
                    value={returnFormData.price_per_kg}
                    onChange={(e) =>
                      setReturnFormData({ ...returnFormData, price_per_kg: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">ملاحظات العودة</label>
            <textarea
              className="form-input"
              rows="2"
              placeholder="أي ملاحظات حول حالة البضاعة المرتجعة..."
              value={returnFormData.notes}
              onChange={(e) => setReturnFormData({ ...returnFormData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsReturnModalOpen(false)}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'تأكيد استلام البضاعة'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== MODAL: STOCK TO INVENTORY ===================== */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => setIsStockModalOpen(false)}
        title="ترحيل المنتج الملون إلى المخزن"
      >
        <form onSubmit={handleStockSubmit}>
          <div
            style={{
              background: '#f0fdf4',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 16,
              fontSize: '0.9rem',
              border: '1px solid #bbf7d0',
            }}
          >
            <div>
              <strong>الصنف الملون:</strong> {selectedOrder?.colored_product}
            </div>
            <div>
              <strong>الوزن الإجمالي للترحيل:</strong> {fmt(selectedOrder?.returned_weight, 2)} كجم
              {Number(selectedOrder?.weight_gain) > 0 && (
                <span style={{ color: '#16a34a', marginRight: 6 }}>
                  (يشمل فرق زيادة +{fmt(selectedOrder?.weight_gain, 2)} كجم)
                </span>
              )}
            </div>
            <div>
              <strong>عدد اللفات:</strong> {selectedOrder?.returned_rolls || selectedOrder?.issued_rolls || 0} لفة
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">اسم الصنف بالمخزن *</label>
            <input
              type="text"
              className="form-input"
              value={stockFormData.colored_product}
              onChange={(e) => setStockFormData({ ...stockFormData, colored_product: e.target.value })}
              required
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              إذا كان هذا الصنف موجوداً بالمخزن سابقاً ستتم إضافة الكمية إليه تلقائياً.
            </small>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">سعر اللفة (ج.م)</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="0.00"
                value={stockFormData.roll_price}
                onChange={(e) => setStockFormData({ ...stockFormData, roll_price: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">سعر الكيلو (ج.م)</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="0.00"
                value={stockFormData.price_per_kg}
                onChange={(e) => setStockFormData({ ...stockFormData, price_per_kg: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">ملاحظات الترحيل</label>
            <textarea
              className="form-input"
              rows="2"
              placeholder="ملاحظات تظهر بالمخزن..."
              value={stockFormData.notes}
              onChange={(e) => setStockFormData({ ...stockFormData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsStockModalOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn"
              style={{ background: '#16a34a', color: '#fff' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'جاري الترحيل...' : 'تأكيد الترحيل للمخزن الآن'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== MODAL: EDIT COLORING ORDER ===================== */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`تعديل أمر التلوين (${selectedOrder?.order_number || ''})`}
      >
        <form onSubmit={handleEditSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">التاريخ</label>
              <input
                type="date"
                className="form-input"
                value={editFormData.date}
                onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">رقم الأمر</label>
              <input
                type="text"
                className="form-input"
                value={editFormData.order_number}
                onChange={(e) => setEditFormData({ ...editFormData, order_number: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">اللون المطلوب</label>
              <input
                type="text"
                className="form-input"
                value={editFormData.color}
                onChange={(e) => setEditFormData({ ...editFormData, color: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">اسم الصنف الملوّن</label>
              <input
                type="text"
                className="form-input"
                value={editFormData.colored_product}
                onChange={(e) => setEditFormData({ ...editFormData, colored_product: e.target.value })}
              />
            </div>
          </div>

          {/* Coloring Company */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">الشركة أو الورشة القائمة بالتلوين</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: الشركة الدولية للألومنيوم / ورشة السلام..."
              value={editFormData.coloring_company}
              onChange={(e) => setEditFormData({ ...editFormData, coloring_company: e.target.value })}
            />
          </div>

          {/* Coloring Cost & Payment Method */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">تكلفة التلوين (ج.م)</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="0.00"
                value={editFormData.coloring_cost}
                onChange={(e) => setEditFormData({ ...editFormData, coloring_cost: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">طريقة الدفع (الخصم من الخزينة)</label>
              <select
                className="form-input"
                value={editFormData.payment_type_id}
                onChange={(e) => {
                  const pt = paymentTypes.find((p) => String(p.id) === e.target.value);
                  setEditFormData({
                    ...editFormData,
                    payment_type_id: e.target.value,
                    channel: pt?.channel || 'cash',
                  });
                }}
              >
                <option value="">-- كاش (الخزينة الرئيسية) --</option>
                {paymentTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-input"
              rows={2}
              value={editFormData.notes}
              onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsEditModalOpen(false)}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ===================== CONFIRM DELETE MODAL ===================== */}
      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDeleteOrder}
        title="تأكيد حذف أمر التلوين"
        message={
          selectedOrder?.status === 'stocked'
            ? `هل أنت متأكد من حذف أمر التلوين رقم "${selectedOrder?.order_number || selectedOrder?.id}"؟ سيتم حذف المنتج الملون من المخزن واسترجاع الوزن المنصرف (${fmt(selectedOrder?.issued_weight, 2)} كجم) إلى رصيد المادة الخام.`
            : `هل أنت متأكد من حذف أمر التلوين رقم "${selectedOrder?.order_number || selectedOrder?.id}"؟ سيتم استرجاع الوزن المنصرف (${fmt(selectedOrder?.issued_weight, 2)} كجم) إلى رصيد المخزن المتاح.`
        }
        confirmText="نعم، حذف واسترجاع"
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
      {/* ===================== PRINT INVOICE MODAL ===================== */}
      <PrintableColoringInvoice
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        order={selectedOrder}
      />
    </div>
  );
};

export default ColoringPage;

