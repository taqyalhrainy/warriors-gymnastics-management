import { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPayments, createPayment, updatePayment, deletePayment } from '../services/payments.js';
import { fetchPlayers } from '../services/players.js';
import { verifyPaymentPassword } from '../services/security.js';
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
const isPaymentInCurrentSubscription = (payment, player) => {
  if (player?.currentSubscriptionStartedAt) {
    return payment.createdAt && new Date(payment.createdAt) >= new Date(player.currentSubscriptionStartedAt);
  }
  if (!player?.startDate) return true;
  return new Date(payment.paymentDate || 0) >= new Date(player.startDate);
};
const isSubscriptionPaymentType = (value) => ['full payment', 'partial payment'].includes(String(value || '').trim().toLowerCase());
const getPackageName = (payment) => {
  const classes = payment.playerId?.packageClasses || payment.packageClassesSnapshot;
  const hours = payment.playerId?.packageHours || payment.packageHoursSnapshot;
  const name = payment.playerId?.packageName || payment.packageNameSnapshot;
  if (classes && hours) return `${classes} classes (${hours} hours)`;
  if (classes) return `${classes} classes`;
  return name && name !== 'custom' ? name : '-';
};

const getPaymentSubscriptionDetails = (payment) => {
  const player = payment.playerId && typeof payment.playerId === 'object' ? payment.playerId : null;
  return {
    memberName: getMemberName(payment),
    packageName: getPackageName(payment),
    startDate: player?.startDate || null,
    endDate: player?.endDate || null,
    classes: player?.packageClasses ?? payment.packageClassesSnapshot ?? 0,
    hours: player?.packageHours ?? payment.packageHoursSnapshot ?? 0,
    usedClasses: player?.subscriptionId?.usedSessions ?? 0
  };
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
  const [isPaymentUnlocked, setIsPaymentUnlocked] = useState(false);
  const [showPaymentUnlock, setShowPaymentUnlock] = useState(false);
  const [pendingPaymentView, setPendingPaymentView] = useState('');
  const [paymentAccessPassword, setPaymentAccessPassword] = useState('');
  const [isUnlockingPayment, setIsUnlockingPayment] = useState(false);
  const [isTransactionTouched, setIsTransactionTouched] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeView, setActiveView] = useState('day');
  const [selectedMonth, setSelectedMonth] = useState(getPaymentMonthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState(getDateInputValue());
  const [searchQuery, setSearchQuery] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [viewingPayment, setViewingPayment] = useState(null);
  const paymentsLoadRequestIdRef = useRef(0);
  const paymentsRevisionRef = useRef(0);
  const { t } = useLanguage();

  const loadPayments = async (options = {}) => {
    const requestId = paymentsLoadRequestIdRef.current + 1;
    paymentsLoadRequestIdRef.current = requestId;
    const startedRevision = paymentsRevisionRef.current;
    try {
      const forceAll = Boolean(options.forceAll);
      const params = isPaymentUnlocked || forceAll
        ? { fresh: Date.now() }
        : { day: selectedDay || getDateInputValue(), fresh: Date.now() };
      const paymentRows = sortPaymentsNewestFirst(await fetchPayments(params));
      if (requestId === paymentsLoadRequestIdRef.current && startedRevision === paymentsRevisionRef.current) {
        setPayments(paymentRows);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const refreshPaymentsInBackground = () => {
    loadPayments().catch(console.error);
  };

  useEffect(() => {
    fetchPlayers({ fresh: Date.now() }).then(setPlayers).catch(console.error);
    loadPayments();
  }, []);

  useEffect(() => {
    loadPayments({ forceAll: isPaymentUnlocked });
  }, [isPaymentUnlocked]);

  useEffect(() => {
    if (isPaymentUnlocked || activeView !== 'day') return;
    loadPayments();
  }, [selectedDay, activeView, isPaymentUnlocked]);

  const handlePaymentUnlock = async (event) => {
    event.preventDefault();
    setError('');

    try {
      setIsUnlockingPayment(true);
      await verifyPaymentPassword(paymentAccessPassword);
      setIsPaymentUnlocked(true);
      if (pendingPaymentView) {
        setActiveView(pendingPaymentView);
      }
      setPendingPaymentView('');
      setShowPaymentUnlock(false);
      setPaymentAccessPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to unlock payments.');
    } finally {
      setIsUnlockingPayment(false);
    }
  };

  const handlePaymentViewClick = (viewId) => {
    if (viewId !== 'day' && !isPaymentUnlocked) {
      setPendingPaymentView(viewId);
      setShowPaymentUnlock(true);
      setError('');
      return;
    }
    setActiveView(viewId);
  };

  const getAutoTransactionType = (playerId, paidAmount) => {
    const player = players.find((item) => item._id === playerId);
    if (!player) return 'Partial payment';
    const totalAmount = Number(player.payment || 0);
    const paidBefore = payments
      .filter((payment) => (
        String(payment.playerId?._id || payment.playerId) === String(playerId)
        && payment._id !== editingPaymentId
        && isPaymentInCurrentSubscription(payment, player)
        && isSubscriptionPaymentType(getTransactionLabel(payment))
      ))
      .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
    const remainingBefore = totalAmount ? Math.max(0, totalAmount - paidBefore) : 0;
    return remainingBefore && parseLocalizedNumber(paidAmount) < remainingBefore ? 'Partial payment' : 'Full payment';
  };

  const buildOptimisticPayment = (payload, id) => {
    const player = players.find((item) => item._id === payload.playerId);
    const paidBefore = payments
      .filter((payment) => (
        String(payment.playerId?._id || payment.playerId) === String(payload.playerId)
        && payment._id !== editingPaymentId
        && isPaymentInCurrentSubscription(payment, player)
        && isSubscriptionPaymentType(getTransactionLabel(payment))
      ))
      .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
    const subscriptionPrice = Number(player?.payment || 0);
    const paidAmount = Number(payload.paidAmount || 0);
    const subscriptionPayment = isSubscriptionPaymentType(payload.transactionType);
    const remainingAmount = subscriptionPayment ? Math.max(0, subscriptionPrice - paidBefore - paidAmount) : 0;

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
      totalAmount: subscriptionPayment ? subscriptionPrice : 0,
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
    const latestPaymentsByPlayer = new Map();
    sortPaymentsNewestFirst(payments).forEach((payment) => {
      const player = payment.playerId && typeof payment.playerId === 'object' ? payment.playerId : null;
      if (player && !isPaymentInCurrentSubscription(payment, player)) return;
      const playerKey = getPaymentPlayerKey(payment);
      if (!latestPaymentsByPlayer.has(playerKey)) {
        latestPaymentsByPlayer.set(playerKey, payment);
      }
    });
    const remaining = [...latestPaymentsByPlayer.values()].reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);
    const fullPayments = payments.filter((payment) => Number(payment.remainingAmount || 0) <= 0).length;
    return { paid, remaining, fullPayments };
  }, [payments]);

  const pendingAmountRows = useMemo(() => players
    .map((player) => {
      const totalAmount = Number(player.payment || 0);
      if (!totalAmount) return null;
      const paidAmount = payments
        .filter((payment) => (
          String(payment.playerId?._id || payment.playerId) === String(player._id)
          && isPaymentInCurrentSubscription(payment, player)
          && isSubscriptionPaymentType(getTransactionLabel(payment))
        ))
        .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
      const remainingAmount = Math.max(0, totalAmount - paidAmount);
      if (!remainingAmount) return null;
      return {
        _id: `pending-${player._id}`,
        playerId: player,
        playerNameSnapshot: player.fullName,
        parentNameSnapshot: player.parentId?.name || '',
        parentPhoneSnapshot: player.parentId?.phone || player.parentPhone || '',
        packageNameSnapshot: player.packageName || '',
        packageClassesSnapshot: Number(player.packageClasses || 0),
        packageHoursSnapshot: Number(player.packageHours || 0),
        totalAmount,
        paidAmount,
        remainingAmount,
        transactionType: 'Pending amount',
        paymentMethod: '-',
        paymentDate: player.startDate || '',
        notes: ''
      };
    })
    .filter(Boolean)
    .sort((first, second) => second.remainingAmount - first.remainingAmount), [players, payments]);

  const monthOptions = useMemo(() => {
    const paymentMonths = payments.map((payment) => getPaymentMonthKey(payment.paymentDate));
    const months = [...new Set(paymentMonths.filter((key) => key !== 'undated'))];
    if (!months.includes(selectedMonth)) months.push(selectedMonth);
    return months.sort().reverse();
  }, [payments, selectedMonth]);

  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    return players
      .filter((player) => (player.status || 'active') === 'active' || player._id === form.playerId)
      .filter((player) => {
        if (!query) return true;
        return [
          player.fullName,
          player.parentId?.name,
          player.status,
          getPlayerGroups(player)
        ].join(' ').toLowerCase().includes(query);
      });
  }, [players, playerSearch, form.playerId]);

  const visiblePayments = useMemo(() => {
    if (activeView === 'pending') {
      return pendingAmountRows;
    }
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
  }, [payments, activeView, selectedMonth, selectedDay, pendingAmountRows]);

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

      paymentsRevisionRef.current += 1;
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
        paymentsRevisionRef.current += 1;
        setPayments((current) => sortPaymentsNewestFirst(
          current.map((payment) => payment._id === savedPayment._id ? savedPayment : payment)
        ));
      } else {
        const savedPayment = await createPayment(payload);
        paymentsRevisionRef.current += 1;
        setPayments((current) => sortPaymentsNewestFirst(
          current.map((payment) => payment._id === optimisticId ? savedPayment : payment)
        ));
      }
      refreshPaymentsInBackground();
    } catch (err) {
      paymentsRevisionRef.current += 1;
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
    paymentsRevisionRef.current += 1;
    setPayments((current) => current.filter((item) => item._id !== payment._id));
    try {
      await deletePayment(payment._id);
      paymentsRevisionRef.current += 1;
      if (editingPaymentId === payment._id) {
        handleCancelEdit();
      }
      refreshPaymentsInBackground();
    } catch (err) {
      paymentsRevisionRef.current += 1;
      setPayments(previousPayments);
      setError(err.response?.data?.message || 'Unable to delete payment.');
    }
  };

  const viewTabs = [
    { id: 'day', label: 'By Day' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'month', label: 'By Month' },
    { id: 'pending', label: 'Pending Amounts' }
  ];
  const activeViewLabel = viewTabs.find((tab) => tab.id === activeView)?.label || 'payments';
  const activeRecordCount = searchedPayments.length;
  const viewTotals = useMemo(() => ({
    paid: searchedPayments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0),
    remaining: searchedPayments.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0),
    fullPayments: searchedPayments.filter((payment) => Number(payment.remainingAmount || 0) <= 0).length
  }), [searchedPayments]);
  const viewingPaymentDetails = viewingPayment ? getPaymentSubscriptionDetails(viewingPayment) : null;

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
                onClick={() => handlePaymentViewClick(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="payment-metrics">
            <div>
              <span>{activeViewLabel} Paid</span>
              <strong>{formatMoney(viewTotals.paid)}</strong>
            </div>
            <div>
              <span>{activeViewLabel} Remaining</span>
              <strong>{formatMoney(viewTotals.remaining)}</strong>
            </div>
            <div>
              <span>{activeViewLabel} Records</span>
              <strong>{searchedPayments.length}</strong>
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
                <span>{activeViewLabel}</span>
                <span>{activeRecordCount} records</span>
                <label className="payment-search">
                  <span>Search</span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={`Search ${activeViewLabel}`}
                  />
                </label>
                {activeView === 'month' && (
                  <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                    {monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}
                  </select>
                )}
                {activeView === 'day' && (
                  <input
                    className="payment-date-filter"
                    type="date"
                    value={selectedDay}
                    onChange={(event) => setSelectedDay(event.target.value || getDateInputValue())}
                  />
                )}
              </div>
              <strong>{t('paymentHistory')}</strong>
            </div>

            <div className="payment-view-panel payment-month-banner">
              <span>{activeView === 'pending' ? 'Players with remaining amounts' : activeView === 'thisMonth' ? 'Showing this month' : activeView === 'day' ? `Showing ${selectedDay}` : `Showing ${selectedMonth}`}</span>
              <strong>{activeView === 'pending'
                ? `${searchedPayments.length} players / ${formatMoney(searchedPayments.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0))} remaining`
                : `${searchedPayments.length} records / ${formatMoney(searchedPayments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0))}`}
              </strong>
            </div>

            <div className="payment-table-wrap">
              <table className="payment-database-table">
                <thead>
                  {activeView === 'pending' ? (
                    <tr>
                      <th>Receipt no</th>
                      <th>Member</th>
                      <th>Phone</th>
                      <th>Transaction</th>
                      <th>Package</th>
                      <th>Remaining</th>
                    </tr>
                  ) : (
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
                  )}
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
                        {activeView === 'pending' ? (
                          <>
                            <td>{index + 1}</td>
                            <td className={`payment-member-cell${deletedPlayer ? ' payment-member-deleted' : ''}`}>{memberName}</td>
                            <td>{parentPhone || '-'}</td>
                            <td><span className="payment-pill transaction-pill">{getTransactionLabel(payment)}</span></td>
                            <td><span className="payment-pill package-pill">{packageName}</span></td>
                            <td className="payment-amount-cell">{formatMoney(payment.remainingAmount)}</td>
                          </>
                        ) : (
                          <>
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
                                <button type="button" onClick={() => setViewingPayment(payment)}>View</button>
                                <button type="button" onClick={() => handleEditPayment(payment)}>Edit</button>
                                <button type="button" className="is-danger" onClick={() => handleDeletePayment(payment)}>Delete</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={activeView === 'pending' ? 6 : 12} className="payment-empty-row">{t('noPaymentsRecorded')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        {showPaymentUnlock && (
          <div className="student-modal-backdrop" role="presentation" onClick={() => setShowPaymentUnlock(false)}>
            <section className="payment-lock-card payment-lock-modal" role="dialog" aria-modal="true" aria-label="Unlock payment data" onClick={(event) => event.stopPropagation()}>
              <div>
                <p className="payments-kicker">Protected payment data</p>
                <h1>{viewTabs.find((tab) => tab.id === pendingPaymentView)?.label || 'Payments'}</h1>
                <span>Enter the payment password to view this payment data.</span>
              </div>
              {error && <p className="alert-error">{error}</p>}
              <form onSubmit={handlePaymentUnlock}>
                <label>
                  <span>Payment Password</span>
                  <input
                    type="password"
                    value={paymentAccessPassword}
                    onChange={(event) => setPaymentAccessPassword(event.target.value)}
                    autoFocus
                    required
                  />
                </label>
                <div className="payment-entry-actions">
                  <button className="btn-primary" type="submit" disabled={isUnlockingPayment}>
                    {isUnlockingPayment ? 'Checking...' : 'Unlock'}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setShowPaymentUnlock(false)}>Cancel</button>
                </div>
              </form>
            </section>
          </div>
        )}
        {viewingPaymentDetails && (
          <div className="student-modal-backdrop" role="presentation" onClick={() => setViewingPayment(null)}>
            <section className="payment-detail-modal" role="dialog" aria-modal="true" aria-label="Payment subscription details" onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div>
                  <p className="payments-kicker">Subscription details</p>
                  <h2>{viewingPaymentDetails.memberName}</h2>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setViewingPayment(null)}>Close</button>
              </div>
              <div className="payment-detail-grid">
                <div>
                  <span>Start Date</span>
                  <strong>{formatDate(viewingPaymentDetails.startDate)}</strong>
                </div>
                <div>
                  <span>End Date</span>
                  <strong>{formatDate(viewingPaymentDetails.endDate)}</strong>
                </div>
                <div>
                  <span>Classes</span>
                  <strong>{viewingPaymentDetails.classes || 0}</strong>
                </div>
                <div>
                  <span>Attended From Package</span>
                  <strong>{viewingPaymentDetails.usedClasses || 0}/{viewingPaymentDetails.classes || 0}</strong>
                </div>
                <div>
                  <span>Package</span>
                  <strong>{viewingPaymentDetails.packageName}</strong>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default PaymentsPage;
