import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPayments, createPayment, updatePayment, deletePayment } from '../services/payments.js';
import { fetchPlayers } from '../services/players.js';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const formatTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US');

const getDateInputValue = (date = new Date()) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTransactionLabel = (payment) => {
  if (Number(payment.remainingAmount || 0) <= 0) return 'Full payment';
  return 'Partial payment';
};

const getMethodClass = (method) => {
  const normalized = String(method || '').toLowerCase();
  if (normalized.includes('cash')) return 'cash';
  if (normalized.includes('bank')) return 'bank';
  return 'click';
};

const getPaymentMonthKey = (date) => {
  if (!date) return 'undated';
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
};

const getPaymentDayKey = (date) => {
  if (!date) return 'undated';
  return getDateInputValue(date);
};

const getMemberName = (payment) => payment.playerId?.fullName || payment.playerNameSnapshot || '-';
const getParentName = (payment) => payment.playerId?.parentId?.name || payment.parentNameSnapshot || '-';
const isDeletedPlayerPayment = (payment) => Boolean(payment.playerId?.isDeleted);
const getPackageName = (payment) => {
  const classes = payment.playerId?.packageClasses || payment.packageClassesSnapshot;
  const hours = payment.playerId?.packageHours || payment.packageHoursSnapshot;
  const name = payment.playerId?.packageName || payment.packageNameSnapshot;
  if (classes && hours) return `${classes} classes (${hours} hours)`;
  if (classes) return `${classes} classes`;
  return name && name !== 'custom' ? name : '-';
};

const getPlayerGroups = (player) => {
  const groups = player?.groupIds?.length ? player.groupIds : [player?.groupId].filter(Boolean);
  return groups.map((group) => group?.name).filter(Boolean).join(', ');
};

const PaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState({ playerId: '', paidAmount: 0, paymentMethod: 'Cash', paymentDate: getDateInputValue(), receiptImage: '', notes: '' });
  const [editingPaymentId, setEditingPaymentId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeView, setActiveView] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(getPaymentMonthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState(getDateInputValue());
  const [searchQuery, setSearchQuery] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const { t } = useLanguage();

  const loadPayments = async () => {
    try {
      setPayments(await fetchPayments());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPlayers().then(setPlayers).catch(console.error);
    loadPayments();
  }, []);

  const totals = useMemo(() => {
    const paid = payments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
    const remaining = payments.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
    const fullPayments = payments.filter((payment) => Number(payment.remainingAmount || 0) <= 0).length;
    return { paid, remaining, fullPayments };
  }, [payments]);

  const monthOptions = useMemo(() => {
    const months = [...new Set(payments.map((payment) => getPaymentMonthKey(payment.paymentDate)).filter((key) => key !== 'undated'))];
    if (!months.includes(selectedMonth)) months.push(selectedMonth);
    return months.sort().reverse();
  }, [payments, selectedMonth]);

  const dayOptions = useMemo(() => {
    const days = [...new Set(payments.map((payment) => getPaymentDayKey(payment.paymentDate)).filter((key) => key !== 'undated'))];
    if (!days.includes(selectedDay)) days.push(selectedDay);
    return days.sort().reverse();
  }, [payments, selectedDay]);

  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => [
      player.fullName,
      player.parentId?.name,
      player.status,
      getPlayerGroups(player)
    ].join(' ').toLowerCase().includes(query));
  }, [players, playerSearch]);

  const visiblePayments = useMemo(() => {
    if (activeView === 'thisMonth') {
      const thisMonth = getPaymentMonthKey(new Date());
      return payments.filter((payment) => getPaymentMonthKey(payment.paymentDate) === thisMonth);
    }
    if (activeView === 'month') {
      return payments.filter((payment) => getPaymentMonthKey(payment.paymentDate) === selectedMonth);
    }
    if (activeView === 'day') {
      return payments.filter((payment) => getPaymentDayKey(payment.paymentDate) === selectedDay);
    }
    return payments;
  }, [payments, activeView, selectedMonth, selectedDay]);

  const searchedPayments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return visiblePayments;

    return visiblePayments.filter((payment) => {
      const searchable = [
        getMemberName(payment),
        getParentName(payment),
        getPackageName(payment),
        payment.paymentMethod,
        getTransactionLabel(payment),
        payment.createdBy?.name,
        payment.createdBy?.email,
        payment.paidAmount,
        payment.remainingAmount,
        formatDate(payment.paymentDate),
        formatTime(payment.paymentDate),
        payment.receiptImage
      ].join(' ').toLowerCase();

      return searchable.includes(query);
    });
  }, [visiblePayments, searchQuery]);

  const memberSummaries = useMemo(() => {
    const map = new Map();
    searchedPayments.forEach((payment) => {
      const memberName = getMemberName(payment);
      const current = map.get(memberName) || { memberName, count: 0, paid: 0, remaining: 0, lastDate: payment.paymentDate };
      current.count += 1;
      current.paid += Number(payment.paidAmount || 0);
      current.remaining += Number(payment.remainingAmount || 0);
      if (new Date(payment.paymentDate) > new Date(current.lastDate || 0)) current.lastDate = payment.paymentDate;
      map.set(memberName, current);
    });
    return [...map.values()].sort((a, b) => b.paid - a.paid);
  }, [searchedPayments]);

  const calendarGroups = useMemo(() => {
    const map = new Map();
    searchedPayments.forEach((payment) => {
      const key = payment.paymentDate ? new Date(payment.paymentDate).toDateString() : 'No date';
      const current = map.get(key) || { key, date: payment.paymentDate, count: 0, paid: 0 };
      current.count += 1;
      current.paid += Number(payment.paidAmount || 0);
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [searchedPayments]);

  const statusSummary = useMemo(() => {
    return [
      {
        label: 'Full payment',
        count: searchedPayments.filter((payment) => Number(payment.remainingAmount || 0) <= 0).length,
        amount: searchedPayments.filter((payment) => Number(payment.remainingAmount || 0) <= 0).reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0)
      },
      {
        label: 'Partial payment',
        count: searchedPayments.filter((payment) => Number(payment.remainingAmount || 0) > 0).length,
        amount: searchedPayments.filter((payment) => Number(payment.remainingAmount || 0) > 0).reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0)
      }
    ];
  }, [searchedPayments]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const payload = { ...form, paidAmount: parseLocalizedNumber(form.paidAmount) };
      if (editingPaymentId) {
        await updatePayment(editingPaymentId, payload);
      } else {
        await createPayment(payload);
      }
      setForm({ playerId: '', paidAmount: 0, paymentMethod: 'Cash', paymentDate: getDateInputValue(), receiptImage: '', notes: '' });
      setEditingPaymentId('');
      await loadPayments();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPayment = (payment) => {
    setEditingPaymentId(payment._id);
    setForm({
      playerId: payment.playerId?._id || payment.playerId || '',
      paidAmount: String(payment.paidAmount ?? 0),
      paymentMethod: payment.paymentMethod || 'Cash',
      paymentDate: getDateInputValue(payment.paymentDate),
      receiptImage: payment.receiptImage || '',
      notes: payment.notes || ''
    });
    setPlayerSearch(payment.playerId?.fullName || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingPaymentId('');
    setForm({ playerId: '', paidAmount: 0, paymentMethod: 'Cash', paymentDate: getDateInputValue(), receiptImage: '', notes: '' });
    setPlayerSearch('');
  };

  const handleDeletePayment = async (payment) => {
    const confirmed = confirmAction('Delete payment');
    if (!confirmed) return;

    setError('');
    try {
      await deletePayment(payment._id);
      if (editingPaymentId === payment._id) {
        handleCancelEdit();
      }
      await loadPayments();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete payment.');
    }
  };

  const viewTabs = [
    { id: 'all', label: 'All Payments' },
    { id: 'member', label: 'Member Payment History' },
    { id: 'calendar', label: 'Payment Calendar' },
    { id: 'status', label: 'Payment Status' },
    { id: 'month', label: 'By Month' },
    { id: 'day', label: 'By Day' },
    { id: 'thisMonth', label: 'This Month' }
  ];

  return (
    <div className="dashboard-layout payments-admin-layout">
      <Sidebar />
      <main className="page-content payments-admin-page">
        <section className="payments-workspace">
          <div className="payments-topbar">
            <div>
              <p className="payments-kicker">Warriors Gymnastics</p>
              <h1>{t('payments')}</h1>
            </div>
            <div className="payments-brand">DSR</div>
          </div>

          <div className="payments-tabs">
            {viewTabs.map((tab) => (
              <button
                type="button"
                className={activeView === tab.id ? 'active' : ''}
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="payment-metrics">
            <div>
              <span>Total Amount</span>
              <strong>{formatMoney(totals.paid)}</strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong>{formatMoney(totals.remaining)}</strong>
            </div>
            <div>
              <span>Full Payments</span>
              <strong>{totals.fullPayments}</strong>
            </div>
            <div>
              <span>Records</span>
              <strong>{payments.length}</strong>
            </div>
          </div>

          <form className="payment-entry-panel" onSubmit={handleSubmit}>
            <div className="payment-entry-heading">
              <h2>{editingPaymentId ? 'Edit Payment' : t('addPayment')}</h2>
              <p>{editingPaymentId ? 'Update the selected payment record.' : 'Record a payment without leaving the table.'}</p>
            </div>
            {error && <p className="alert-error">{error}</p>}
            <div className="payment-entry-grid">
              <label>
                <span>{t('player')}</span>
                <input
                  className="select-search-input"
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Search player..."
                  type="search"
                />
                <select value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })} required disabled={Boolean(editingPaymentId)}>
                  <option value="">{t('selectPlayer')}</option>
                  {filteredPlayers.map((player) => <option key={player._id} value={player._id}>{player.fullName}</option>)}
                </select>
              </label>

              <label>
                <span>{t('paidAmount')}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.paidAmount}
                  onChange={(e) => setForm({ ...form, paidAmount: normalizeDigits(e.target.value) })}
                  required
                />
              </label>

              <label>
                <span>{t('paymentMethod')}</span>
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                  <option>Cash</option>
                  <option>Click</option>
                  <option>Bank Transfer</option>
                </select>
              </label>

              <label>
                <span>Payment Date</span>
                <input
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value || getDateInputValue() })}
                  required
                />
              </label>

              <label>
                <span>{t('receiptImageUrl')}</span>
                <input value={form.receiptImage} onChange={(e) => setForm({ ...form, receiptImage: e.target.value })} />
              </label>

              <label>
                <span>{t('notes')}</span>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>

            <div className="payment-entry-footer">
              <span>{form.playerId ? `Package: ${getPackageName({ playerId: players.find((player) => player._id === form.playerId) })}` : 'Select a player to see the package.'}</span>
              <div className="payment-entry-actions">
                {editingPaymentId && <button className="btn-secondary" type="button" onClick={handleCancelEdit}>Cancel Edit</button>}
                <button className="btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : (editingPaymentId ? 'Update Payment' : t('recordPayment'))}</button>
              </div>
            </div>
          </form>

          <div className="payment-database-card">
            <div className="payment-table-tools">
              <div className="payment-tool-icons">
                <span>{viewTabs.find((tab) => tab.id === activeView)?.label}</span>
                <span>{searchedPayments.length} records</span>
                <label className="payment-search">
                  <span>Search</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={`Search ${viewTabs.find((tab) => tab.id === activeView)?.label || 'payments'}`}
                  />
                </label>
                {activeView === 'month' && (
                  <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                    {monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}
                  </select>
                )}
                {activeView === 'day' && (
                  <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)}>
                    {dayOptions.map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                )}
              </div>
              <strong>{t('paymentHistory')}</strong>
            </div>

            {activeView === 'member' && (
              <div className="payment-view-panel payment-member-summary-grid">
                {memberSummaries.length ? memberSummaries.map((member) => (
                  <button
                    type="button"
                    key={member.memberName}
                    onClick={() => setActiveView('all')}
                    className="payment-summary-tile"
                  >
                    <span>{member.memberName}</span>
                    <strong>{formatMoney(member.paid)}</strong>
                    <small>{member.count} payments / Last {formatDate(member.lastDate)}</small>
                  </button>
                )) : <p className="payment-empty-row">{t('noPaymentsRecorded')}</p>}
              </div>
            )}

            {activeView === 'calendar' && (
              <div className="payment-view-panel payment-calendar-grid">
                {calendarGroups.length ? calendarGroups.map((day) => (
                  <div className="payment-calendar-day" key={day.key}>
                    <span>{formatDate(day.date)}</span>
                    <strong>{formatMoney(day.paid)}</strong>
                    <small>{day.count} payments</small>
                  </div>
                )) : <p className="payment-empty-row">{t('noPaymentsRecorded')}</p>}
              </div>
            )}

            {activeView === 'status' && (
              <div className="payment-view-panel payment-status-grid">
                {statusSummary.map((status) => (
                  <div className="payment-status-card" key={status.label}>
                    <span>{status.label}</span>
                    <strong>{status.count}</strong>
                    <small>{formatMoney(status.amount)} total</small>
                  </div>
                ))}
              </div>
            )}

            {(activeView === 'month' || activeView === 'day' || activeView === 'thisMonth') && (
              <div className="payment-view-panel payment-month-banner">
                <span>{activeView === 'thisMonth' ? 'Showing this month' : activeView === 'day' ? `Showing ${selectedDay}` : `Showing ${selectedMonth}`}</span>
                <strong>{searchedPayments.length} records / {formatMoney(searchedPayments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0))}</strong>
              </div>
            )}

            <div className="payment-table-wrap">
              <table className="payment-database-table">
                <thead>
                  <tr>
                    <th>Receipt no</th>
                    <th>Member</th>
                    <th>Phone</th>
                    <th>Transaction</th>
                    <th>Package</th>
                    <th>Payment Date</th>
                    <th>Payment Method</th>
                    <th>Total Amount</th>
                    <th>Created by</th>
                    <th>Last edited by</th>
                    <th>Last edited time</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedPayments.length ? searchedPayments.map((payment, index) => {
                    const memberName = getMemberName(payment);
                    const parentName = getParentName(payment);
                    const packageName = getPackageName(payment);
                    const methodClass = getMethodClass(payment.paymentMethod);
                    const deletedPlayer = isDeletedPlayerPayment(payment);
                    return (
                      <tr key={payment._id}>
                        <td>{payment.receiptImage ? <a href={payment.receiptImage} target="_blank" rel="noreferrer">1</a> : index + 1}</td>
                        <td className={`payment-member-cell${deletedPlayer ? ' payment-member-deleted' : ''}`}>{memberName}</td>
                        <td>{parentName || '-'}</td>
                        <td><span className="payment-pill transaction-pill">{getTransactionLabel(payment)}</span></td>
                        <td><span className="payment-pill package-pill">{packageName}</span></td>
                        <td>{formatDate(payment.paymentDate)}</td>
                        <td><span className={`payment-pill method-${methodClass}`}>{payment.paymentMethod || '-'}</span></td>
                        <td className="payment-amount-cell">{formatMoney(payment.paidAmount)}</td>
                        <td>{payment.createdBy?.name || 'Warriors gymnastics'}</td>
                        <td>{payment.updatedBy?.name || payment.createdBy?.name || 'Warriors gymnastics'}</td>
                        <td>{payment.updatedAt ? `${formatDate(payment.updatedAt)} ${formatTime(payment.updatedAt)}` : `${formatDate(payment.paymentDate)} ${formatTime(payment.paymentDate)}`}</td>
                        <td>{payment.notes ? payment.notes : '-'}</td>
                        <td>
                          <div className="payment-row-actions">
                            <button type="button" onClick={() => handleEditPayment(payment)}>Edit</button>
                            <button type="button" onClick={() => handleDeletePayment(payment)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan="13" className="payment-empty-row">{t('noPaymentsRecorded')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PaymentsPage;
