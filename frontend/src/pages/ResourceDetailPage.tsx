import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { AvailabilitySlot, Booking, Resource } from '../types';

// Generate 30-minute time options (00:00 to 23:30)
const TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function getTomorrowLocalDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Availability state
  const [date, setDate] = useState(getTomorrowLocalDate);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Booking form state
  const [startSlot, setStartSlot] = useState('10:00');
  const [endSlot, setEndSlot] = useState('10:30');
  const [purpose, setPurpose] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    api<Resource>(`/resources/${id}`)
      .then(setResource)
      .catch((err) => setError(err.message || 'Resource not found'))
      .finally(() => setLoading(false));
  }, [id]);

  async function loadAvailability(selectedDate: string) {
    if (!id) return;
    setLoadingSlots(true);
    try {
      const from = new Date(`${selectedDate}T00:00:00`).toISOString();
      const to = new Date(`${selectedDate}T23:59:59`).toISOString();
      const res = await api<{ bookings: AvailabilitySlot[] }>(
        `/resources/${id}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      setSlots(res.bookings);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    if (resource) loadAvailability(date);
  }, [resource, date]);

  async function handleBook(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      const startTime = new Date(`${date}T${startSlot}:00`).toISOString();
      const endTime = new Date(`${date}T${endSlot}:00`).toISOString();

      await api<Booking>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          resourceId: id,
          startTime,
          endTime,
          purpose: purpose.trim(),
          ...(ticketId.trim() ? { ticketId: ticketId.trim() } : {}),
        }),
      });
      setFormSuccess('Booking requested (status: PENDING).');
      setPurpose('');
      setTicketId('');
      await loadAvailability(date);
    } catch (err: any) {
      setFormError(err.message || 'Could not create booking');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="muted">Loading resource...</p>;
  if (error || !resource) {
    return (
      <div className="card">
        <div className="alert-error">{error || 'Resource not found'}</div>
        <Link to="/resources">← Back to Resources</Link>
      </div>
    );
  }

  return (
    <div>
      <p><Link to="/resources">← Back to Resources</Link></p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{resource.name}</h2>
        <p className="muted">
          Type: <strong>{resource.type}</strong> · Capacity: <strong>{resource.capacity}</strong> ·{' '}
          Status: <strong>{resource.isActive ? 'Active' : 'Inactive'}</strong>
        </p>
        {resource.description && <p>{resource.description}</p>}
      </div>

      <div className="split-layout">
        {/* Availability Panel */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Booked Slots (Local Time)</h3>
          <label style={{ display: 'block', marginBottom: '0.75rem' }}>
            Date:{' '}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          {loadingSlots ? (
            <p className="muted">Checking availability...</p>
          ) : slots.length === 0 ? (
            <p className="muted">No booked slots for this date. Resource is wide open.</p>
          ) : (
            <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
              {slots.map((s, idx) => (
                <li key={idx} style={{ marginBottom: '0.4rem' }}>
                  {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                  {new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Booking Form */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Request a Slot</h3>
          {formError && <div className="alert-error">{formError}</div>}
          {formSuccess && <div className="alert-success">{formSuccess}</div>}

          <form className="form-stack" onSubmit={handleBook}>
            <label>
              Date
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <label>
                Start Time
                <select value={startSlot} onChange={(e) => setStartSlot(e.target.value)}>
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                End Time
                <select value={endSlot} onChange={(e) => setEndSlot(e.target.value)}>
                  {TIME_SLOTS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Purpose (5–200 chars)
              <textarea
                required
                minLength={5}
                maxLength={200}
                rows={3}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Live troubleshooting session for ticket..."
              />
            </label>
            <label>
              Linked Ticket ID (optional UUID)
              <input
                type="text"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="Optional ticket UUID"
              />
            </label>
            <button type="submit" className="primary" disabled={submitting || !resource.isActive}>
              {submitting ? 'Submitting...' : 'Book Slot'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}