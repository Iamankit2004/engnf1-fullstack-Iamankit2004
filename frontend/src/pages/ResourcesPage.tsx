import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Paginated, Resource, ResourceType } from '../types';

const TYPES: ResourceType[] = ['ROOM', 'LAB', 'EQUIPMENT'];

export function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [minCapacity, setMinCapacity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page) });
    if (search.trim()) params.set('search', search.trim());
    if (type) params.set('type', type);
    if (minCapacity.trim()) params.set('minCapacity', minCapacity.trim());

    api<Paginated<Resource>>(`/resources?${params.toString()}`)
      .then((res) => {
        setResources(res.data);
        setTotalPages(Math.max(1, res.totalPages));
      })
      .catch((err) => setError(err.message || 'Failed to load resources'))
      .finally(() => setLoading(false));
  }, [page, search, type, minCapacity]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Resources</h2>
      {error && <div className="alert-error">{error}</div>}

      <div className="filters">
        <input
          type="search"
          placeholder="Search name or description..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <select
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value);
          }}
        >
          <option value="">All Types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={500}
          placeholder="Min capacity"
          style={{ width: 140 }}
          value={minCapacity}
          onChange={(e) => {
            setPage(1);
            setMinCapacity(e.target.value);
          }}
        />
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Loading resources...</p>
        ) : resources.length === 0 ? (
          <p className="muted">No resources found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.description && <div className="muted">{r.description}</div>}
                    </td>
                    <td><span className="badge">{r.type}</span></td>
                    <td>{r.capacity}</td>
                    <td>
                      <span className={`badge ${r.isActive ? 'badge-APPROVED' : 'badge-CANCELLED'}`}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <Link to={`/resources/${r.id}`}>View &amp; Book</Link>
                    </td>
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
    </div>
  );
}