import { useState, useRef } from 'react';
import {
  Printer, X, FileText, Receipt, CheckCircle, Calendar, Phone,
  CreditCard, Wallet, Banknote, Smartphone, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';
import { format } from 'date-fns';
import '../common/PrintableModal.css';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// Simple Arabic Tafqeet Helper
const tafqeetNumber = (num) => {
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return 'صفر جنيه مصري فقط لا غير';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  const convertThreeDigits = (val) => {
    let res = '';
    const h = Math.floor(val / 100);
    const rem = val % 100;
    if (h > 0) res += hundreds[h];
    if (rem > 0) {
      if (res) res += ' و ';
      if (rem < 20) res += ones[rem];
      else {
        const t = Math.floor(rem / 10);
        const o = rem % 10;
        if (o > 0) res += `${ones[o]} و ${tens[t]}`;
        else res += tens[t];
      }
    }
    return res;
  };

  let words = '';
  const thousands = Math.floor(n / 1000);
  const remainder = n % 1000;

  if (thousands > 0) {
    if (thousands === 1) words += 'ألف';
    else if (thousands === 2) words += 'ألفان';
    else if (thousands >= 3 && thousands <= 10) words += `${convertThreeDigits(thousands)} آلاف`;
    else words += `${convertThreeDigits(thousands)} ألف`;
  }

  if (remainder > 0) {
    if (words) words += ' و ';
    words += convertThreeDigits(remainder);
  }

  return `فقط وقدره ${words} جنيه مصري لا غير`;
};

const PrintableCustodyVoucher = ({ isOpen, onClose, voucher }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !voucher) return null;

  const isDisbursement = voucher.type === 'disbursement';
  const voucherDate = voucher.date ? new Date(voucher.date) : new Date();
  const voucherNumber = voucher.receipt_number || (isDisbursement ? `CSD-${voucher.id}` : `CSC-${voucher.id}`);
  const amount = Number(voucher.amount || 0);
  const personName = voucher.person_name || 'بدون اسم';
  const phone = voucher.phone || '';
  const channel = voucher.channel || voucher.effective_channel || 'cash';
  const paymentTypeName =
    voucher.payment_type_name ||
    (channel === 'wallet'
      ? 'محفظة إلكترونية'
      : channel === 'instapay'
      ? 'انستاباي (InstaPay)'
      : channel === 'bank'
      ? 'تحويل بنكي'
      : 'نقدي (كاش)');

  const themeColor = isDisbursement ? '#ea580c' : '#16a34a';
  const themeBg = isDisbursement ? '#fff7ed' : '#f0fdf4';
  const themeBorder = isDisbursement ? '#fed7aa' : '#bbf7d0';
  const voucherTitle = isDisbursement ? 'سند صرف عهدة مالية' : 'سند استلام / توريد عهدة';
  const subTitle = isDisbursement ? 'إذن صرف وتسليم عهدة نقدية من الخزينة' : 'إيصال استلام واسترداد عهدة نقدية إلى الخزينة';

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const isA4 = printFormat === 'a4';
    const pageMargin = isA4 ? '10mm 15mm' : '4mm 6mm';

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('يرجى السماح بفتح النوافذ المنبثقة لإتمام الطباعة');
      return;
    }

    printWindow.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head>' +
      '<meta charset="UTF-8">' +
      '<title>' + voucherTitle + ' #' + voucherNumber + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">' +
      '<style>' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'body { font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif; direction: rtl; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '@page { size: ' + (isA4 ? 'A4 portrait' : '80mm auto') + '; margin: ' + pageMargin + '; }' +
      '@media print { ' +
      '  body { margin: 0; } ' +
      '  .no-break { page-break-inside: avoid !important; break-inside: avoid !important; } ' +
      '}' +
      'table { border-collapse: collapse; width: 100%; }' +
      '</style></head><body>' +
      content.innerHTML +
      '</body></html>'
    );

    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 400);
    };
    setTimeout(() => {
      if (!printWindow.closed) {
        printWindow.print();
        printWindow.close();
      }
    }, 1800);
  };

  return (
    <div className="printable-modal-overlay">
      <div className={`printable-modal-dialog format-${printFormat}`}>

        {/* Action Bar */}
        <div className="printable-action-bar">
          <div className="printable-action-top">
            <span className="printable-title">
              معاينة {voucherTitle} #{voucherNumber}
            </span>
            <button type="button" onClick={onClose} className="printable-close-btn mobile-only" title="إغلاق">
              <X size={18} />
            </button>
          </div>

          <div className="printable-action-controls">
            <div className="printable-format-switcher">
              {[
                { key: 'a4', label: 'سند A4 رسمي', Icon: FileText },
                { key: 'thermal', label: 'إيصال بون (80mm)', Icon: Receipt },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPrintFormat(key)}
                  className="printable-format-btn"
                  style={{
                    background: printFormat === key ? themeColor : 'transparent',
                    color: printFormat === key ? '#fff' : '#64748b',
                  }}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="printable-print-btn"
              style={{
                background: themeColor,
                boxShadow: `0 2px 8px ${isDisbursement ? 'rgba(234,88,12,0.3)' : 'rgba(22,163,74,0.3)'}`,
              }}
            >
              <Printer size={15} /> طباعة السند
            </button>

            <button
              type="button"
              onClick={onClose}
              className="printable-close-btn desktop-only"
              title="إغلاق"
            >
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
            {/* ===================== FORMAT: A4 ===================== */}
            {printFormat === 'a4' && (
            <div className="no-break" style={{ width: '100%' }}>
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: `2.5px solid ${themeColor}`,
                  paddingBottom: 14,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img
                    src="/logo.jpg"
                    alt="شعار"
                    style={{
                      width: 56,
                      height: 56,
                      objectFit: 'contain',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <div>
                    <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: themeColor }}>
                      مؤسسة السلسبيل للتجارة والتوزيع
                    </h1>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                      {subTitle}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      background: themeBg,
                      color: themeColor,
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      padding: '4px 14px',
                      borderRadius: 8,
                      marginBottom: 3,
                      border: `1px solid ${themeBorder}`,
                    }}
                  >
                    {voucherTitle} #{voucherNumber}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    التاريخ: <strong>{format(voucherDate, 'yyyy/MM/dd')}</strong>
                  </div>
                </div>
              </div>

              {/* Person & Voucher Meta Info Card */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 16,
                  display: 'grid',
                  gridTemplateColumns: phone ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
                  gap: 12,
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                    {isDisbursement ? 'يُصرف للأستاذ / المستلم:' : 'استلمنا من الأستاذ:'}
                  </span>
                  <strong style={{ color: '#0f172a', fontSize: '1rem' }}>{personName}</strong>
                </div>
                {phone && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                      رقم الهاتف:
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{phone}</strong>
                  </div>
                )}
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                    طريقة الدفع / الخزينة:
                  </span>
                  <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{paymentTypeName}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                    نوع الحركة:
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      background: themeBg,
                      color: themeColor,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: `1px solid ${themeBorder}`,
                    }}
                  >
                    {isDisbursement ? 'تسليم عهدة (صرف)' : 'استلام عهدة (توريد)'}
                  </span>
                </div>
              </div>

              {/* Amount Showcase Box */}
              <div
                style={{
                  background: themeBg,
                  border: `2px solid ${themeBorder}`,
                  borderRadius: 10,
                  padding: '18px 24px',
                  marginBottom: 18,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
                  {isDisbursement ? 'المبلغ المصروف كعهدة مالية' : 'المبلغ المسترد / المورد من العهدة'}
                </div>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    color: themeColor,
                    direction: 'ltr',
                    marginBottom: 6,
                  }}
                >
                  {fmt(amount, 2)} <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>ج.م</span>
                </div>
                <div
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: '#334155',
                    background: '#fff',
                    display: 'inline-block',
                    padding: '4px 16px',
                    borderRadius: 20,
                    border: `1px solid ${themeBorder}`,
                  }}
                >
                  {tafqeetNumber(amount)}
                </div>
              </div>

              {/* Details / Notes Section */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 20,
                  fontSize: '0.88rem',
                }}
              >
                <span style={{ fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>
                  البيان والغرض من العهدة:
                </span>
                <p style={{ color: voucher.notes ? '#1e293b' : '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                  {voucher.notes || 'لا يوجد بيان إضافي مسجل.'}
                </p>
              </div>

              {/* Signatures */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 16,
                  borderTop: '1px dashed #cbd5e1',
                  paddingTop: 16,
                  marginTop: 16,
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 30 }}>
                    {isDisbursement ? 'توقيع المستلم (صاحب العهدة)' : 'توقيع المورد (صاحب العهدة)'}
                  </div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 30 }}>
                    توقيع أمين الخزينة / المحاسب
                  </div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 30 }}>
                    اعتماد الإدارة / المدير المسؤول
                  </div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: 18, fontSize: '0.72rem', color: '#94a3b8' }}>
                مؤسسة السلسبيل — نظام إدارة الشركة | تاريخ الطباعة: {format(new Date(), 'yyyy/MM/dd HH:mm')}
              </div>
            </div>
          )}

          {/* ===================== FORMAT: THERMAL 80MM ===================== */}
          {printFormat === 'thermal' && (
            <div style={{ fontSize: '11px', lineHeight: 1.4, fontFamily: "'Courier New', Courier, monospace" }}>
              <div style={{ textAlign: 'center', paddingBottom: 6, borderBottom: '1px dashed #000', marginBottom: 6 }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>مؤسسة السلسبيل</div>
                <div style={{ fontSize: '10px' }}>{voucherTitle}</div>
                <div style={{ fontSize: '10px' }}>رقم #{voucherNumber}</div>
                <div style={{ fontSize: '10px' }}>التاريخ: {format(voucherDate, 'yyyy/MM/dd')}</div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <div>صاحب العهدة: <strong>{personName}</strong></div>
                {phone && <div>الهاتف: <strong>{phone}</strong></div>}
                <div>طريقة الدفع: <strong>{paymentTypeName}</strong></div>
                <div>نوع الحركة: <strong>{isDisbursement ? 'تسليم عهدة' : 'استلام عهدة'}</strong></div>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '6px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '10px' }}>المبلغ المطلوب:</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{fmt(amount, 2)} ج.م</div>
                <div style={{ fontSize: '9px', marginTop: 2 }}>{tafqeetNumber(amount)}</div>
              </div>

              {voucher.notes && (
                <div style={{ fontSize: '10px', marginTop: 4, color: '#333' }}>
                  البيان: {voucher.notes}
                </div>
              )}

              <div style={{ marginTop: 14, paddingTop: 6, borderTop: '1px dashed #000', textAlign: 'center', fontSize: '9px' }}>
                <div>توقيع المستلم: ........................</div>
                <div style={{ marginTop: 6 }}>شكراً لتعاملكم مع السلسبيل</div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableCustodyVoucher;

