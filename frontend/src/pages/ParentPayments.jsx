import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentPayments, getCachedParentPayments } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import warriorsLogo from '../assets/warriors-logo.png';

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US');

const ParentPaymentsPage = () => {
  const [payments, setPayments] = useState(() => getCachedParentPayments() || []);
  const [isLoading, setIsLoading] = useState(() => !getCachedParentPayments());
  const [previewProfileImage, setPreviewProfileImage] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    let isMounted = true;
    fetchParentPayments()
      .then((data) => {
        if (isMounted) setPayments(data);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const openProfileImage = (event, image) => {
    if (!image) return;
    event.stopPropagation();
    setPreviewProfileImage(image);
  };

  const handleProfileImageKeyDown = (event, image) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openProfileImage(event, image);
  };

  const renderChildName = (child) => (
    <span className="player-name-with-photo">
      <span
        className={`player-avatar${child?.profileImage ? ' is-clickable' : ''}`}
        role={child?.profileImage ? 'button' : undefined}
        tabIndex={child?.profileImage ? 0 : undefined}
        onClick={(event) => openProfileImage(event, child?.profileImage)}
        onKeyDown={(event) => handleProfileImageKeyDown(event, child?.profileImage)}
      >
        {child?.profileImage ? <img src={child.profileImage} alt="" /> : <span>{child?.fullName?.charAt(0) || '?'}</span>}
      </span>
      <span>{child?.fullName || t('child')}</span>
    </span>
  );

  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
  const totalRemaining = payments.reduce((sum, payment) => sum + Number(payment.remainingAmount || 0), 0);

  return (
    <div className="dashboard-layout parent-app-layout">
      <Sidebar />
      <main className="page-content parent-portal-page">
        <button type="button" className="parent-back-button" onClick={() => navigate('/parent')} aria-label="Back to parent home">
          <span aria-hidden="true">‹</span>
        </button>
        <section className="parent-hero is-compact">
          <div>
            <span className="parent-kicker">Payments</span>
            <h1>{t('paymentHistory')}</h1>
          </div>
          <div className="parent-hero-stats">
            <div><span>{t('paid')}</span><strong>{formatMoney(totalPaid)}</strong></div>
            <div><span>{t('remaining')}</span><strong>{formatMoney(totalRemaining)}</strong></div>
            <div><span>Records</span><strong>{payments.length}</strong></div>
          </div>
        </section>
        {isLoading ? (
          <div className="parent-loading-panel">
            <img src={warriorsLogo} alt="" />
            <span className="parent-loading-spinner" />
            <strong>Loading payments...</strong>
          </div>
        ) : (
        <div className="table-card parent-payment-card">
          <table className="data-table">
            <thead><tr><th>{t('child')}</th><th>{t('date')}</th><th>{t('paid')}</th><th>{t('remaining')}</th><th>{t('method')}</th></tr></thead>
            <tbody>
              {payments.length ? payments.map((payment) => (
                <tr key={payment._id}>
                  <td>{renderChildName(payment.playerId)}</td>
                  <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                  <td><strong className="parent-paid-amount">{formatMoney(payment.paidAmount)}</strong></td>
                  <td>
                    <span className={`parent-remaining-pill ${Number(payment.remainingAmount || 0) > 0 ? 'is-due' : 'is-paid'}`}>
                      {Number(payment.remainingAmount || 0) > 0 ? `${formatMoney(payment.remainingAmount)} remaining` : 'Paid in full'}
                    </span>
                  </td>
                  <td>{payment.paymentMethod}</td>
                </tr>
              )) : <tr><td colSpan="5">{t('noPaymentsFound')}</td></tr>}
            </tbody>
          </table>
        </div>
        )}
        {previewProfileImage && (
          <div className="profile-image-preview-backdrop" role="presentation" onClick={() => setPreviewProfileImage('')}>
            <section className="profile-image-preview-dialog" role="dialog" aria-modal="true" aria-label="Profile picture preview" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="btn-secondary" onClick={() => setPreviewProfileImage('')}>{t('close')}</button>
              <img src={previewProfileImage} alt="" />
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default ParentPaymentsPage;
