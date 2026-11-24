import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import type {
  AdminStats,
  Booking,
  BookingStatus,
  Paginated,
  Resource,
  ResourceType,
} from '../types';

const RESOURCE_TYPES: ResourceType[] = ['ROOM', 'LAB', 'EQUIPMENT'];
const BOOKING_STATUSES: BookingStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export function AdminPage() {
  const [tab, setTab] = useState<'analytics' | 'resources' | 'bookings'>('analytics');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Analytics
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Resources
  const [resources, setResources] = useState<Resource[]>([]);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ResourceType>('ROOM');
  const [newCapacity, setNewCapacity] = useState(4);
  const [newDesc, setNewDesc] = useState('');

  // Bookings
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingStatus, setBookingStatus] = useState('PENDING');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  async function loadAnalytics() {
    try {
      const data = await api<AdminStats>('/admin/stats');
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin stats');
    }
  }

  async function loadResources() {
    try {
      const res = await api<Paginated<Resource>>('/resources?page=1');
      setResources(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load resources');
    }
  }

  async function loadBookings() {
    try {
      const params = new URLSearchParams({ page: '1' });
      if (bookingStatus) params.set('status', bookingStatus);
      const res = await api<Paginated<Booking>>(`/bookings?${params.toString()}`);
      setBookings(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load bookings');
    }
  }

  useEffect(() => {
    setError('');
    setSuccess('');
    if (tab === 'analytics') loadAnalytics();
    if (tab === 'resources') loadResources();
    if (tab === 'bookings') loadBookings();
  }, [tab, bookingStatus]);

  async function handleCreateResource(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api<Resource>('/resources', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          capacity: Number(newCapacity),
          description: newDesc.trim() || undefined,
        }),
      });
      setNewName('');
      setNewDesc('');
      setSuccess('Resource created.');
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'Failed to create resource');
    }
  }

  async function handleToggleActive(r: Resource) {
    setError('');
    try {
      await api<Resource>(`/resources/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      await loadResources();
    } catch (err: any) {
      setError(err.message || 'Failed to update resource');
    }
  }

  async function handleApprove(id: string) {
    setError('');
    setSuccess('');
    try {
      await api<Booking>(`/bookings/${id}/approve`, { method: 'PATCH' });
      setSuccess('Booking approved.');
      await loadBookings();
    } catch (err: any) {
      setError(err.message || 'Failed to approve booking');
    }
  }

  async function handleReject(id: string) {
    setError('');
    setSuccess('');
    try {
      await api<Booking>(`/bookings/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ note: rejectNote.trim() }),
      });
      setRejectId(null);
      setRejectNote('');
      setSuccess('Booking rejected.');
      await loadBookings();
    } catch (err: any) {
      setError(err.message || 'Failed to reject booking');
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Admin Console</h2>

      <div className="filters">
        <button className={tab === 'analytics' ? 'primary' : ''} onClick={() => setTab('analytics')}>
          Analytics
        </button>
        <button className={tab === 'resources' ? 'primary' : ''} onClick={() => setTab('resources')}>
          Resources
        </button>
        <button className={tab === 'bookings' ? 'primary' : ''} onClick={() => setTab('bookings')}>
          Bookings
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      {/* TAB 1: ANALYTICS */}
      {tab === 'analytics' && (
        <div>
          {!stats ? (
            <p className="muted">Loading analytics...</p>
          ) : (
            <>
              <div className="grid-stats">
                <div className="stat-box">
                  <div className="stat-label">Active Resources</div>
                  <div className="stat-value">{stats.activeResources}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Pending Bookings</div>
                  <div className="stat-value">{stats.bookingsByStatus.PENDING}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Approved Bookings</div>
                  <div className="stat-value">{stats.bookingsByStatus.APPROVED}</div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">Model Agreement</div>
                  <div className="stat-value">{stats.ticketStats.modelAgreementRate}%</div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ marginTop: 0 }}>Top Resources by Bookings</h3>
                {stats.topResources.length === 0 ? (
                  <p className="muted">No resources yet.</p>
                ) : (
                  <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                    {stats.topResources.map((r) => (
                      <li key={r.id}>
                        <strong>{r.name}</strong> ({r.type}) — {r.bookingCount} bookings
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: RESOURCES CRUD */}
      {tab === 'resources' && (
        <div className="split-layout">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>All Resources</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Cap</th>
                    <th>Status</th>
                    <th>Toggle</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.name}</strong></td>
                      <td>{r.type}</td>
                      <td>{r.capacity}</td>
                      <td>
                        <span className={`badge ${r.isActive ? 'badge-APPROVED' : 'badge-CANCELLED'}`}>
                          {r.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button onClick={() => handleToggleActive(r)}>
                          {r.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Add Resource</h3>
            <form className="form-stack" onSubmit={handleCreateResource}>
              <label>
                Name (3–60 chars)
                <input
                  required
                  minLength={3}
                  maxLength={60}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <label>
                Type
                <select value={newType} onChange={(e) => setNewType(e.target.value as ResourceType)}>
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Capacity (1–500)
                <input
                  type="number"
                  required
                  min={1}
                  max={500}
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(Number(e.target.value))}
                />
              </label>
              <label>
                Description (optional, max 300 chars)
                <textarea
                  maxLength={300}
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </label>
              <button type="submit" className="primary">Create Resource</button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: BOOKINGS APPROVAL */}
      {tab === 'bookings' && (
        <div className="card">
          <div className="filters">
            <select value={bookingStatus} onChange={(e) => setBookingStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {bookings.length === 0 ? (
            <p className="muted">No bookings found for this status.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time (Local)</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <div>{new Date(b.startTime).toLocaleString()}</div>
                        <div className="muted">to {new Date(b.endTime).toLocaleTimeString()}</div>
                      </td>
                      <td>
                        {b.purpose}
                        {b.decisionNote && <div className="muted">Note: {b.decisionNote}</div>}
                      </td>
                      <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                      <td>
                        {b.status === 'PENDING' ? (
                          rejectId === b.id ? (
                            <div className="form-stack" style={{ minWidth: 180 }}>
                              <input
                                placeholder="Rejection note (5-200 chars)"
                                value={rejectNote}
                                onChange={(e) => setRejectNote(e.target.value)}
                              />
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <button className="danger" onClick={() => handleReject(b.id)}>
                                  Confirm Reject
                                </button>
                                <button onClick={() => setRejectId(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button className="primary" onClick={() => handleApprove(b.id)}>
                                Approve
                              </button>
                              <button className="danger" onClick={() => setRejectId(b.id)}>
                                Reject
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}