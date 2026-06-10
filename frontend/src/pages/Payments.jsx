import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPayments, createPayment } from '../services/payments.js';
import { fetchPlayers } from '../services/players.js';
import { fetchSubscriptions } from '../services/subscriptions.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const PaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState({ totalPaid: 0, remaining: 0 });
  const [form, setForm] = useState({ playerId: '', subscriptionId: '', totalAmount: 0, paidAmount: 0, paymentMethod: 'Cash', receiptImage: '', notes: '' });
  const [error, setError] = useState('');
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
    try {
      await createPayment(form);
      setForm({ playerId: '', subscriptionId: '', totalAmount: 0, paidAmount: 0, paymentMethod: 'Cash', receiptImage: '', notes: '' });
      loadPayments();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to record payment.');
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('payments')}</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{t('addPayment')}</h2>
            {error && <p className="alert-error">{error}</p>}
            <form onSubmit={handleSubmit}>
              <label>{t('player')}</label>
              <select value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })} required>
                <option value="">{t('selectPlayer')}</option>
                {players.map((player) => <option key={player._id} value={player._id}>{player.fullName}</option>)}
              </select>

              <label>{t('subscription')}</label>
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
                {subscriptions.map((sub) => (
                  <option key={sub._id} value={sub._id}>{`${sub.packageName || t('subscription')} (${sub.type})`}</option>
                ))}
              </select>

              <div className="info-row">
                <div>
                  <label>{t('subscriptionPrice')}</label>
                  <input type="number" value={selectedSubscription?.price ?? 0} readOnly />
                </div>
                <div>
                  <label>{t('totalPaid')}</label>
                  <input type="number" value={paymentSummary.totalPaid} readOnly />
                </div>
                <div>
                  <label>{t('remaining')}</label>
                  <input type="number" value={paymentSummary.remaining} readOnly />
                </div>
              </div>

              <label>{t('paidAmount')}</label>
              <input type="number" min="0" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: Number(e.target.value) })} required />
              <label>{t('paymentMethod')}</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option>Cash</option>
                <option>Click</option>
                <option>Bank Transfer</option>
              </select>
              <label>{t('receiptImageUrl')}</label>
              <input value={form.receiptImage} onChange={(e) => setForm({ ...form, receiptImage: e.target.value })} />
              <label>{t('notes')}</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <button className="btn-primary" type="submit">{t('recordPayment')}</button>
            </form>
          </div>
          <div className="table-card">
            <h2>{t('paymentHistory')}</h2>
            <table className="data-table">
              <thead><tr><th>{t('player')}</th><th>{t('paid')}</th><th>{t('remaining')}</th><th>{t('method')}</th></tr></thead>
              <tbody>
                {payments.length ? payments.map((payment) => (
                  <tr key={payment._id}>
                    <td>{payment.playerId?.fullName || payment.playerId}</td>
                    <td>{payment.paidAmount}</td>
                    <td>{payment.remainingAmount}</td>
                    <td>{payment.paymentMethod}</td>
                  </tr>
                )) : <tr><td colSpan="4">{t('noPaymentsRecorded')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PaymentsPage;
