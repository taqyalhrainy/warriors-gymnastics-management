import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPayments, createPayment } from '../services/payments.js';
import { fetchPlayers } from '../services/players.js';
import { fetchSubscriptions } from '../services/subscriptions.js';
import { fetchPrograms } from '../services/programs.js';
import { useLanguage } from '../context/LanguageContext.jsx';

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

const getMemberName = (payment) => payment.playerId?.fullName || payment.playerId || '-';
const getParentName = (payment) => payment.playerId?.parentId?.name || '-';
const getPackageName = (payment) => payment.subscriptionId?.packageName || payment.subscriptionId?.type || '-';

const PaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState({ totalPaid: 0, remaining: 0 });
  const [form, setForm] = useState({ playerId: '', subscriptionId: '', totalAmount: 0, paidAmount: 0, paymentMethod: 'Cash', receiptImage: '', notes: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeView, setActiveView] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(getPaymentMonthKey(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
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
    fetchPrograms().then(setPrograms).catch(console.error);
    loadPayments();
  }, []);

  useEffect(() => {
    if (!form.playerId) {
      setSubscriptions([]);
      setForm((prev) => ({ ...prev, subscriptionId: '', totalAmount: 0 }));
      setPaymentSummary({ totalPaid: 0, remaining: 0 });
      setSelectedSubscription(null);
      return;
    }
    fetchSubscriptions({ playerId: form.playerId })
      .then((data) => {
        setSubscriptions(data);
        if (data.length > 0) {
          const current = data[0];
          setSelectedSubscription(current);
          setForm((prev) => ({
            ...prev,
            subscriptionId: current._id,
            totalAmount: current.price || 0
          }));
          calculateSubscriptionSummary(current._id, current.price || 0);
        } else {
          setSelectedSubscription(null);
          setPaymentSummary({ totalPaid: 0, remaining: 0 });
        }
      })
      .catch(console.error);
  }, [form.playerId]);

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

  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) => [
      player.fullName,
      player.parentId?.name,
      player.status,
      player.groupId?.name
    ].join(' ').toLowerCase().includes(query));
  }, [players, playerSearch]);

  const filteredSubscriptions = useMemo(() => {
    const query = subscriptionSearch.trim().toLowerCase();
    if (!query) return subscriptions;
    return subscriptions.filter((subscription) => [
      subscription.packageName,
      subscription.type,
      subscription.status,
      subscription.price,
      subscription.remainingSessions
    ].join(' ').toLowerCase().includes(query));
  }, [subscriptions, subscriptionSearch]);

  const filteredPrograms = useMemo(() => {
    const query = subscriptionSearch.trim().toLowerCase();
    if (!query) return programs;
    return programs.filter((program) => [
      program.name,
      program.description,
      program.level,
      program.price,
      program.duration
    ].join(' ').toLowerCase().includes(query));
  }, [programs, subscriptionSearch]);

  const visiblePayments = useMemo(() => {
    if (activeView === 'thisMonth') {
      const thisMonth = getPaymentMonthKey(new Date());
      return payments.filter((payment) => getPaymentMonthKey(payment.paymentDate) === thisMonth);
    }
    if (activeView === 'month') {
      return payments.filter((payment) => getPaymentMonthKey(payment.paymentDate) === selectedMonth);
    }
    return payments;
  }, [payments, activeView, selectedMonth]);

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

  const calculateSubscriptionSummary = async (subscriptionId, price) => {
    if (!subscriptionId) {
      setPaymentSummary({ totalPaid: 0, remaining: 0 });
      return;
    }
    try {
      const paymentsBySubscription = await fetchPayments({ subscriptionId });
      const totalPaid = paymentsBySubscription.reduce((sum, payment) => sum + (Number(payment.paidAmount) || 0), 0);
      const remaining = Math.max(0, price - totalPaid);
      setPaymentSummary({ totalPaid, remaining });
    } catch (err) {
      console.error(err);
      setPaymentSummary({ totalPaid: 0, remaining: 0 });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await createPayment(form);
      setForm({ playerId: '', subscriptionId: '', totalAmount: 0, paidAmount: 0, paymentMethod: 'Cash', receiptImage: '', notes: '' });
      await loadPayments();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to record payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const viewTabs = [
    { id: 'all', label: 'All Payments' },
    { id: 'member', label: 'Member Payment History' },
    { id: 'calendar', label: 'Payment Calendar' },
    { id: 'status', label: 'Payment Status' },
    { id: 'month', label: 'By Month' },
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
              <h2>{t('addPayment')}</h2>
              <p>Record a payment without leaving the table.</p>
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
                <select value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })} required>
                  <option value="">{t('selectPlayer')}</option>
                  {filteredPlayers.map((player) => <option key={player._id} value={player._id}>{player.fullName}</option>)}
                </select>
              </label>

              <label>
                <span>{t('subscription')}</span>
                <input
                  className="select-search-input"
                  value={subscriptionSearch}
                  onChange={(event) => setSubscriptionSearch(event.target.value)}
                  placeholder="Search subscription..."
                  type="search"
                />
                <select value={form.subscriptionId} onChange={(e) => {
                  const subscriptionId = e.target.value;
                  const selected = subscriptions.find((sub) => sub._id === subscriptionId);
                  setSelectedSubscription(selected || null);
                  setForm((prev) => ({
                    ...prev,
                    subscriptionId,
                    totalAmount: selected?.price || 0,
                    paidAmount: 0
                  }));
                  calculateSubscriptionSummary(subscriptionId, selected?.price || 0);
                }}>
                  <option value="">{t('pickSubscription')}</option>
                  {filteredSubscriptions.length > 0 && (
                    <optgroup label="Player subscriptions">
                      {filteredSubscriptions.map((sub) => (
                        <option key={sub._id} value={sub._id}>{`${sub.packageName || t('subscription')} (${sub.type})`}</option>
                      ))}
                    </optgroup>
                  )}
                  {filteredPrograms.length > 0 && (
                    <optgroup label={filteredSubscriptions.length > 0 ? 'Academy programs' : 'Academy programs - create a subscription first'}>
                      {filteredPrograms.map((program) => (
                        <option key={program._id} value="" disabled>
                          {`${program.name}${program.level ? ` - ${program.level}` : ''}`}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>

              <label>
                <span>{t('paidAmount')}</span>
                <input type="number" min="0" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: Number(e.target.value) })} required />
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
                <span>{t('receiptImageUrl')}</span>
                <input value={form.receiptImage} onChange={(e) => setForm({ ...form, receiptImage: e.target.value })} />
              </label>

              <label>
                <span>{t('notes')}</span>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>

            <div className="payment-entry-footer">
              <span>Price: {formatMoney(selectedSubscription?.price)} / Paid: {formatMoney(paymentSummary.totalPaid)} / Remaining: {formatMoney(paymentSummary.remaining)}</span>
              <button className="btn-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Recording...' : t('recordPayment')}</button>
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

            {(activeView === 'month' || activeView === 'thisMonth') && (
              <div className="payment-view-panel payment-month-banner">
                <span>{activeView === 'thisMonth' ? 'Showing this month' : `Showing ${selectedMonth}`}</span>
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
                    <th>Aa</th>
                    <th>Created by</th>
                    <th>Last edited by</th>
                    <th>Last edited time</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedPayments.length ? searchedPayments.map((payment, index) => {
                    const memberName = getMemberName(payment);
                    const parentName = getParentName(payment);
                    const packageName = getPackageName(payment);
                    const methodClass = getMethodClass(payment.paymentMethod);
                    return (
                      <tr key={payment._id}>
                        <td>{payment.receiptImage ? <a href={payment.receiptImage} target="_blank" rel="noreferrer">1</a> : index + 1}</td>
                        <td className="payment-member-cell">{memberName}</td>
                        <td>{parentName || '-'}</td>
                        <td><span className="payment-pill transaction-pill">{getTransactionLabel(payment)}</span></td>
                        <td><span className="payment-pill package-pill">{packageName}</span></td>
                        <td>{formatDate(payment.paymentDate)}</td>
                        <td><span className={`payment-pill method-${methodClass}`}>{payment.paymentMethod || '-'}</span></td>
                        <td className="payment-amount-cell">{formatMoney(payment.paidAmount)}</td>
                        <td>{payment._id?.slice(-4) || index + 1}</td>
                        <td>{payment.createdBy?.name || 'Warriors gymnastics'}</td>
                        <td>{payment.createdBy?.name || 'Warriors gymnastics'}</td>
                        <td>{formatDate(payment.paymentDate)} {formatTime(payment.paymentDate)}</td>
                        <td>{payment.notes ? payment.notes : '-'}</td>
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
