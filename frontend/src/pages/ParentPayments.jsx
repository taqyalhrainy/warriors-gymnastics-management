import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import DataStatus from '../components/DataStatus.jsx';
import { fetchParentPayments, getCachedParentPaymentsPage } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import warriorsLogo from '../assets/warriors-logo.png';

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US');
const getVisiblePaid = (payment) => Number(payment?.visiblePaidAmount ?? payment?.playerId?.currentSubscriptionPaidAmount ?? 0);
const getVisibleRemaining = (payment) => Number(payment?.visibleRemainingAmount ?? (payment?.playerId?.attendanceDueManual ? payment.remainingAmount : 0) ?? 0);
const PAGE_SIZE = 20;
const FIRST_PAGE_PARAMS = { page: 1, limit: PAGE_SIZE };

const ParentPaymentsPage = () => {
  const cachedFirstPage = getCachedParentPaymentsPage(FIRST_PAGE_PARAMS);
  const [payments, setPayments] = useState(() => cachedFirstPage?.items || []);
  const [isLoading, setIsLoading] = useState(() => !cachedFirstPage);
  const [page, setPage] = useState(() => cachedFirstPage?.page || 1);
  const [total, setTotal] = useState(() => cachedFirstPage?.total || 0);
  const [hasMore, setHasMore] = useState(() => Boolean(cachedFirstPage?.hasMore));
  const [previewProfileImage, setPreviewProfileImage] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loadError, setLoadError] = useState('');

  const loadPayments = (nextPage = 1, append = false) => {
    let isMounted = true;
    setIsLoading(!append && !payments.length);
    fetchParentPayments({ page: nextPage, limit: PAGE_SIZE })
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setPayments(data);
          setTotal(data.length);
          setHasMore(false);
          setPage(1);
          return;
        }
        const rows = data?.items || [];
        setPayments((current) => (append ? [...current, ...rows] : rows));
        setTotal(data?.total || rows.length);
        setPage(data?.page || nextPage);
        setHasMore(Boolean(data?.hasMore));
      })
      .catch(() => { if (isMounted) setLoadError('Unable to load data.'); })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  };

  useEffect(() => {
    const cleanup = loadPayments(1, false);
    return () => {
      cleanup?.();
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

  const totalPaidByPlayer = new Map();
  payments.forEach((payment) => {
    const playerId = String(payment.playerId?._id || payment.playerId || payment._id);
    if (!totalPaidByPlayer.has(playerId)) totalPaidByPlayer.set(playerId, getVisiblePaid(payment));
  });
  const totalPaid = [...totalPaidByPlayer.values()].reduce((sum, value) => sum + value, 0);
  const totalRemaining = payments.reduce((sum, payment) => sum + getVisibleRemaining(payment), 0);

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
            <div><span>{t('paid')}</span><strong>{isLoading || (loadError && !payments.length) ? '...' : formatMoney(totalPaid)}</strong></div>
            <div><span>{t('remaining')}</span><strong>{isLoading || (loadError && !payments.length) ? '...' : formatMoney(totalRemaining)}</strong></div>
            <div><span>Records</span><strong>{isLoading || (loadError && !payments.length) ? '...' : `${payments.length}/${total || payments.length}`}</strong></div>
          </div>
        </section>
        {loadError && !payments.length ? <DataStatus state={{ error: loadError }} /> : isLoading ? (
          <div className="parent-loading-panel">
            <img src={warriorsLogo} alt="" />
            <span className="parent-loading-spinner" />
            <strong>Loading payments...</strong>
          </div>
        ) : (
        <>
        <div className="table-card parent-payment-card">
          <table className="data-table">
            <thead><tr><th>{t('child')}</th><th>{t('date')}</th><th>{t('paid')}</th><th>{t('remaining')}</th><th>{t('method')}</th></tr></thead>
            <tbody>
              {payments.length ? payments.map((payment) => (
                <tr key={payment._id}>
                  <td>{renderChildName(payment.playerId)}</td>
                  <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                  <td><strong className="parent-paid-amount">{formatMoney(getVisiblePaid(payment))}</strong></td>
                  <td>
                    <span className={`parent-remaining-pill ${getVisibleRemaining(payment) > 0 ? 'is-due' : 'is-paid'}`}>
                      {getVisibleRemaining(payment) > 0 ? `${formatMoney(getVisibleRemaining(payment))} remaining` : 'Paid in full'}
                    </span>
                  </td>
                  <td>{payment.paymentMethod}</td>
                </tr>
              )) : <tr><td colSpan="5">{t('noPaymentsFound')}</td></tr>}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="show-more-row">
            <button type="button" className="btn-secondary" disabled={isLoading} onClick={() => loadPayments(page + 1, true)}>
              Show more
            </button>
          </div>
        )}
        </>
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
