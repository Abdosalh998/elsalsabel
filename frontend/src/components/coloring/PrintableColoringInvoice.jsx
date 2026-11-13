import { useState, useRef } from 'react';
import { Printer, X, FileText, Receipt, Palette, Scale, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import '../common/PrintableModal.css';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const PrintableColoringInvoice = ({ isOpen, onClose, order }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !order) return null;

  const orderDate = order.date ? new Date(order.date) : new Date();
  const orderNumber = order.order_number || `CLR-${order.id}`;
  const issuedWeight = Number(order.issued_weight || 0);
  const issuedRolls = Number(order.issued_rolls || 0);
  const returnedWeight = Number(order.returned_weight || 0);
  const returnedRolls = Number(order.returned_rolls || 0);
  const weightGain = Number(order.weight_gain || 0);
  const coloringCost = Number(order.coloring_cost || 0);
  const coloringCompany = order.coloring_company || '';
  const paymentTypeName =
    order.payment_type_name ||
    (order.channel === 'wallet'
      ? 'محفظة إلكترونية'
      : order.channel === 'bank'
        ? 'تحويل بنكي'
        : order.channel === 'instapay'
          ? 'انستاباي'
          : 'نقدي (كاش)');

  const statusMap = {
    pending: { label: 'قيد التنفيذ للتلوين', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    returned: { label: 'عاد من التلوين', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    stocked: { label: 'مرحّل للمخزن للبيع', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  };

  const currentStatus = statusMap[order.status] || {
    label: order.status,
    color: '#475569',
    bg: '#f1f5f9',
    border: '#cbd5e1',
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const isA4 = printFormat === 'a4';
    const pageMargin = isA4 ? '8mm 12mm' : '4mm 6mm';

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('يرجى السماح بفتح النوافذ المنبثقة لإتمام الطباعة');
      return;
    }

    printWindow.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head>' +
      '<meta charset="UTF-8"><title>فاتورة أمر تلوين #' + orderNumber + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">' +
      '<style>' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'body { font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif; direction: rtl; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '@page { size: ' + (isA4 ? 'A4 portrait' : '80mm auto') + '; margin: ' + pageMargin + '; }' +
      '@media print { ' +
      '  html, body { height: 100%; margin: 0 !important; padding: 0 !important; } ' +
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
              معاينة أمر التلوين #{orderNumber}
            </span>
            <button type="button" onClick={onClose} className="printable-close-btn mobile-only" title="إغلاق">
              <X size={18} />
            </button>
          </div>

          <div className="printable-action-controls">
            <div className="printable-format-switcher">
              {[
                { key: 'a4', label: 'فاتورة A4', Icon: FileText },
                { key: 'thermal', label: 'إيصال بون (80mm)', Icon: Receipt },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPrintFormat(key)}
                  className="printable-format-btn"
                  style={{
                    background: printFormat === key ? '#2563eb' : 'transparent',
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
                background: '#2563eb',
                boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
              }}
            >
              <Printer size={15} /> طباعة الفاتورة
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
              <span>↔️ اسحب أفقياً لمعاينة كامل الفاتورة A4 أو اختر "إيصال بون"</span>
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
                  borderBottom: '2.5px solid #2563eb',
                  paddingBottom: 12,
                  marginBottom: 14,
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
                    <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#2563eb' }}>
                      مؤسسة السلسبيل للتجارة والتوزيع
                    </h1>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                      إدارة تشغيل وأوامر التلوين — إذن / فاتورة تلوين
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      padding: '4px 12px',
                      borderRadius: 8,
                      marginBottom: 3,
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    أمر تلوين #{orderNumber}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    التاريخ: <strong>{format(orderDate, 'yyyy/MM/dd')}</strong>
                  </div>
                </div>
              </div>

              {/* Order Meta Info Card */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 14,
                  display: 'grid',
                  gridTemplateColumns: coloringCompany ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)',
                  gap: 10,
                  fontSize: '0.82rem',
                }}
              >
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                    الصنف المنصرف:
                  </span>
                  <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                    {order.product || order.inventory_name || '-'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                    الصنف بعد التلوين:
                  </span>
                  <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                    {order.colored_product || '-'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                    اللون المطلوب:
                  </span>
                  <strong style={{ color: '#2563eb', fontSize: '0.9rem' }}>
                    {order.color || '-'}
                  </strong>
                </div>
                {coloringCompany && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                      شركة / ورشة التلوين:
                    </span>
                    <strong style={{ color: '#0f766e', fontSize: '0.9rem' }}>
                      {coloringCompany}
                    </strong>
                  </div>
                )}
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block', marginBottom: 2 }}>
                    الحالة:
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      background: currentStatus.bg,
                      color: currentStatus.color,
                      border: `1px solid ${currentStatus.border}`,
                    }}
                  >
                    {currentStatus.label}
                  </span>
                </div>
              </div>

              {/* Quantities Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
                <thead>
                  <tr style={{ background: '#2563eb', color: '#fff' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.82rem' }}>البيان</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.82rem' }}>الوزن (كجم)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.82rem' }}>عدد اللفات</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.82rem' }}>ملاحظات الحركة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>الوزن المنصرف للتلوين</strong>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: '0.92rem' }}>
                      {fmt(issuedWeight, 2)} كجم
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>
                      {issuedRolls > 0 ? `${issuedRolls} لفة` : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                      صرف من المخزن الرئيسي
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>الوزن الداخل بعد التلوين</strong>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, fontSize: '0.92rem' }}>
                      {returnedWeight > 0 ? `${fmt(returnedWeight, 2)} كجم` : 'قيد التلوين'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 600 }}>
                      {returnedRolls > 0 ? `${returnedRolls} لفة` : '-'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                      {order.status === 'pending' ? 'في انتظار استلام البضاعة' : 'تم الاستلام والفحص'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '2px solid #cbd5e1', background: '#eff6ff' }}>
                    <td style={{ padding: '8px 10px' }}>
                      <strong style={{ fontSize: '0.88rem', color: '#1d4ed8' }}>فرق الوزن (الزيادة من البودرة / الدهان)</strong>
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        textAlign: 'center',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        color: weightGain >= 0 ? '#16a34a' : '#dc2626',
                      }}
                    >
                      {weightGain >= 0 ? `+${fmt(weightGain, 2)}` : fmt(weightGain, 2)} كجم
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>-</td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', color: '#2563eb' }}>
                      {weightGain !== 0 ? 'فروق تلوين معتمدة' : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Cost & Settlement Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, marginBottom: 16 }}>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: '0.82rem',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#475569', display: 'block', marginBottom: 3 }}>
                    ملاحظات أمر التلوين:
                  </span>
                  <p style={{ color: order.notes ? '#1e293b' : '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                    {order.notes || 'لا توجد ملاحظات مسجلة.'}
                  </p>
                </div>

                <div
                  style={{
                    background: '#eff6ff',
                    border: '1.5px solid #bfdbfe',
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '3px 0',
                      borderBottom: '1px solid #dbeafe',
                      fontSize: '0.84rem',
                    }}
                  >
                    <span style={{ color: '#475569' }}>الوزن المعتمد:</span>
                    <strong>{fmt(returnedWeight > 0 ? returnedWeight : issuedWeight, 2)} كجم</strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 0',
                      fontSize: '1.05rem',
                      fontWeight: 800,
                      color: '#1d4ed8',
                    }}
                  >
                    <span>تكلفة التلوين:</span>
                    <span>{fmt(coloringCost, 2)} ج.م</span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#64748b', textAlign: 'left', marginTop: 2 }}>
                    الخصم من الخزينة: <strong>{paymentTypeName}</strong>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 16,
                  borderTop: '1px dashed #cbd5e1',
                  paddingTop: 12,
                  marginTop: 12,
                  textAlign: 'center',
                }}
              >
                {['توقيع مسؤول التلوين', 'توقيع أمين المخزن / المستلم', 'توقيع المحاسب المسؤول'].map((sig) => (
                  <div key={sig}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 26 }}>{sig}</div>
                    <div style={{ borderBottom: '1px solid #94a3b8', width: '65%', margin: '0 auto' }}></div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ textAlign: 'center', marginTop: 14, fontSize: '0.7rem', color: '#94a3b8' }}>
                مؤسسة السلسبيل — نظام إدارة الشركة | تاريخ الطباعة: {format(new Date(), 'yyyy/MM/dd HH:mm')}
              </div>
            </div>
          )}

          {/* ===================== FORMAT: THERMAL 80MM ===================== */}
          {printFormat === 'thermal' && (
            <div style={{ fontSize: '11px', lineHeight: 1.4, fontFamily: "'Courier New', Courier, monospace" }}>
              <div style={{ textAlign: 'center', paddingBottom: 6, borderBottom: '1px dashed #000', marginBottom: 6 }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>مؤسسة السلسبيل</div>
                <div style={{ fontSize: '10px' }}>أمر تلوين بضاعة</div>
                <div style={{ fontSize: '10px' }}>رقم #{orderNumber}</div>
                <div style={{ fontSize: '10px' }}>التاريخ: {format(orderDate, 'yyyy/MM/dd')}</div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <div>الصنف المنصرف: <strong>{order.product || order.inventory_name || '-'}</strong></div>
                <div>الصنف الملون: <strong>{order.colored_product || '-'}</strong></div>
                <div>اللون: <strong>{order.color || '-'}</strong></div>
                {coloringCompany && <div>شركة التلوين: <strong>{coloringCompany}</strong></div>}
                <div>الحالة: <strong>{currentStatus.label}</strong></div>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>الوزن المنصرف:</span>
                  <span>{fmt(issuedWeight, 2)} كجم</span>
                </div>
                {issuedRolls > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>اللفات المنصرفة:</span>
                    <span>{issuedRolls}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>الوزن الداخل:</span>
                  <span>{returnedWeight > 0 ? `${fmt(returnedWeight, 2)} كجم` : 'قيد التلوين'}</span>
                </div>
                {returnedRolls > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>اللفات المرتجعة:</span>
                    <span>{returnedRolls}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>فرق الزيادة:</span>
                  <span>{weightGain >= 0 ? `+${fmt(weightGain, 2)}` : fmt(weightGain, 2)} كجم</span>
                </div>
              </div>

              <div style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '12px' }}>
                  <span>تكلفة التلوين:</span>
                  <span>{fmt(coloringCost, 2)} ج.م</span>
                </div>
                <div style={{ fontSize: '10px', color: '#333' }}>
                  طريقة السداد: {paymentTypeName}
                </div>
                {order.notes && (
                  <div style={{ fontSize: '10px', marginTop: 4, color: '#555' }}>
                    ملاحظة: {order.notes}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'center', fontSize: '9px', marginTop: 10 }}>
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

export default PrintableColoringInvoice;
