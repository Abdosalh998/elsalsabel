import { useRef } from 'react';
import { Printer, X, ArrowLeftRight, CheckCircle, Clock, AlertTriangle, Building2, User, Calendar, MapPin, Phone } from 'lucide-react';
import { format } from 'date-fns';
import logo from '../../assets/logo.jpg';
import '../common/PrintableModal.css';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const PrintableTransferVoucher = ({ isOpen, onClose, transfer }) => {
  const printRef = useRef(null);

  if (!isOpen || !transfer) return null;

  const isMonetary = transfer.type === 'monetary';
  const isCompleted = transfer.status === 'completed';
  const isRejected = transfer.status === 'rejected';
  const isPending = transfer.status === 'pending';

  const totalItemsWeight = transfer.items?.reduce((s, it) => s + Number(it.weight || 0), 0) || 0;
  const totalItemsRolls = transfer.items?.reduce((s, it) => s + Number(it.rolls_count || 0), 0) || 0;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=950,height=800');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة إذن التحويل');
      return;
    }

    const printContent = printRef.current?.innerHTML || '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>إذن تحويل ${transfer.transfer_number} - السلسبيل</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, sans-serif;
            direction: rtl;
            color: #0f172a;
            background: #fff;
            padding: 24px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
          th {
            background-color: #1A3A5C !important;
            color: #ffffff !important;
            font-weight: 800;
            padding: 9px 12px;
            text-align: right;
            border: 1px solid #1A3A5C;
          }
          td {
            padding: 8px 12px;
            border: 1px solid #cbd5e1;
            text-align: right;
          }
          tr:nth-child(even) { background-color: #f8fafc !important; }
          .voucher-border {
            border: 2px solid #1A3A5C;
            border-radius: 12px;
            padding: 20px;
          }
          .header-box {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #1A3A5C;
            padding-bottom: 16px;
            margin-bottom: 16px;
          }
          .branch-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 18px;
          }
          .branch-card {
            border: 1.5px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px 14px;
            background: #f8fafc !important;
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px dashed #cbd5e1;
            text-align: center;
          }
          .sig-box {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
            background: #fafafa;
          }
        </style>
      </head>
      <body>
        ${printContent}
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  return (
    <div className="printable-modal-overlay">
      <div className="printable-modal-dialog format-a4">

        {/* Action Bar */}
        <div className="printable-action-bar" style={{ background: '#1A3A5C', color: '#fff' }}>
          <div className="printable-action-top">
            <span className="printable-title" style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ArrowLeftRight size={18} color="#38bdf8" />
              إذن التحويل الرسمي ({transfer.transfer_number})
            </span>
            <button type="button" onClick={onClose} className="printable-close-btn mobile-only" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="إغلاق">
              <X size={18} />
            </button>
          </div>

          <div className="printable-action-controls">
            <button
              type="button"
              onClick={handlePrint}
              className="printable-print-btn"
              style={{ background: '#16a34a', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}
            >
              <Printer size={15} /> طباعة إذن التحويل (A4)
            </button>

            <button
              type="button"
              onClick={onClose}
              className="printable-close-btn desktop-only"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
              title="إغلاق"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Viewport */}
        <div className="printable-scroll-viewport">
          <div className="printable-mobile-hint">
            <span>↔️ اسحب أفقياً لمعاينة كامل المستند A4</span>
          </div>

          {/* Paper Sheet */}
          <div
            ref={printRef}
            className="printable-sheet sheet-a4"
            style={{
              border: '2px solid #1A3A5C',
              padding: 28,
            }}
          >
            {/* Header with Logo and Title */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '2.5px solid #1A3A5C', paddingBottom: 16, marginBottom: 18
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <img src={logo} alt="السلسبيل" style={{ height: 60, borderRadius: 8 }} />
                <div>
                  <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#1A3A5C', margin: 0 }}>
                    السلسبيل لتجارة وتوزيع البضائع
                  </h1>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0' }}>
                    نظام إدارة الفروع والمخازن المشتركة
                  </p>
                </div>
              </div>

              <div style={{ textAlign: 'left', direction: 'ltr' }}>
                <div style={{
                  display: 'inline-block',
                  background: isCompleted ? '#DCFCE7' : isRejected ? '#FEE2E2' : '#FEF3C7',
                  color: isCompleted ? '#166534' : isRejected ? '#991B1B' : '#92400E',
                  fontWeight: 800, fontSize: '0.78rem', padding: '4px 10px',
                  borderRadius: 6, marginBottom: 4
                }}>
                  {isCompleted ? '✓ تم الاستلام والاعتماد' : isRejected ? '✕ تم رفض الاستلام' : '⏳ قيد الشحن والتسليم'}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#1A3A5C' }}>
                  {transfer.transfer_number}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {format(new Date(transfer.created_at), 'yyyy/MM/dd - HH:mm')}
                </div>
              </div>
            </div>

            {/* Title Banner */}
            <div style={{
              textAlign: 'center', background: '#f1f5f9', padding: '10px 16px',
              borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 20
            }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#1A3A5C', margin: 0 }}>
                {isMonetary ? 'إذن تحويل مالي ونقدي بين الفروع' : 'إذن خروج وتحويل خامات ومخازن'}
              </h2>
              <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 3 }}>
                نوع المعاملة: <strong>{isMonetary ? `تحويل سيولة نقدية (${transfer.channel === 'cash' ? 'نقدي كاش' : transfer.channel === 'wallet' ? 'محفظة إلكترونية' : 'انستاباي'})` : 'بضاعة وخامات مخزنية'}</strong>
              </div>
            </div>

            {/* Branch Details Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20
            }}>
              {/* Sending Branch */}
              <div style={{
                border: '1.5px solid #cbd5e1', borderRadius: 10, padding: '14px 16px', background: '#f8fafc'
              }}>
                <div style={{
                  fontSize: '0.85rem', fontWeight: 800, color: '#1A3A5C', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 6
                }}>
                  <Building2 size={16} color="#2563eb" />
                  الفرع الراسل (جهة الصرف والخروج):
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0f172a' }}>
                  {transfer.from_branch_name} ({transfer.from_branch_code})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 4 }}>
                  مسؤول الصرف: <strong>{transfer.created_by_name || 'مسؤول الفرع'}</strong>
                </div>
                {transfer.from_branch_phone && (
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    الهاتف: {transfer.from_branch_phone}
                  </div>
                )}
              </div>

              {/* Receiving Branch */}
              <div style={{
                border: '1.5px solid #cbd5e1', borderRadius: 10, padding: '14px 16px', background: '#f8fafc'
              }}>
                <div style={{
                  fontSize: '0.85rem', fontWeight: 800, color: '#1A3A5C', marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 6
                }}>
                  <Building2 size={16} color="#16a34a" />
                  الفرع المستلم (جهة الوصول والاستلام):
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0f172a' }}>
                  {transfer.to_branch_name} ({transfer.to_branch_code})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 4 }}>
                  مسؤول الاستلام: <strong>{transfer.received_by_name || (isPending ? 'في انتظار الاستلام' : '-')}</strong>
                </div>
                {transfer.to_branch_phone && (
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    الهاتف: {transfer.to_branch_phone}
                  </div>
                )}
              </div>
            </div>

            {/* Content: Monetary or Inventory */}
            {isMonetary ? (
              <div style={{
                border: '1.5px solid #cbd5e1', borderRadius: 10, padding: 18,
                background: '#fff', marginBottom: 20
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>المبلغ المحول:</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#16a34a', marginTop: 4 }}>
                      {fmt(transfer.amount)} ج.م
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>قناة التحويل / الصرف:</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1A3A5C', marginTop: 6 }}>
                      {transfer.channel === 'cash' ? 'نقدي (كاش)' : transfer.channel === 'wallet' ? 'محفظة إلكترونية' : 'انستاباي'}
                    </div>
                  </div>
                </div>

                {transfer.notes && (
                  <div style={{ marginTop: 14, fontSize: '0.85rem', color: '#334155' }}>
                    <strong>البيان والملاحظات:</strong> {transfer.notes}
                  </div>
                )}
              </div>
            ) : (
              /* Inventory Items Table */
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1A3A5C', marginBottom: 6 }}>
                  بيان الخامات والبضاعة المحولة:
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#1A3A5C', color: '#fff' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'center', width: 45 }}>م</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>الشركة</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>الصنف / الخامة</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>الوزن المحول (كجم)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>عدد اللفات</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(transfer.items || []).map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #cbd5e1' }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{it.company}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>{it.product}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: '#16a34a' }}>
                          {fmt(it.weight)} كجم
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: '#2563eb' }}>
                          {it.rolls_count || 0} لفة
                        </td>
                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{it.notes || '-'}</td>
                      </tr>
                    ))}
                    {/* Totals Row */}
                    <tr style={{ background: '#f1f5f9', fontWeight: 900, borderTop: '2px solid #1A3A5C' }}>
                      <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'center', color: '#1A3A5C' }}>
                        إجمالي التحويل المخزني:
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#16a34a', fontSize: '0.95rem' }}>
                        {fmt(totalItemsWeight)} كجم
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#2563eb', fontSize: '0.95rem' }}>
                        {totalItemsRolls} لفة
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>

                {transfer.notes && (
                  <div style={{ marginTop: 12, fontSize: '0.82rem', color: '#475569' }}>
                    <strong>ملاحظات عامة على التحويل:</strong> {transfer.notes}
                  </div>
                )}
              </div>
            )}

            {/* Rejection notice if rejected */}
            {isRejected && transfer.rejection_reason && (
              <div style={{
                background: '#FEF2F2', border: '1.5px solid #F87171', borderRadius: 8,
                padding: '10px 14px', marginBottom: 20, color: '#991B1B', fontSize: '0.85rem'
              }}>
                <strong>سبب رفض الاستلام:</strong> {transfer.rejection_reason}
              </div>
            )}

            {/* Official Signatures Box */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14,
              marginTop: 30, paddingTop: 16, borderTop: '1px dashed #cbd5e1', textAlign: 'center'
            }}>
              <div style={{
                border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 8px', background: '#f8fafc'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1A3A5C', marginBottom: 30 }}>
                  توقيع مسؤول الصرف (الفرع الراسل)
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {transfer.created_by_name || '............................'}
                </div>
              </div>

              <div style={{
                border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 8px', background: '#f8fafc'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1A3A5C', marginBottom: 30 }}>
                  توقيع مندوب النقل / السائق
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  الاسم: ............................
                </div>
              </div>

              <div style={{
                border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 8px', background: '#f8fafc'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1A3A5C', marginBottom: 30 }}>
                  توقيع وختم المستلم (الفرع المستقبل)
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {transfer.received_by_name || '............................'}
                </div>
              </div>
            </div>

            <div style={{
              textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8', marginTop: 24, paddingTop: 8
            }}>
              طُبع هذا المستند إلكترونياً من نظام السلسبيل لإدارة الشركات والفروع - {format(new Date(), 'yyyy/MM/dd HH:mm')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableTransferVoucher;
