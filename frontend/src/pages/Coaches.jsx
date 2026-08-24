import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchCoaches, createCoach, updateCoach, deleteCoach, updateCoachAttendance } from '../services/coaches.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const initialForm = { name: '', email: '', phone: '', specialization: '' };

const getDateInputValue = (date = new Date()) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getCoachStatusLabel = (attendance) => {
  if (!attendance) return 'Not set';
  if (attendance.status === 'left') return 'Left';
  if (attendance.status === 'absent') return 'Absent';
  return 'Present';
};

const CoachesPage = () => {
  const [coaches, setCoaches] = useState([]);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(getDateInputValue());
  const [pendingCoachAction, setPendingCoachAction] = useState('');
  const { t } = useLanguage();

  const loadCoaches = async () => {
    try {
      setCoaches(await fetchCoaches({ date: selectedDate, fresh: Date.now() }));
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load coaches.');
    }
  };

  useEffect(() => {
    loadCoaches();
  }, [selectedDate]);

  const resetForm = () => {
    setSelectedCoach(null);
    setForm(initialForm);
    setMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    try {
      if (selectedCoach) {
        await updateCoach(selectedCoach._id, form);
        setMessage('Coach updated successfully.');
      } else {
        await createCoach(form);
        setMessage('Coach added successfully.');
      }
      resetForm();
      await loadCoaches();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save coach.');
    }
  };

  const handleEdit = (coach) => {
    setSelectedCoach(coach);
    setForm({
      name: coach.name || '',
      email: coach.userId?.email || '',
      phone: coach.phone || '',
      specialization: coach.specialization || ''
    });
    setMessage('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete coach?')) return;
    setMessage('');
    try {
      await deleteCoach(id);
      setCoaches((current) => current.filter((coach) => coach._id !== id));
      setMessage('Coach deleted successfully.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to delete coach.');
    }
  };

  const handleAttendanceAction = async (coach, action) => {
    const actionKey = `${coach._id}:${action}`;
    if (pendingCoachAction) return;
    setMessage('');
    setPendingCoachAction(actionKey);
    try {
      const attendance = await updateCoachAttendance(coach._id, { action, date: selectedDate });
      setCoaches((current) => current.map((item) => (
        item._id === coach._id ? { ...item, todayAttendance: attendance } : item
      )));
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update coach attendance.');
    } finally {
      setPendingCoachAction('');
    }
  };

  const filteredCoaches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return coaches;
    return coaches.filter((coach) => [
      coach.name,
      coach.userId?.email,
      coach.phone,
      coach.specialization,
      getCoachStatusLabel(coach.todayAttendance)
    ].join(' ').toLowerCase().includes(query));
  }, [coaches, search]);

  const attendanceTotals = useMemo(() => ({
    present: coaches.filter((coach) => coach.todayAttendance?.status === 'present' || coach.todayAttendance?.status === 'left').length,
    left: coaches.filter((coach) => coach.todayAttendance?.status === 'left').length,
    absent: coaches.filter((coach) => coach.todayAttendance?.status === 'absent').length
  }), [coaches]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content coaches-page">
        <div className="page-header coaches-header">
          <div>
            <p className="payments-kicker">Warriors Gymnastics</p>
            <h1>{t('coaches')}</h1>
          </div>
          <label className="coach-date-filter">
            <span>Date</span>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value || getDateInputValue())} />
          </label>
        </div>

        {message && <p className="alert-info">{message}</p>}

        <section className="coach-summary-row">
          <div>
            <span>Total coaches</span>
            <strong>{coaches.length}</strong>
          </div>
          <div>
            <span>Came today</span>
            <strong>{attendanceTotals.present}</strong>
          </div>
          <div>
            <span>Left</span>
            <strong>{attendanceTotals.left}</strong>
          </div>
          <div>
            <span>Absent</span>
            <strong>{attendanceTotals.absent}</strong>
          </div>
        </section>

        <div className="grid-two coaches-workspace">
          <section className="form-card coach-form-card">
            <h2>{selectedCoach ? t('editCoach') : t('addCoach')}</h2>
            <form onSubmit={handleSubmit}>
              <label>{t('name')}</label>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <label>{t('emailOptional')}</label>
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <label>{t('phone')}</label>
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <label>{t('specialization')}</label>
              <input value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })} />
              <div className="coach-form-actions">
                <button className="btn-primary" type="submit">{selectedCoach ? t('update') : t('add')}</button>
                {selectedCoach && <button type="button" className="btn-secondary" onClick={resetForm}>{t('cancel')}</button>}
              </div>
            </form>
          </section>

          <section className="table-card coach-attendance-card">
            <div className="table-toolbar">
              <div>
                <h2>Coach Attendance</h2>
                <p className="table-filter-count">{filteredCoaches.length} shown</p>
              </div>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search coaches..." />
              </label>
            </div>
            <div className="coach-card-grid">
              {filteredCoaches.length ? filteredCoaches.map((coach) => {
                const attendance = coach.todayAttendance;
                const status = getCoachStatusLabel(attendance);
                return (
                  <article className={`coach-attendance-item status-${attendance?.status || 'empty'}`} key={coach._id}>
                    <div className="coach-card-top">
                      <div>
                        <h3>{coach.name}</h3>
                        <p>{coach.specialization || 'Coach'}</p>
                      </div>
                      <span>{status}</span>
                    </div>
                    <div className="coach-time-grid">
                      <div>
                        <small>Came</small>
                        <strong>{formatTime(attendance?.arrivedAt)}</strong>
                      </div>
                      <div>
                        <small>Left</small>
                        <strong>{formatTime(attendance?.leftAt)}</strong>
                      </div>
                      <div>
                        <small>Absent</small>
                        <strong>{formatTime(attendance?.absentAt)}</strong>
                      </div>
                    </div>
                    <div className="coach-card-actions">
                      <button type="button" className="btn-present" disabled={Boolean(pendingCoachAction)} onClick={() => handleAttendanceAction(coach, 'arrived')}>
                        {pendingCoachAction === `${coach._id}:arrived` ? 'Saving...' : 'Came'}
                      </button>
                      <button type="button" className="btn-secondary" disabled={Boolean(pendingCoachAction)} onClick={() => handleAttendanceAction(coach, 'left')}>
                        {pendingCoachAction === `${coach._id}:left` ? 'Saving...' : 'Left'}
                      </button>
                      <button type="button" className="btn-absent" disabled={Boolean(pendingCoachAction)} onClick={() => handleAttendanceAction(coach, 'absent')}>
                        {pendingCoachAction === `${coach._id}:absent` ? 'Saving...' : 'Absent'}
                      </button>
                    </div>
                    <div className="coach-admin-actions">
                      <button type="button" onClick={() => handleEdit(coach)}>{t('edit')}</button>
                      <button type="button" onClick={() => handleDelete(coach._id)}>{t('delete')}</button>
                    </div>
                  </article>
                );
              }) : (
                <p className="empty-state">{t('noCoachesAvailable')}</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default CoachesPage;
