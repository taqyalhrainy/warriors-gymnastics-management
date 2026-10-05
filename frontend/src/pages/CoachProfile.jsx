import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchCoach, updateCoachAttendance } from '../services/coaches.js';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US');
};

const formatTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const statusLabel = (status) => {
  if (status === 'left') return 'Left';
  if (status === 'absent') return 'Absent';
  if (status === 'present') return 'Present';
  return 'Not set';
};

const CoachProfilePage = () => {
  const { id } = useParams();
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  const saveNote = async (event) => {
    event.preventDefault();
    if (savingNote) return;
    setSavingNote(true);
    setNoteError('');
    try {
      const saved = await updateCoachAttendance(id, {
        action: 'note', date: editingNote.date, dayNote: noteDraft
      });
      setCoach((current) => ({ ...current, attendanceHistory: current.attendanceHistory.map((row) => (
        row._id === saved._id ? saved : row
      )) }));
      setEditingNote(null);
    } catch (error) {
      setNoteError(error.response?.data?.message || 'Unable to save day note.');
    } finally {
      setSavingNote(false);
    }
  };

  useEffect(() => {
    const loadCoach = async () => {
      setLoading(true);
      setMessage('');
      try {
        setCoach(await fetchCoach(id));
      } catch (error) {
        setMessage(error.response?.data?.message || 'Unable to load coach.');
      } finally {
        setLoading(false);
      }
    };
    loadCoach();
  }, [id]);

  const history = useMemo(() => coach?.attendanceHistory || [], [coach]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content coach-profile-page">
        <div className="page-header coaches-header">
          <div>
            <p className="payments-kicker">Warriors Gymnastics</p>
            <h1>{coach?.name || 'Coach Profile'}</h1>
          </div>
          <Link className="btn-secondary coach-back-link" to="/coaches">Back to coaches</Link>
        </div>

        {message && <p className="alert-info">{message}</p>}
        {loading ? (
          <div className="route-loading"><span className="loading-spinner" />Loading...</div>
        ) : coach && (
          <>
            <section className="coach-profile-hero">
              <div>
                <span>Coach</span>
                <strong>{coach.name}</strong>
                <p>{coach.specialization || 'No specialization set'}</p>
              </div>
              <div className="coach-profile-details">
                <article>
                  <span>Phone 1</span>
                  <strong>{coach.phone || '-'}</strong>
                </article>
                <article>
                  <span>Phone 2</span>
                  <strong>{coach.phone2 || '-'}</strong>
                </article>
                <article>
                  <span>Records</span>
                  <strong>{history.length}</strong>
                </article>
              </div>
            </section>

            <section className="table-card coach-history-card">
              <div className="table-toolbar">
                <div>
                  <h2>Attendance History</h2>
                  <p className="table-filter-count">Latest records first</p>
                </div>
              </div>
              {history.length ? (
                <div className="coach-history-table">
                  <div className="coach-history-head">
                    <span>Date</span>
                    <span>Status</span>
                    <span>Came</span>
                    <span>Left</span>
                    <span>Absent</span>
                    <span>Day note</span>
                  </div>
                  {history.map((row) => (
                    <div className={`coach-history-row status-${row.status}`} key={row._id}>
                      <span>{formatDate(row.date)}</span>
                      <strong>{statusLabel(row.status)}</strong>
                      <span>{formatTime(row.arrivedAt)}</span>
                      <span>{formatTime(row.leftAt)}</span>
                      <span>{formatTime(row.absentAt)}</span>
                      <div className="coach-history-note">
                        <span>{row.dayNote || '-'}</span>
                        <button type="button" className="btn-secondary coach-history-edit" onClick={() => {
                          setEditingNote(row);
                          setNoteDraft(row.dayNote || '');
                          setNoteError('');
                        }} aria-label={`Edit day note ${formatDate(row.date)}`}>Edit note</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No attendance records yet.</p>
              )}
            </section>
          </>
        )}
      </main>
      {editingNote && (
        <div className="student-modal-backdrop">
          <section className="student-modal coach-note-dialog" role="dialog" aria-modal="true" aria-labelledby="coach-note-title">
            <h2 id="coach-note-title">Day note - {formatDate(editingNote.date)}</h2>
            <form onSubmit={saveNote}>
              <label htmlFor="coach-history-note-input">Day note</label>
              <textarea id="coach-history-note-input" value={noteDraft} maxLength={1000} rows={5} autoFocus
                disabled={savingNote} onChange={(event) => setNoteDraft(event.target.value)} />
              {noteError && <p role="alert" className="alert-error">{noteError}</p>}
              <div className="coach-note-actions">
                <button className="btn-primary" type="submit" disabled={savingNote}>{savingNote ? 'Saving...' : 'Save note'}</button>
                <button className="btn-secondary" type="button" disabled={savingNote} onClick={() => setEditingNote(null)}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default CoachProfilePage;
