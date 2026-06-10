import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentPayments } from '../services/parents.js';

const ParentPaymentsPage = () => {
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    fetchParentPayments().then(setPayments).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Payment History</h1></div>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Child</th><th>Date</th><th>Paid</th><th>Remaining</th><th>Method</th></tr></thead>
            <tbody>
              {payments.length ? payments.map((payment) => (
                <tr key={payment._id}>
                  <td>{payment.playerId?.fullName || 'Child'}</td>
                  <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                  <td>{payment.paidAmount}</td>
                  <td>{payment.remainingAmount}</td>
                  <td>{payment.paymentMethod}</td>
                </tr>
              )) : <tr><td colSpan="5">No payments found.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default ParentPaymentsPage;
