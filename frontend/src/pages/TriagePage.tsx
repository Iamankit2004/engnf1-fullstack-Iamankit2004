import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type {
  Paginated,
  Ticket,
  TicketCategory,
  TicketEvent,
  TicketPriority,
  TicketStats,
  TicketStatus,
} from '../types';

const CATEGORIES: TicketCategory[] = ['BILLING', 'BUG', 'FEATURE_REQUEST', 'LOGIN', 'DELIVERY'];
const PRIORITIES: TicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

const SAMPLE_FEED = [
  {
    externalId: 'FEED-1001',
    subject: 'My package has not arrived yet',
    body: 'Tracking shows delivered two days ago but the package never arrived.',
  },
  {
    externalId: 'FEED-1002',
    subject: 'Urgent: locked out of 2FA login',
    body: 'Production team is locked out after password reset and 2FA code fails.',
  },
  {
    externalId: 'FEED-1003',
    subject: 'Duplicate invoice charge refund request',
    body: 'We received a duplicate payment charge on our latest invoice. Please issue a refund.',
  },
];

export function TriagePage() {
  const { user } = useAuth();

  // Stats state
  const [stats, setStats] = useState<TicketStats | null>(null);

  // List & filter state
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');

  // Re-import state
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // Detail & Optimistic UI state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [patchError, setPatchError] = useState('');

  async function loadStats() {
    try {
      const data = await api<TicketStats>('/stats');
      setStats(data);
    } catch {
      // Non-blocking; list error banner handles connectivity issues
    }
  }

  async function loadTickets() {
    setLoadingList(true);
    setListError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (searchQ.trim()) params.set('q', searchQ.trim());

      const res = await api<Paginated<Ticket>>(`/tickets?${params.toString()}`);
      setTickets(res.data);
      setTotalPages(Math.max(1, res.totalPages));
    } catch (err: any) {
      setListError(err.message || 'Failed to load tickets');
    } finally {
      setLoadingList(false);
    }
  }

  async function loadDetail(id: string) {
    setSelectedId(id);
    setPatchError('');
    setLoadingDetail(true);
    try {
      const res = await api<{ ticket: Ticket; events: TicketEvent[] }>(`/tickets/${id}`);
      setSelectedTicket(res.ticket);
      setEvents(res.events);
    } catch (err: any) {
      setPatchError(err.message || 'Failed to load ticket details');
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadTickets();
  }, [page, statusFilter, categoryFilter, priorityFilter, searchQ]);

  async function handleReimport() {
    setImporting(true);
    setImportMsg('');
    setListError('');
    try {
      const res = await api<{
        importedCount: number;
        updatedCount: number;
        skippedOverrideCount: number;
        total: number;
      }>('/tickets/import', {
        method: 'POST',
        body: JSON.stringify({ tickets: SAMPLE_FEED }),
      });
      setImportMsg(
        `Feed synced (${res.total} processed): ${res.importedCount} new, ${res.updatedCount} updated, ${res.skippedOverrideCount} human overrides preserved.`
      );
      await Promise.all([loadTickets(), loadStats()]);
      if (selectedId) await loadDetail(selectedId);
    } catch (err: any) {
      setListError(err.message || 'Re-import failed');
    } finally {
      setImporting(false);
    }
  }

  // Optimistic UI update with automatic rollback on error
  async function handleOptimisticPatch(
    patch: Partial<Pick<Ticket, 'category' | 'priority' | 'status'>>
  ) {
    if (!selectedTicket) return;
    setPatchError('');

    const prevTicket = selectedTicket;
    const prevTickets = tickets;

    const optimistic: Ticket = {
      ...selectedTicket,
      ...patch,
      isHumanOverride:
        selectedTicket.isHumanOverride ||
        (patch.category !== undefined && patch.category !== selectedTicket.category),
      isReviewed:
        selectedTicket.isReviewed ||
        (patch.category !== undefined && patch.category !== selectedTicket.category) ||
        (selectedTicket.status === 'OPEN' && patch.status !== undefined && patch.status !== 'OPEN'),
    };

    // 1. Update UI immediately
    setSelectedTicket(optimistic);
    setTickets((list) => list.map((t) => (t.id === optimistic.id ? optimistic : t)));

    // 2. Send request; roll back if server rejects
    try {
      const res = await api<{ ticket: Ticket; events: TicketEvent[] }>(
        `/tickets/${selectedTicket.id}`,
        {
          method: 'PATCH',
          agent: user?.email,
          body: JSON.stringify(patch),
        }
      );
      setSelectedTicket(res.ticket);
      setEvents(res.events);
      setTickets((list) => list.map((t) => (t.id === res.ticket.id ? res.ticket : t)));
      loadStats();
    } catch (err: any) {
      setSelectedTicket(prevTicket);
      setTickets(prevTickets);
      setPatchError(`Update failed and was rolled back: ${err.message || 'Server error'}`);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Triage Queue</h2>
        <button className="primary" onClick={handleReimport} disabled={importing}>
          {importing ? 'Syncing Feed...' : 'Re-Import Feed'}
        </button>
      </div>

      {importMsg && <div className="alert-success">{importMsg}</div>}
      {listError && <div className="alert-error">{listError}</div>}

      {/* Top Stats Strip */}
      {stats && (
        <div className="grid-stats">
          <div className="stat-box">
            <div className="stat-label">Model Agreement</div>
            <div className="stat-value">{stats.modelAgreementRate}%</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Reviewed</div>
            <div className="stat-value">{stats.reviewedCount}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Open</div>
            <div className="stat-value">{stats.byStatus.OPEN}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">In Progress</div>
            <div className="stat-value">{stats.byStatus.IN_PROGRESS}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Urgent</div>
            <div className="stat-value">{stats.byPriority.URGENT}</div>
          </div>
        </div>
      )}

      {/* Dynamic Filter Bar */}
      <div className="filters">
        <input
          type="search"
          placeholder="Search subject or body..."
          value={searchQ}
          onChange={(e) => {
            setPage(1);
            setSearchQ(e.target.value);
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setPage(1);
            setCategoryFilter(e.target.value);
          }}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPage(1);
            setPriorityFilter(e.target.value);
          }}
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Split Layout: Ticket List + Detail Panel */}
      <div className="split-layout">
        <div className="card">
          {loadingList ? (
            <p className="muted">Loading tickets...</p>
          ) : tickets.length === 0 ? (
            <p className="muted">No tickets match the current filters.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => loadDetail(t.id)}
                      style={{
                        cursor: 'pointer',
                        background: selectedId === t.id ? '#eff6ff' : undefined,
                      }}
                    >
                      <td>
                        <strong>{t.subject}</strong>
                        <div className="muted">
                          {t.externalId}
                          {t.isHumanOverride ? ' · Override' : ''}
                        </div>
                      </td>
                      <td><span className="badge">{t.category}</span></td>
                      <td><span className={`badge badge-${t.priority}`}>{t.priority}</span></td>
                      <td><span className={`badge badge-${t.status}`}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span className="muted">Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>

        {/* Ticket Detail & Audit Panel */}
        <div className="card">
          {!selectedId ? (
            <p className="muted">Select a ticket to review details, edit triage fields, and inspect audit history.</p>
          ) : loadingDetail && !selectedTicket ? (
            <p className="muted">Loading ticket details...</p>
          ) : selectedTicket ? (
            <div>
              {patchError && <div className="alert-error">{patchError}</div>}

              {/* XSS-safe: React escapes text children automatically */}
              <h3 style={{ marginTop: 0 }}>{selectedTicket.subject}</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{selectedTicket.body}</p>

              <p className="muted">
                Auto-classified: <strong>{selectedTicket.autoCategory}</strong> ·{' '}
                Reviewed: <strong>{selectedTicket.isReviewed ? 'Yes' : 'No'}</strong> ·{' '}
                Human Override: <strong>{selectedTicket.isHumanOverride ? 'Yes' : 'No'}</strong>
              </p>

              <div className="form-stack" style={{ marginTop: '1rem' }}>
                <label>
                  Category
                  <select
                    value={selectedTicket.category}
                    onChange={(e) =>
                      handleOptimisticPatch({ category: e.target.value as TicketCategory })
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Priority
                  <select
                    value={selectedTicket.priority}
                    onChange={(e) =>
                      handleOptimisticPatch({ priority: e.target.value as TicketPriority })
                    }
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Status
                  <select
                    value={selectedTicket.status}
                    onChange={(e) =>
                      handleOptimisticPatch({ status: e.target.value as TicketStatus })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              <h4 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Audit History</h4>
              {events.length === 0 ? (
                <p className="muted">No changes recorded yet.</p>
              ) : (
                <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                  {events.map((ev) => (
                    <li key={ev.id} style={{ marginBottom: '0.4rem', fontSize: '0.88rem' }}>
                      <strong>{ev.field}</strong>: {ev.oldValue ?? 'none'} → {ev.newValue ?? 'none'}{' '}
                      <span className="muted">
                        by {ev.actor} ({new Date(ev.createdAt).toLocaleString()})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}