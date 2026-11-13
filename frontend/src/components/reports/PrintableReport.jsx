import { useRef } from 'react';
import { Printer, X, FileSpreadsheet, Download } from 'lucide-react';
import { format } from 'date-fns';
import logo from '../../assets/logo.jpg';

const PrintableReport = ({
  isOpen,
  onClose,
  reportTitle,
  subtitle,
  summaryCards = [],
  columns = [],
  data = [],
  extraSections = [],
  branchName = 'فرع السلسبيل الرئيسي',
  userName = 'المسؤول'
}) => {
  const printRef = useRef(null);

  if (!isOpen) return null;

  const nowFormatted = format(new Date(), 'yyyy/MM/dd - HH:mm');

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير');
      return;
    }

    const printContent = printRef.current?.innerHTML || '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>${reportTitle} - السلسبيل</title>
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
            padding: 20px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          @page {
            size: A4 portrait;
            margin: 12mm 10mm;
          }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
          th {
            background-color: #1A3A5C !important;
            color: #ffffff !important;
            font-weight: 700;
            padding: 8px 10px;
            text-align: right;
            border: 1px solid #1A3A5C;
          }
          td {
            padding: 7px 10px;
            border: 1px solid #cbd5e1;
            text-align: right;
          }
          tr:nth-child(even) { background-color: #f8fafc !important; }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
          }
          .kpi-box {
            border: 1.5px solid #cbd5e1;
            border-radius: 8px;
            padding: 10px 12px;
            background: #f8fafc !important;
            text-align: center;
          }
          .kpi-title { font-size: 10px; color: #64748b; font-weight: 700; margin-bottom: 4px; }
          .kpi-val { font-size: 14px; color: #1A3A5C; font-weight: 800; }
          .header-box {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            border-bottom: 2.5px solid #1A3A5C;
            padding-bottom: 14px;
            margin-bottom: 18px;
          }
          .signatures {
            display: flex;
            justify-content: space-between;
            margin-top: 40px;
            padding-top: 15px;
            border-top: 1px dashed #cbd5e1;
            font-size: 11px;
            color: #475569;
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
    }, 450);
  };

  const handleExportCSV = () => {
    if (!data || data.length === 0) {
      alert('لا توجد بيانات لتصديرها');
      return;
    }

    const headers = columns.map(c => `"${c.header}"`).join(',');
    const rows = data.map(row => {
      return columns.map(c => {
        let val = typeof c.render === 'function' ? c.render(row) : row[c.key];
        if (val === null || val === undefined) val = '';
        if (typeof val === 'string') val = val.replace(/"/g, '""');
        return `"${val}"`;
      }).join(',');
    });

    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${reportTitle}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '95%', maxWidth: 1050,
        maxHeight: '94vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)', overflow: 'hidden'
      }}>
        {/* Top Control Bar */}
        <div style={{
          padding: '14px 20px', background: '#1A3A5C', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Printer size={20} color="#38bdf8" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>معاينة وطباعة التقرير</div>
              <div style={{ fontSize: '0.75rem', color: '#93c5fd' }}>{reportTitle}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleExportCSV}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem',
                fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              <Download size={14} /> تصدير Excel (CSV)
            </button>

            <button
              type="button"
              onClick={handlePrint}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none',
                color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: '0.88rem',
                fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)'
              }}
            >
              <Printer size={16} /> طباعة التقرير (A4 / PDF)
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
                width: 32, height: 32, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '30px 40px', background: '#f1f5f9' }}>
          <div
            ref={printRef}
            style={{
              background: '#fff', padding: '36px 40px', borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.06)', minHeight: 700,
              maxWidth: 900, margin: '0 auto'
            }}
          >
            {/* Header */}
            <div className="header-box" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '2.5px solid #1A3A5C', paddingBottom: 14, marginBottom: 18
            }}>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1A3A5C', marginBottom: 2 }}>
                  السلسبيل لتجارة وتوزيع البضائع
                </h1>
                <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                  {branchName} — الإدارة المالية والمخازن
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <img src={logo} alt="السلسبيل" style={{ height: 50, objectFit: 'contain' }} />
              </div>

              <div style={{ textAlign: 'left', fontSize: '0.78rem', color: '#475569' }}>
                <div><strong>تاريخ الاستخراج:</strong> {nowFormatted}</div>
                <div><strong>المسؤول:</strong> {userName}</div>
              </div>
            </div>

            {/* Title & Subtitle Banner */}
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
              borderRight: '4px solid #1A3A5C',
              padding: '10px 16px',
              borderRadius: '0 8px 8px 0',
              marginBottom: 20
            }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                {reportTitle}
              </h2>
              {subtitle && (
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2, fontWeight: 600 }}>
                  {subtitle}
                </div>
              )}
            </div>

            {/* KPI Summary Grid */}
            {summaryCards.length > 0 && (
              <div className="summary-grid" style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 5)}, 1fr)`,
                gap: 12,
                marginBottom: 24
              }}>
                {summaryCards.map((card, i) => (
                  <div key={i} className="kpi-box" style={{
                    border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '10px 12px',
                    background: '#f8fafc', textAlign: 'center'
                  }}>
                    <div className="kpi-title" style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700, marginBottom: 4 }}>
                      {card.label}
                    </div>
                    <div className="kpi-val" style={{ fontSize: '1.05rem', fontWeight: 800, color: card.color || '#1A3A5C' }}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Main Table */}
            {columns.length > 0 && data.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      {columns.map((col, idx) => (
                        <th key={idx} style={{
                          background: '#1A3A5C', color: '#fff', padding: '9px 12px',
                          textAlign: col.align || 'right', fontWeight: 700, border: '1px solid #1A3A5C'
                        }}>
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, rIdx) => (
                      <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        {columns.map((col, cIdx) => {
                          const val = typeof col.render === 'function' ? col.render(row) : row[col.key];
                          return (
                            <td key={cIdx} style={{
                              padding: '8px 12px', border: '1px solid #cbd5e1',
                              textAlign: col.align || 'right', color: '#1e293b'
                            }}>
                              {val ?? '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Extra Sections (e.g. Top Products, Categories breakdown) */}
            {extraSections.map((sec, sIdx) => (
              <div key={sIdx} style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1A3A5C', marginBottom: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                  {sec.title}
                </h3>
                {sec.content}
              </div>
            ))}

            {/* Signatures */}
            <div className="signatures" style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 40,
              paddingTop: 16, borderTop: '1px dashed #cbd5e1', fontSize: '0.82rem', color: '#475569'
            }}>
              <div>توقيع مُعد التقرير: ........................</div>
              <div>المراجعة والتدقيق: ........................</div>
              <div>اعتماد المدير المسؤول: ........................</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableReport;
