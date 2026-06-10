import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPayments, createPayment } from '../services/payments.js';
import { fetchPlayers } from '../services/players.js';
import { fetchSubscriptions } from '../services/subscriptions.js';

const PaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [paymentSummary, setPaymentSummary] = useState({ totalPaid: 0, remaining: 0 });
  const [form, setForm] = useState({ playerId: '', subscriptionId: '', totalAmount: 0, paidAmount: 0, paymentMethod: 'Cash', receiptImage: '', notes: '' });
  const [error, setError] = useState('');

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
        <div className="page-header"><h1>Payments</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>Add Payment</h2>
            {error && <p className="alert-error">{error}</p>}
            <form onSubmit={handleSubmit}>
              <label>Player</label>
              <select value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })} required>
                <option value="">Select Player</option>
                {players.map((player) => <option key={player._id} value={player._id}>{player.fullName}</option>)}
              </select>

              <label>Subscription</label>
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
                <option value="">Pick Subscription</option>
                {subscriptions.map((sub) => (
                  <option key={sub._id} value={sub._id}>{`${sub.packageName || 'Subscription'} (${sub.type})`}</option>
                ))}
              </select>

              <div className="info-row">
                <div>
                  <label>Subscription Price</label>
                  <input type="number" value={selectedSubscription?.price ?? 0} readOnly />
                </div>
                <div>
                  <label>Total Paid</label>
                  <input type="number" value={paymentSummary.totalPaid} readOnly />
                </div>
                <div>
                  <label>Remaining</label>
                  <input type="number" value={paymentSummary.remaining} readOnly />
                </div>
              </div>

              <label>Paid Amount</label>
              <input type="number" min="0" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: Number(e.target.value) })} required />
              <label>Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                <option>Cash</option>
                <option>Click</option>
                <option>Bank Transfer</option>
              </select>
              <label>Receipt Image URL</label>
              <input value={form.receiptImage} onChange={(e) => setForm({ ...form, receiptImage: e.target.value })} />
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <button className="btn-primary" type="submit">Record Payment</button>
            </form>
          </div>
          <div className="table-card">
            <h2>Payment History</h2>
            <table className="data-table">
              <thead><tr><th>Player</th><th>Paid</th><th>Remaining</th><th>Method</th></tr></thead>
              <tbody>
                {payments.length ? payments.map((payment) => (
                  <tr key={payment._id}>
                    <td>{payment.playerId?.fullName || payment.playerId}</td>
                    <td>{payment.paidAmount}</td>
                    <td>{payment.remainingAmount}</td>
                    <td>{payment.paymentMethod}</td>
                  </tr>
                )) : <tr><td colSpan="4">No payments recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PaymentsPage;
