import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { downloadPlayersBackup, fetchDashboard } from '../services/reports.js';
import { fetchGroups } from '../services/groups.js';
import { fetchPlayers, getPlayer } from '../services/players.js';
import { fetchAttendanceByPlayer } from '../services/attendance.js';
import { fetchPaymentsByPlayer } from '../services/payments.js';
import { createWaitingListEntry, deleteWaitingListEntry, fetchWaitingList, updateWaitingListEntry } from '../services/waitingList.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const initialWaitingForm = {
  playerName: '',
  playerAge: '',
  parentName: '',
  parentPhone: '',
  desiredGroupId: '',
  notes: ''
};

const EXPIRED_ALERT_READ_KEY = 'warriors-expired-alert-read-ids';
const DASHBOARD_STATS_CACHE_KEY = 'warriors-dashboard-stats-cache';

const readDashboardStatsCache = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(DASHBOARD_STATS_CACHE_KEY) || 'null');
    if (!parsed?.data) {
      return null;
    }
    return parsed.data;
  } catch (error) {
    return null;
  }
};

const writeDashboardStatsCache = (data) => {
  localStorage.setItem(DASHBOARD_STATS_CACHE_KEY, JSON.stringify({
    data,
    savedAt: Date.now()
  }));
};

let dashboardStatsCache = readDashboardStatsCache();

const getLocalDateOnly = (date = new Date()) => {
  const currentDate = new Date(date);
  currentDate.setHours(0, 0, 0, 0);
  return currentDate;
};

const getLocalDateValue = (date = new Date()) => {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDaysUntil = (dateValue) => {
  const today = getLocalDateOnly();
  const targetDate = getLocalDateOnly(dateValue);
  return Math.ceil((targetDate.getTime() - today.getTime()) / 86400000);
};

const getExpiredAlertKey = (player) => `${player._id}:${player.endDate ? new Date(player.endDate).toISOString().split('T')[0] : ''}`;

const readExpiredAlertIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(EXPIRED_ALERT_READ_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
};

const writeExpiredAlertIds = (ids) => {
  localStorage.setItem(EXPIRED_ALERT_READ_KEY, JSON.stringify([...new Set(ids.map(String))]));
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(() => dashboardStatsCache);
  const [groups, setGroups] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [expiredAlertPlayers, setExpiredAlertPlayers] = useState([]);
  const [dashboardPlayers, setDashboardPlayers] = useState([]);
  const [expiredAlertReadIds, setExpiredAlertReadIds] = useState(() => readExpiredAlertIds());
  const [highlightedExpiredAlertIds, setHighlightedExpiredAlertIds] = useState([]);
  const [isExpiredAlertOpen, setIsExpiredAlertOpen] = useState(false);
  const [isExpiredTimeOpen, setIsExpiredTimeOpen] = useState(false);
  const [expiredTimeDate, setExpiredTimeDate] = useState(() => getLocalDateValue());
  const [viewedPlayer, setViewedPlayer] = useState(null);
  const [viewedPlayerAttendance, setViewedPlayerAttendance] = useState([]);
  const [viewedPlayerPayments, setViewedPlayerPayments] = useState([]);
  const [isPlayerViewLoading, setIsPlayerViewLoading] = useState(false);
  const [playerViewError, setPlayerViewError] = useState('');
  const [isBackupDownloading, setIsBackupDownloading] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [waitingForm, setWaitingForm] = useState(initialWaitingForm);
  const [editingWaitingEntryId, setEditingWaitingEntryId] = useState('');
  const [isWaitingFormOpen, setIsWaitingFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [waitingMessage, setWaitingMessage] = useState('');
  const { language, t } = useLanguage();
  const { token, user } = useAuth();
  const copy = language === 'ar'
    ? {
      waitingList: 'قائمة الانتظار',
      waitingSubtitle: 'طلاب مهتمين بدون إضافتهم لقائمة اللاعبين.',
      addWaiting: 'Waiting List',
      playerName: 'اسم اللاعب',
      parentName: 'اسم ولي الأمر',
      parentPhone: 'رقم ولي الأمر',
      desiredGroup: 'المجموعة المطلوبة',
      chooseGroup: 'اختر المجموعة',
      save: 'حفظ في قائمة الانتظار',
      empty: 'لا يوجد طلاب على قائمة الانتظار.',
      added: 'تمت إضافة اللاعب لقائمة الانتظار.',
      deleted: 'تم حذف الطلب من قائمة الانتظار.',
      unableLoad: 'تعذر تحميل قائمة الانتظار.',
      unableSave: 'تعذر حفظ طلب الانتظار.',
      unableDelete: 'تعذر حذف طلب الانتظار.',
      addedAt: 'تاريخ الإضافة',
      call: 'اتصال'
    }
    : {
      waitingList: 'Waiting List',
      waitingSubtitle: 'Interested players without adding them to Players yet.',
      addWaiting: 'Waiting List',
      playerName: 'Player name',
      parentName: 'Parent name',
      parentPhone: 'Parent phone',
      desiredGroup: 'Desired group',
      chooseGroup: 'Choose group',
      save: 'Save to waiting list',
      empty: 'No waiting list entries yet.',
      added: 'Player added to the waiting list.',
      deleted: 'Waiting list entry deleted.',
      unableLoad: 'Unable to load waiting list.',
      unableSave: 'Unable to save waiting list entry.',
      unableDelete: 'Unable to delete waiting list entry.',
      addedAt: 'Added at',
      call: 'Call'
    };
  copy.playerAge = copy.playerAge || 'Age';
  copy.note = copy.note || 'Note';
  const expiredCopy = language === 'ar'
    ? {
      title: 'Expired Alert',
      subtitle: 'لاعبين باقي على نهاية اشتراكهم أسبوع أو أقل.',
      empty: 'لا يوجد لاعبين قريبين من تاريخ الانتهاء.',
      daysLeft: 'الأيام المتبقية',
      endDate: 'End date',
      parent: 'ولي الأمر',
      sendMessage: 'إرسال رسالة',
      openAlert: 'Expired Alert',
      messageTitle: 'تنبيه قرب انتهاء الاشتراك',
      messageBody: (player) => `مرحباً ${player.parentId?.name || ''}، نذكركم أن اشتراك ${player.fullName} قريب من الانتهاء بتاريخ ${formatDate(player.endDate)}.`
    }
    : {
      title: 'Expired Alert',
      subtitle: 'Players whose subscriptions end today.',
      empty: 'No player subscriptions end today.',
      daysLeft: 'Days left',
      endDate: 'End date',
      parent: 'Parent',
      sendMessage: 'Send message',
      openAlert: 'Expired Alert',
      messageTitle: 'Subscription expiry alert',
      messageBody: (player) => `Hello ${player.parentId?.name || ''}, ${player.fullName}'s subscription is close to ending on ${formatDate(player.endDate)}.`
    };

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    setError('');
    setIsDashboardLoading(!dashboardStatsCache);

    fetchDashboard()
      .then((data) => {
        dashboardStatsCache = data;
        writeDashboardStatsCache(data);
        if (isMounted) setStats(data);
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setError(err.response?.data?.message || 'Unable to load dashboard data. Please refresh or try again.');
      })
      .finally(() => {
        if (isMounted) setIsDashboardLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const loadWaitingListData = async () => {
    try {
      const [groupRows, waitingRows, playerRows] = await Promise.all([
        fetchGroups(),
        fetchWaitingList(),
        fetchPlayers({ dashboard: 'expired-alert' })
      ]);
      setGroups(groupRows);
      setWaitingList(waitingRows);
      setDashboardPlayers(playerRows);
      setExpiredAlertPlayers(getExpiredAlertPlayers(playerRows));
    } catch (err) {
      setWaitingMessage(err.response?.data?.message || copy.unableLoad);
    }
  };

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      loadWaitingListData();
    }, 1000);

    return () => clearTimeout(timer);
  }, [token]);

  const handleWaitingFormChange = (event) => {
    const { name, value } = event.target;
    setWaitingForm((current) => ({ ...current, [name]: value }));
  };

  const handleWaitingSubmit = async (event) => {
    event.preventDefault();
    setWaitingMessage('');

    try {
      if (editingWaitingEntryId) {
        const entry = await updateWaitingListEntry(editingWaitingEntryId, waitingForm);
        setWaitingList((current) => current.map((item) => (item._id === entry._id ? entry : item)));
        setWaitingMessage('Waiting list entry updated.');
      } else {
        const entry = await createWaitingListEntry(waitingForm);
        setWaitingList((current) => [entry, ...current]);
        setWaitingMessage(copy.added);
      }
      setWaitingForm(initialWaitingForm);
      setEditingWaitingEntryId('');
      if (!editingWaitingEntryId) {
        setIsWaitingFormOpen(false);
      }
    } catch (err) {
      setWaitingMessage(err.response?.data?.message || (editingWaitingEntryId ? 'Unable to update waiting list entry.' : copy.unableSave));
    }
  };

  const handleWaitingEdit = (entry) => {
    setWaitingForm({
      playerName: entry.playerName || '',
      playerAge: typeof entry.playerAge === 'number' ? String(entry.playerAge) : '',
      parentName: entry.parentName || '',
      parentPhone: entry.parentPhone || '',
      desiredGroupId: entry.desiredGroupId?._id || entry.desiredGroupId || '',
      notes: entry.notes || ''
    });
    setEditingWaitingEntryId(entry._id);
    setWaitingMessage('');
  };

  const handleWaitingCancelEdit = () => {
    setWaitingForm(initialWaitingForm);
    setEditingWaitingEntryId('');
    setWaitingMessage('');
  };

  const closeWaitingListModal = () => {
    setIsWaitingFormOpen(false);
    handleWaitingCancelEdit();
  };

  const handleWaitingDelete = async (id) => {
    try {
      await deleteWaitingListEntry(id);
      setWaitingList((current) => current.filter((entry) => entry._id !== id));
      if (editingWaitingEntryId === id) {
        setWaitingForm(initialWaitingForm);
        setEditingWaitingEntryId('');
      }
      setWaitingMessage(copy.deleted);
    } catch (err) {
      setWaitingMessage(err.response?.data?.message || copy.unableDelete);
    }
  };

  const getExpiredAlertPlayers = (players) => players
    .map((player) => ({
      ...player,
      daysUntilEnd: player.endDate ? getDaysUntil(player.endDate) : null
    }))
    .filter((player) => player.status === 'active' && player.endDate && player.daysUntilEnd === 0)
    .sort((first, second) => first.daysUntilEnd - second.daysUntilEnd || first.fullName.localeCompare(second.fullName));

  const formatDate = (dateValue) => dateValue ? new Date(dateValue).toLocaleDateString() : '-';

  const unreadExpiredAlertCount = expiredAlertPlayers.filter((player) => !expiredAlertReadIds.includes(getExpiredAlertKey(player))).length;

  const openExpiredAlert = () => {
    const currentIds = expiredAlertPlayers.map(getExpiredAlertKey);
    const unreadIds = currentIds.filter((id) => !expiredAlertReadIds.includes(id));
    const nextReadIds = [...new Set([...expiredAlertReadIds, ...currentIds])];
    setHighlightedExpiredAlertIds(unreadIds);
    writeExpiredAlertIds(nextReadIds);
    setExpiredAlertReadIds(nextReadIds);
    window.dispatchEvent(new Event('expired-alerts:read'));
    setIsExpiredAlertOpen(true);
  };

  const closeExpiredAlert = () => {
    setIsExpiredAlertOpen(false);
    setHighlightedExpiredAlertIds([]);
  };

  const getPlayerGroups = (player) => {
    const playerGroups = player?.groupIds?.length ? player.groupIds : [player?.groupId].filter(Boolean);
    return playerGroups.map((group) => group?.name).filter(Boolean).join(', ');
  };

  const openPlayerView = async (player) => {
    setViewedPlayer(player);
    setViewedPlayerAttendance([]);
    setViewedPlayerPayments([]);
    setPlayerViewError('');
    setIsPlayerViewLoading(true);

    try {
      const [playerData, attendanceData, paymentData] = await Promise.all([
        getPlayer(player._id),
        fetchAttendanceByPlayer(player._id),
        fetchPaymentsByPlayer(player._id)
      ]);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      setViewedPlayer(playerData);
      setViewedPlayerAttendance(attendanceData.filter((record) => new Date(record.date) >= threeMonthsAgo));
      setViewedPlayerPayments(paymentData);
    } catch (err) {
      setPlayerViewError(err.response?.data?.message || 'Unable to load player details.');
    } finally {
      setIsPlayerViewLoading(false);
    }
  };

  const closePlayerView = () => {
    setViewedPlayer(null);
    setViewedPlayerAttendance([]);
    setViewedPlayerPayments([]);
    setPlayerViewError('');
  };

  const handlePlayersBackup = async () => {
    setError('');
    setIsBackupDownloading(true);
    try {
      const { blob, filename } = await downloadPlayersBackup();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create players backup.');
    } finally {
      setIsBackupDownloading(false);
    }
  };

  const handleExpiredPlayerNotification = (player) => {
    navigate('/notifications', {
      state: {
        prefillNotification: {
          recipientUserId: player.parentId?.userId || '',
          parentId: player.parentId?._id || '',
          parentName: player.parentId?.name || '',
          playerName: player.fullName || '',
          title: expiredCopy.messageTitle,
          message: expiredCopy.messageBody(player),
          type: 'subscription'
        }
      }
    });
  };

  const currentViewedPlayerPayments = viewedPlayerPayments.filter((payment) => {
    if (viewedPlayer?.currentSubscriptionStartedAt) {
      return payment.createdAt && new Date(payment.createdAt) >= new Date(viewedPlayer.currentSubscriptionStartedAt);
    }
    if (!viewedPlayer?.startDate) return true;
    return new Date(payment.paymentDate || 0) >= new Date(viewedPlayer.startDate);
  });
  const viewedPlayerTotalPaid = currentViewedPlayerPayments.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
  const expiredTimePlayers = dashboardPlayers
    .filter((player) => player.endDate?.split?.('T')?.[0] === expiredTimeDate)
    .sort((first, second) => first.fullName.localeCompare(second.fullName));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('adminDashboard')}</h1>
          <div className="page-header-actions">
            {user?.role === 'admin' && (
              <button className="backup-button" type="button" onClick={handlePlayersBackup} disabled={isBackupDownloading}>
                <span>{isBackupDownloading ? 'Creating...' : 'Backup'}</span>
              </button>
            )}
            <button
              className="waiting-list-button"
              type="button"
              onClick={() => setIsWaitingFormOpen(true)}
            >
              <span>{copy.addWaiting}</span>
            </button>
          </div>
        </div>
        {isDashboardLoading && !stats && (
          <p className="alert-info">
            Preparing dashboard data...
          </p>
        )}
        {error && !isDashboardLoading && <p className="alert-error">{error}</p>}
        <div className="stats-grid">
          <StatsCard title={t('activePlayers')} value={stats?.activePlayers ?? '...'} description={t('activePlayersDesc')} />
          <StatsCard title={t('expiredSubscriptions')} value={stats?.expiredSubscriptions ?? '...'} description={t('expiredSubscriptionsDesc')} />
          <StatsCard title={t('endingSoon')} value={stats?.soonSubscriptions ?? '...'} description={t('endingSoonDesc')} />
          <StatsCard title={t('monthlyRevenue')} value={stats?.monthlyRevenue ?? '...'} description={t('monthlyRevenueDesc')} />
          <StatsCard title={t('pendingAmounts')} value={stats?.pendingAmounts ?? '...'} description={t('pendingAmountsDesc')} />
          <StatsCard title={t('presentToday')} value={stats?.presentCount ?? '...'} description={t('presentTodayDesc')} />
          <StatsCard title={t('absentToday')} value={stats?.absentCount ?? '...'} description={t('absentTodayDesc')} />
        </div>
        <div className="expired-alert-row">
          <button className="expired-alert-button" type="button" onClick={openExpiredAlert}>
            <span>{expiredCopy.openAlert}</span>
            {unreadExpiredAlertCount > 0 && <strong>{unreadExpiredAlertCount}</strong>}
          </button>
          <button className="expired-time-button" type="button" onClick={() => setIsExpiredTimeOpen(true)}>
            <span>Expired Time</span>
          </button>
        </div>

        {isWaitingFormOpen && (
          <div className="student-modal-backdrop" role="presentation" onClick={closeWaitingListModal}>
            <section className="student-modal waiting-list-modal" role="dialog" aria-modal="true" aria-label={copy.waitingList} onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div className="waiting-list-heading">
                  <div>
                    <h2>{copy.waitingList}</h2>
                    <p>{copy.waitingSubtitle}</p>
                  </div>
                  <strong>{waitingList.length}</strong>
                </div>
                <button type="button" className="btn-secondary" onClick={closeWaitingListModal}>{t('close')}</button>
              </div>

              {waitingMessage && <p className="alert-info">{waitingMessage}</p>}

              <form className="waiting-list-form" onSubmit={handleWaitingSubmit}>
                <label>
                  <span>{copy.playerName}</span>
                  <input name="playerName" value={waitingForm.playerName} onChange={handleWaitingFormChange} required />
                </label>
                <label>
                  <span>{copy.playerAge}</span>
                  <input name="playerAge" type="number" min="0" max="120" value={waitingForm.playerAge} onChange={handleWaitingFormChange} />
                </label>
                <label>
                  <span>{copy.parentName}</span>
                  <input name="parentName" value={waitingForm.parentName} onChange={handleWaitingFormChange} required />
                </label>
                <label>
                  <span>{copy.parentPhone}</span>
                  <input name="parentPhone" value={waitingForm.parentPhone} onChange={handleWaitingFormChange} required />
                </label>
                <label>
                  <span>{copy.desiredGroup}</span>
                  <select name="desiredGroupId" value={waitingForm.desiredGroupId} onChange={handleWaitingFormChange} required>
                    <option value="">{copy.chooseGroup}</option>
                    {groups.map((group) => (
                      <option key={group._id} value={group._id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="waiting-list-form-note">
                  <span>{copy.note}</span>
                  <input name="notes" value={waitingForm.notes} onChange={handleWaitingFormChange} />
                </label>
                <button className="btn-primary" type="submit">{editingWaitingEntryId ? 'Save changes' : copy.save}</button>
                {editingWaitingEntryId && (
                  <button className="btn-secondary" type="button" onClick={handleWaitingCancelEdit}>Cancel edit</button>
                )}
              </form>

              <div className="waiting-list-table-wrap">
                <table className="data-table waiting-list-table">
                  <thead>
                    <tr>
                      <th>{copy.playerName}</th>
                      <th>{copy.playerAge}</th>
                      <th>{copy.parentName}</th>
                      <th>{copy.parentPhone}</th>
                      <th>{copy.desiredGroup}</th>
                      <th>{copy.note}</th>
                      <th>{copy.addedAt}</th>
                      <th>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingList.length ? waitingList.map((entry) => (
                      <tr key={entry._id}>
                        <td>{entry.playerName}</td>
                        <td>{entry.playerAge ?? '-'}</td>
                        <td>{entry.parentName}</td>
                        <td>
                          <a href={`tel:${entry.parentPhone}`} className="waiting-phone-link">
                            {entry.parentPhone}
                          </a>
                        </td>
                        <td>{entry.desiredGroupId?.name || t('notSet')}</td>
                        <td>{entry.notes || '-'}</td>
                        <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-'}</td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-secondary" type="button" onClick={() => handleWaitingEdit(entry)}>{t('edit')}</button>
                            <button className="btn-secondary" type="button" onClick={() => handleWaitingDelete(entry._id)}>{t('delete')}</button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="8">{copy.empty}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {isExpiredAlertOpen && (
          <div className="student-modal-backdrop" role="presentation" onClick={closeExpiredAlert}>
            <section className="student-modal expired-alert-modal" role="dialog" aria-modal="true" aria-label={expiredCopy.title} onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div className="expired-alert-heading">
                  <div>
                    <h2>{expiredCopy.title}</h2>
                    <p>{expiredCopy.subtitle}</p>
                  </div>
                  <strong>{expiredAlertPlayers.length}</strong>
                </div>
                <button type="button" className="btn-secondary" onClick={closeExpiredAlert}>{t('close')}</button>
              </div>

              <div className="waiting-list-table-wrap">
                <table className="data-table expired-alert-table">
                  <thead>
                    <tr>
                      <th>{t('player')}</th>
                      <th>{expiredCopy.parent}</th>
                      <th>{expiredCopy.endDate}</th>
                      <th>{expiredCopy.daysLeft}</th>
                      <th>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiredAlertPlayers.length ? expiredAlertPlayers.map((player) => (
                      <tr key={player._id}>
                        <td>
                          <button
                            className={`expired-alert-player-link${highlightedExpiredAlertIds.includes(getExpiredAlertKey(player)) ? ' is-new-alert' : ''}`}
                            type="button"
                            onClick={() => handleExpiredPlayerNotification(player)}
                          >
                            {player.fullName}
                          </button>
                        </td>
                        <td>{player.parentId?.name || t('notSet')}</td>
                        <td>{formatDate(player.endDate)}</td>
                        <td>{player.daysUntilEnd}</td>
                        <td>
                          <div className="expired-alert-actions">
                            <button className="btn-secondary" type="button" onClick={() => openPlayerView(player)}>
                              {t('view')}
                            </button>
                            <button className="btn-secondary" type="button" onClick={() => handleExpiredPlayerNotification(player)}>
                              {expiredCopy.sendMessage}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="5">{expiredCopy.empty}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {isExpiredTimeOpen && (
          <div className="student-modal-backdrop" role="presentation" onClick={() => setIsExpiredTimeOpen(false)}>
            <section className="student-modal expired-time-modal" role="dialog" aria-modal="true" aria-label="Expired Time" onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div>
                  <h2>Expired Time</h2>
                  <p>Choose an end date to see every player whose subscription ends on that day.</p>
                </div>
                <button className="btn-secondary" type="button" onClick={() => setIsExpiredTimeOpen(false)}>{t('close')}</button>
              </div>

              <div className="expired-time-toolbar">
                <label>
                  <span>End date</span>
                  <input type="date" value={expiredTimeDate} onChange={(event) => setExpiredTimeDate(event.target.value)} />
                </label>
                <strong>{expiredTimePlayers.length}</strong>
              </div>

              <div className="waiting-list-table-wrap">
                <table className="data-table expired-time-table">
                  <thead>
                    <tr>
                      <th>{t('player')}</th>
                      <th>{t('parent')}</th>
                      <th>{t('status')}</th>
                      <th>{t('endDate')}</th>
                      <th>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiredTimePlayers.length ? expiredTimePlayers.map((player) => (
                      <tr key={player._id}>
                        <td><strong>{player.fullName}</strong></td>
                        <td>{player.parentId?.name || t('notSet')}</td>
                        <td><span className={`expired-time-status status-${player.status || 'active'}`}>{player.status || 'active'}</span></td>
                        <td>{formatDate(player.endDate)}</td>
                        <td>
                          <button className="btn-secondary" type="button" onClick={() => openPlayerView(player)}>{t('view')}</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5">No subscriptions end on this date.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {viewedPlayer && (
          <div className="student-modal-backdrop expired-player-view-backdrop" role="presentation" onClick={closePlayerView}>
            <section className="student-modal expired-player-view-modal" role="dialog" aria-modal="true" aria-label={viewedPlayer.fullName} onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div>
                  <h2>{viewedPlayer.fullName}</h2>
                  <p>{t('playerProfile')}</p>
                </div>
                <button className="btn-secondary" type="button" onClick={closePlayerView}>{t('close')}</button>
              </div>

              {playerViewError && <p className="alert-error">{playerViewError}</p>}
              {isPlayerViewLoading ? (
                <p className="empty-state">{t('loadingPlayer')}</p>
              ) : (
                <>
                  <div className="student-info-grid expired-player-info-grid">
                    <div><span>{t('name')}</span><strong>{viewedPlayer.fullName}</strong></div>
                    <div><span>{t('status')}</span><strong>{viewedPlayer.status}</strong></div>
                    <div className="student-info-grid-full"><span>{t('group')}</span><strong>{getPlayerGroups(viewedPlayer) || t('unassigned')}</strong></div>
                    <div><span>{t('parent')}</span><strong>{viewedPlayer.parentId?.name || t('unknown')}</strong></div>
                    <div><span>{t('parentPhone')}</span><strong>{viewedPlayer.parentPhone || t('notSet')}</strong></div>
                    <div><span>{t('startDate')}</span><strong>{viewedPlayer.startDate?.split('T')[0] || t('notSet')}</strong></div>
                    <div><span>{t('endDate')}</span><strong>{viewedPlayer.endDate?.split('T')[0] || t('notSet')}</strong></div>
                    <div><span>{t('package')}</span><strong>{viewedPlayer.packageName || t('notSet')}</strong></div>
                    <div><span>{t('classes')}</span><strong>{viewedPlayer.packageClasses || t('notSet')}</strong></div>
                    <div><span>{t('hours')}</span><strong>{viewedPlayer.packageHours || t('notSet')}</strong></div>
                    <div><span>{t('payment')}</span><strong>{formatCurrency(viewedPlayer.payment || 0)}</strong></div>
                    <div><span>Total Paid</span><strong>{formatCurrency(viewedPlayerTotalPaid)}</strong></div>
                    <div className="student-info-grid-full"><span>{t('note')}</span><strong>{viewedPlayer.note || t('notSet')}</strong></div>
                  </div>

                  <div className="student-history expired-player-attendance-history">
                    <h3>Attendance History</h3>
                    <div className="student-history-list">
                      {viewedPlayerAttendance.length ? viewedPlayerAttendance.map((record) => (
                        <div className="student-history-row" key={record._id}>
                          <span>{new Date(record.date).toLocaleDateString()}</span>
                          <strong>{record.status}</strong>
                          <span>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}</span>
                        </div>
                      )) : <p className="empty-state">No attendance history found for the last 3 months.</p>}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
