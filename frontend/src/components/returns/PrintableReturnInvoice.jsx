import { useState, useRef } from 'react';
import { Printer, X, FileText, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import '../common/PrintableModal.css';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const PrintableReturnInvoice = ({ isOpen, onClose, returnData }) => {
  const [printFormat, setPrintFormat] = useState('a4');
  const printRef = useRef(null);

  if (!isOpen || !returnData) return null;

  const returnDate = returnData.date ? new Date(returnData.date) : new Date();
  const invoiceNumber = returnData.id;
  const weight       = Number(returnData.weight || 0);
  const rollsCount   = Number(returnData.rolls_count || 0);
  const pricePerTon  = Number(returnData.price_per_ton || 0);
  const totalAmount  = Number(returnData.total || 0);
  const companyName  = returnData.company || '';

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const isA4 = printFormat === 'a4';
    const pageMargin = isA4 ? '12mm 15mm' : '4mm 6mm';
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { alert('يرجى السماح بفتح النوافذ المنبثقة لإتمام الطباعة'); return; }
    printWindow.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head>' +
      '<meta charset="UTF-8"><title>فاتورة مرتجع #' + invoiceNumber + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet">' +
      '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:"Tajawal",sans-serif;direction:rtl;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      '@page{size:' + (isA4 ? 'A4' : '80mm auto') + ';margin:' + pageMargin + '}table{border-collapse:collapse;width:100%}</style></head><body>' +
      content.innerHTML + '</body></html>'
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => { setTimeout(() => { printWindow.print(); printWindow.close(); }, 400); };
    setTimeout(() => { if (!printWindow.closed) { printWindow.print(); printWindow.close(); } }, 1800);
  };

  return (
    <div className="printable-modal-overlay">
      <div className={`printable-modal-dialog format-${printFormat}`}>

        {/* Action Bar */}
        <div className="printable-action-bar">
          <div className="printable-action-top">
            <span className="printable-title">
              معاينة فاتورة المرتجع #{invoiceNumber}
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
                  background: printFormat === key ? '#dc2626' : 'transparent',
                  color: printFormat === key ? '#fff' : '#64748b'
                }}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            <button type="button" onClick={handlePrint} className="printable-print-btn" style={{ background: '#dc2626' }}>
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
            {/* A4 */}
            {printFormat === 'a4' && (
            <div>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'2.5px solid #dc2626',paddingBottom:16,marginBottom:20 }}>
                <div style={{ display:'flex',alignItems:'center',gap:14 }}>
                  <img src="/logo.jpg" alt="شعار" style={{ width:68,height:68,objectFit:'contain',borderRadius:10,border:'1px solid #e2e8f0' }} onError={e=>e.target.style.display='none'} />
                  <div>
                    <h1 style={{ margin:0,fontSize:'1.45rem',fontWeight:800,color:'#dc2626' }}>مؤسسة السلسبيل للتجارة والتوزيع</h1>
                    <div style={{ fontSize:'0.85rem',color:'#64748b',marginTop:3 }}>إدارة المرتجعات — فاتورة مرتجع بضاعة</div>
                  </div>
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ display:'inline-block',background:'#fee2e2',color:'#dc2626',fontWeight:800,fontSize:'1.15rem',padding:'6px 14px',borderRadius:8,marginBottom:4 }}>فاتورة مرتجع #{invoiceNumber}</div>
                  <div style={{ fontSize:'0.85rem',color:'#64748b' }}>التاريخ: <strong>{format(returnDate,'yyyy/MM/dd')}</strong></div>
                </div>
              </div>

              <div style={{ background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px 18px',marginBottom:20,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,fontSize:'0.88rem' }}>
                <div>
                  <span style={{ color:'#64748b',fontSize:'0.78rem',display:'block' }}>العميل / الجهة المرتجعة:</span>
                  <strong style={{ color:'#0f172a',fontSize:'1rem' }}>{returnData.customer_name || 'بدون عميل'}</strong>
                  {returnData.customer_phone && <div style={{ fontSize:'0.8rem',color:'#64748b' }}>{returnData.customer_phone}</div>}
                </div>
                <div>
                  <span style={{ color:'#64748b',fontSize:'0.78rem',display:'block' }}>تاريخ المرتجع:</span>
                  <strong>{format(returnDate,'yyyy/MM/dd')}</strong>
                </div>
                <div>
                  <span style={{ color:'#64748b',fontSize:'0.78rem',display:'block' }}>المصدر:</span>
                  <span style={{ display:'inline-block',borderRadius:5,padding:'2px 8px',fontSize:'0.8rem',fontWeight:700,background:returnData.sale_invoice_number?'#dcfce7':'#f1f5f9',color:returnData.sale_invoice_number?'#15803d':'#475569' }}>
                    {returnData.sale_invoice_number ? `فاتورة مبيعات #${returnData.sale_invoice_number}` : 'مرتجع مباشر'}
                  </span>
                </div>
              </div>

              <table style={{ width:'100%',borderCollapse:'collapse',marginBottom:20 }}>
                <thead>
                  <tr style={{ background:'#dc2626',color:'#fff' }}>
                    <th style={{ padding:'10px 12px',textAlign:'right',fontSize:'0.85rem' }}>#</th>
                    <th style={{ padding:'10px 12px',textAlign:'right',fontSize:'0.85rem' }}>الصنف / المنتج</th>
                    {companyName && <th style={{ padding:'10px 12px',textAlign:'center',fontSize:'0.85rem' }}>الشركة</th>}
                    <th style={{ padding:'10px 12px',textAlign:'center',fontSize:'0.85rem' }}>الوزن (طن)</th>
                    {rollsCount > 0 && <th style={{ padding:'10px 12px',textAlign:'center',fontSize:'0.85rem' }}>عدد اللفات</th>}
                    <th style={{ padding:'10px 12px',textAlign:'center',fontSize:'0.85rem' }}>سعر الطن (ج)</th>
                    <th style={{ padding:'10px 12px',textAlign:'left',fontSize:'0.85rem' }}>إجمالي القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom:'1px solid #e2e8f0',background:'#fff' }}>
                    <td style={{ padding:'12px',color:'#64748b' }}>1</td>
                    <td style={{ padding:'12px' }}><strong style={{ fontSize:'0.95rem',color:'#0f172a' }}>{returnData.product}</strong></td>
                    {companyName && <td style={{ padding:'12px',textAlign:'center',color:'#475569' }}>{companyName}</td>}
                    <td style={{ padding:'12px',textAlign:'center',fontWeight:600 }}>{fmt(weight,3)}</td>
                    {rollsCount > 0 && <td style={{ padding:'12px',textAlign:'center',fontWeight:600 }}>{rollsCount.toLocaleString()}</td>}
                    <td style={{ padding:'12px',textAlign:'center',fontWeight:700,color:'#dc2626',fontSize:'1rem' }}>{fmt(pricePerTon)}</td>
                    <td style={{ padding:'12px',textAlign:'left',fontWeight:800,fontSize:'1rem',color:'#0f172a' }}>{fmt(totalAmount)} ج.م</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display:'grid',gridTemplateColumns:'1fr 340px',gap:20,marginBottom:24 }}>
                <div style={{ background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'14px 18px',fontSize:'0.85rem' }}>
                  <span style={{ fontWeight:700,color:'#475569',display:'block',marginBottom:6 }}>ملاحظات المرتجع:</span>
                  <p style={{ color:returnData.notes?'#1e293b':'#94a3b8',margin:0,lineHeight:1.6 }}>{returnData.notes || 'لا توجد ملاحظات مسجلة.'}</p>
                </div>
                <div style={{ background:'#fff5f5',border:'1.5px solid #fecaca',borderRadius:10,padding:'14px 18px' }}>
                  <div style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #fee2e2',fontSize:'0.9rem' }}>
                    <span style={{ color:'#475569' }}>وزن المرتجع (طن):</span>
                    <strong>{fmt(weight,3)}</strong>
                  </div>
                  {rollsCount > 0 && (
                    <div style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #fee2e2',fontSize:'0.9rem' }}>
                      <span style={{ color:'#475569' }}>عدد اللفات المرتجعة:</span>
                      <strong>{rollsCount.toLocaleString()}</strong>
                    </div>
                  )}
                  <div style={{ display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #fee2e2',fontSize:'0.9rem' }}>
                    <span style={{ color:'#475569' }}>سعر الطن:</span>
                    <strong>{fmt(pricePerTon)} ج.م</strong>
                  </div>
                  <div style={{ display:'flex',justifyContent:'space-between',padding:'8px 0',fontSize:'1.1rem',fontWeight:800,color:'#dc2626' }}>
                    <span>إجمالي قيمة المرتجع:</span>
                    <span>{fmt(totalAmount)} ج.م</span>
                  </div>
                  <div style={{ fontSize:'0.78rem',color:'#64748b',marginTop:4 }}>
                    {returnData.add_to_balance ? '✅ تم إضافة القيمة لرصيد العميل / مقاصة المديونية' : '⚪ لم تُضف للرصيد'}
                  </div>
                </div>
              </div>

              <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24,borderTop:'1px dashed #cbd5e1',paddingTop:20,marginTop:32,textAlign:'center' }}>
                {['توقيع أمين المخزن / المستلم','توقيع المحاسب المسؤول','توقيع العميل / المورد'].map(sig => (
                  <div key={sig}>
                    <div style={{ fontSize:'0.82rem',color:'#64748b',marginBottom:36 }}>{sig}</div>
                    <div style={{ borderBottom:'1px solid #94a3b8',width:'70%',margin:'0 auto' }}></div>
                  </div>
                ))}
              </div>

              <div style={{ textAlign:'center',marginTop:28,fontSize:'0.75rem',color:'#94a3b8' }}>
                مؤسسة السلسبيل — نظام إدارة الشركة | تاريخ الطباعة: {format(new Date(),'yyyy/MM/dd HH:mm')}
              </div>
            </div>
          )}

          {/* Thermal */}
          {printFormat === 'thermal' && (
            <div style={{ fontSize:'11px',lineHeight:1.4,fontFamily:"'Courier New',Courier,monospace" }}>
              <div style={{ textAlign:'center',paddingBottom:8,borderBottom:'1px dashed #000',marginBottom:8 }}>
                <div style={{ fontWeight:'bold',fontSize:'14px' }}>مؤسسة السلسبيل</div>
                <div style={{ fontSize:'10px' }}>فاتورة مرتجع بضاعة</div>
                <div style={{ fontSize:'10px' }}>رقم #{invoiceNumber}</div>
                <div style={{ fontSize:'10px' }}>التاريخ: {format(returnDate,'yyyy/MM/dd')}</div>
              </div>
              <div style={{ marginBottom:6 }}>
                <div>العميل: <strong>{returnData.customer_name || 'بدون عميل'}</strong></div>
                <div>الصنف: <strong>{returnData.product}</strong></div>
                {companyName && <div>الشركة: <strong>{companyName}</strong></div>}
                {returnData.sale_invoice_number && <div>مرجع: <strong>فاتورة #{returnData.sale_invoice_number}</strong></div>}
              </div>
              <div style={{ borderTop:'1px dashed #000',borderBottom:'1px dashed #000',padding:'4px 0',margin:'6px 0' }}>
                <div style={{ display:'flex',justifyContent:'space-between' }}><span>الوزن (طن):</span><span>{fmt(weight,3)}</span></div>
                {rollsCount > 0 && <div style={{ display:'flex',justifyContent:'space-between' }}><span>عدد اللفات:</span><span>{rollsCount.toLocaleString()}</span></div>}
                <div style={{ display:'flex',justifyContent:'space-between',fontWeight:'bold' }}><span>سعر الطن (ج):</span><span>{fmt(pricePerTon)}</span></div>
              </div>
              <div style={{ padding:'4px 0' }}>
                <div style={{ display:'flex',justifyContent:'space-between',fontWeight:'bold',fontSize:'12px' }}><span>إجمالي المرتجع:</span><span>{fmt(totalAmount)} ج.م</span></div>
                {returnData.notes && <div style={{ fontSize:'10px',marginTop:4,color:'#555' }}>ملاحظة: {returnData.notes}</div>}
              </div>
              <div style={{ textAlign:'center',fontSize:'9px',marginTop:12 }}>شكراً لتعاملكم مع السلسبيل</div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableReturnInvoice;
