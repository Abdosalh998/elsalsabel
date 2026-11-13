import { useState, useRef } from 'react';
import { Printer, X, ArrowLeftRight, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';

const fmt = (n, d = 2) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const PrintableCustodyTransfers = ({ isOpen, onClose, transfers = [], summary = {} }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen) return null;

  const totalAmount = Number(summary.total_amount || transfers.reduce((sum, t) => sum + Number(t.amount || 0), 0));
  const totalCount = summary.total_count || transfers.length;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=950,height=750');
    if (!printWindow) {
      alert('يرجى السماح بفتح النوافذ المنبثقة لإتمام الطباعة');
      return;
    }

    printWindow.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head>' +
      '<meta charset="UTF-8">' +
      '<title>كشف تحويلات العهد المالية</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">' +
      '<style>' +
      '* { box-sizing: border-box; margin: 0; padding: 0; }' +
      'body { font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif; direction: rtl; color: #0f172a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '@page { size: A4 portrait; margin: 10mm 14mm; }' +
      '@media print { body { margin: 0; } .no-break { page-break-inside: avoid !important; break-inside: avoid !important; } tr { page-break-inside: avoid !important; } }' +
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
          maxWidth: '920px',
          width: '100%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Top Control Bar */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#ede9fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <ArrowLeftRight size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>كشف تحويلات العهد المالية</h2>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                معاينة وطباعة سجل تحويلات العهد بين الأفراد
              </p>
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
              <Printer size={16} /> طباعة الكشف
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
            padding: '24px 28px',
            color: '#0f172a',
            fontFamily: "'Tajawal','Segoe UI',Tahoma,sans-serif",
            direction: 'rtl',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '2.5px solid #7c3aed',
              paddingBottom: 12,
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
                <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#7c3aed' }}>
                  مؤسسة السلسبيل للتجارة والتوزيع
                </h1>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                  إدارة العهد المالية والرقابة الداخلية — كشف تحويلات العهد بين الأفراد
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
                  fontSize: '0.82rem',
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid #ddd6fe',
                }}
              >
                كشف رسمي للتحويلات
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                تاريخ الاستخراج: {format(new Date(), 'yyyy/MM/dd')}
              </div>
            </div>
          </div>

          {/* KPI Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                إجمالي المبالغ المحولة
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>
                {fmt(totalAmount, 2)} <span style={{ fontSize: '0.8rem' }}>ج.م</span>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                إجمالي عدد التحويلات
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {totalCount} <span style={{ fontSize: '0.8rem' }}>حركة</span>
              </div>
            </div>
          </div>

          {/* Transfers Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead>
              <tr style={{ background: '#7c3aed', color: '#fff' }}>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 35 }}>#</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.8rem', width: 90 }}>التاريخ</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 90 }}>رقم الإيصال</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.8rem' }}>محوّل من (الطرف الأول)</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.8rem' }}>محوّل إلى (الطرف الثاني)</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.8rem', width: 110 }}>المبلغ المحول</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '0.8rem' }}>البيان / ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                    لا توجد حركات تحويل مسجلة
                  </td>
                </tr>
              ) : (
                transfers.map((tx, idx) => (
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
                      {tx.receipt_number || `CTR-${tx.id}`}
                    </td>
                    <td style={{ padding: '7px 8px', fontSize: '0.82rem', fontWeight: 700, color: '#dc2626' }}>
                      {tx.from_person}
                    </td>
                    <td style={{ padding: '7px 8px', fontSize: '0.82rem', fontWeight: 700, color: '#16a34a' }}>
                      {tx.to_person}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 800, color: '#7c3aed', fontSize: '0.88rem' }}>
                      {fmt(tx.amount, 2)} ج.م
                    </td>
                    <td style={{ padding: '7px 8px', fontSize: '0.78rem', color: tx.notes ? '#1e293b' : '#94a3b8' }}>
                      {tx.notes || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {transfers.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                  <td colSpan={5} style={{ padding: '8px 10px', textAlign: 'center', fontSize: '0.82rem' }}>
                    إجمالي المبالغ المحولة:
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center', color: '#7c3aed', fontSize: '0.92rem' }}>
                    {fmt(totalAmount, 2)} ج.م
                  </td>
                  <td></td>
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
              marginTop: 18,
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 26 }}>
                توقيع الطرف المحوِّل (من)
              </div>
              <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 26 }}>
                توقيع الطرف المستلم (إلى)
              </div>
              <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 26 }}>
                اعتماد أمين الخزينة / الإدارة
              </div>
              <div style={{ borderBottom: '1px solid #94a3b8', width: '70%', margin: '0 auto' }}></div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: '0.7rem', color: '#94a3b8' }}>
            مؤسسة السلسبيل — نظام إدارة الشركة | تاريخ الطباعة: {format(new Date(), 'yyyy/MM/dd HH:mm')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableCustodyTransfers;

