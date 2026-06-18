import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { fetchDashboard } from '../services/reports.js';
import { fetchGroups } from '../services/groups.js';
import { fetchPlayers } from '../services/players.js';
import { createWaitingListEntry, deleteWaitingListEntry, fetchWaitingList } from '../services/waitingList.js';
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

const getLocalDateOnly = (date = new Date()) => {
  const currentDate = new Date(date);
  currentDate.setHours(0, 0, 0, 0);
  return currentDate;
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
  const [stats, setStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [expiredAlertPlayers, setExpiredAlertPlayers] = useState([]);
  const [expiredAlertReadIds, setExpiredAlertReadIds] = useState(() => readExpiredAlertIds());
  const [isExpiredAlertOpen, setIsExpiredAlertOpen] = useState(false);
  const [waitingForm, setWaitingForm] = useState(initialWaitingForm);
  const [isWaitingFormOpen, setIsWaitingFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [waitingMessage, setWaitingMessage] = useState('');
  const { language, t } = useLanguage();
  const { token } = useAuth();
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
      subtitle: 'Players with one week or less before their end date.',
      empty: 'No players are close to their end date.',
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
    setStats(null);

    fetchDashboard()
      .then((data) => {
        if (isMounted) setStats(data);
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setError(err.response?.data?.message || 'Unable to load dashboard data. Please refresh or try again.');
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
      setExpiredAlertPlayers(getExpiredAlertPlayers(playerRows));
    } catch (err) {
      setWaitingMessage(err.response?.data?.message || copy.unableLoad);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadWaitingListData();
  }, [token]);

  const handleWaitingFormChange = (event) => {
    const { name, value } = event.target;
    setWaitingForm((current) => ({ ...current, [name]: value }));
  };

  const handleWaitingSubmit = async (event) => {
    event.preventDefault();
    setWaitingMessage('');

    try {
      const entry = await createWaitingListEntry(waitingForm);
      setWaitingList((current) => [entry, ...current]);
      setWaitingForm(initialWaitingForm);
      setIsWaitingFormOpen(false);
      setWaitingMessage(copy.added);
    } catch (err) {
      setWaitingMessage(err.response?.data?.message || copy.unableSave);
    }
  };

  const handleWaitingDelete = async (id) => {
    try {
      await deleteWaitingListEntry(id);
      setWaitingList((current) => current.filter((entry) => entry._id !== id));
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
    .filter((player) => player.status === 'active' && player.endDate && player.daysUntilEnd >= 0 && player.daysUntilEnd <= 7)
    .sort((first, second) => first.daysUntilEnd - second.daysUntilEnd || first.fullName.localeCompare(second.fullName));

  const formatDate = (dateValue) => dateValue ? new Date(dateValue).toLocaleDateString() : '-';

  const unreadExpiredAlertCount = expiredAlertPlayers.filter((player) => !expiredAlertReadIds.includes(getExpiredAlertKey(player))).length;

  const openExpiredAlert = () => {
    const currentIds = expiredAlertPlayers.map(getExpiredAlertKey);
    const nextReadIds = [...new Set([...expiredAlertReadIds, ...currentIds])];
    writeExpiredAlertIds(nextReadIds);
    setExpiredAlertReadIds(nextReadIds);
    setIsExpiredAlertOpen(true);
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

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('adminDashboard')}</h1>
          <button
            className="waiting-list-button"
            type="button"
            onClick={() => setIsWaitingFormOpen(true)}
          >
            <span>{copy.addWaiting}</span>
          </button>
        </div>
        {error && <p className="alert-error">{error}</p>}
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
        </div>

        {isWaitingFormOpen && (
          <div className="student-modal-backdrop" role="presentation" onClick={() => setIsWaitingFormOpen(false)}>
            <section className="student-modal waiting-list-modal" role="dialog" aria-modal="true" aria-label={copy.waitingList} onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div className="waiting-list-heading">
                  <div>
                    <h2>{copy.waitingList}</h2>
                    <p>{copy.waitingSubtitle}</p>
                  </div>
                  <strong>{waitingList.length}</strong>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setIsWaitingFormOpen(false)}>{t('close')}</button>
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
                <button className="btn-primary" type="submit">{copy.save}</button>
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
                            <a className="btn-secondary" href={`tel:${entry.parentPhone}`}>{copy.call}</a>
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
          <div className="student-modal-backdrop" role="presentation" onClick={() => setIsExpiredAlertOpen(false)}>
            <section className="student-modal expired-alert-modal" role="dialog" aria-modal="true" aria-label={expiredCopy.title} onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div className="expired-alert-heading">
                  <div>
                    <h2>{expiredCopy.title}</h2>
                    <p>{expiredCopy.subtitle}</p>
                  </div>
                  <strong>{expiredAlertPlayers.length}</strong>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setIsExpiredAlertOpen(false)}>{t('close')}</button>
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
                          <button className="expired-alert-player-link" type="button" onClick={() => handleExpiredPlayerNotification(player)}>
                            {player.fullName}
                          </button>
                        </td>
                        <td>{player.parentId?.name || t('notSet')}</td>
                        <td>{formatDate(player.endDate)}</td>
                        <td>{player.daysUntilEnd}</td>
                        <td>
                          <button className="btn-secondary" type="button" onClick={() => handleExpiredPlayerNotification(player)}>
                            {expiredCopy.sendMessage}
                          </button>
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
      </main>
    </div>
  );
};

export default AdminDashboard;
