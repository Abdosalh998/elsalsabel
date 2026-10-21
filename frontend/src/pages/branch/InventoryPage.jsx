import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { inventoryService } from '../../services/inventory.service';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const InventoryPage = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueValues, setUniqueValues] = useState({ products: [], companies: [] });
  
  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    company: '',
    product: '',
    weight_quantity: '',
    count: '',
    roll_price: '',
    notes: ''
  });

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const res = await inventoryService.getInventory(params);
      setInventory(res.data.inventory);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب بيانات المخزن');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    inventoryService.getUniqueValues().then(res => {
      setUniqueValues({
        products: res.data.products || [],
        companies: res.data.companies || []
      });
    }).catch(console.error);
  }, [fetchData]);

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        date: format(new Date(item.date), 'yyyy-MM-dd'),
        company: item.company || '',
        product: item.product || '',
        weight_quantity: item.weight_quantity,
        count: item.count,
        roll_price: item.roll_price,
        notes: item.notes || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        company: '',
        product: '',
        weight_quantity: '',
        count: '',
        roll_price: '',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleRestock = (item) => {
    setEditingItem(null); // It's a new entry, not an edit!
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      company: item.company || '',
      product: item.product || '',
      weight_quantity: '',
      count: '',
      roll_price: item.roll_price || '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.date || !formData.product.trim()) {
      return toast.error('التاريخ واسم المنتج مطلوبان');
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        weight_quantity: Number(formData.weight_quantity || 0),
        count: Number(formData.count || 0),
        roll_price: Number(formData.roll_price || 0)
      };

      if (editingItem) {
        await inventoryService.updateInventory(editingItem.id, payload);
        toast.success('تم تحديث بيانات المخزن بنجاح');
      } else {
        await inventoryService.addInventory(payload);
        toast.success('تم إضافة المنتج للمخزن بنجاح');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id) => {
    setItemToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await inventoryService.deleteInventory(itemToDelete);
      toast.success('تم الحذف بنجاح');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ أثناء الحذف');
    } finally {
      setIsConfirmOpen(false);
      setItemToDelete(null);
    }
  };

  const columns = [
    { key: 'date', label: 'التاريخ', render: (row) => format(new Date(row.date), 'yyyy/MM/dd') },
    { key: 'company', label: 'الشركة', render: (row) => row.company || '—' },
    { key: 'product', label: 'الصنف/المنتج' },
    { key: 'weight_quantity', label: 'الوزن (كج)', render: (row) => Number(row.weight_quantity).toFixed(3) },
    { key: 'count', label: 'عدد اللفات', render: (row) => row.count || '0' },
    { key: 'issued_quantity', label: 'مباع (لفة)', render: (row) => Number(row.issued_quantity) },
    { key: 'available_count', label: 'المتاح (لفة)', render: (row) => {
        const avail = Number(row.count) - Number(row.issued_quantity);
        return <span style={{ color: avail <= 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 'bold' }}>{avail}</span>;
      }
    },
    { key: 'roll_price', label: 'سعر اللفة', render: (row) => Number(row.roll_price).toFixed(2) },
    { key: 'total', label: 'الإجمالي', render: (row) => Number(row.total).toFixed(2) },
  ];

  const renderActions = (row) => (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button className="btn btn-icon btn-ghost" onClick={() => handleRestock(row)} style={{ color: 'var(--primary)' }} title="تزويد مخزون (وارد جديد)">
        <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>+</span>
      </button>
      <button className="btn btn-icon btn-ghost" onClick={() => handleOpenModal(row)} title="تعديل">
        <Edit size={16} />
      </button>
      <button className="btn btn-icon btn-ghost" onClick={() => handleDeleteClick(row.id)} style={{ color: 'var(--danger)' }} title="حذف">
        <Trash2 size={16} />
      </button>
    </div>
  );

  const filterConfig = [
    {
      key: 'product',
      label: 'المنتج / الصنف',
      type: 'select',
      options: uniqueValues.products.map(p => ({ label: p, value: p }))
    },
    {
      key: 'company',
      label: 'الشركة',
      type: 'select',
      options: uniqueValues.companies.map(c => ({ label: c, value: c }))
    },
    {
      key: 'date',
      label: 'الفترة الزمنية',
      type: 'date-range'
    }
  ];

  return (
    <>
      <DataTable
        title="المخازن"
        columns={columns}
        data={inventory}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchData}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'تعديل بيانات مخزن' : 'إضافة منتج للمخزن'}
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

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">الشركة (اختياري)</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل اسم الشركة"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">الصنف / المنتج *</label>
              <input
                type="text"
                className="form-input"
                placeholder="أدخل اسم المنتج"
                value={formData.product}
                onChange={(e) => setFormData({ ...formData, product: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">الوزن (كج)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                className="form-input"
                value={formData.weight_quantity}
                onChange={(e) => setFormData({ ...formData, weight_quantity: e.target.value })}
                placeholder="أدخل الوزن بالكيلوجرام"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">عدد اللفات * {editingItem && <span style={{fontSize:'0.75rem', color:'var(--danger)'}}>(مغلق للتعديل، استخدم زر + للزيادة)</span>}</label>
              <input
                type="number"
                step="1"
                min="0"
                className="form-input"
                value={formData.count}
                onChange={(e) => setFormData({ ...formData, count: e.target.value })}
                placeholder="أدخل عدد اللفات"
                disabled={!!editingItem}
                style={editingItem ? { background: 'var(--bg-secondary)', cursor: 'not-allowed' } : {}}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">سعر اللفة (شراء) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input"
              value={formData.roll_price}
              onChange={(e) => setFormData({ ...formData, roll_price: e.target.value })}
            />
            {Number(formData.count) > 0 && Number(formData.roll_price) > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--success)', marginTop: '4px', display: 'block' }}>
                الإجمالي المحتسب: {(Number(formData.count) * Number(formData.roll_price)).toFixed(2)} ج.م
                ({formData.count} لفة × {formData.roll_price} ج.م)
              </span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">ملاحظات</label>
            <textarea
              className="form-textarea"
              rows="3"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            ></textarea>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا الصنف من المخزن؟"
      />
    </>
  );
};

export default InventoryPage;
