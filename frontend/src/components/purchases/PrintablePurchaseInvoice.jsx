import { useState, useRef } from 'react';
import { Printer, X, FileText, Receipt, CheckCircle, Calendar, Phone, CreditCard, Wallet, Banknote, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import '../common/PrintableModal.css';

const PrintablePurchaseInvoice = ({ isOpen, onClose, purchase }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !purchase) return null;

  const purchaseDate = purchase.date ? new Date(purchase.date) : new Date();
  const invoiceNumber = purchase.id;
  const weightQty = Number(purchase.weight_quantity || 0);
  const rollCount = Number(purchase.count || 0);
  const pricePerTon = Number(purchase.price_per_ton || 0);
  const totalAmount = Number(purchase.total || 0);
  const creditUsed = Number(purchase.credit_used || 0);
  const treasuryPaid = Number(purchase.treasury_balance || 0);
  const channel = purchase.channel || 'cash';
  const companyName = purchase.company || '';
  const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

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
      '<title>فاتورة مشتريات #' + invoiceNumber + '</title>' +
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
              معاينة فاتورة المشتريات #{invoiceNumber}
            </span>
            <button type="button" onClick={onClose} className="printable-close-btn mobile-only" title="إغلاق">
              <X size={18} />
            </button>
          </div>

          <div className="printable-action-controls">
            <div className="printable-format-switcher">
              {[
                { key: 'a4', label: 'فاتورة A4', Icon: FileText },
                { key: 'thermal', label: 'إيصال بون (80mm)', Icon: Receipt }
              ].map(({ key, label, Icon }) => (
                <button key={key} type="button" onClick={() => setPrintFormat(key)} className="printable-format-btn" style={{
                  background: printFormat === key ? '#0284c7' : 'transparent',
                  color: printFormat === key ? '#fff' : '#64748b'
                }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <button type="button" onClick={handlePrint} className="printable-print-btn" style={{ background: '#0284c7' }}>
              <Printer size={15} /> طباعة الفاتورة
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
              <span>↔️ اسحب أفقياً لمعاينة كامل الفاتورة A4 أو اختر "إيصال بون"</span>
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
                  borderBottom: '2.5px solid #0284c7', paddingBottom: 16, marginBottom: 20
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <img src="/logo.jpg" alt="شعار السلسبيل"
                      style={{ width: 68, height: 68, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div>
                      <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#0369a1' }}>
                        مؤسسة السلسبيل للتجارة والتوزيع
                      </h1>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 3 }}>
                        إدارة المشتريات والتوريدات — فاتورة استلام وتوريد
                      </div>
                    </div>
                  </div>

                  {/* Invoice # and Date */}
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      display: 'inline-block', background: '#e0f2fe', color: '#0369a1',
                      fontWeight: 800, fontSize: '1.15rem', padding: '6px 14px', borderRadius: 8, marginBottom: 4
                    }}>
                      فاتورة مشتريات #{invoiceNumber}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      التاريخ: <strong>{format(purchaseDate, 'yyyy/MM/dd')}</strong>
                    </div>
                  </div>
                </div>

                {/* Supplier Info Card */}
                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                  padding: '12px 18px', marginBottom: 20, display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: '0.88rem'
                }}>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>المورد / التاجر:</span>
                    <strong style={{ color: '#0f172a', fontSize: '1rem' }}>{purchase.customer_name || 'بدون مورد'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>تاريخ الفاتورة:</span>
                    <strong>{format(purchaseDate, 'yyyy/MM/dd')}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.78rem', display: 'block' }}>طريقة سداد الخزينة:</span>
                    <span style={{
                      display: 'inline-block', background: '#e0f2fe', color: '#0369a1',
                      borderRadius: 5, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 700
                    }}>
                      {channelLabels[channel] || channelLabels.cash}
                    </span>
                  </div>
                </div>

                {/* Items Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: '#0284c7', color: '#fff' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.85rem' }}>#</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.85rem' }}>الصنف / المنتج</th>
                      {companyName && <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.85rem' }}>الشركة</th>}
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.85rem' }}>الوزن (كجم)</th>
                      {rollCount > 0 && <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.85rem' }}>عدد اللفات</th>}
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.85rem' }}>سعر الكجم (ج)</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.85rem' }}>إجمالي القيمة</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                      <td style={{ padding: '12px', color: '#64748b' }}>1</td>
                      <td style={{ padding: '12px' }}>
                        <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{purchase.product}</strong>
                      </td>
                      {companyName && <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{companyName}</td>}
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>{fmt(weightQty, 3)}</td>
                      {rollCount > 0 && <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>{rollCount.toLocaleString()}</td>}
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, color: '#0284c7', fontSize: '1rem' }}>
                        {fmt(pricePerTon)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'left', fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                        {fmt(totalAmount)} ج.م
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Totals & Settlement Box */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginBottom: 24 }}>
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                    padding: '14px 18px', fontSize: '0.85rem'
                  }}>
                    <span style={{ fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>ملاحظات الفاتورة:</span>
                    <p style={{ color: purchase.notes ? '#1e293b' : '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                      {purchase.notes || 'لا توجد ملاحظات مسجلة على هذه الفاتورة.'}
                    </p>
                  </div>

                  <div style={{
                    background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: 10,
                    padding: '14px 18px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                      <span style={{ color: '#475569' }}>إجمالي الفاتورة:</span>
                      <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{totalAmount.toFixed(2)} ج.م</strong>
                    </div>
                    {creditUsed > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#16a34a' }}>
                        <span>خصم من رصيد المورد:</span>
                        <strong>-{creditUsed.toFixed(2)} ج.م</strong>
                      </div>
                    )}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', padding: '8px 0',
                      fontSize: '1rem', fontWeight: 800, color: '#0284c7'
                    }}>
                      <span>المدفوع من الخزينة:</span>
                      <span>{treasuryPaid.toFixed(2)} ج.م</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'left', marginTop: 2 }}>
                      عبر {channelLabels[channel] || channelLabels.cash}
                    </div>
                  </div>
                </div>

                {/* Signatures */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
                  borderTop: '1px dashed #cbd5e1', paddingTop: 20, marginTop: 32, textAlign: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 36 }}>توقيع أمين المخزن / المستلم</div>
                    <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 36 }}>توقيع المحاسب المسؤول</div>
                    <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 36 }}>توقيع وسند استلام المورد</div>
                    <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
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
                  <div style={{ fontSize: '10px' }}>فاتورة توريد / مشتريات</div>
                  <div style={{ fontSize: '10px' }}>فاتورة #{invoiceNumber}</div>
                  <div style={{ fontSize: '10px' }}>التاريخ: {format(purchaseDate, 'yyyy/MM/dd')}</div>
                </div>

                <div style={{ marginBottom: 6 }}>
                  <div>المورد: <strong>{purchase.customer_name || 'بدون مورد'}</strong></div>
                  <div>الصنف: <strong>{purchase.product}</strong></div>
                  {companyName && <div>الشركة: <strong>{companyName}</strong></div>}
                </div>

                <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>الوزن (كجم):</span>
                    <span>{fmt(weightQty, 3)}</span>
                  </div>
                  {rollCount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>عدد اللفات:</span>
                      <span>{rollCount.toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>سعر الكجم (ج):</span>
                    <span>{fmt(pricePerTon)}</span>
                  </div>
                </div>

                <div style={{ padding: '4px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
                    <span>إجمالي الفاتورة:</span>
                    <span>{totalAmount.toFixed(2)} ج.م</span>
                  </div>
                  {creditUsed > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>خصم من الرصيد:</span>
                      <span>-{creditUsed.toFixed(2)} ج.م</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>مدفوع الخزينة ({channelLabels[channel] || channelLabels.cash}):</span>
                    <span>{treasuryPaid.toFixed(2)} ج.م</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', fontSize: '9px', marginTop: 12 }}>
                  شكراً لتعاملكم مع السلسبيل
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintablePurchaseInvoice;
