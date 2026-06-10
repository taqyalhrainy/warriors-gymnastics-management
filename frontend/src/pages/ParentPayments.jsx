import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentPayments } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const ParentPaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    fetchParentPayments().then(setPayments).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('paymentHistory')}</h1></div>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>{t('child')}</th><th>{t('date')}</th><th>{t('paid')}</th><th>{t('remaining')}</th><th>{t('method')}</th></tr></thead>
            <tbody>
              {payments.length ? payments.map((payment) => (
                <tr key={payment._id}>
                  <td>{payment.playerId?.fullName || t('child')}</td>
                  <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                  <td>{payment.paidAmount}</td>
                  <td>{payment.remainingAmount}</td>
                  <td>{payment.paymentMethod}</td>
                </tr>
              )) : <tr><td colSpan="5">{t('noPaymentsFound')}</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default ParentPaymentsPage;
