import { useState, useRef } from 'react';
import { Printer, X, FileText, Receipt, CheckCircle, Calendar, Phone, CreditCard, Wallet, Banknote, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import '../common/PrintableModal.css';

const PrintableExpenseVoucher = ({ isOpen, onClose, expense }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !expense) return null;

  const expenseDate = expense.date ? new Date(expense.date) : new Date();
  const voucherNumber = expense.id;
  const totalAmount = Number(expense.amount || 0);
  const recipientName = expense.recipient_name || '—';
  const channel = expense.channel || 'cash';
  const items = Array.isArray(expense.items) && expense.items.length > 0
    ? expense.items
    : [{ description: expense.description, amount: totalAmount, notes: expense.notes || '' }];

  const channelLabels = {
    cash: 'نقدي (كاش)',
    wallet: 'محفظة إلكترونية',
    instapay: 'انستاباي'
  };



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
      '<title>سند صرف #' + voucherNumber + '</title>' +
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
              معاينة سند الصرف #{voucherNumber}
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
                  background: printFormat === key ? '#dc2626' : 'transparent',
                  color: printFormat === key ? '#fff' : '#64748b'
                }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <button type="button" onClick={handlePrint} className="printable-print-btn" style={{ background: '#dc2626' }}>
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
                borderBottom: '2.5px solid #dc2626', paddingBottom: 16, marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <img src="/logo.jpg" alt="شعار السلسبيل"
                    style={{ width: 68, height: 68, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div>
                    <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#991b1b' }}>
                      مؤسسة السلسبيل للتجارة والتوزيع
                    </h1>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 3 }}>
                      الإدارة المالية والخزينة — إذن وسند صرف نقدية
                    </div>
                  </div>
                </div>

                {/* Voucher # and Date */}
                <div style={{ textAlign: 'left' }}>
                  <div style={{
                    display: 'inline-block', background: '#fee2e2', color: '#991b1b',
                    fontWeight: 800, fontSize: '1.15rem', padding: '6px 14px', borderRadius: 8, marginBottom: 4
                  }}>
                    سند صرف #{voucherNumber}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    التاريخ: <strong>{format(expenseDate, 'yyyy/MM/dd')}</strong>
                  </div>
                </div>
              </div>

              {/* Voucher Info Card */}
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                padding: '14px 18px', marginBottom: 20, display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: '0.88rem'
              }}>
                <div>
                  <span style={{ color: '#991b1b', fontSize: '0.78rem', display: 'block' }}>يُصرف إلى السيد / الجهة:</span>
                  <strong style={{ color: '#0f172a', fontSize: '1.05rem' }}>{recipientName}</strong>
                </div>
                <div>
                  <span style={{ color: '#991b1b', fontSize: '0.78rem', display: 'block' }}>طريقة الخصم من الخزينة:</span>
                  <span style={{
                    display: 'inline-block', background: '#fee2e2', color: '#991b1b',
                    borderRadius: 5, padding: '2px 8px', fontSize: '0.82rem', fontWeight: 700
                  }}>
                    {channelLabels[channel] || channelLabels.cash}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#991b1b', fontSize: '0.78rem', display: 'block' }}>إجمالي المبلغ المصروف:</span>
                  <strong style={{ color: '#dc2626', fontSize: '1.25rem' }}>{totalAmount.toFixed(2)} ج.م</strong>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead>
                  <tr style={{ background: '#dc2626', color: '#fff' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.85rem', width: '50px' }}>#</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.85rem' }}>بيان بند المصروف</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.85rem' }}>ملاحظات البند</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.85rem', width: '160px' }}>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <strong style={{ color: '#0f172a' }}>{item.description}</strong>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.85rem' }}>
                        {item.notes || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#dc2626' }}>
                        {Number(item.amount || 0).toFixed(2)} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#fef2f2', borderTop: '2px solid #dc2626', fontWeight: 800 }}>
                    <td colSpan={3} style={{ padding: '12px', textAlign: 'right', color: '#991b1b', fontSize: '0.95rem' }}>
                      إجمالي مبلغ السند
                    </td>
                    <td style={{ padding: '12px', textAlign: 'left', color: '#dc2626', fontSize: '1.15rem' }}>
                      {totalAmount.toFixed(2)} ج.م
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Notes / Override Box */}
              {(expense.notes || expense.override_reason) && (
                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                  padding: '12px 16px', marginBottom: 20, fontSize: '0.85rem'
                }}>
                  {expense.notes && (
                    <div style={{ marginBottom: expense.override_reason ? 6 : 0 }}>
                      <strong style={{ color: '#475569' }}>ملاحظات عامة: </strong>
                      <span style={{ color: '#1e293b' }}>{expense.notes}</span>
                    </div>
                  )}
                  {expense.override_reason && (
                    <div style={{ color: '#b45309' }}>
                      <strong>سبب تجاوز رصيد الخزينة: </strong>
                      <span>{expense.override_reason}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Signatures */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
                borderTop: '1px dashed #cbd5e1', paddingTop: 24, marginTop: 28, textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 36 }}>توقيع المستلم (المصروف له)</div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 36 }}>توقيع أمين الخزينة / المحاسب</div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 36 }}>اعتماد مدير الفرع</div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.75rem', color: '#94a3b8' }}>
                مؤسسة السلسبيل — نظام إدارة الشركة | تاريخ الطباعة: {format(new Date(), 'yyyy/MM/dd HH:mm')}
              </div>
            </div>
          )}

          {/* ════ THERMAL 80mm FORMAT ════ */}
          {printFormat === 'thermal' && (
            <div style={{ fontSize: '11px', lineHeight: 1.4, fontFamily: "'Courier New', Courier, monospace" }}>
              <div style={{ textAlign: 'center', paddingBottom: 8, borderBottom: '1px dashed #000', marginBottom: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>مؤسسة السلسبيل</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>سند صرف نقدية</div>
                <div style={{ fontSize: '10px' }}>سند رقم #{voucherNumber}</div>
                <div style={{ fontSize: '10px' }}>التاريخ: {format(expenseDate, 'yyyy/MM/dd')}</div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <div>المستلم: <strong>{recipientName}</strong></div>
                <div>طريقة الصرف: <strong>{channelLabels[channel] || channelLabels.cash}</strong></div>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0' }}>
                {items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>{it.description}</span>
                    <span>{Number(it.amount || 0).toFixed(2)} ج.م</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px', margin: '6px 0' }}>
                <span>إجمالي المبلغ:</span>
                <span>{totalAmount.toFixed(2)} ج.م</span>
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

export default PrintableExpenseVoucher;
