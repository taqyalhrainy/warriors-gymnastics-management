import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { getPlayer, updatePlayer } from '../services/players.js';
import { fetchAttendanceByPlayer } from '../services/attendance.js';
import { fetchPaymentsByPlayer } from '../services/payments.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const getDateInputValue = (date = new Date()) => {
  if (!date) return '';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getFourWeekEndDateValue = (startDate) => {
  const value = new Date(`${startDate || getDateInputValue()}T00:00:00`);
  if (Number.isNaN(value.getTime())) return '';
  value.setDate(value.getDate() + 28);
  return getDateInputValue(value);
};

const PlayerProfilePage = () => {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState({ startDate: '', endDate: '' });
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [isSavingSubscription, setIsSavingSubscription] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    Promise.all([getPlayer(id), fetchAttendanceByPlayer(id), fetchPaymentsByPlayer(id)])
      .then(([playerData, attendanceData, paymentData]) => {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        setPlayer(playerData);
        setAttendanceHistory(attendanceData.filter((record) => new Date(record.date) >= threeMonthsAgo));
        setPaymentHistory(paymentData);
      })
      .catch(console.error);
  }, [id]);

  const getPlayerGroups = (value) => {
    const groups = value?.groupIds?.length ? value.groupIds : [value?.groupId].filter(Boolean);
    return groups.map((group) => group?.name).filter(Boolean).join(', ');
  };

  const currentSubscriptionPayments = paymentHistory.filter((payment) => {
    if (player?.currentSubscriptionStartedAt) {
      return payment.createdAt && new Date(payment.createdAt) >= new Date(player.currentSubscriptionStartedAt);
    }
    if (!player?.startDate) return true;
    return new Date(payment.paymentDate || 0) >= new Date(player.startDate);
  });
  const totalPaid = currentSubscriptionPayments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);

  const openSubscriptionModal = () => {
    const startDate = getDateInputValue();
    setSubscriptionForm({
      startDate,
      endDate: getFourWeekEndDateValue(startDate)
    });
    setSubscriptionMessage('');
    setShowSubscriptionModal(true);
  };

  const handleSubscriptionStartDateChange = (startDate) => {
    setSubscriptionForm((current) => ({
      ...current,
      startDate,
      endDate: getFourWeekEndDateValue(startDate)
    }));
  };

  const handleSubscriptionSave = async (event) => {
    event.preventDefault();
    const confirmed = window.confirm('This will start a new subscription cycle and cannot be undone. Old payments will no longer count toward the current subscription. Continue?');
    if (!confirmed) return;
    setSubscriptionMessage('');
    setIsSavingSubscription(true);
    try {
      const updatedPlayer = await updatePlayer(id, {
        startDate: subscriptionForm.startDate,
        endDate: subscriptionForm.endDate,
        status: player?.status === 'expired' ? 'active' : player?.status,
        newSubscription: true
      });
      const refreshedPayments = await fetchPaymentsByPlayer(id);
      setPlayer(updatedPlayer);
      setPaymentHistory(refreshedPayments);
      setShowSubscriptionModal(false);
    } catch (error) {
      setSubscriptionMessage(error.response?.data?.message || 'Unable to start a new subscription.');
    } finally {
      setIsSavingSubscription(false);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('playerProfile')}</h1>
          <div className="profile-header-actions">
            <button className="new-subscription-button" type="button" onClick={openSubscriptionModal}>
              <span>New Subscription</span>
            </button>
            <Link className="btn-secondary" to="/players">{t('backToList')}</Link>
          </div>
        </div>
        {player ? (
          <div className="card details-card">
            <div><strong>{t('name')}:</strong> {player.fullName}</div>
            <div><strong>{t('status')}:</strong> {player.status}</div>
            <div><strong>{t('group')}:</strong> {getPlayerGroups(player) || t('unassigned')}</div>
            <div><strong>{t('parent')}:</strong> {player.parentId?.name || t('unknown')}</div>
            <div><strong>{t('parentPhone')}:</strong> {player.parentPhone || t('notSet')}</div>
            <div><strong>{t('startDate')}:</strong> {player.startDate?.split('T')[0] || t('notSet')}</div>
            <div><strong>{t('endDate')}:</strong> {player.endDate?.split('T')[0] || t('notSet')}</div>
            <div><strong>{t('package')}:</strong> {player.packageName ? (player.packageName === 'custom' ? t('customPackage') : player.packageName) : t('notSet')}</div>
            <div><strong>{t('classes')}:</strong> {player.packageClasses || t('notSet')}</div>
            <div><strong>{t('hours')}:</strong> {player.packageHours || t('notSet')}</div>
            <div><strong>{t('payment')}:</strong> {formatCurrency(player.payment || 0)}</div>
            <div><strong>Total Paid:</strong> {formatCurrency(totalPaid)}</div>
            <div><strong>{t('note')}:</strong> {player.note || t('notSet')}</div>
            <div className="profile-attendance-history">
              <h2>Attendance History</h2>
              <div className="student-history-list">
                {attendanceHistory.length ? attendanceHistory.map((record) => (
                  <div className="student-history-row" key={record._id}>
                    <span>{new Date(record.date).toLocaleDateString()}</span>
                    <strong>{record.status}</strong>
                    <span>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}</span>
                  </div>
                )) : <p className="empty-state">No attendance history found for the last 3 months.</p>}
              </div>
            </div>
          </div>
        ) : (
          <p>{t('loadingPlayer')}</p>
        )}
        {showSubscriptionModal && (
          <div className="student-modal-backdrop" role="presentation">
            <div className="student-modal new-subscription-modal" role="dialog" aria-modal="true">
              <div className="student-modal-header">
                <div>
                  <h2>New Subscription</h2>
                  <p>Choose the new subscription dates. Payments from before the new start date will not count in this subscription.</p>
                </div>
                <button className="btn-secondary" type="button" onClick={() => setShowSubscriptionModal(false)}>Close</button>
              </div>
              <p className="new-subscription-warning">Warning: this action cannot be undone after saving.</p>
              {subscriptionMessage && <p className="alert-error">{subscriptionMessage}</p>}
              <form className="student-modal-edit-form" onSubmit={handleSubscriptionSave}>
                <div className="student-modal-edit-grid">
                  <label>
                    <span>{t('startDate')}</span>
                    <input
                      type="date"
                      value={subscriptionForm.startDate}
                      onChange={(event) => handleSubscriptionStartDateChange(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>{t('endDate')}</span>
                    <input
                      type="date"
                      value={subscriptionForm.endDate}
                      onChange={(event) => setSubscriptionForm({ ...subscriptionForm, endDate: event.target.value })}
                      required
                    />
                  </label>
                </div>
                <div className="student-modal-edit-actions">
                  <button className="btn-primary" type="submit" disabled={isSavingSubscription}>
                    {isSavingSubscription ? 'Saving...' : 'Start Subscription'}
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setShowSubscriptionModal(false)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PlayerProfilePage;
