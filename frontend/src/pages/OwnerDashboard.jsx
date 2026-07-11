import { useEffect, useMemo, useState } from 'react';
import { fetchTodayAttendance } from '../services/attendance.js';
import { fetchGroups, fetchGroupPlayers } from '../services/groups.js';
import { fetchPayments } from '../services/payments.js';
import { fetchPlayers } from '../services/players.js';

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US');

const getDateInputValue = (date = new Date()) => {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPaymentMonthKey = (date) => {
  if (!date) return 'undated';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return 'undated';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
};

const getPlayerSubscriptionDate = (player) => player?.startDate || player?.currentSubscriptionStartedAt || null;

const getEntityId = (value) => String(value?._id || value || '');
const getAttendanceRecordKey = (playerId, groupId) => `${getEntityId(playerId)}:${getEntityId(groupId)}`;

const getPlayerGroups = (player) => {
  const groups = player?.groupIds?.length ? player.groupIds : [player?.groupId].filter(Boolean);
  return groups.map((group) => group?.name).filter(Boolean).join(', ');
};

const getPackageName = (player) => {
  if (player?.packageClasses && player?.packageHours) {
    return `${player.packageClasses} classes (${player.packageHours} hours)`;
  }
  if (player?.packageClasses) return `${player.packageClasses} classes`;
  return player?.packageName && player.packageName !== 'custom' ? player.packageName : '-';
};

const getParentName = (player) => player?.parentId?.name || player?.parentName || '-';
const getParentPhone = (player) => player?.parentId?.phone || player?.parentPhone || '-';
const isPlayerVisibleInAttendance = (player) => !player?.isDeleted && player?.status !== 'left';
const formatGroupTime = (group) => [group.startTime, group.endTime].filter(Boolean).join(' - ');

const OwnerDashboard = () => {
  const [players, setPlayers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [groupColumns, setGroupColumns] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(getPaymentMonthKey(new Date()));
  const [selectedSummaryGroup, setSelectedSummaryGroup] = useState(null);
  const [hoveredSummaryGroup, setHoveredSummaryGroup] = useState(null);
  const [showSubscriptionDetails, setShowSubscriptionDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const today = getDateInputValue();

  const loadOwnerDashboard = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [playerRows, paymentRows, groups, todayRecords] = await Promise.all([
        fetchPlayers({ fresh: Date.now() }),
        fetchPayments({ fresh: Date.now() }),
        fetchGroups({ force: true }),
        fetchTodayAttendance({ date: today }, { force: true })
      ]);
      const recordsByPlayerAndGroupId = new Map();
      todayRecords.forEach((record) => {
        recordsByPlayerAndGroupId.set(getAttendanceRecordKey(record.playerId, record.groupId), record);
      });
      const groupsWithPlayers = await Promise.all(groups.map(async (group) => {
        const groupPlayers = (await fetchGroupPlayers(group._id, { force: true }))
          .filter(isPlayerVisibleInAttendance)
          .map((player) => ({
            ...player,
            todayAttendance: recordsByPlayerAndGroupId.get(getAttendanceRecordKey(player._id, group._id)) || null
          }));

        return {
          ...group,
          players: groupPlayers,
          markedCount: groupPlayers.filter((player) => Boolean(player.todayAttendance)).length,
          presentCount: groupPlayers.filter((player) => player.todayAttendance?.status === 'present').length,
          color: group.color || '#c83fcb'
        };
      }));

      setPlayers(playerRows);
      setPayments(paymentRows);
      setGroupColumns(groupsWithPlayers);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load owner dashboard.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOwnerDashboard();
  }, []);

  const monthOptions = useMemo(() => {
    const months = players
      .map((player) => getPaymentMonthKey(getPlayerSubscriptionDate(player)))
      .filter((month) => month !== 'undated');
    const uniqueMonths = [...new Set(months)];
    if (!uniqueMonths.includes(selectedMonth)) uniqueMonths.push(selectedMonth);
    return uniqueMonths.sort().reverse();
  }, [players, selectedMonth]);

  const newSubscriptionRows = useMemo(() => {
    return players
      .filter((player) => getPaymentMonthKey(getPlayerSubscriptionDate(player)) === selectedMonth)
      .map((player) => {
        const subscriptionStart = getPlayerSubscriptionDate(player);
        const subscriptionTime = new Date(subscriptionStart || 0).getTime();
        const expectedAmount = Number(player.payment || 0);
        const paidAmount = payments
          .filter((payment) => String(payment.playerId?._id || payment.playerId) === String(player._id))
          .filter((payment) => {
            if (!subscriptionStart) return true;
            const paymentTime = new Date(payment.createdAt || payment.paymentDate || 0).getTime();
            return !Number.isNaN(paymentTime) && !Number.isNaN(subscriptionTime) && paymentTime >= subscriptionTime;
          })
          .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);

        return {
          player,
          subscriptionStart,
          expectedAmount,
          paidAmount,
          remainingAmount: Math.max(0, expectedAmount - paidAmount)
        };
      })
      .sort((first, second) => new Date(second.subscriptionStart || 0) - new Date(first.subscriptionStart || 0));
  }, [players, payments, selectedMonth]);

  const newSubscriptionSummary = useMemo(() => {
    return newSubscriptionRows.reduce((summary, row) => ({
      count: summary.count + 1,
      expectedAmount: summary.expectedAmount + row.expectedAmount,
      paidAmount: summary.paidAmount + row.paidAmount,
      remainingAmount: summary.remainingAmount + row.remainingAmount
    }), {
      count: 0,
      expectedAmount: 0,
      paidAmount: 0,
      remainingAmount: 0
    });
  }, [newSubscriptionRows]);

  const newSubscriptionCollectionRate = newSubscriptionSummary.expectedAmount
    ? Math.min(100, Math.round((newSubscriptionSummary.paidAmount / newSubscriptionSummary.expectedAmount) * 100))
    : 0;

  const attendedGroups = groupColumns.filter((group) => group.markedCount > 0);
  const presentGroups = attendedGroups.filter((group) => group.presentCount > 0);
  const totalPresent = presentGroups.reduce((sum, group) => sum + group.presentCount, 0);
  const donutRadius = 46;
  const donutStrokeWidth = 14;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutOffset = 0;
  const donutSegments = presentGroups.map((group) => {
    const segmentLength = totalPresent ? (group.presentCount / totalPresent) * donutCircumference : 0;
    const startOffset = donutOffset;
    const startAngle = (startOffset / donutCircumference) * Math.PI * 2;
    const segment = {
      ...group,
      dashLength: Math.max(0, segmentLength),
      dashOffset: -startOffset,
      capX: 60 + donutRadius * Math.cos(startAngle),
      capY: 60 + donutRadius * Math.sin(startAngle)
    };
    donutOffset += segmentLength;
    return segment;
  });

  return (
    <main className="owner-dashboard-page">
      <section className="owner-dashboard-header">
        <div>
          <p>Warriors Gymnastics</p>
          <h1>Owner Overview</h1>
        </div>
        <div className="owner-dashboard-actions">
          <span>Private link</span>
          <button type="button" className="btn-secondary" onClick={loadOwnerDashboard} disabled={isLoading}>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      {error && <p className="alert-error">{error}</p>}

      <section className="owner-dashboard-grid">
        <div className="owner-panel owner-subscriptions-panel">
          <div className="owner-panel-header">
            <div>
              <span>New Subscriptions</span>
              <h2>Monthly subscription summary</h2>
            </div>
            <div className="owner-panel-tools">
              <strong>{newSubscriptionSummary.count} this month</strong>
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                {monthOptions.map((month) => <option key={month} value={month}>{month}</option>)}
              </select>
            </div>
          </div>

          <div className="new-subscription-dashboard owner-new-subscription-dashboard">
            <button className="new-subscription-hero-card owner-subscription-main-card" type="button" onClick={() => setShowSubscriptionDetails(true)}>
              <div>
                <span>Expected to collect</span>
                <strong>{formatMoney(newSubscriptionSummary.expectedAmount)}</strong>
                <small>{selectedMonth} subscription pipeline</small>
              </div>
              <div className="new-subscription-progress">
                <div>
                  <span>Collected</span>
                  <strong>{newSubscriptionCollectionRate}%</strong>
                </div>
                <i>
                  <b style={{ width: `${newSubscriptionCollectionRate}%` }} />
                </i>
              </div>
            </button>

            <div className="new-subscription-side-grid">
              <button className="new-subscription-summary-card" type="button" onClick={() => setShowSubscriptionDetails(true)}>
                <span>New subscriptions</span>
                <strong>{newSubscriptionSummary.count}</strong>
              </button>
              <div className="new-subscription-summary-card is-collected">
                <span>Collected</span>
                <strong>{formatMoney(newSubscriptionSummary.paidAmount)}</strong>
              </div>
              <div className="new-subscription-summary-card is-remaining">
                <span>Remaining</span>
                <strong>{formatMoney(newSubscriptionSummary.remainingAmount)}</strong>
              </div>
            </div>
          </div>

          <div className="owner-subscription-footer">
            <span>Click the cards to view the new subscription details.</span>
            <button type="button" className="btn-primary" onClick={() => setShowSubscriptionDetails(true)}>View Details</button>
          </div>
        </div>

        <div className="owner-panel owner-attendance-panel">
          <div className="owner-panel-header">
            <div>
              <span>Attendance</span>
              <h2>Today present circle</h2>
            </div>
            <strong>{today}</strong>
          </div>

          <div className="attendance-summary-card owner-attendance-summary" aria-label="Attendance summary">
            <div className="attendance-donut">
              <svg viewBox="0 0 120 120" role="img">
                <circle className="attendance-donut-track" cx="60" cy="60" r={donutRadius} />
                {donutSegments.map((group) => (
                  <circle
                    className="attendance-donut-segment"
                    cx="60"
                    cy="60"
                    key={group._id}
                    r={donutRadius}
                    stroke={group.color}
                    strokeDasharray={`${group.dashLength} ${donutCircumference}`}
                    strokeDashoffset={group.dashOffset}
                    onMouseEnter={() => setHoveredSummaryGroup(group)}
                    onMouseLeave={() => setHoveredSummaryGroup(null)}
                    onClick={() => setSelectedSummaryGroup(group)}
                  />
                ))}
                {donutSegments.map((group) => (
                  <circle
                    className="attendance-donut-cap"
                    cx={group.capX}
                    cy={group.capY}
                    fill={group.color}
                    key={`${group._id}-cap`}
                    r={donutStrokeWidth / 2}
                    onMouseEnter={() => setHoveredSummaryGroup(group)}
                    onMouseLeave={() => setHoveredSummaryGroup(null)}
                    onClick={() => setSelectedSummaryGroup(group)}
                  />
                ))}
              </svg>
              <div className="attendance-donut-center">
                <strong>{totalPresent}</strong>
                <span>Total</span>
              </div>
              {hoveredSummaryGroup && (
                <div className="attendance-donut-tooltip">
                  <strong>{hoveredSummaryGroup.name}</strong>
                  <span>{hoveredSummaryGroup.presentCount}/{hoveredSummaryGroup.players.length}</span>
                  <small>Click for details</small>
                </div>
              )}
            </div>
            <div className="attendance-summary-legend">
              {attendedGroups.length ? attendedGroups.map((group) => (
                <span key={group._id} onClick={() => setSelectedSummaryGroup(group)}>
                  <i style={{ background: group.color }} />
                  {group.presentCount}/{group.players.length}
                </span>
              )) : <span><i />0/0</span>}
            </div>
          </div>
        </div>
      </section>

      {showSubscriptionDetails && (
        <div className="student-modal-backdrop" role="presentation" onClick={() => setShowSubscriptionDetails(false)}>
          <section className="student-modal owner-subscription-modal" role="dialog" aria-modal="true" aria-label="New subscription details" onClick={(event) => event.stopPropagation()}>
            <div className="student-modal-header">
              <div>
                <h2>New subscription details</h2>
                <p>{selectedMonth}: {newSubscriptionSummary.count} records / expected {formatMoney(newSubscriptionSummary.expectedAmount)}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setShowSubscriptionDetails(false)}>Close</button>
            </div>
            <div className="owner-subscription-detail-summary">
              <span>Collected <strong>{formatMoney(newSubscriptionSummary.paidAmount)}</strong></span>
              <span>Remaining <strong>{formatMoney(newSubscriptionSummary.remainingAmount)}</strong></span>
            </div>
            <div className="owner-table-wrap">
              <table className="data-table owner-subscription-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Parent</th>
                    <th>Phone</th>
                    <th>Start Date</th>
                    <th>Group</th>
                    <th>Package</th>
                    <th>Expected</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {newSubscriptionRows.length ? newSubscriptionRows.map((row) => (
                    <tr key={row.player._id}>
                      <td>{row.player.fullName}</td>
                      <td>{getParentName(row.player)}</td>
                      <td>{getParentPhone(row.player)}</td>
                      <td>{row.subscriptionStart ? row.subscriptionStart.split('T')[0] : '-'}</td>
                      <td>{getPlayerGroups(row.player) || '-'}</td>
                      <td>{getPackageName(row.player)}</td>
                      <td>{formatMoney(row.expectedAmount)}</td>
                      <td>{formatMoney(row.paidAmount)}</td>
                      <td>{formatMoney(row.remainingAmount)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="9">No new subscriptions in this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {selectedSummaryGroup && (
        <div className="student-modal-backdrop" role="presentation" onClick={() => setSelectedSummaryGroup(null)}>
          <section className="student-modal group-details-modal" role="dialog" aria-modal="true" aria-label="Group details" onClick={(event) => event.stopPropagation()}>
            <div className="student-modal-header">
              <div>
                <h2>{selectedSummaryGroup.name}</h2>
                <p>Schedule: {selectedSummaryGroup.days?.join(', ') || 'No days set'} {formatGroupTime(selectedSummaryGroup) && `| ${formatGroupTime(selectedSummaryGroup)}`}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setSelectedSummaryGroup(null)}>Close</button>
            </div>
            <div className="group-details-summary">
              <span><i style={{ background: selectedSummaryGroup.color }} />{selectedSummaryGroup.presentCount}/{selectedSummaryGroup.players.length}</span>
            </div>
            <div className="student-history-list">
              {selectedSummaryGroup.players.length ? selectedSummaryGroup.players.map((player) => (
                <div className="student-history-row" key={player._id}>
                  <span>{player.fullName}</span>
                  <strong>{player.todayAttendance?.status || 'Not set'}</strong>
                  <span>{player.parentId?.name || 'No parent'}</span>
                </div>
              )) : <p className="empty-state">No students in this group.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default OwnerDashboard;
