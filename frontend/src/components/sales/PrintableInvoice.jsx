import { useState, useRef } from 'react';
import { Printer, X, FileText, Receipt, CheckCircle, Calendar, Phone, CreditCard, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import '../common/PrintableModal.css';

const PaymentBadge = ({ name }) => {
  if (!name) return null;
  const lower = (name || '').toLowerCase();
  const isWallet = lower.includes('محفظة') || lower.includes('wallet');
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: '#e0f2fe', color: '#0369a1',
      borderRadius: 5, padding: '2px 7px', fontSize: '0.78rem', fontWeight: 700
    }}>
      {isWallet ? <Wallet size={12} /> : <CreditCard size={12} />} {name}
    </span>
  );
};

const PrintableInvoice = ({ isOpen, onClose, sale }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !sale) return null;

  const saleDate = sale.date ? new Date(sale.date) : new Date();
  const createdDate = sale.created_at ? new Date(sale.created_at) : saleDate;

  const invoiceNumber = sale.invoice_number || sale.id;
  const items = sale.items || [];
  const returns = sale.returns || [];
  const returnsTotal = Number(sale.returns_total || (returns.reduce((s, r) => s + Number(r.total || 0), 0)));
  const grossTotal = Number(sale.gross_total || (returnsTotal > 0 ? (Number(sale.total || 0) + returnsTotal) : Number(sale.total || 0)));
  const currentTotal = Number(sale.total || 0);
  const paidAmount = Number(sale.paid_amount || 0);
  const remainingCurrent = Number(sale.remaining_balance || 0);
  const settlementAmount = Number(sale.settlement_amount || 0);

  const prevDebt = Number(sale.customer_current_debt || 0);
  const prevCredit = Number(sale.customer_current_credit || 0);
  const creditUsed = Number(sale.customer_credit || 0);
  const cashPaid = Number(sale.cash_paid || 0);
  const paymentTypeName = sale.payment_type_name || null;
  const payments = sale.payments || [];
  const unpaidInvoices = sale.previous_unpaid_invoices || [];
  const overpaidAddedToCredit = (cashPaid > 0 && (cashPaid + creditUsed) > currentTotal)
    ? (cashPaid + creditUsed) - currentTotal
    : Number(sale.overpaid_credit_added || 0);



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
      '<title>فاتورة رقم #' + invoiceNumber + '</title>' +
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
              معاينة الفاتورة #{invoiceNumber}
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

            <button type="button" onClick={handlePrint} className="printable-print-btn" style={{ background: '#16a34a' }}>
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
                        {sale.branch_name || 'فرع 45'} — بضاعة عالية الجودة وخامات ممتازة
                      </div>
                      {sale.branch_phone && (
                        <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Phone size={12} /> {sale.branch_phone}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Invoice # and Date */}
                  <div style={{ textAlign: 'left' }}>
                    <div style={{
                      display: 'inline-block', background: '#e0f2fe', color: '#0369a1',
                      fontWeight: 800, fontSize: '1.15rem', padding: '6px 14px', borderRadius: 8, marginBottom: 4
                    }}>
                      فاتورة مبيعات #{invoiceNumber}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      التاريخ: <strong>{format(saleDate, 'yyyy/MM/dd')}</strong>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
                      الوقت: {format(createdDate, 'hh:mm a')}
                    </div>
                  </div>
                </div>

                {/* Customer Box */}
                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                  padding: '12px 16px', marginBottom: 20,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: 12
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>العميل المكرم:</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                      {sale.customer_name || 'عميل نقدي'}
                    </div>
                  </div>
                  {sale.customer_phone && (
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>رقم الهاتف:</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>{sale.customer_phone}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>حالة الحساب قبل هذه الفاتورة:</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                      {prevDebt > 0
                        ? <span style={{ color: '#dc2626' }}>مديونية سابقة: {prevDebt.toFixed(2)} ج.م</span>
                        : prevCredit > 0
                          ? <span style={{ color: '#16a34a' }}>رصيد دائن متاح: {prevCredit.toFixed(2)} ج.م</span>
                          : <span style={{ color: '#64748b' }}>حساب خالص</span>
                      }
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div style={{ marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                        {['#', 'الصنف / المنتج', 'الوزن (كج)', 'اللفات', 'سعر الكيلو', 'الإجمالي'].map((h, i) => (
                          <th key={i} style={{
                            padding: '10px 12px',
                            textAlign: i === 0 || i >= 2 ? 'center' : 'right',
                            color: i === 5 ? '#0369a1' : '#475569',
                            fontWeight: i === 5 ? 700 : 600,
                            width: i === 0 ? 36 : undefined
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const weight = Number(item.weight ?? item.quantity ?? 0);
                        const rolls = Number(item.rolls_count || 0);
                        const price = Number(item.price ?? item.unit_price ?? 0);
                        const isIssue = Boolean(item.is_issue_only || (item.deduction_source === 'jard' && price === 0 && weight === 0));
                        const total = Number(item.total ?? (weight * price));
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                              {item.product_name || item.product || 'صنف'}
                              {item.deduction_source === 'jard' && (
                                <span style={{ marginRight: 6, fontSize: '0.72rem', background: '#f0fdf4', color: '#15803d', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                  (جرد)
                                </span>
                              )}
                              {isIssue && (
                                <span style={{ marginRight: 6, fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                  (بند صرف)
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: weight > 0 ? '#0284c7' : '#94a3b8' }}>
                              {weight > 0 ? `${weight.toFixed(3)} كج` : '-'}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>{rolls > 0 ? rolls : '-'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: price > 0 ? 'inherit' : '#94a3b8' }}>
                              {price > 0 ? `${price.toFixed(2)} ج.م` : (isIssue ? 'صرف' : '0.00 ج.م')}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: total > 0 ? '#0f172a' : '#64748b' }}>
                              {total > 0 ? `${total.toFixed(2)} ج.م` : (isIssue ? '0.00 ج.م (صرف)' : '0.00 ج.م')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Returns Table if any */}
                {returns.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{
                      fontSize: '0.88rem', fontWeight: 800, color: '#dc2626',
                      marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6
                    }}>
                      <span>🔄 مرتجع بضاعة مخصوم من الفاتورة</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', border: '1px solid #fecaca' }}>
                      <thead>
                        <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                          <th style={{ padding: '8px 10px', textAlign: 'center', color: '#991b1b', fontWeight: 700, width: 36 }}>#</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right', color: '#991b1b', fontWeight: 700 }}>الصنف المرتجع</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', color: '#991b1b', fontWeight: 700 }}>الوزن (كجم)</th>
                          {returns.some(r => Number(r.rolls_count) > 0) && (
                            <th style={{ padding: '8px 10px', textAlign: 'center', color: '#991b1b', fontWeight: 700 }}>اللفات</th>
                          )}
                          <th style={{ padding: '8px 10px', textAlign: 'center', color: '#991b1b', fontWeight: 700 }}>سعر الكجم (ج)</th>
                          <th style={{ padding: '8px 10px', textAlign: 'center', color: '#991b1b', fontWeight: 700 }}>إجمالي المرتجع (ج)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returns.map((ret, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #fee2e2', background: '#fff' }}>
                            <td style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{ret.product}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#0284c7' }}>{Number(ret.weight).toFixed(3)} كجم</td>
                            {returns.some(r => Number(r.rolls_count) > 0) && (
                              <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>
                                {Number(ret.rolls_count || 0) > 0 ? Number(ret.rolls_count).toLocaleString() : '—'}
                              </td>
                            )}
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{Number(ret.price_per_ton).toFixed(2)} ج.م</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: '#dc2626' }}>{Number(ret.total).toFixed(2)} ج.م</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Financial Summary Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 16, marginBottom: 20 }}>

                  {/* Previous Invoices */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} /> كشف الفواتير السابقة
                    </div>
                    {unpaidInvoices.length > 0 ? (
                      <div style={{ fontSize: '0.78rem' }}>
                        <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: 6 }}>⚠️ فواتير سابقة غير مسددة بالكامل:</div>
                        {unpaidInvoices.map((inv, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px dashed #e2e8f0' }}>
                            <span>فاتورة #{inv.invoice_number} ({format(new Date(inv.date), 'MM/dd')}):</span>
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>متبقي {Number(inv.remaining_balance).toFixed(2)} ج.م</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: '#16a34a', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle size={15} /> لا توجد فواتير سابقة معلقة.
                      </div>
                    )}
                    {sale.notes && (
                      <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b' }}>
                        <strong>ملاحظات:</strong> {sale.notes}
                      </div>
                    )}
                  </div>

                  {/* Totals & Payment */}
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '14px 16px' }}>
                    {returnsTotal > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.85rem' }}>
                          <span style={{ color: '#64748b' }}>إجمالي المبيعات:</span>
                          <span>{grossTotal.toFixed(2)} ج.م</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.85rem' }}>
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>خصم المرتجع:</span>
                          <strong style={{ color: '#dc2626' }}>- {returnsTotal.toFixed(2)} ج.م</strong>
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem', borderTop: returnsTotal > 0 ? '1px dashed #cbd5e1' : 'none', paddingTop: returnsTotal > 0 ? 6 : 0 }}>
                      <span style={{ color: '#475569', fontWeight: 700 }}>{returnsTotal > 0 ? 'الصافي بعد المرتجع:' : 'إجمالي الفاتورة:'}</span>
                      <strong style={{ fontSize: '1.05rem', color: '#0f172a' }}>{currentTotal.toFixed(2)} ج.م</strong>
                    </div>

                    {creditUsed > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.85rem' }}>
                        <span style={{ color: '#0369a1', fontWeight: 600 }}>💳 خصم من الرصيد الدائن:</span>
                        <strong style={{ color: '#0369a1' }}>- {creditUsed.toFixed(2)} ج.م</strong>
                      </div>
                    )}

                    {payments.length > 1 ? (
                      <div style={{ background: '#f0fdf4', border: '1px dashed #86efac', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#166534', marginBottom: 4 }}>
                          💳 تفاصيل طرق الدفع المسددة ({payments.length} بنود):
                        </div>
                        {payments.map((p, pIdx) => (
                          <div key={pIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '2px 0' }}>
                            <span style={{ color: '#14532d', display: 'flex', alignItems: 'center', gap: 4 }}>
                              • {p.payment_type_name || p.name || 'طريقة دفع'}
                            </span>
                            <strong style={{ color: '#16a34a' }}>{Number(p.amount || 0).toFixed(2)} ج.م</strong>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #bbf7d0', marginTop: 4, paddingTop: 4, fontWeight: 800, fontSize: '0.85rem' }}>
                          <span style={{ color: '#166534' }}>إجمالي المسدد نقداً:</span>
                          <strong style={{ color: '#16a34a' }}>{cashPaid.toFixed(2)} ج.م</strong>
                        </div>
                      </div>
                    ) : (
                      cashPaid > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.85rem' }}>
                          <span style={{ color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            💵 المدفوع نقداً
                            {paymentTypeName && <PaymentBadge name={paymentTypeName} />}
                            :
                          </span>
                          <strong style={{ color: '#16a34a' }}>{cashPaid.toFixed(2)} ج.م</strong>
                        </div>
                      )
                    )}

                    {paidAmount > 0 && cashPaid === 0 && creditUsed === 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
                        <span style={{ color: '#16a34a', fontWeight: 600 }}>المسدد:</span>
                        <strong style={{ color: '#16a34a' }}>{paidAmount.toFixed(2)} ج.م</strong>
                      </div>
                    )}

                    {paymentTypeName && cashPaid === 0 && payments.length <= 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: '0.85rem' }}>
                        <span style={{ color: '#475569' }}>طريقة الدفع:</span>
                        <PaymentBadge name={paymentTypeName} />
                      </div>
                    )}

                    {settlementAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem', color: '#b45309' }}>
                        <span style={{ fontWeight: 600 }}>⚡ تسوية باقي الفاتورة:</span>
                        <strong style={{ color: '#b45309' }}>- {settlementAmount.toFixed(2)} ج.م</strong>
                      </div>
                    )}

                    <div style={{ borderTop: '2px solid #86efac', paddingTop: 8, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: remainingCurrent > 0 ? '#b91c1c' : '#15803d' }}>
                        {remainingCurrent > 0 ? 'المتبقي على العميل:' : 'حالة الفاتورة:'}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '1.25rem', color: remainingCurrent > 0 ? '#dc2626' : '#16a34a' }}>
                        {remainingCurrent > 0 ? remainingCurrent.toFixed(2) + ' ج.م' : '✓ مسددة بالكامل'}
                      </span>
                    </div>
                    {overpaidAddedToCredit > 0 && (
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 8, padding: '7px 12px', background: '#ecfdf5',
                        border: '1px solid #a7f3d0', borderRadius: 8,
                        color: '#065f46', fontWeight: 700, fontSize: '0.88rem'
                      }}>
                        <span>🎉 تم إضافة المتبقي لرصيد العميل المتاح:</span>
                        <strong style={{ fontSize: '1rem', color: '#047857' }}>+ {overpaidAddedToCredit.toFixed(2)} ج.م</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Signatures */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                  marginTop: 32, paddingTop: 16, borderTop: '1px solid #e2e8f0',
                  fontSize: '0.82rem', color: '#64748b'
                }}>
                  <div style={{ textAlign: 'center', width: 180 }}>
                    <div style={{ marginBottom: 40 }}>توقيع المحاسب</div>
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 4 }}>السلسبيل للتجارة</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 600 }}>البضاعة المستلمة بحالة جيدة وسليمة 100%</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>شكراً لثقتكم واختياركم مؤسسة السلسبيل</div>
                  </div>
                  <div style={{ textAlign: 'center', width: 180 }}>
                    <div style={{ marginBottom: 40 }}>توقيع واستلام العميل</div>
                    <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 4 }}>{sale.customer_name || 'العميل'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ════ THERMAL 80mm FORMAT ════ */}
            {printFormat === 'thermal' && (
              <div style={{ width: '100%', maxWidth: '320px', margin: '0 auto', fontSize: '0.8rem', lineHeight: 1.5, color: '#000' }}>
                <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 2 }}>مؤسسة السلسبيل</div>
                  <div style={{ fontSize: '0.75rem' }}>{sale.branch_name || 'فرع 45'}</div>
                  {sale.branch_phone && <div style={{ fontSize: '0.72rem' }}>هاتف: {sale.branch_phone}</div>}
                  <div style={{ fontWeight: 700, marginTop: 4 }}>إيصال مبيعات #{invoiceNumber}</div>
                  <div style={{ fontSize: '0.7rem' }}>{format(saleDate, 'yyyy/MM/dd')} — {format(createdDate, 'hh:mm a')}</div>
                </div>

                <div style={{ borderBottom: '1px dashed #000', paddingBottom: 6, marginBottom: 6 }}>
                  <div>العميل: <strong>{sale.customer_name || 'نقدي'}</strong></div>
                  {sale.customer_phone && <div>الهاتف: {sale.customer_phone}</div>}
                  {prevDebt > 0 && (
                    <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: '0.78rem', marginTop: 2 }}>
                      ⚠ مديونية سابقة: {prevDebt.toFixed(2)} ج.م
                    </div>
                  )}
                </div>

                <div style={{ borderBottom: '1px dashed #000', paddingBottom: 6, marginBottom: 6 }}>
                  <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #000' }}>
                        <th style={{ textAlign: 'right', paddingBottom: 4 }}>الصنف</th>
                        <th style={{ textAlign: 'center', paddingBottom: 4 }}>الوزن</th>
                        <th style={{ textAlign: 'center', paddingBottom: 4 }}>السعر</th>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const weight = Number(item.weight ?? item.quantity ?? 0);
                        const rolls = Number(item.rolls_count || 0);
                        const price = Number(item.price ?? item.unit_price ?? 0);
                        const isIssue = Boolean(item.is_issue_only || (item.deduction_source === 'jard' && price === 0 && weight === 0));
                        const total = Number(item.total ?? (weight * price));
                        return (
                          <tr key={idx}>
                            <td style={{ padding: '3px 0' }}>
                              {item.product_name || item.product || 'صنف'}
                              {item.deduction_source === 'jard' && ' (جرد)'}
                              {isIssue && ' (صرف)'}
                              {rolls > 0 && ` [${rolls} لفة]`}
                            </td>
                            <td style={{ textAlign: 'center' }}>{weight > 0 ? weight.toFixed(2) : (rolls > 0 ? `${rolls} لفة` : '-')}</td>
                            <td style={{ textAlign: 'center' }}>{price > 0 ? price.toFixed(1) : (isIssue ? 'صرف' : '0')}</td>
                            <td style={{ textAlign: 'left', fontWeight: 700 }}>{total.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Returns in 80mm if any */}
                {returns.length > 0 && (
                  <div style={{ borderBottom: '1px dashed #000', paddingBottom: 6, marginBottom: 6 }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 800, textAlign: 'center', marginBottom: 3, color: '#000' }}>
                      --- مرتجع بضاعة مخصوم من الفاتورة ---
                    </div>
                    <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px dashed #000' }}>
                          <th style={{ textAlign: 'right', paddingBottom: 2 }}>الصنف المرتجع</th>
                          <th style={{ textAlign: 'center', paddingBottom: 2 }}>الوزن</th>
                          <th style={{ textAlign: 'center', paddingBottom: 2 }}>السعر</th>
                          <th style={{ textAlign: 'left', paddingBottom: 2 }}>الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returns.map((ret, rIdx) => (
                          <tr key={rIdx}>
                            <td style={{ padding: '2px 0' }}>{ret.product}</td>
                            <td style={{ textAlign: 'center' }}>{Number(ret.weight).toFixed(2)}</td>
                            <td style={{ textAlign: 'center' }}>{Number(ret.price_per_ton).toFixed(1)}</td>
                            <td style={{ textAlign: 'left', fontWeight: 700 }}>- {Number(ret.total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ borderBottom: '1px dashed #000', paddingBottom: 8, marginBottom: 8, fontSize: '0.85rem' }}>
                  {returnsTotal > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
                        <span>إجمالي المبيعات:</span>
                        <span>{grossTotal.toFixed(2)} ج.م</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.8rem' }}>
                        <span>خصم المرتجع:</span>
                        <span>- {returnsTotal.toFixed(2)} ج.م</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontWeight: returnsTotal > 0 ? 800 : 700 }}>
                    <span>{returnsTotal > 0 ? 'الصافي بعد المرتجع:' : 'الإجمالي:'}</span>
                    <strong>{currentTotal.toFixed(2)} ج.م</strong>
                  </div>
                  {creditUsed > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: '0.78rem' }}>
                      <span>خصم من الرصيد:</span>
                      <span>- {creditUsed.toFixed(2)} ج.م</span>
                    </div>
                  )}
                  {payments.length > 1 ? (
                    <div style={{ margin: '4px 0', padding: '4px 0', borderTop: '1px dotted #000', borderBottom: '1px dotted #000' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 2 }}>طرق السداد ({payments.length}):</div>
                      {payments.map((p, pIdx) => (
                        <div key={pIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 1 }}>
                          <span>• {p.payment_type_name || p.name || 'طريقة دفع'}:</span>
                          <strong>{Number(p.amount || 0).toFixed(2)} ج.م</strong>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 2 }}>
                        <span>إجمالي المدفوع:</span>
                        <strong>{cashPaid.toFixed(2)} ج.م</strong>
                      </div>
                    </div>
                  ) : (
                    cashPaid > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span>المدفوع {paymentTypeName ? '(' + paymentTypeName + ')' : 'نقداً'}:</span>
                        <strong>{cashPaid.toFixed(2)} ج.م</strong>
                      </div>
                    )
                  )}
                  {settlementAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, color: '#000', fontSize: '0.82rem' }}>
                      <span>تسوية باقي الفاتورة:</span>
                      <strong>- {settlementAmount.toFixed(2)} ج.م</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.95rem' }}>
                    <span>{remainingCurrent > 0 ? 'المتبقي:' : 'الرصيد:'}</span>
                    <span>{remainingCurrent > 0 ? remainingCurrent.toFixed(2) + ' ج.م' : 'خالص'}</span>
                  </div>
                  {overpaidAddedToCredit > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '3px 0', borderTop: '1px dashed #000', fontWeight: 700 }}>
                      <span>مضاف لرصيد العميل:</span>
                      <span>+ {overpaidAddedToCredit.toFixed(2)} ج.م</span>
                    </div>
                  )}
                </div>



                <div style={{ textAlign: 'center', fontSize: '0.72rem', color: '#555' }}>
                  <div>شكراً لتعاملكم معنا</div>
                  <div>السلسبيل للتجارة والتوزيع</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableInvoice;
