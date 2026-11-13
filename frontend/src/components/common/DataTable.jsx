import { useState, useRef, Fragment, useEffect, useCallback } from 'react';
import { Plus, FileDown, FileText, Printer, SlidersHorizontal, X, ChevronDown, Check } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import './DataTable.css';

/**
 * MultiSelectFilter — dropdown with checkboxes for multiple selection
 */
const MultiSelectFilter = ({ options = [], value = [], onChange, placeholder = '-- الكل --' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (val) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const toggleAll = () => {
    if (value.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(o => o.value));
    }
  };

  const selectedLabels = options
    .filter(o => value.includes(o.value))
    .map(o => o.label);

  return (
    <div className="ms-wrapper" ref={ref}>
      <button
        type="button"
        className={`ms-trigger ${open ? 'open' : ''} ${value.length > 0 ? 'has-value' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span className="ms-trigger-text">
          {value.length === 0
            ? placeholder
            : value.length === 1
              ? selectedLabels[0]
              : `${value.length} مختار`}
        </span>
        {value.length > 0 && (
          <span
            className="ms-clear-btn"
            onClick={e => { e.stopPropagation(); onChange([]); }}
            title="مسح الاختيار"
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown size={14} className={`ms-chevron ${open ? 'rotated' : ''}`} />
      </button>

      {open && (
        <div className="ms-dropdown">
          {options.length > 5 && (
            <div className="ms-search-wrap">
              <input
                type="text"
                className="ms-search"
                placeholder="بحث..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            </div>
          )}
          <div className="ms-options">
            {filtered.length > 1 && (
              <label className="ms-option ms-select-all" onClick={toggleAll}>
                <span className={`ms-checkbox ${value.length === options.length ? 'checked' : value.length > 0 ? 'partial' : ''}`}>
                  {value.length === options.length ? <Check size={10} /> : null}
                </span>
                <span className="ms-option-label">
                  {value.length === options.length ? 'إلغاء الكل' : 'تحديد الكل'}
                </span>
              </label>
            )}
            <div className="ms-divider" />
            {filtered.length === 0 ? (
              <div className="ms-empty">لا توجد نتائج</div>
            ) : (
              filtered.map(opt => (
                <label key={opt.value} className="ms-option" onClick={() => toggle(opt.value)}>
                  <span className={`ms-checkbox ${value.includes(opt.value) ? 'checked' : ''}`}>
                    {value.includes(opt.value) ? <Check size={10} /> : null}
                  </span>
                  <span className="ms-option-label">{opt.label}</span>
                </label>
              ))
            )}
          </div>
          {value.length > 0 && (
            <div className="ms-footer">
              <span className="ms-count">{value.length} مختار</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * DataTable with server-side filter support.
 *
 * filterConfig: Array of filter definitions:
 *   { key, label, type: 'select' | 'multi-select' | 'date-range' | 'text', options?, placeholder? }
 *
 * onFilter: (filtersObj) => void  — called when user applies or clears filters
 * For multi-select, the value sent is a comma-separated string of selected values.
 */
const DataTable = ({
  title,
  columns,
  data,
  loading,
  onFilter,
  onAdd,
  actions,
  filterConfig = [],
  hideExport = false,
  renderExpandedRow
}) => {
  const initialFilters = useCallback(() => {
    const init = {};
    filterConfig.forEach(f => {
      if (f.type === 'date-range') init[f.key] = { from: '', to: '' };
      else if (f.type === 'multi-select') init[f.key] = [];
      else init[f.key] = '';
    });
    return init;
  }, [filterConfig]);

  const [filters, setFilters] = useState(initialFilters);
  const [filtersVisible, setFiltersVisible] = useState(true);

  // Count active filters
  const activeCount = Object.entries(filters).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return v.from || v.to;
    return v !== '';
  }).length;

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleDateRangeChange = (key, field, value) => {
    setFilters(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleApply = () => {
    if (onFilter) onFilter(buildParams());
  };

  const handleClear = () => {
    const cleared = initialFilters();
    setFilters(cleared);
    if (onFilter) onFilter({});
  };

  // Build flat params object for API call
  // multi-select → sends comma-separated string if multiple, or single value if one
  const buildParams = () => {
    const params = {};
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length > 0) params[key] = value.join(',');
      } else if (typeof value === 'object') {
        if (value.from) params[`${key}From`] = value.from;
        if (value.to) params[`${key}To`] = value.to;
      } else if (value !== '') {
        params[key] = value;
      }
    });
    return params;
  };

  // ─── Export helpers ──────────────────────────────────────
  const getCellValue = (col, row) => {
    if (col.render) {
      const rendered = col.render(row);
      if (typeof rendered === 'string' || typeof rendered === 'number') return rendered;
      if (rendered?.props?.children) {
        const children = rendered.props.children;
        if (typeof children === 'string' || typeof children === 'number') return String(children);
        if (Array.isArray(children))
          return children.filter(c => typeof c === 'string' || typeof c === 'number').join('');
      }
    }
    const val = row[col.key];
    return val !== null && val !== undefined ? String(val) : '';
  };

  const handleExportExcel = () => {
    try {
      const exportData = data.map(row => {
        const obj = {};
        columns.forEach(col => { obj[col.label] = getCellValue(col, row); });
        return obj;
      });
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const colWidths = columns.map(col => ({ wch: Math.max(col.label.length * 2, 15) }));
      worksheet['!cols'] = colWidths;
      worksheet['!dir'] = 'rtl';
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const filename = `Export_Excel_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('Excel Export Error:', err);
    }
  };

  const handleExportPDF = async () => {
    const printTable = document.createElement('div');
    printTable.style.cssText = `
      position: absolute; top: 0; left: 0; z-index: -1000;
      direction: rtl; font-family: 'Arial', sans-serif;
      background: white; padding: 20px; width: 1100px;
    `;
    const titleEl = document.createElement('h2');
    titleEl.style.cssText = 'text-align: center; margin-bottom: 16px; font-size: 18px; color: #1e293b;';
    titleEl.textContent = title;
    printTable.appendChild(titleEl);

    const table = document.createElement('table');
    table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 13px;';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.cssText = 'background: #1e3a5f; color: white;';
    columns.forEach(col => {
      const th = document.createElement('th');
      th.style.cssText = 'padding: 10px 12px; text-align: right; border: 1px solid #cbd5e1;';
      th.textContent = col.label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.style.cssText = idx % 2 === 0 ? 'background: #f8fafc;' : 'background: white;';
      columns.forEach(col => {
        const td = document.createElement('td');
        td.style.cssText = 'padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;';
        td.textContent = getCellValue(col, row);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    printTable.appendChild(table);

    const footer = document.createElement('p');
    footer.style.cssText = 'margin-top: 12px; font-size: 11px; color: #64748b; text-align: left;';
    footer.textContent = `تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')}`;
    printTable.appendChild(footer);
    document.body.appendChild(printTable);

    try {
      const canvas = await html2canvas(printTable, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width / 2, canvas.height / 2] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      const filename = `Export_PDF_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('PDF Export Error:', err);
    } finally {
      document.body.removeChild(printTable);
    }
  };

  const handlePrint = () => window.print();

  return (
    <div style={{ padding: '28px 32px', direction: 'rtl' }}>
    <div className="card datatable-card">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="datatable-header">
        <div className="datatable-header-top">
          <h2 className="card-title">{title}</h2>
          <div className="datatable-actions">
            {!hideExport && (
              <div className="export-buttons hide-print">
                <button className="btn btn-ghost btn-sm" onClick={handleExportExcel} title="تصدير Excel">
                  <FileDown size={15} /> <span className="btn-label">Excel</span>
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleExportPDF} title="تصدير PDF">
                  <FileText size={15} /> <span className="btn-label">PDF</span>
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handlePrint} title="طباعة">
                  <Printer size={15} /> <span className="btn-label">طباعة</span>
                </button>
              </div>
            )}
            {filterConfig.length > 0 && (
              <button
                className={`btn btn-ghost btn-sm hide-print filter-toggle-btn ${filtersVisible ? 'active' : ''}`}
                onClick={() => setFiltersVisible(v => !v)}
              >
                <SlidersHorizontal size={15} />
                <span>فلترة</span>
                {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
              </button>
            )}
            {onAdd && (
              <button className="btn btn-primary hide-print datatable-add-btn" onClick={onAdd}>
                <Plus size={16} /> <span>إضافة</span>
              </button>
            )}
          </div>
        </div>

        {/* ─── Filter Bar ───────────────────────────── */}
        {filterConfig.length > 0 && filtersVisible && (
          <div className="filter-bar hide-print">
            {filterConfig.map(f => (
              <div key={f.key} className="filter-item">
                <label className="filter-label">{f.label}</label>

                {/* ── Single Select ── */}
                {f.type === 'select' && (
                  <select
                    className="form-select filter-select"
                    value={filters[f.key] || ''}
                    onChange={e => handleFilterChange(f.key, e.target.value)}
                  >
                    <option value="">-- الكل --</option>
                    {(f.options || []).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}

                {/* ── Multi Select ── */}
                {f.type === 'multi-select' && (
                  <MultiSelectFilter
                    options={f.options || []}
                    value={filters[f.key] || []}
                    onChange={val => handleFilterChange(f.key, val)}
                    placeholder={f.placeholder || '-- الكل --'}
                  />
                )}

                {/* ── Date Range ── */}
                {f.type === 'date-range' && (
                  <div className="date-range-wrapper">
                    <div className="date-range-field">
                      <span className="date-range-sublabel">من</span>
                      <input
                        type="date"
                        className="form-input filter-date"
                        value={filters[f.key]?.from || ''}
                        onChange={e => handleDateRangeChange(f.key, 'from', e.target.value)}
                      />
                    </div>
                    <span className="date-range-sep">←</span>
                    <div className="date-range-field">
                      <span className="date-range-sublabel">إلى</span>
                      <input
                        type="date"
                        className="form-input filter-date"
                        value={filters[f.key]?.to || ''}
                        onChange={e => handleDateRangeChange(f.key, 'to', e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* ── Text ── */}
                {f.type === 'text' && (
                  <input
                    type="text"
                    className="form-input filter-select"
                    placeholder={f.placeholder || ''}
                    value={filters[f.key] || ''}
                    onChange={e => handleFilterChange(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}

            <div className="filter-actions">
              <button className="btn btn-primary btn-sm" onClick={handleApply}>
                تطبيق
              </button>
              {activeCount > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={handleClear}>
                  <X size={14} /> مسح
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Table ───────────────────────────────────── */}
      <div className="datatable-scroll-hint hide-desktop">
        <span>⇄ اسحب الجدول أفقياً لعرض كافة الأعمدة</span>
      </div>
      <div className="datatable-wrapper">
        <table className="datatable">
          <thead>
            <tr>
              {columns.map((col, idx) => <th key={idx}>{col.label}</th>)}
              {actions && <th className="hide-print">الإجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center py-8">
                  <div className="spinner mx-auto" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="empty-state">
                  لا توجد بيانات لعرضها
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <Fragment key={row.id || rowIndex}>
                  <tr>
                    {columns.map((col, colIndex) => (
                      <td key={colIndex}>
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                    {actions && (
                      <td className="hide-print">
                        <div className="datatable-row-actions">{actions(row)}</div>
                      </td>
                    )}
                  </tr>
                  {renderExpandedRow && renderExpandedRow(row)}
                </Fragment>
              ))
            )}
          </tbody>
          {!loading && data.length > 0 && columns.some(c => c.sum || c.summary) && (
            <tfoot className="datatable-tfoot">
              <tr>
                {columns.map((col, colIndex) => {
                  let content = null;
                  if (col.summary) {
                    content = col.summary(data);
                  } else if (col.sum) {
                    const total = data.reduce((acc, row) => {
                      const raw = row[col.key];
                      const val = Number(raw !== undefined && raw !== null ? raw : 0);
                      return acc + (isNaN(val) ? 0 : val);
                    }, 0);
                    content = col.renderSummary
                      ? col.renderSummary(total, data)
                      : (
                        <span className="tfoot-sum-val">
                          {total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                        </span>
                      );
                  } else if (colIndex === 0) {
                    content = (
                      <span className="summary-title-badge">
                        الإجمالي ({data.length})
                      </span>
                    );
                  }
                  return (
                    <td key={colIndex} className={col.sum || col.summary ? 'tfoot-sum-cell' : ''}>
                      {content}
                    </td>
                  );
                })}
                {actions && <td className="hide-print"></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ─── Summary row ─────────────────────────────── */}
      {!loading && data.length > 0 && (
        <div className="datatable-footer">
          إجمالي النتائج: <strong>{data.length}</strong> سجل
        </div>
      )}
    </div>
    </div>
  );
};

export default DataTable;
