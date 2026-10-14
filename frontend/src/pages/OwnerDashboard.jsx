import { useEffect, useMemo, useRef, useState } from 'react';
import DataStatus from '../components/DataStatus.jsx';
import { useSectionLoader, canShowEmpty } from '../hooks/useSectionLoader.js';
import { fetchOwnerDateAudits, fetchOwnerSummary } from '../services/reports.js';

const NEW_SUBSCRIPTION_ALERT_READ_KEY = 'warriors-new-subscription-alert-read-ids';
const OWNER_DATE_AUDIT_READ_KEY = 'warriors-owner-date-audit-read-ids';

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

const getPlayerSubscriptionDate = (player) => player?.currentSubscriptionCreatedAt || player?.currentSubscriptionStartedAt || player?.startDate || player?.createdAt || null;

const getSortableDateTime = (...dates) => {
  for (const date of dates) {
    const time = new Date(date || 0).getTime();
    if (!Number.isNaN(time) && time > 0) return time;
  }
  return 0;
};

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
const formatGroupTime = (group) => [group.startTime, group.endTime].filter(Boolean).join(' - ');

const readNewSubscriptionAlertIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(NEW_SUBSCRIPTION_ALERT_READ_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
};

const writeNewSubscriptionAlertIds = (ids) => {
  localStorage.setItem(NEW_SUBSCRIPTION_ALERT_READ_KEY, JSON.stringify([...new Set(ids.map(String))]));
};

const getNewSubscriptionAlertKey = (row) => {
  const dateKey = row.subscriptionStart ? getDateInputValue(row.subscriptionStart) : 'undated';
  return `${row.player._id}:${dateKey}`;
};

const readOwnerDateAuditIds = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(OWNER_DATE_AUDIT_READ_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
};

const writeOwnerDateAuditIds = (ids) => {
  localStorage.setItem(OWNER_DATE_AUDIT_READ_KEY, JSON.stringify([...new Set(ids.map(String))]));
};

const formatAuditDate = (value) => value ? String(value).slice(0, 10) : 'Not set';
const formatAuditDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Amman',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true
  }).format(date);
};

const OwnerDashboard = () => {
  const { states: loadStates, load: loadSection } = useSectionLoader(['players', 'payments', 'board', 'audits']);
  const [players, setPlayers] = useState([]);
  const [groupColumns, setGroupColumns] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(getPaymentMonthKey(new Date()));
  const [selectedSummaryGroup, setSelectedSummaryGroup] = useState(null);
  const [hoveredSummaryGroup, setHoveredSummaryGroup] = useState(null);
  const [showSubscriptionDetails, setShowSubscriptionDetails] = useState(false);
  const [newSubscriptionAlertReadIds, setNewSubscriptionAlertReadIds] = useState(() => readNewSubscriptionAlertIds());
  const [highlightedNewSubscriptionIds, setHighlightedNewSubscriptionIds] = useState([]);
  const [dateAuditLogs, setDateAuditLogs] = useState([]);
  const [dateAuditReadIds, setDateAuditReadIds] = useState(() => readOwnerDateAuditIds());
  const [highlightedDateAuditIds, setHighlightedDateAuditIds] = useState([]);
  const [isDateAuditOpen, setIsDateAuditOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const dashboardLoadRequestIdRef = useRef(0);
  const today = getDateInputValue();

  const loadDateAudits = (options = {}) => loadSection(
    'audits',
    () => fetchOwnerDateAudits(options),
    (logs) => setDateAuditLogs(logs || [])
  );

  const loadOwnerDashboard = async (options = {}) => {
    const requestId = dashboardLoadRequestIdRef.current + 1;
    dashboardLoadRequestIdRef.current = requestId;
    setIsLoading(true);
    setError('');

    try {
      const summaryRequest = fetchOwnerSummary(options);
      const playersRequest = loadSection('players', () => summaryRequest, (summary) => {
        setPlayers(summary.players || []);
      });
      const paymentsRequest = loadSection('payments', () => summaryRequest, () => {});
      const boardRequest = loadSection('board', () => summaryRequest, (summary) => {
        if (requestId === dashboardLoadRequestIdRef.current) setGroupColumns(summary.board || []);
      });
      await Promise.all([playersRequest, paymentsRequest, boardRequest]);
    } catch (err) {
      if (requestId === dashboardLoadRequestIdRef.current) {
        setError(err.response?.data?.message || 'Unable to load owner dashboard.');
      }
    } finally {
      if (requestId === dashboardLoadRequestIdRef.current) {
        setIsLoading(false);
        loadDateAudits(options).catch(console.error);
      }
    }
  };

  useEffect(() => {
    loadOwnerDashboard();
  }, []);

  const newSubscriptionRows = useMemo(() => {
    return players
      .filter((player) => getPaymentMonthKey(getPlayerSubscriptionDate(player)) === selectedMonth)
      .map((player) => {
        const subscriptionStart = getPlayerSubscriptionDate(player);
        const expectedAmount = Number(player.currentSubscriptionExpectedAmount ?? player.payment ?? 0);
        const paidAmount = Number(player.currentSubscriptionPaidAmount || 0);

        return {
          player,
          subscriptionStart,
          expectedAmount,
          paidAmount,
          remainingAmount: Number(player.currentSubscriptionRemainingAmount ?? Math.max(0, expectedAmount - paidAmount))
        };
      })
      .sort((first, second) => {
        const secondTime = getSortableDateTime(second.subscriptionStart, second.player.createdAt);
        const firstTime = getSortableDateTime(first.subscriptionStart, first.player.createdAt);
        return secondTime - firstTime || first.player.fullName.localeCompare(second.player.fullName);
      });
  }, [players, selectedMonth]);

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
  const unreadNewSubscriptionCount = newSubscriptionRows.filter((row) => !newSubscriptionAlertReadIds.includes(getNewSubscriptionAlertKey(row))).length;
  const unreadDateAuditCount = dateAuditLogs.filter((entry) => !dateAuditReadIds.includes(String(entry._id))).length;

  const openSubscriptionDetails = () => {
    const currentIds = newSubscriptionRows.map(getNewSubscriptionAlertKey);
    const unreadIds = currentIds.filter((id) => !newSubscriptionAlertReadIds.includes(id));
    const nextReadIds = [...new Set([...newSubscriptionAlertReadIds, ...currentIds])];
    setHighlightedNewSubscriptionIds(unreadIds);
    writeNewSubscriptionAlertIds(nextReadIds);
    setNewSubscriptionAlertReadIds(nextReadIds);
    setShowSubscriptionDetails(true);
  };

  const closeSubscriptionDetails = () => {
    setShowSubscriptionDetails(false);
    setHighlightedNewSubscriptionIds([]);
  };

  const openDateAudit = () => {
    const currentIds = dateAuditLogs.map((entry) => String(entry._id));
    const unreadIds = currentIds.filter((id) => !dateAuditReadIds.includes(id));
    const nextReadIds = [...new Set([...dateAuditReadIds, ...currentIds])];
    setHighlightedDateAuditIds(unreadIds);
    writeOwnerDateAuditIds(nextReadIds);
    setDateAuditReadIds(nextReadIds);
    setIsDateAuditOpen(true);
  };

  const closeDateAudit = () => {
    setIsDateAuditOpen(false);
    setHighlightedDateAuditIds([]);
  };

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
          <button
            type="button"
            className={`expired-alert-button owner-new-subscription-alert owner-date-audit-button${unreadDateAuditCount ? '' : ' is-read'}`}
            onClick={openDateAudit}
          >
            <span>Audit Logs</span>
            {unreadDateAuditCount > 0 && <strong>{unreadDateAuditCount}</strong>}
          </button>
          <button type="button" className="btn-secondary" onClick={() => loadOwnerDashboard({ force: true })} disabled={isLoading}>
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
              <button
                type="button"
                className={`expired-alert-button owner-new-subscription-alert${unreadNewSubscriptionCount ? '' : ' is-read'}`}
                onClick={openSubscriptionDetails}
              >
                <span>New Subscription Alert</span>
                {unreadNewSubscriptionCount > 0 && <strong>{unreadNewSubscriptionCount}</strong>}
              </button>
              <label className="owner-month-picker">
                <span>Month</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value || getPaymentMonthKey(new Date()))}
                />
              </label>
            </div>
          </div>

          <div className="new-subscription-dashboard owner-new-subscription-dashboard">
            <button className="new-subscription-hero-card owner-subscription-main-card" type="button" onClick={openSubscriptionDetails}>
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
              <button className="new-subscription-summary-card" type="button" onClick={openSubscriptionDetails}>
                <span>New subscriptions</span>
                <strong>{canShowEmpty(loadStates.players) ? newSubscriptionSummary.count : <DataStatus state={loadStates.players} />}</strong>
              </button>
              <div className="new-subscription-summary-card is-collected">
                <span>Collected</span>
                <strong>{canShowEmpty(loadStates.players) && canShowEmpty(loadStates.payments) ? formatMoney(newSubscriptionSummary.paidAmount) : <DataStatus state={!canShowEmpty(loadStates.players) ? loadStates.players : loadStates.payments} />}</strong>
              </div>
              <div className="new-subscription-summary-card is-remaining">
                <span>Remaining</span>
                <strong>{canShowEmpty(loadStates.players) && canShowEmpty(loadStates.payments) ? formatMoney(newSubscriptionSummary.remainingAmount) : <DataStatus state={!canShowEmpty(loadStates.players) ? loadStates.players : loadStates.payments} />}</strong>
              </div>
            </div>
          </div>

          <div className="owner-subscription-footer">
            <span>Click the cards to view the new subscription details.</span>
            <button type="button" className="btn-primary" onClick={openSubscriptionDetails}>View Details</button>
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
            <DataStatus state={loadStates.board} />
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
        <div className="student-modal-backdrop" role="presentation" onClick={closeSubscriptionDetails}>
          <section className="student-modal owner-subscription-modal" role="dialog" aria-modal="true" aria-label="New subscription details" onClick={(event) => event.stopPropagation()}>
            <div className="student-modal-header">
              <div>
                <h2>New subscription details</h2>
                <p>{selectedMonth}: {newSubscriptionSummary.count} records / expected {formatMoney(newSubscriptionSummary.expectedAmount)}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={closeSubscriptionDetails}>Close</button>
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
                  {!canShowEmpty(loadStates.players) ? <tr><td colSpan="9"><DataStatus state={loadStates.players} /></td></tr> : newSubscriptionRows.length ? newSubscriptionRows.map((row) => {
                    const isNewAlert = highlightedNewSubscriptionIds.includes(getNewSubscriptionAlertKey(row));
                    return (
                      <tr className={isNewAlert ? 'owner-new-subscription-row is-new-alert' : 'owner-new-subscription-row'} key={row.player._id}>
                        <td>
                          <span>
                            <i
                              className={`owner-subscription-payment-dot ${row.player.currentSubscriptionPaymentConfirmedAt ? 'is-paid' : 'is-unpaid'}`}
                              aria-label={row.player.currentSubscriptionPaymentConfirmedAt ? 'Payment recorded on subscription day' : 'No payment recorded on subscription day'}
                              title={row.player.currentSubscriptionPaymentConfirmedAt ? 'Payment recorded on subscription day' : 'No payment recorded on subscription day'}
                            />
                            {row.player.fullName}
                          </span>
                        </td>
                      <td>{getParentName(row.player)}</td>
                      <td>{getParentPhone(row.player)}</td>
                      <td>{row.subscriptionStart ? row.subscriptionStart.split('T')[0] : '-'}</td>
                      <td>{getPlayerGroups(row.player) || '-'}</td>
                      <td>{getPackageName(row.player)}</td>
                      <td>{formatMoney(row.expectedAmount)}</td>
                      <td>{canShowEmpty(loadStates.payments) ? formatMoney(row.paidAmount) : <DataStatus state={loadStates.payments} />}</td>
                      <td>{canShowEmpty(loadStates.payments) ? formatMoney(row.remainingAmount) : <DataStatus state={loadStates.payments} />}</td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan="9">No new subscriptions in this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {isDateAuditOpen && (
        <div className="student-modal-backdrop" role="presentation" onClick={closeDateAudit}>
          <section className="student-modal owner-subscription-modal owner-date-audit-modal" role="dialog" aria-modal="true" aria-label="Date audit logs" onClick={(event) => event.stopPropagation()}>
            <div className="student-modal-header">
              <div>
                <h2>Start & End Date Audit Logs</h2>
                <p>Only player subscription date changes are shown here.</p>
              </div>
              <button type="button" className="btn-secondary" onClick={closeDateAudit}>Close</button>
            </div>
            <div className="owner-subscription-detail-summary">
              <span>Total logs <strong>{dateAuditLogs.length}</strong></span>
            </div>
            <div className="owner-table-wrap">
              <table className="data-table owner-subscription-table owner-date-audit-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Changed Field</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Changed By</th>
                    <th>Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dateAuditLogs.length ? dateAuditLogs.flatMap((entry) => entry.changes.map((change) => (
                    <tr
                      className={highlightedDateAuditIds.includes(String(entry._id)) ? 'owner-date-audit-row is-new-alert' : 'owner-date-audit-row'}
                      key={`${entry._id}:${change.field}`}
                    >
                      <td>{entry.playerName}</td>
                      <td>{change.field === 'startDate' ? 'Start Date' : 'End Date'}</td>
                      <td>{formatAuditDate(change.before)}</td>
                      <td>{formatAuditDate(change.after)}</td>
                      <td>
                        {entry.changedBy?.name || entry.changedBy?.email || 'System'}
                        {(entry.changedBy?.role || entry.changedBy?.email) && (
                          <small>{[entry.changedBy.role, entry.changedBy.email].filter(Boolean).join(' / ')}</small>
                        )}
                      </td>
                      <td>{formatAuditDateTime(entry.changedAt)}</td>
                    </tr>
                  ))) : (
                    <tr><td colSpan="6">No start or end date changes recorded.</td></tr>
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
