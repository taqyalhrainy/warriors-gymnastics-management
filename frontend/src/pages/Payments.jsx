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
  if (payment.transactionType) return payment.transactionType;
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

const isPendingPayment = (payment) => String(payment._id || '').startsWith('temp-payment-');

const sortPaymentsNewestFirst = (items) => [...items].sort((first, second) => {
  const firstIsPending = isPendingPayment(first);
  const secondIsPending = isPendingPayment(second);
  if (firstIsPending !== secondIsPending) return firstIsPending ? -1 : 1;
  const firstDate = new Date(first.paymentDate || 0).getTime();
  const secondDate = new Date(second.paymentDate || 0).getTime();
  if (secondDate !== firstDate) return secondDate - firstDate;
  return String(second._id || '').localeCompare(String(first._id || ''));
});

const getMemberName = (payment) => payment.playerId?.fullName || payment.playerNameSnapshot || '-';
const getParentName = (payment) => payment.playerId?.parentId?.name || payment.parentNameSnapshot || '-';
const getParentPhone = (payment) => payment.playerId?.parentId?.phone || payment.playerId?.parentPhone || payment.parentPhoneSnapshot || '-';
const getPaymentPlayerKey = (payment) => String(payment.playerId?._id || payment.playerId || payment.playerNameSnapshot || payment._id || '');
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

const initialPaymentForm = {
  playerId: '',
  paidAmount: 0,
  transactionType: 'Partial payment',
  customTransactionType: '',
  paymentMethod: 'Cash',
  paymentDate: getDateInputValue(),
  notes: ''
};

const PaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState(initialPaymentForm);
  const [isTransactionTouched, setIsTransactionTouched] = useState(false);
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
      setPayments(sortPaymentsNewestFirst(await fetchPayments({ fresh: Date.now() })));
    } catch (err) {
      console.error(err);
    }
  };

  const refreshPaymentsInBackground = () => {
    loadPayments().catch(console.error);
  };

  useEffect(() => {
    fetchPlayers().then(setPlayers).catch(console.error);
    loadPayments();
  }, []);

  const getAutoTransactionType = (playerId, paidAmount) => {
    const player = players.find((item) => item._id === playerId);
    if (!player) return 'Partial payment';
    const totalAmount = Number(player.payment || 0);
    const paidBefore = payments
      .filter((payment) => String(payment.playerId?._id || payment.playerId) === String(playerId) && payment._id !== editingPaymentId)
      .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
    const remainingBefore = totalAmount ? Math.max(0, totalAmount - paidBefore) : 0;
    return remainingBefore && parseLocalizedNumber(paidAmount) < remainingBefore ? 'Partial payment' : 'Full payment';
  };

  const buildOptimisticPayment = (payload, id) => {
    const player = players.find((item) => item._id === payload.playerId);
    const paidBefore = payments
      .filter((payment) => String(payment.playerId?._id || payment.playerId) === String(payload.playerId) && payment._id !== editingPaymentId)
      .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
    const subscriptionPrice = Number(player?.payment || 0);
    const paidAmount = Number(payload.paidAmount || 0);
    const remainingAmount = Math.max(0, subscriptionPrice - paidBefore - paidAmount);

    return {
      ...(editingPaymentId ? payments.find((payment) => payment._id === editingPaymentId) : {}),
      _id: id,
      playerId: player || payload.playerId,
      playerNameSnapshot: player?.fullName || '',
      parentNameSnapshot: player?.parentId?.name || '',
      parentPhoneSnapshot: player?.parentId?.phone || player?.parentPhone || '',
      packageNameSnapshot: player?.packageName || '',
      packageClassesSnapshot: Number(player?.packageClasses || 0),
      packageHoursSnapshot: Number(player?.packageHours || 0),
      totalAmount: subscriptionPrice,
      paidAmount,
      remainingAmount,
      transactionType: payload.transactionType,
      paymentMethod: payload.paymentMethod,
      paymentDate: new Date(payload.paymentDate).toISOString(),
      notes: payload.notes || '',
      updatedAt: editingPaymentId ? new Date().toISOString() : undefined
    };
  };

  useEffect(() => {
    if (isTransactionTouched) return;
    setForm((current) => ({
      ...current,
      transactionType: getAutoTransactionType(current.playerId, current.paidAmount)
    }));
  }, [form.playerId, form.paidAmount, players, payments, editingPaymentId, isTransactionTouched]);

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
        getParentPhone(payment),
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

    const previousPayments = payments;
    const previousForm = form;
    const previousEditingPaymentId = editingPaymentId;
    const previousPlayerSearch = playerSearch;
    const optimisticId = editingPaymentId || `temp-payment-${Date.now()}`;

    try {
      const payload = {
        ...form,
        paidAmount: parseLocalizedNumber(form.paidAmount),
        transactionType: form.transactionType === 'custom' ? form.customTransactionType : form.transactionType
      };
      delete payload.customTransactionType;
      const optimisticPayment = buildOptimisticPayment(payload, optimisticId);

      setPayments((current) => sortPaymentsNewestFirst(
        editingPaymentId
          ? current.map((payment) => payment._id === editingPaymentId ? optimisticPayment : payment)
          : [optimisticPayment, ...current]
      ));
      setForm({ ...initialPaymentForm, paymentDate: getDateInputValue() });
      setIsTransactionTouched(false);
      setEditingPaymentId('');
      setPlayerSearch('');
      setIsSubmitting(true);

      if (editingPaymentId) {
        const savedPayment = await updatePayment(editingPaymentId, payload);
        setPayments((current) => sortPaymentsNewestFirst(
          current.map((payment) => payment._id === savedPayment._id ? savedPayment : payment)
        ));
      } else {
        const savedPayment = await createPayment(payload);
        setPayments((current) => sortPaymentsNewestFirst(
          current.map((payment) => payment._id === optimisticId ? savedPayment : payment)
        ));
      }
      refreshPaymentsInBackground();
    } catch (err) {
      setPayments(previousPayments);
      setForm(previousForm);
      setEditingPaymentId(previousEditingPaymentId);
      setPlayerSearch(previousPlayerSearch);
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
      transactionType: ['Full payment', 'Partial payment'].includes(getTransactionLabel(payment)) ? getTransactionLabel(payment) : 'custom',
      customTransactionType: ['Full payment', 'Partial payment'].includes(getTransactionLabel(payment)) ? '' : getTransactionLabel(payment),
      paymentMethod: payment.paymentMethod || 'Cash',
      paymentDate: getDateInputValue(payment.paymentDate),
      notes: payment.notes || ''
    });
    setIsTransactionTouched(false);
    setPlayerSearch(payment.playerId?.fullName || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingPaymentId('');
    setForm({ ...initialPaymentForm, paymentDate: getDateInputValue() });
    setIsTransactionTouched(false);
    setPlayerSearch('');
  };

  const handleDeletePayment = async (payment) => {
    const confirmed = confirmAction('Delete payment');
    if (!confirmed) return;

    setError('');
    const previousPayments = payments;
    setPayments((current) => current.filter((item) => item._id !== payment._id));
    try {
      await deletePayment(payment._id);
      if (editingPaymentId === payment._id) {
        handleCancelEdit();
      }
      refreshPaymentsInBackground();
    } catch (err) {
      setPayments(previousPayments);
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
              <span>Remaining Amount</span>
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
                <select
                  value={form.playerId}
                  onChange={(e) => {
                    setIsTransactionTouched(false);
                    setForm({ ...form, playerId: e.target.value });
                  }}
                  required
                  disabled={Boolean(editingPaymentId)}
                >
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
                <span>Transaction</span>
                <select
                  value={form.transactionType}
                  onChange={(e) => {
                    setIsTransactionTouched(true);
                    setForm({ ...form, transactionType: e.target.value, customTransactionType: e.target.value === 'custom' ? form.customTransactionType : '' });
                  }}
                >
                  <option>Full payment</option>
                  <option>Partial payment</option>
                  <option value="custom">Custom</option>
                </select>
                {form.transactionType === 'custom' && (
                  <input
                    value={form.customTransactionType}
                    onChange={(e) => setForm({ ...form, customTransactionType: e.target.value })}
                    placeholder="Write transaction..."
                    required
                  />
                )}
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
                <span>{t('notes')}</span>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>

            <div className="payment-entry-footer">
              <span>{form.playerId ? `Package: ${getPackageName({ playerId: players.find((player) => player._id === form.playerId) })}` : 'Select a player to see the package.'}</span>
              <div className="payment-entry-actions">
                {editingPaymentId && <button className="btn-secondary" type="button" onClick={handleCancelEdit}>Cancel Edit</button>}
                <button className="btn-primary" type="submit">{isSubmitting ? 'Saving...' : (editingPaymentId ? 'Update Payment' : t('recordPayment'))}</button>
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
                    <th>Payment Amount</th>
                    <th>Remaining Amount</th>
                    <th>Last edited time</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedPayments.length ? searchedPayments.map((payment, index) => {
                    const memberName = getMemberName(payment);
                    const parentPhone = getParentPhone(payment);
                    const packageName = getPackageName(payment);
                    const methodClass = getMethodClass(payment.paymentMethod);
                    const deletedPlayer = isDeletedPlayerPayment(payment);
                    return (
                      <tr key={payment._id}>
                        <td>{payment.receiptImage ? <a href={payment.receiptImage} target="_blank" rel="noreferrer">1</a> : index + 1}</td>
                        <td className={`payment-member-cell${deletedPlayer ? ' payment-member-deleted' : ''}`}>{memberName}</td>
                        <td>{parentPhone || '-'}</td>
                        <td><span className="payment-pill transaction-pill">{getTransactionLabel(payment)}</span></td>
                        <td><span className="payment-pill package-pill">{packageName}</span></td>
                        <td>{formatDate(payment.paymentDate)}</td>
                        <td><span className={`payment-pill method-${methodClass}`}>{payment.paymentMethod || '-'}</span></td>
                        <td className="payment-amount-cell">{formatMoney(payment.paidAmount)}</td>
                        <td className="payment-amount-cell">{formatMoney(payment.remainingAmount)}</td>
                        <td>{payment.updatedAt ? `${formatDate(payment.updatedAt)} ${formatTime(payment.updatedAt)}` : '-'}</td>
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
                    <tr><td colSpan="12" className="payment-empty-row">{t('noPaymentsRecorded')}</td></tr>
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
