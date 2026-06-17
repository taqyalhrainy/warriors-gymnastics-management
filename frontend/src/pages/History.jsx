import { useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchHistorySnapshot } from '../services/history.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const padTime = (value) => String(value).padStart(2, '0');

const getNowParts = () => {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${padTime(now.getMonth() + 1)}-${padTime(now.getDate())}`,
    time: `${padTime(now.getHours())}:${padTime(now.getMinutes())}`
  };
};

const HistoryPage = () => {
  const nowParts = useMemo(() => getNowParts(), []);
  const [entityType, setEntityType] = useState('player');
  const [selectedDate, setSelectedDate] = useState(nowParts.date);
  const [selectedTime, setSelectedTime] = useState(nowParts.time);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [availableSince, setAvailableSince] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useLanguage();

  const isTodaySelected = selectedDate === nowParts.date;

  const effectiveDateTime = useMemo(() => {
    if (!selectedDate) {
      return '';
    }

    const timeValue = isTodaySelected ? (selectedTime || nowParts.time) : '23:59';
    return `${selectedDate}T${timeValue}:59`;
  }, [isTodaySelected, nowParts.time, selectedDate, selectedTime]);

  const handleLoad = async () => {
    if (!effectiveDateTime) {
      setMessage('Choose a date first.');
      return;
    }

    try {
      setIsLoading(true);
      setMessage('');
      const result = await fetchHistorySnapshot({
        entityType,
        at: new Date(effectiveDateTime).toISOString()
      });
      setRows(result.rows || []);
      setRequestedAt(result.asOf);
      setAvailableSince(result.availableSince || '');
      setMessage(`Loaded ${result.count || 0} ${entityType === 'player' ? 'players' : entityType === 'payment' ? 'payments' : 'attendance records'} from the selected moment.`);
    } catch (error) {
      setRows([]);
      setRequestedAt('');
      setAvailableSince('');
      setMessage(error.response?.data?.message || 'Unable to load history snapshot.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRows = rows.filter((row) => {
    const haystack = entityType === 'player'
      ? [
        row.fullName,
        row.parentName,
        row.parentPhone,
        row.programName,
        row.coachName,
        row.groupNames?.join(', '),
        row.status,
        row.packageName,
        row.level
      ]
      : [
        row.playerName,
        row.parentName,
        row.groupName,
        row.packageName,
        row.paymentMethod,
        row.notes,
        row.paymentDate,
        row.status,
        row.date
      ];

    return haystack.join(' ').toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <div>
            <h1>History</h1>
            <p className="page-subtitle">Review players or payments exactly as they existed at a chosen moment.</p>
          </div>
        </div>

        <div className="table-card history-controls-card">
          <div className="history-controls">
            <label>
              <span>Type</span>
              <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
                <option value="player">{t('players')}</option>
                <option value="payment">{t('payments')}</option>
                <option value="attendance">Attendance</option>
              </select>
            </label>

            <label>
              <span>{t('date')}</span>
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>

            {isTodaySelected && (
              <label>
                <span>{t('time')}</span>
                <input type="time" value={selectedTime} onChange={(event) => setSelectedTime(event.target.value)} />
              </label>
            )}

            <button type="button" className="btn-primary" onClick={handleLoad} disabled={isLoading}>
              {isLoading ? 'Loading...' : 'Load History'}
            </button>
          </div>

          <div className="history-hint-row">
            <span>
              {isTodaySelected
                ? 'Today uses the exact selected time.'
                : 'Past dates load the end-of-day snapshot for that date.'}
            </span>
            {requestedAt && <strong>{new Date(requestedAt).toLocaleString()}</strong>}
          </div>

          {availableSince && (
            <div className="history-hint-row">
              <span>History tracking started at</span>
              <strong>{new Date(availableSince).toLocaleString()}</strong>
            </div>
          )}

          {message && <p className="alert-info">{message}</p>}
        </div>

        <div className="table-card">
          <div className="table-toolbar">
            <h2>{entityType === 'player' ? 'Player Snapshot' : entityType === 'payment' ? 'Payment Snapshot' : 'Attendance Snapshot'}</h2>
            <label className="table-search">
              <span>Search</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search snapshot..." />
            </label>
          </div>

          <table className="data-table history-table">
            {entityType === 'player' ? (
              <>
                <thead>
                  <tr>
                    <th>{t('name')}</th>
                    <th>{t('parent')}</th>
                    <th>{t('parentPhone')}</th>
                    <th>{t('group')}</th>
                    <th>{t('program')}</th>
                    <th>{t('coach')}</th>
                    <th>{t('status')}</th>
                    <th>{t('package')}</th>
                    <th>{t('payment')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((row) => (
                    <tr key={row._id}>
                      <td>{row.fullName}</td>
                      <td>{row.parentName || t('unknown')}</td>
                      <td>{row.parentPhone || '-'}</td>
                      <td>{row.groupNames?.join(', ') || t('unassigned')}</td>
                      <td>{row.programName || t('notSet')}</td>
                      <td>{row.coachName || t('notSet')}</td>
                      <td>{row.status || t('notSet')}</td>
                      <td>{row.packageName || t('notSet')}</td>
                      <td>{Number(row.payment || 0).toFixed(2)}</td>
                    </tr>
                  )) : <tr><td colSpan="9">No players found for this snapshot.</td></tr>}
                </tbody>
              </>
            ) : entityType === 'payment' ? (
              <>
                <thead>
                  <tr>
                    <th>{t('player')}</th>
                    <th>{t('parent')}</th>
                    <th>{t('package')}</th>
                    <th>{t('paid')}</th>
                    <th>{t('total')}</th>
                    <th>{t('remaining')}</th>
                    <th>{t('method')}</th>
                    <th>{t('date')}</th>
                    <th>{t('notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((row) => (
                    <tr key={row._id}>
                      <td>{row.playerName || t('unknown')}</td>
                      <td>{row.parentName || t('unknown')}</td>
                      <td>{row.packageName || t('notSet')}</td>
                      <td>{Number(row.paidAmount || 0).toFixed(2)}</td>
                      <td>{Number(row.totalAmount || 0).toFixed(2)}</td>
                      <td>{Number(row.remainingAmount || 0).toFixed(2)}</td>
                      <td>{row.paymentMethod || t('notSet')}</td>
                      <td>{row.paymentDate ? new Date(row.paymentDate).toLocaleString() : '-'}</td>
                      <td>{row.notes || '-'}</td>
                    </tr>
                  )) : <tr><td colSpan="9">No payments found for this snapshot.</td></tr>}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>{t('player')}</th>
                    <th>{t('parent')}</th>
                    <th>{t('group')}</th>
                    <th>{t('package')}</th>
                    <th>{t('classes')}</th>
                    <th>{t('hours')}</th>
                    <th>{t('status')}</th>
                    <th>{t('date')}</th>
                    <th>{t('time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length ? filteredRows.map((row) => (
                    <tr key={row._id}>
                      <td>{row.playerName || t('unknown')}</td>
                      <td>{row.parentName || t('unknown')}</td>
                      <td>{row.groupName || t('unassigned')}</td>
                      <td>{row.packageName || t('notSet')}</td>
                      <td>{row.packageClasses ?? 0}</td>
                      <td>{row.packageHours ?? 0}</td>
                      <td>{row.status || t('notSet')}</td>
                      <td>{row.date ? new Date(row.date).toLocaleDateString() : '-'}</td>
                      <td>{row.checkInTime ? new Date(row.checkInTime).toLocaleTimeString() : '-'}</td>
                    </tr>
                  )) : <tr><td colSpan="9">No attendance found for this snapshot.</td></tr>}
                </tbody>
              </>
            )}
          </table>
        </div>
      </main>
    </div>
  );
};

export default HistoryPage;
