import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchCoach } from '../services/coaches.js';

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
                  </div>
                  {history.map((row) => (
                    <div className={`coach-history-row status-${row.status}`} key={row._id}>
                      <span>{formatDate(row.date)}</span>
                      <strong>{statusLabel(row.status)}</strong>
                      <span>{formatTime(row.arrivedAt)}</span>
                      <span>{formatTime(row.leftAt)}</span>
                      <span>{formatTime(row.absentAt)}</span>
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
    </div>
  );
};

export default CoachProfilePage;
