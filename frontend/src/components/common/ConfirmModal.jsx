import Modal from './Modal';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'تأكيد', cancelText = 'إلغاء', isDanger = true }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div style={{ padding: '10px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>
        {message}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button 
          className="btn" 
          style={{ flex: 1, backgroundColor: isDanger ? 'var(--danger)' : 'var(--primary)', color: 'white' }} 
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmText}
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
          {cancelText}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
