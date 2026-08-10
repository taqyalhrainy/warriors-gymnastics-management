import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { getPlayer, updatePlayer } from '../services/players.js';
import { fetchAttendanceByPlayer } from '../services/attendance.js';
import { fetchPaymentsByPlayer } from '../services/payments.js';
import { formatCurrency } from '../utils/format.js';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';
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
  const [year, month, day] = String(startDate || getDateInputValue()).split('-').map(Number);
  const value = new Date(year, month - 1, day);
  if (Number.isNaN(value.getTime())) return '';
  value.setDate(value.getDate() + 28);
  return getDateInputValue(value);
};

const DAY_INDEXES = {
  sunday: 0,
  sun: 0,
  'الأحد': 0,
  monday: 1,
  mon: 1,
  'الاثنين': 1,
  'الإثنين': 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  'الثلاثاء': 2,
  wednesday: 3,
  wed: 3,
  'الأربعاء': 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  'الخميس': 4,
  friday: 5,
  fri: 5,
  'الجمعة': 5,
  saturday: 6,
  sat: 6,
  'السبت': 6
};

const getDayIndexFromText = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (Number.isInteger(DAY_INDEXES[normalized])) return DAY_INDEXES[normalized];
  const match = Object.entries(DAY_INDEXES).find(([dayName]) => normalized.includes(dayName));
  return match ? match[1] : null;
};

const getGroupScheduledDayIndexes = (group) => {
  const daySources = Array.isArray(group?.days) ? group.days : [group?.days].filter(Boolean);
  if (group?.name) daySources.push(group.name);
  return daySources
    .flatMap((value) => String(value || '').split(/[\/,|]+/))
    .map(getDayIndexFromText)
    .filter((day) => Number.isInteger(day));
};

const getScheduledEndDateValue = (startDate, player) => {
  const totalClasses = Number(player?.packageClasses || 0);
  const groups = player?.groupIds?.length ? player.groupIds : [player?.groupId].filter(Boolean);
  const scheduledDays = new Set(
    groups
      .flatMap(getGroupScheduledDayIndexes)
      .filter((day) => Number.isInteger(day))
  );

  if (!startDate || totalClasses <= 0 || !scheduledDays.size) {
    return getFourWeekEndDateValue(startDate);
  }

  const [year, month, day] = String(startDate).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return '';

  let scheduledClasses = 0;
  while (scheduledClasses < totalClasses) {
    if (scheduledDays.has(date.getDay())) scheduledClasses += 1;
    if (scheduledClasses < totalClasses) date.setDate(date.getDate() + 1);
  }

  return getDateInputValue(date);
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
  const [balanceForm, setBalanceForm] = useState('');
  const [balanceMessage, setBalanceMessage] = useState('');
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    Promise.all([getPlayer(id), fetchAttendanceByPlayer(id), fetchPaymentsByPlayer(id)])
      .then(([playerData, attendanceData, paymentData]) => {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        setPlayer(playerData);
        setBalanceForm(String(playerData.accountBalance ?? 0));
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
  const accountBalance = Number(player?.accountBalance || 0);
  const balanceState = accountBalance > 0 ? 'credit' : accountBalance < 0 ? 'due' : 'settled';

  const handleBalanceSave = async (event) => {
    event.preventDefault();
    setBalanceMessage('');
    setIsSavingBalance(true);
    try {
      const updatedPlayer = await updatePlayer(id, { accountBalance: parseLocalizedNumber(balanceForm) });
      setPlayer(updatedPlayer);
      setBalanceForm(String(updatedPlayer.accountBalance ?? 0));
      setBalanceMessage('Balance updated.');
    } catch (error) {
      setBalanceMessage(error.response?.data?.message || 'Unable to update balance.');
    } finally {
      setIsSavingBalance(false);
    }
  };

  const openSubscriptionModal = () => {
    const startDate = getDateInputValue();
    setSubscriptionForm({
      startDate,
      endDate: getScheduledEndDateValue(startDate, player)
    });
    setSubscriptionMessage('');
    setShowSubscriptionModal(true);
  };

  const handleSubscriptionStartDateChange = (startDate) => {
    setSubscriptionForm((current) => ({
      ...current,
      startDate,
      endDate: getScheduledEndDateValue(startDate, player)
    }));
  };

  useEffect(() => {
    if (!showSubscriptionModal || !subscriptionForm.startDate) return;
    const nextEndDate = getScheduledEndDateValue(subscriptionForm.startDate, player);
    setSubscriptionForm((current) => (
      current.endDate === nextEndDate
        ? current
        : { ...current, endDate: nextEndDate }
    ));
  }, [showSubscriptionModal, subscriptionForm.startDate, player]);

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
            <section className={`player-balance-card is-${balanceState}`}>
              <div>
                <span>Player account</span>
                <strong>{formatCurrency(accountBalance)}</strong>
                <small>
                  {balanceState === 'credit' && 'Credit available'}
                  {balanceState === 'due' && 'Amount due'}
                  {balanceState === 'settled' && 'Settled'}
                </small>
              </div>
              <form onSubmit={handleBalanceSave}>
                <label>
                  <span>Manual balance</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={balanceForm}
                    onChange={(event) => setBalanceForm(normalizeDigits(event.target.value))}
                  />
                </label>
                <button className="btn-secondary" type="submit" disabled={isSavingBalance}>
                  {isSavingBalance ? 'Saving...' : 'Save balance'}
                </button>
              </form>
              {balanceMessage && <p>{balanceMessage}</p>}
            </section>
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
