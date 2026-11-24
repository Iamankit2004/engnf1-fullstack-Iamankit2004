import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Booking, BookingStatus, Paginated } from '../types';

const STATUSES: BookingStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  async function loadBookings() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set('status', status);
      const res = await api<Paginated<Booking>>(`/bookings/mine?${params.toString()}`);
      setBookings(res.data);
      setTotalPages(Math.max(1, res.totalPages));
    } catch (err: any) {
      setError(err.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, [page, status]);

  async function handleCancel(id: string) {
    setActionBusy(true);
    setError('');
    try {
      await api<Booking>(`/bookings/${id}/cancel`, { method: 'PATCH' });
      setConfirmId(null);
      await loadBookings();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel booking');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>My Bookings</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="filters">
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Loading your bookings...</p>
        ) : bookings.length === 0 ? (
          <p className="muted">You have no bookings matching this filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time (Local)</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => {
                  const canCancel =
                    (b.status === 'PENDING' || b.status === 'APPROVED') &&
                    new Date(b.startTime).getTime() > Date.now();
                  return (
                    <tr key={b.id}>
                      <td>
                        <div>{new Date(b.startTime).toLocaleString()}</div>
                        <div className="muted">to {new Date(b.endTime).toLocaleTimeString()}</div>
                      </td>
                      <td>{b.purpose}</td>
                      <td><span className={`badge badge-${b.status}`}>{b.status}</span></td>
                      <td className="muted">{b.decisionNote || '—'}</td>
                      <td>
                        {canCancel ? (
                          confirmId === b.id ? (
                            <span style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button
                                className="danger"
                                disabled={actionBusy}
                                onClick={() => handleCancel(b.id)}
                              >
                                Confirm
                              </button>
                              <button onClick={() => setConfirmId(null)}>Keep</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmId(b.id)}>Cancel</button>
                          )
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
    </div>
  );
}