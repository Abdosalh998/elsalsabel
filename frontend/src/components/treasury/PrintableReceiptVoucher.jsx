import { useState, useRef } from 'react';
import { Printer, X, FileText, Receipt, CheckCircle, Calendar, Phone, CreditCard, Wallet, Banknote } from 'lucide-react';
import { format } from 'date-fns';
import '../common/PrintableModal.css';

const PrintableReceiptVoucher = ({ isOpen, onClose, record }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !record) return null;

  const recordDate = record.date ? new Date(record.date) : new Date();
  const voucherNumber = record.id;
  const amount = Number(record.amount || 0);
  const customerName = record.customer_name || 'عميل نقدي / إيداع عام';
  const paymentType = record.payment_type || 'نقدي';

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const isA4 = printFormat === 'a4';
    const pageMargin = isA4 ? '12mm 15mm' : '4mm 6mm';

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('يرجى السماح بفتح النوافذ المنبثقة لإتمام الطباعة');
      return;
    }

    printWindow.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head>' +
      '<meta charset="UTF-8">' +
      '<title>سند قبض #' + voucherNumber + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">' +
      '<style>' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'body { font-family: "Tajawal","Segoe UI",Tahoma,sans-serif; direction: rtl; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '@page { size: ' + (isA4 ? 'A4' : '80mm auto') + '; margin: ' + pageMargin + '; }' +
      '@media print { body { margin: 0; } }' +
      'table { border-collapse: collapse; width: 100%; }' +
      '</style></head><body>' +
      content.innerHTML +
      '</body></html>'
    );

    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 400);
    };
    setTimeout(() => { if (!printWindow.closed) { printWindow.print(); printWindow.close(); } }, 1800);
  };

  return (
    <div className="printable-modal-overlay">
      <div className={`printable-modal-dialog format-${printFormat}`}>

        {/* Action Bar */}
        <div className="printable-action-bar">
          <div className="printable-action-top">
            <span className="printable-title">
              معاينة سند القبض #{voucherNumber}
            </span>
            <button type="button" onClick={onClose} className="printable-close-btn mobile-only" title="إغلاق">
              <X size={18} />
            </button>
          </div>

          <div className="printable-action-controls">
            <div className="printable-format-switcher">
              {[
                { key: 'a4', label: 'سند A4 رسمي', Icon: FileText },
                { key: 'thermal', label: 'إيصال بون (80mm)', Icon: Receipt }
              ].map(({ key, label, Icon }) => (
                <button key={key} type="button" onClick={() => setPrintFormat(key)} className="printable-format-btn" style={{
                  background: printFormat === key ? '#16a34a' : 'transparent',
                  color: printFormat === key ? '#fff' : '#64748b'
                }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <button type="button" onClick={handlePrint} className="printable-print-btn" style={{ background: '#16a34a' }}>
              <Printer size={15} /> طباعة السند
            </button>

            <button type="button" onClick={onClose} className="printable-close-btn desktop-only" title="إغلاق">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Viewport */}
        <div className="printable-scroll-viewport">
          {printFormat === 'a4' && (
            <div className="printable-mobile-hint">
              <span>↔️ اسحب أفقياً لمعاينة كامل السند A4 أو اختر "إيصال بون"</span>
            </div>
          )}

          {/* Paper Sheet */}
          <div ref={printRef} className={`printable-sheet sheet-${printFormat}`}>
            {/* ════ A4 FORMAT ════ */}
            {printFormat === 'a4' && (
            <div>
              {/* Header */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '2.5px solid #16a34a', paddingBottom: 16, marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <img src="/logo.jpg" alt="شعار السلسبيل"
                    style={{ width: 68, height: 68, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div>
                    <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#15803d' }}>
                      مؤسسة السلسبيل للتجارة والتوزيع
                    </h1>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 3 }}>
                      الإدارة المالية والخزينة — إيصال وسند توريد وقبض نقدية
                    </div>
                  </div>
                </div>

                {/* Voucher # */}
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    display: 'inline-block', background: '#dcfce7', color: '#15803d',
                    fontWeight: 800, fontSize: '1.15rem', padding: '6px 14px', borderRadius: 8, marginBottom: 4
                  }}>
                    سند قبض #{voucherNumber}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    التاريخ: <strong>{format(recordDate, 'yyyy/MM/dd')}</strong>
                  </div>
                </div>
              </div>

              {/* Receipt Info Card */}
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                padding: '16px 20px', marginBottom: 20, display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, fontSize: '0.9rem'
              }}>
                <div>
                  <span style={{ color: '#15803d', fontSize: '0.8rem', display: 'block' }}>استلمنا من المكرم / السيد:</span>
                  <strong style={{ color: '#0f172a', fontSize: '1.1rem' }}>{customerName}</strong>
                </div>
                <div>
                  <span style={{ color: '#15803d', fontSize: '0.8rem', display: 'block' }}>طريقة القبض / نوع الدفع:</span>
                  <span style={{
                    display: 'inline-block', background: '#dcfce7', color: '#15803d',
                    borderRadius: 5, padding: '2px 8px', fontSize: '0.85rem', fontWeight: 700
                  }}>
                    {paymentType}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#15803d', fontSize: '0.8rem', display: 'block' }}>المبلغ المقبوض:</span>
                  <strong style={{ color: '#16a34a', fontSize: '1.35rem' }}>{amount.toFixed(2)} ج.م</strong>
                </div>
              </div>

              {/* Details Box */}
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                padding: '16px 20px', marginBottom: 24, fontSize: '0.9rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid #e2e8f0', marginBottom: 10 }}>
                  <span style={{ color: '#475569' }}>وذلك سداداً عن:</span>
                  <strong style={{ color: '#0f172a' }}>{record.notes || 'إيداع نقدي / دفعة حساب'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.85rem' }}>
                  <span>حالة التوريد للخزينة:</span>
                  <span style={{ color: '#15803d', fontWeight: 700 }}>✓ تم إيداع المبلغ بنجاح في رصيد الخزينة</span>
                </div>
              </div>

              {/* Signatures */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 36,
                borderTop: '1px dashed #cbd5e1', paddingTop: 28, marginTop: 36, textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 40 }}>توقيع المودع / العميل</div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '60%', margin: '0 auto' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 40 }}>توقيع أمين الخزينة / المستلم</div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '60%', margin: '0 auto' }}></div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: 28, fontSize: '0.75rem', color: '#94a3b8' }}>
                مؤسسة السلسبيل — نظام إدارة الشركة | تاريخ الطباعة: {format(new Date(), 'yyyy/MM/dd HH:mm')}
              </div>
            </div>
          )}

          {/* ════ THERMAL 80mm FORMAT ════ */}
          {printFormat === 'thermal' && (
            <div style={{ fontSize: '11px', lineHeight: 1.4, fontFamily: "'Courier New', Courier, monospace" }}>
              <div style={{ textAlign: 'center', paddingBottom: 8, borderBottom: '1px dashed #000', marginBottom: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>مؤسسة السلسبيل</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>سند قبض نقدية</div>
                <div style={{ fontSize: '10px' }}>سند رقم #{voucherNumber}</div>
                <div style={{ fontSize: '10px' }}>التاريخ: {format(recordDate, 'yyyy/MM/dd')}</div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <div>استلمنا من: <strong>{customerName}</strong></div>
                <div>نوع الدفع: <strong>{paymentType}</strong></div>
                {record.notes && <div>البيان: <span>{record.notes}</span></div>}
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '6px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
                  <span>المبلغ المقبوض:</span>
                  <span>{amount.toFixed(2)} ج.م</span>
                </div>
              </div>


              <div style={{ textAlign: 'center', fontSize: '9px', marginTop: 6 }}>
                سند رسمي معتمد — مؤسسة السلسبيل
              </div>
            </div>
          )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableReceiptVoucher;
