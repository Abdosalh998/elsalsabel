import { useState, useEffect, useCallback } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { customerService } from '../../services/customer.service';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import ConfirmModal from '../../components/common/ConfirmModal';

const CustomersPage = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueValues, setUniqueValues] = useState({ names: [], phones: [] });
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  // Confirm Delete Modal states
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  
  // Form states
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCustomers = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const response = await customerService.getCustomers(params);
      setCustomers(response.data.customers);
    } catch (error) {
      toast.error('حدث خطأ أثناء جلب بيانات العملاء');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    customerService.getUniqueValues().then(res => {
      setUniqueValues({
        names: res.data.names || [],
        phones: res.data.phones || []
      });
    }).catch(console.error);
  }, [fetchCustomers]);

  const handleOpenModal = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({ 
        name: customer.name, 
        phone: customer.phone || ''
      });
    } else {
      setEditingCustomer(null);
      setFormData({ name: '', phone: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCustomer(null);
    setFormData({ name: '', phone: '', total_payments: '', customer_total: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return toast.error('اسم العميل مطلوب');
    }

    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        await customerService.updateCustomer(editingCustomer.id, formData);
        toast.success('تم تحديث بيانات العميل بنجاح');
      } else {
        await customerService.addCustomer(formData);
        toast.success('تم إضافة العميل بنجاح');
      }
      handleCloseModal();
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (id) => {
    setCustomerToDelete(id);
    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await customerService.deleteCustomer(customerToDelete);
      toast.success('تم حذف العميل بنجاح');
      fetchCustomers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'لا يمكن حذف هذا العميل');
    } finally {
      setCustomerToDelete(null);
      setIsConfirmOpen(false);
    }
  };

  const columns = [
    { key: 'name', label: 'اسم العميل' },
    { key: 'phone', label: 'رقم الهاتف', render: (row) => row.phone || '—' },
    { key: 'total_payments', label: 'الرصيد الدائن (له)', render: (row) => <span style={{ color: Number(row.total_payments) > 0 ? 'var(--success)' : 'inherit', fontWeight: Number(row.total_payments) > 0 ? 600 : 'normal' }}>{Number(row.total_payments).toFixed(2)} ج.م</span> },
    { key: 'customer_total', label: 'إجمالي المديونية (عليه)', render: (row) => <span style={{ color: Number(row.customer_total) > 0 ? 'var(--danger)' : 'inherit', fontWeight: Number(row.customer_total) > 0 ? 600 : 'normal' }}>{Number(row.customer_total).toFixed(2)} ج.م</span> },
    { key: 'remaining_balance', label: 'صافي الحساب', render: (row) => {
        const bal = Number(row.remaining_balance);
        const color = bal > 0 ? 'var(--danger)' : bal < 0 ? 'var(--success)' : 'inherit';
        return <span style={{ color, fontWeight: 'bold' }}>{bal === 0 ? 'خالص (0.00 ج.م)' : `${Math.abs(bal).toFixed(2)} ج.م ${bal > 0 ? '(عليه)' : '(له)'}`}</span>;
      }
    }
  ];

  const renderActions = (row) => (
    <>
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
      key: 'name',
      label: 'اسم العميل',
      type: 'select',
      options: uniqueValues.names.map(n => ({ label: n, value: n }))
    },
    {
      key: 'phone',
      label: 'رقم الهاتف',
      type: 'select',
      options: uniqueValues.phones.map(p => ({ label: p, value: p }))
    },
    {
      key: 'balance_type',
      label: 'حالة الرصيد',
      type: 'select',
      options: [
        { label: 'رصيد عليه (مدين)', value: 'debtor' },
        { label: 'رصيد له (دائن)', value: 'creditor' },
        { label: 'بدون رصيد', value: 'zero' },
      ]
    }
  ];

  return (
    <>
      <DataTable
        title="إدارة العملاء"
        columns={columns}
        data={customers}
        loading={loading}
        filterConfig={filterConfig}
        onFilter={fetchCustomers}
        onAdd={() => handleOpenModal()}
        actions={renderActions}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">اسم العميل *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="أدخل اسم العميل ثلاثي"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">رقم الهاتف</label>
            <input
              type="tel"
              className="form-input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="مثال: 01012345678"
            />
          </div>

          
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={handleCloseModal}>
              إلغاء
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setCustomerToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا العميل؟ (لا يمكن حذف عميل لديه فواتير أو أرصدة سابقة)"
      />
    </>
  );
};

export default CustomersPage;
