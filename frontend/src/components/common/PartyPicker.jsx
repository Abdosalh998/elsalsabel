import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  UserPlus, 
  Zap, 
  Search, 
  Check, 
  AlertTriangle, 
  CreditCard, 
  Phone, 
  X,
  ChevronDown
} from 'lucide-react';

/**
 * PartyPicker Component
 * Allows selecting:
 * 1. Existing customer / supplier from the database (الموجودين حالياً)
 * 2. New permanent party (إضافة جديد مع إضافته عليهم في قاعدة البيانات)
 * 3. Instantaneous / walk-in party (عميل / مورد لحظي نقدي دون حفظ في السجل)
 */
const PartyPicker = ({
  type = 'customer', // 'customer' | 'supplier'
  customers = [],
  value = {},
  onChange,
  disabled = false,
  required = true,
  allowNone = false,
  className = ''
}) => {
  const isSupplier = type === 'supplier';
  const labelText = isSupplier ? 'المورد' : 'العميل';

  // Determine initial mode
  const getInitialMode = () => {
    if (value.isNewCustomer) {
      return value.saveNewCustomer === false ? 'instant' : 'new';
    }
    return 'existing';
  };

  const [mode, setMode] = useState(getInitialMode);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Sync mode when value changes externally (e.g. form reset or editing)
  useEffect(() => {
    if (disabled) {
      setMode('existing');
    } else if (value.isNewCustomer) {
      setMode(value.saveNewCustomer === false ? 'instant' : 'new');
    } else {
      setMode('existing');
    }
  }, [value.isNewCustomer, value.saveNewCustomer, disabled]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectedParty = customers.find(c => String(c.id) === String(value.customer_id));

  // Filter existing customers
  const filteredCustomers = customers.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = c.name?.toLowerCase().includes(q);
    const phoneMatch = c.phone?.includes(q);
    return nameMatch || phoneMatch;
  });

  const handleModeChange = (newMode) => {
    if (disabled) return;
    setMode(newMode);
    setIsDropdownOpen(false);

    if (newMode === 'existing') {
      onChange?.({
        customer_id: selectedParty ? selectedParty.id : '',
        customer_name: '',
        phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        selectedCustomer: selectedParty || null
      });
    } else if (newMode === 'new') {
      onChange?.({
        customer_id: '',
        customer_name: value.customer_name || '',
        phone: value.phone || '',
        isNewCustomer: true,
        saveNewCustomer: true,
        selectedCustomer: null
      });
    } else if (newMode === 'instant') {
      onChange?.({
        customer_id: '',
        customer_name: value.customer_name || (isSupplier ? 'مورد نقدي' : 'عميل نقدي'),
        phone: value.phone || '',
        isNewCustomer: true,
        saveNewCustomer: false,
        selectedCustomer: null
      });
    }
  };

  const handleSelectCustomer = (cust) => {
    if (!cust) {
      onChange?.({
        customer_id: '',
        customer_name: '',
        phone: '',
        isNewCustomer: false,
        saveNewCustomer: true,
        selectedCustomer: null
      });
    } else {
      onChange?.({
        customer_id: cust.id,
        customer_name: cust.name,
        phone: cust.phone || '',
        isNewCustomer: false,
        saveNewCustomer: true,
        selectedCustomer: cust
      });
    }
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const formatMoney = (val) => {
    const n = Number(val || 0);
    return n.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className={`party-picker-container ${className}`} style={{ marginBottom: '16px', direction: 'rtl' }}>
      {/* Label and Mode Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
        <label className="form-label" style={{ margin: 0, fontWeight: 700, fontSize: '0.92rem' }}>
          {labelText} {required && <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>}
        </label>

        {/* 3 Mode Selection Pills */}
        {!disabled && (
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg-secondary, #f1f5f9)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid var(--border-color, #e2e8f0)',
            gap: '2px'
          }}>
            <button
              type="button"
              onClick={() => handleModeChange('existing')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '8px',
                border: 'none',
                background: mode === 'existing' ? 'var(--primary, #1A3A5C)' : 'transparent',
                color: mode === 'existing' ? '#ffffff' : 'var(--text-muted, #64748b)',
                fontSize: '0.78rem',
                fontWeight: mode === 'existing' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Users size={13} />
              <span>من القائمة المسجلة</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('new')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '8px',
                border: 'none',
                background: mode === 'new' ? 'var(--success, #16a34a)' : 'transparent',
                color: mode === 'new' ? '#ffffff' : 'var(--text-muted, #64748b)',
                fontSize: '0.78rem',
                fontWeight: mode === 'new' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <UserPlus size={13} />
              <span>إضافة جديد دائم</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('instant')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '8px',
                border: 'none',
                background: mode === 'instant' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent',
                color: mode === 'instant' ? '#ffffff' : 'var(--text-muted, #64748b)',
                fontSize: '0.78rem',
                fontWeight: mode === 'instant' ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Zap size={13} />
              <span>لحظي (نقدي)</span>
            </button>
          </div>
        )}
      </div>

      {/* ── MODE 1: Existing Customer / Supplier ── */}
      {mode === 'existing' && (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          {/* Main Display Button */}
          <div
            onClick={() => !disabled && setIsDropdownOpen(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--bg-card, #ffffff)',
              border: `1.5px solid ${isDropdownOpen ? 'var(--primary, #1A3A5C)' : 'var(--border-color, #e2e8f0)'}`,
              borderRadius: '10px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              userSelect: 'none',
              boxShadow: isDropdownOpen ? '0 0 0 3px rgba(26,58,92,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            {selectedParty ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--primary, #1A3A5C), #2b5d8f)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  flexShrink: 0
                }}>
                  {selectedParty.name?.charAt(0) || '؟'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary, #0f172a)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedParty.name}
                  </div>
                  {selectedParty.phone && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
                      {selectedParty.phone}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <span style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.9rem' }}>
                {allowNone ? `-- بدون ${labelText} (نقدي) --` : `-- اختر ${labelText} من القائمة --`}
              </span>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedParty && !disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCustomer(null);
                  }}
                  style={{
                    border: 'none',
                    background: 'rgba(239,68,68,0.1)',
                    color: '#ef4444',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="إلغاء الاختيار"
                >
                  <X size={13} />
                </button>
              )}
              <ChevronDown size={18} color="var(--text-muted, #64748b)" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
          </div>

          {/* Searchable Dropdown Menu */}
          {isDropdownOpen && !disabled && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              left: 0,
              background: 'var(--bg-card, #ffffff)',
              border: '1.5px solid var(--border-color, #e2e8f0)',
              borderRadius: '12px',
              boxShadow: '0 12px 32px rgba(15,35,64,0.18)',
              zIndex: 1000,
              overflow: 'hidden'
            }}>
              {/* Search Bar inside Dropdown */}
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color, #e2e8f0)', background: 'var(--bg-secondary, #f8fafc)' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #94a3b8)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder={`ابحث في قائمة ${labelText}ين بالاسم أو الهاتف...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    style={{
                      paddingRight: '34px',
                      height: '36px',
                      fontSize: '0.85rem',
                      background: 'var(--bg-card, #ffffff)'
                    }}
                  />
                </div>
              </div>

              {/* List of Customers */}
              <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {allowNone && (
                  <div
                    onClick={() => handleSelectCustomer(null)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color, #f1f5f9)',
                      color: 'var(--text-muted, #64748b)',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: !selectedParty ? 'rgba(26,58,92,0.06)' : 'transparent'
                    }}
                  >
                    <span>-- بدون {labelText} (تسجيل نقدي) --</span>
                    {!selectedParty && <Check size={16} color="var(--primary, #1A3A5C)" />}
                  </div>
                )}

                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map(cust => {
                    const isSelected = String(cust.id) === String(value.customer_id);
                    const bal = Number(cust.remaining_balance ?? (Number(cust.customer_total || 0) - Number(cust.total_payments || 0)));
                    const isDebtor = bal > 0.01;
                    const isCreditor = bal < -0.01;

                    return (
                      <div
                        key={cust.id}
                        onClick={() => handleSelectCustomer(cust)}
                        style={{
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-color, #f1f5f9)',
                          background: isSelected ? 'rgba(26,58,92,0.08)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => !isSelected && (e.currentTarget.style.background = 'var(--bg-secondary, #f8fafc)')}
                        onMouseLeave={(e) => !isSelected && (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: isSelected ? 'var(--primary, #1A3A5C)' : 'var(--bg-secondary, #e2e8f0)',
                            color: isSelected ? '#ffffff' : 'var(--text-primary, #0f172a)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            flexShrink: 0
                          }}>
                            {cust.name?.charAt(0) || '؟'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary, #0f172a)' }}>
                              {cust.name}
                            </div>
                            {cust.phone && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #64748b)' }}>
                                {cust.phone}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Balance Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {isDebtor && (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: 'rgba(239,68,68,0.1)',
                              color: '#dc2626',
                              fontSize: '0.74rem',
                              fontWeight: 700
                            }}>
                              عليه {formatMoney(bal)} ج.م
                            </span>
                          )}
                          {isCreditor && (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: 'rgba(22,163,74,0.1)',
                              color: '#16a34a',
                              fontSize: '0.74rem',
                              fontWeight: 700
                            }}>
                              له {formatMoney(Math.abs(bal))} ج.م
                            </span>
                          )}
                          {!isDebtor && !isCreditor && (
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: 'var(--bg-secondary, #f1f5f9)',
                              color: 'var(--text-muted, #94a3b8)',
                              fontSize: '0.72rem'
                            }}>
                              خالص
                            </span>
                          )}
                          {isSelected && <Check size={16} color="var(--primary, #1A3A5C)" />}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem' }}>
                    لم يتم العثور على نتائج لـ "{searchQuery}"
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange?.({
                            customer_id: '',
                            customer_name: searchQuery,
                            phone: '',
                            isNewCustomer: true,
                            saveNewCustomer: true,
                            selectedCustomer: null
                          });
                          setMode('new');
                          setIsDropdownOpen(false);
                        }}
                        style={{
                          background: 'rgba(22,163,74,0.1)',
                          color: '#16a34a',
                          border: '1px solid #16a34a',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        + إضافة "{searchQuery}" كـ {labelText} دائم جديد
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Supplier Debt Warning Banner (for Purchases) */}
          {isSupplier && selectedParty && (() => {
            const bal = Number(selectedParty.remaining_balance ?? (Number(selectedParty.customer_total || 0) - Number(selectedParty.total_payments || 0)));
            if (bal > 0.01) {
              return (
                <div style={{
                  marginTop: '8px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  color: '#b45309'
                }}>
                  <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                  <div>
                    <strong>تنبيه مقاصة:</strong> هذا المورد لديه مديونية سابقة بقيمة <strong>{formatMoney(bal)} ج.م</strong>.
                    سيتم تلقائياً عرض نافذة تأكيد المقاصة لتسوية فواتيره القديمة عند الحفظ.
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* ── MODE 2: Add New Permanent Customer / Supplier (حفظ دائم) ── */}
      {mode === 'new' && !disabled && (
        <div style={{
          padding: '14px',
          background: 'rgba(22,163,74,0.04)',
          border: '1.5px solid rgba(22,163,74,0.25)',
          borderRadius: '12px'
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                اسم {labelText} الجديد *
              </label>
              <input
                type="text"
                className="form-input"
                placeholder={`أدخل اسم ${labelText} الجديد`}
                value={value.customer_name || ''}
                onChange={(e) => onChange?.({ ...value, customer_name: e.target.value, isNewCustomer: true, saveNewCustomer: true })}
                required={required}
                autoFocus
              />
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                رقم الهاتف (اختياري)
              </label>
              <input
                type="tel"
                className="form-input"
                placeholder="01xxxxxxxxx"
                value={value.phone || ''}
                onChange={(e) => onChange?.({ ...value, phone: e.target.value, isNewCustomer: true, saveNewCustomer: true })}
              />
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
            fontSize: '0.78rem',
            color: '#15803d',
            fontWeight: 600
          }}>
            <Check size={14} />
            <span>سيتم حفظ {labelText} في قاعدة البيانات وإضافته بشكل دائم لقائمة {labelText}ين.</span>
          </div>
        </div>
      )}

      {/* ── MODE 3: Instant / Walk-in Party (لحظي نقدي بدون حفظ) ── */}
      {mode === 'instant' && !disabled && (
        <div style={{
          padding: '14px',
          background: 'rgba(245,158,11,0.05)',
          border: '1.5px solid rgba(245,158,11,0.3)',
          borderRadius: '12px'
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                اسم {labelText} اللحظي *
              </label>
              <input
                type="text"
                className="form-input"
                placeholder={isSupplier ? 'مورد نقدي' : 'عميل نقدي'}
                value={value.customer_name || ''}
                onChange={(e) => onChange?.({ ...value, customer_name: e.target.value, isNewCustomer: true, saveNewCustomer: false })}
                required={required}
                autoFocus
              />
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                رقم الهاتف (اختياري)
              </label>
              <input
                type="tel"
                className="form-input"
                placeholder="رقم الهاتف للتواصل"
                value={value.phone || ''}
                onChange={(e) => onChange?.({ ...value, phone: e.target.value, isNewCustomer: true, saveNewCustomer: false })}
              />
            </div>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
            fontSize: '0.78rem',
            color: '#b45309',
            fontWeight: 600
          }}>
            <Zap size={14} color="#f59e0b" />
            <span>تعامل لحظي / كاش: الفاتورة ستسجل باسمه فقط، ولن يتم إدراجه في سجل {labelText}ين الدائمين.</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartyPicker;
