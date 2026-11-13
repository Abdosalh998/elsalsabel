import { useState, useRef } from 'react';
import {
  Printer, X, FileText, Receipt, Users, ArrowUpRight,
  ArrowDownLeft, Wallet, CheckCircle, Calendar, Phone
} from 'lucide-react';
import { format } from 'date-fns';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const PrintableCustodyStatement = ({ isOpen, onClose, statement }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !statement) return null;

  const personName = statement.person_name || '—';
  const phone = statement.phone || '';
  const transactions = statement.transactions || [];
  const totalDisbursed = Number(statement.total_disbursed || 0);
  const totalCollected = Number(statement.total_collected || 0);
  const balance = Number(statement.balance || 0);

  const isOwing = balance > 0;
  const isCredit = balance < 0;
  const isSettled = balance === 0;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const isA4 = printFormat === 'a4';
    const pageMargin = isA4 ? '8mm 12mm' : '4mm 6mm';

    const printWindow = window.open('', '_blank', 'width=950,height=750');
    if (!printWindow) {
      alert('يرجى السماح بفتح النوافذ المنبثقة لإتمام الطباعة');
      return;
    }

    printWindow.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head>' +
      '<meta charset="UTF-8">' +
      '<title>كشف حساب عهدة - ' + personName + '</title>' +
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
      '  tr { page-break-inside: avoid !important; } ' +
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15,23,42,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          maxWidth: printFormat === 'a4' ? '920px' : '440px',
          width: '100%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          transition: 'max-width 0.25s ease',
        }}
      >
        {/* Action Bar */}
        <div
          style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
              معاينة كشف حساب عهدة: {personName}
            </span>
            <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: 8, padding: 2 }}>
              {[
                { key: 'a4', label: 'كشف A4 رسمي', Icon: FileText },
                { key: 'thermal', label: 'إيصال بون (80mm)', Icon: Receipt },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPrintFormat(key)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: printFormat === key ? '#7c3aed' : 'transparent',
                    color: printFormat === key ? '#fff' : '#64748b',
                  }}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.88rem',
                boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
              }}
            >
              <Printer size={16} /> طباعة كشف الحساب
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f1f5f9',
                border: 'none',
                borderRadius: 8,
                width: 36,
                height: 36,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div
          ref={printRef}
          style={{
            overflowY: 'auto',
            padding: printFormat === 'a4' ? '22px 28px' : '14px 12px',
            color: '#0f172a',
            fontFamily: "'Tajawal','Segoe UI',Tahoma,sans-serif",
            direction: 'rtl',
          }}
        >
          {/* ===================== FORMAT: A4 ===================== */}
          {printFormat === 'a4' && (
            <div style={{ width: '100%' }}>
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '2.5px solid #7c3aed',
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
                    <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#7c3aed' }}>
                      مؤسسة السلسبيل للتجارة والتوزيع
                    </h1>
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                      إدارة العهد المالية والرقابة الداخلية — كشف حساب عهدة تفصيلي
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#f5f3ff',
                      color: '#7c3aed',
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      padding: '4px 14px',
                      borderRadius: 8,
                      marginBottom: 3,
                      border: '1px solid #ddd6fe',
                    }}
                  >
                    كشف حساب عهدة
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    تاريخ الاستخراج: <strong>{format(new Date(), 'yyyy/MM/dd HH:mm')}</strong>
                  </div>
                </div>
              </div>

              {/* Person Meta Box */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 16px',
                  marginBottom: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>صاحب العهدة:</span>
                  <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{personName}</strong>
                </div>
                {phone && (
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>رقم الهاتف:</span>
                    <strong style={{ color: '#0f172a' }}>{phone}</strong>
                  </div>
                )}
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>عدد الحركات:</span>
                  <strong>{transactions.length} حركة مسجلة</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>حالة الحساب:</span>
                  <span
                    style={{
                      display: 'inline-block',
                      background: isOwing ? '#fee2e2' : (isSettled ? '#f0fdf4' : '#eff6ff'),
                      color: isOwing ? '#dc2626' : (isSettled ? '#16a34a' : '#2563eb'),
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    {isOwing ? 'معه عهدة متبقية' : (isSettled ? 'خالص الحساب تماماً' : 'له رصيد')}
                  </span>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                {/* Total Disbursed */}
                <div
                  style={{
                    background: '#fff7ed',
                    border: '1.5px solid #fed7aa',
                    borderRadius: 8,
                    padding: '10px 14px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: '#9a3412', fontWeight: 600 }}>إجمالي المنصرف (له)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c', marginTop: 2 }}>
                    {fmt(totalDisbursed, 2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
                  </div>
                </div>

                {/* Total Collected */}
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #bbf7d0',
                    borderRadius: 8,
                    padding: '10px 14px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}>إجمالي المسدد (منه)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a', marginTop: 2 }}>
                    {fmt(totalCollected, 2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
                  </div>
                </div>

                {/* Net Balance */}
                <div
                  style={{
                    background: isOwing ? '#fef2f2' : (isSettled ? '#f0fdf4' : '#eff6ff'),
                    border: `1.5px solid ${isOwing ? '#fecaca' : (isSettled ? '#bbf7d0' : '#bfdbfe')}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: isOwing ? '#991b1b' : (isSettled ? '#166534' : '#1e40af'), fontWeight: 600 }}>
                    الرصيد المتبقي بذمته
                  </div>
                  <div
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 900,
                      color: isOwing ? '#dc2626' : (isSettled ? '#16a34a' : '#2563eb'),
                      marginTop: 2,
                    }}
                  >
                    {fmt(Math.abs(balance), 2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, marginRight: 4 }}>
                      {isOwing ? '(عليه)' : (isCredit ? '(له)' : '(خالص)')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#7c3aed', color: '#fff' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 35 }}>#</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.8rem', width: 85 }}>التاريخ</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 85 }}>رقم السند</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 95 }}>نوع الحركة</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 90 }}>منصرف (له)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 90 }}>مسدد (منه)</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 95 }}>الرصيد</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 85 }}>طريقة الدفع</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.8rem' }}>البيان / ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                        لا توجد حركات مسجلة لهذا الشخص
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, idx) => {
                      const isDisb = tx.type === 'disbursement';
                      let typeBadgeText = isDisb ? 'تسليم عهدة' : 'استلام عهدة';
                      let typeBg = isDisb ? '#fff7ed' : '#f0fdf4';
                      let typeColor = isDisb ? '#ea580c' : '#16a34a';

                      if (tx.sub_type === 'deduction') {
                        typeBadgeText = 'تطريح (صرف)';
                        typeBg = '#fef3c7';
                        typeColor = '#d97706';
                      } else if (tx.sub_type === 'transfer_out') {
                        typeBadgeText = 'تحويل صادر';
                        typeBg = '#fee2e2';
                        typeColor = '#b91c1c';
                      } else if (tx.sub_type === 'transfer_in') {
                        typeBadgeText = 'تحويل وارد';
                        typeBg = '#eff6ff';
                        typeColor = '#1d4ed8';
                      }

                      const fullDescription = tx.item_description
                        ? (tx.notes ? `${tx.item_description} — ${tx.notes}` : tx.item_description)
                        : (tx.notes || '-');

                      return (
                        <tr
                          key={tx.id || idx}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                          }}
                        >
                          <td style={{ padding: '7px 8px', textAlign: 'center', color: '#64748b', fontSize: '0.78rem' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '7px 8px', fontSize: '0.8rem' }}>
                            {tx.date ? format(new Date(tx.date), 'yyyy/MM/dd') : '-'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                            {tx.receipt_number || (isDisb ? `CSD-${tx.id}` : `CSC-${tx.id}`)}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: typeBg,
                                color: typeColor,
                              }}
                            >
                              {typeBadgeText}
                            </span>
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, color: '#ea580c', fontSize: '0.85rem' }}>
                            {isDisb ? fmt(tx.amount, 2) : '-'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, color: '#16a34a', fontSize: '0.85rem' }}>
                            {!isDisb ? fmt(tx.amount, 2) : '-'}
                          </td>
                          <td
                            style={{
                              padding: '7px 8px',
                              textAlign: 'center',
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              color: tx.running_balance > 0 ? '#dc2626' : (tx.running_balance < 0 ? '#2563eb' : '#16a34a'),
                            }}
                          >
                            {fmt(Math.abs(tx.running_balance), 2)}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', fontSize: '0.76rem', color: '#475569' }}>
                            {tx.sub_type === 'deduction' ? 'تطريح داخلي' : (tx.payment_type_name || (tx.channel === 'wallet' ? 'محفظة' : tx.channel === 'instapay' ? 'انستاباي' : 'نقدي'))}
                          </td>
                          <td style={{ padding: '7px 8px', fontSize: '0.78rem', color: fullDescription !== '-' ? '#1e293b' : '#94a3b8' }}>
                            {fullDescription}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {transactions.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                      <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.82rem' }}>
                        إجمالي الحركات والرصيد الختامي:
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#ea580c', fontSize: '0.9rem' }}>
                        {fmt(totalDisbursed, 2)} ج.م
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', color: '#16a34a', fontSize: '0.9rem' }}>
                        {fmt(totalCollected, 2)} ج.م
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          textAlign: 'center',
                          fontSize: '0.95rem',
                          color: isOwing ? '#dc2626' : (isSettled ? '#16a34a' : '#2563eb'),
                        }}
                      >
                        {fmt(Math.abs(balance), 2)} ج.م
                      </td>
                      <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                        {isOwing ? 'المتبقي في ذمة الشخص' : (isSettled ? 'الحساب خالص' : 'مستحق للشخص')}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* Signatures */}
              <div
                className="no-break"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 16,
                  borderTop: '1px dashed #cbd5e1',
                  paddingTop: 14,
                  marginTop: 14,
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 26 }}>
                    توقيع وإقرار صاحب العهدة
                  </div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 26 }}>
                    توقيع أمين الخزينة / المحاسب
                  </div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 26 }}>
                    اعتماد الإدارة / المدير المسؤول
                  </div>
                  <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
                </div>
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
                <div style={{ fontSize: '10px' }}>كشف حساب عهدة تفصيلي</div>
                <div style={{ fontSize: '10px' }}>صاحب العهدة: {personName}</div>
                <div style={{ fontSize: '10px' }}>التاريخ: {format(new Date(), 'yyyy/MM/dd')}</div>
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>إجمالي المنصرف:</span>
                  <span>{fmt(totalDisbursed, 2)} ج.م</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>إجمالي المسدد:</span>
                  <span>{fmt(totalCollected, 2)} ج.م</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>الرصيد المتبقي:</span>
                  <span>{fmt(Math.abs(balance), 2)} ج.م {isOwing ? '(عليه)' : ''}</span>
                </div>
              </div>

              <div style={{ marginTop: 6, marginBottom: 6 }}>
                <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: 4 }}>آخر الحركات:</div>
                {transactions.slice(-5).map((tx, i) => {
                  let label = tx.type === 'disbursement' ? 'صرف' : 'سداد';
                  if (tx.sub_type === 'deduction') label = 'تطريح';
                  else if (tx.sub_type === 'transfer_out') label = 'تحويل صادر';
                  else if (tx.sub_type === 'transfer_in') label = 'تحويل وارد';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', padding: '2px 0' }}>
                      <span>{tx.date ? format(new Date(tx.date), 'MM/dd') : ''} ({label}):</span>
                      <span>{fmt(tx.amount, 2)} ج.م</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 12, paddingTop: 6, borderTop: '1px dashed #000', textAlign: 'center', fontSize: '9px' }}>
                <div>توقيع صاحب العهدة: ........................</div>
                <div style={{ marginTop: 6 }}>شكراً لتعاملكم مع السلسبيل</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintableCustodyStatement;

