import { Router } from 'express';
import { pool } from '../db/pool';
import { conflict, forbidden, notFound, validationError } from '../errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  asString,
  BOOKING_STATUSES,
  isUuid,
  optionalEnum,
  parseIsoUtc,
  parsePage,
} from '../utils/validators';

const router = Router();
const PAGE_SIZE = 10;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function isOn30MinGrid(d: Date): boolean {
  const m = d.getUTCMinutes();
  return (m === 0 || m === 30) && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

// 14. POST /api/bookings (Race-safe B6 + 3-booking limit)
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!isUuid(body.resourceId)) throw validationError('resourceId must be a valid UUID');

    const startTime = parseIsoUtc(body.startTime, 'startTime');
    const endTime = parseIsoUtc(body.endTime, 'endTime');

    if (!isOn30MinGrid(startTime) || !isOn30MinGrid(endTime)) {
      throw validationError('startTime and endTime must fall on :00 or :30 UTC with 0s/0ms');
    }

    const durationMin = (endTime.getTime() - startTime.getTime()) / 60000;
    if (durationMin < 30 || durationMin > 240) {
      throw validationError('Booking duration must be between 30 and 240 minutes');
    }

    const now = Date.now();
    if (startTime.getTime() <= now) {
      throw validationError('startTime must be in the future');
    }
    if (startTime.getTime() - now > THIRTY_DAYS_MS) {
      throw validationError('startTime cannot be more than 30 days in the future');
    }

    const purpose = asString(body.purpose, 'purpose').trim();
    if (purpose.length < 5 || purpose.length > 200) {
      throw validationError('purpose must be 5-200 characters');
    }

    let ticketId: string | null = null;
    if (body.ticketId !== undefined && body.ticketId !== null && body.ticketId !== '') {
      if (!isUuid(body.ticketId)) throw validationError('ticketId must be a valid UUID');
      ticketId = body.ticketId;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check referenced resource (404 if missing, 409 if inactive)
      const resRow = await client.query(`SELECT id, "isActive" FROM resources WHERE id = $1`, [
        body.resourceId,
      ]);
      if (!resRow.rowCount) throw notFound('Resource not found');
      if (!resRow.rows[0].isActive) throw conflict('Resource is inactive');

      // Check referenced ticket if provided
      if (ticketId) {
        const ticketRow = await client.query(`SELECT id FROM tickets WHERE id = $1`, [ticketId]);
        if (!ticketRow.rowCount) throw notFound('Ticket not found');
      }

      // Per-user advisory lock prevents concurrent requests from exceeding the 3-booking cap
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [req.user!.id]);

      const activeCount = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM bookings
         WHERE "userId" = $1
           AND status IN ('PENDING', 'APPROVED')
           AND "startTime" > now()`,
        [req.user!.id]
      );
      if (activeCount.rows[0].count >= 3) {
        throw conflict('You can have at most 3 future PENDING or APPROVED bookings');
      }

      // Atomic overlap check enforced by GiST exclusion constraint `bookings_no_overlap` (23P01)
      const { rows } = await client.query(
        `INSERT INTO bookings ("resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
         RETURNING id, "resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status, "decisionNote", "createdAt"`,
        [body.resourceId, req.user!.id, ticketId, startTime.toISOString(), endTime.toISOString(), purpose]
      );

      await client.query('COMMIT');
      res.status(201).json(rows[0]);
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23P01') {
        throw conflict('This time slot overlaps an existing booking');
      }
      throw err;
    } finally {
      client.release();
    }
  })
);

// 15. GET /api/bookings/mine (MUST be registered before /:id)
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page);
    const status = optionalEnum(req.query.status, BOOKING_STATUSES, 'status');

    const conditions = [`"userId" = $1`];
    const params: unknown[] = [req.user!.id];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM bookings ${where}`, params);
    const total = countRes.rows[0].total;

    params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const { rows } = await pool.query(
      `SELECT id, "resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status, "decisionNote", "createdAt"
       FROM bookings ${where}
       ORDER BY "startTime" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      data: rows,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    });
  })
);

// 17. GET /api/bookings (ADMIN)
router.get(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page);
    const status = optionalEnum(req.query.status, BOOKING_STATUSES, 'status');

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (req.query.resourceId !== undefined && req.query.resourceId !== '') {
      if (!isUuid(req.query.resourceId)) throw validationError('resourceId must be a valid UUID');
      params.push(req.query.resourceId);
      conditions.push(`"resourceId" = $${params.length}`);
    }
    if (req.query.from !== undefined && req.query.from !== '') {
      const from = parseIsoUtc(req.query.from, 'from');
      params.push(from.toISOString());
      conditions.push(`"endTime" > $${params.length}`);
    }
    if (req.query.to !== undefined && req.query.to !== '') {
      const to = parseIsoUtc(req.query.to, 'to');
      params.push(to.toISOString());
      conditions.push(`"startTime" < $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM bookings ${where}`, params);
    const total = countRes.rows[0].total;

    params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const { rows } = await pool.query(
      `SELECT id, "resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status, "decisionNote", "createdAt"
       FROM bookings ${where}
       ORDER BY "startTime" DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      data: rows,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    });
  })
);

// 16. GET /api/bookings/:id (Owner or ADMIN)
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Booking not found');

    const { rows } = await pool.query(
      `SELECT id, "resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status, "decisionNote", "createdAt"
       FROM bookings WHERE id = $1`,
      [id]
    );
    const booking = rows[0];
    if (!booking) throw notFound('Booking not found');
    if (req.user!.role !== 'ADMIN' && booking.userId !== req.user!.id) {
      throw forbidden('You can only view your own bookings');
    }
    res.json(booking);
  })
);

// 18. PATCH /api/bookings/:id/cancel (Owner only)
router.patch(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Booking not found');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const booking = rows[0];
      if (!booking) throw notFound('Booking not found');
      if (booking.userId !== req.user!.id) {
        throw forbidden('Only the booking owner can cancel this booking');
      }
      if (new Date(booking.startTime).getTime() <= Date.now()) {
        throw conflict('Cannot cancel a booking that has already started');
      }
      if (booking.status !== 'PENDING' && booking.status !== 'APPROVED') {
        throw conflict(`Cannot cancel a booking in status ${booking.status}`);
      }

      const updated = await client.query(
        `UPDATE bookings SET status = 'CANCELLED'
         WHERE id = $1
         RETURNING id, "resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status, "decisionNote", "createdAt"`,
        [id]
      );
      await client.query('COMMIT');
      res.json(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// 19. PATCH /api/bookings/:id/approve (ADMIN)
router.patch(
  '/:id/approve',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Booking not found');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const booking = rows[0];
      if (!booking) throw notFound('Booking not found');
      if (new Date(booking.startTime).getTime() <= Date.now()) {
        throw conflict('Cannot approve a booking that has already started');
      }
      if (booking.status !== 'PENDING') {
        throw conflict(`Only PENDING bookings can be approved (current: ${booking.status})`);
      }

      const updated = await client.query(
        `UPDATE bookings SET status = 'APPROVED'
         WHERE id = $1
         RETURNING id, "resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status, "decisionNote", "createdAt"`,
        [id]
      );
      await client.query('COMMIT');
      res.json(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// 20. PATCH /api/bookings/:id/reject (ADMIN)
router.patch(
  '/:id/reject',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Booking not found');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const booking = rows[0];
      if (!booking) throw notFound('Booking not found');

      // Validate note after 404 check (matches spec error order)
      const note = asString(req.body?.note, 'note').trim();
      if (note.length < 5 || note.length > 200) {
        throw validationError('note must be 5-200 characters');
      }

      if (new Date(booking.startTime).getTime() <= Date.now()) {
        throw conflict('Cannot reject a booking that has already started');
      }
      if (booking.status !== 'PENDING') {
        throw conflict(`Only PENDING bookings can be rejected (current: ${booking.status})`);
      }

      const updated = await client.query(
        `UPDATE bookings SET status = 'REJECTED', "decisionNote" = $2
         WHERE id = $1
         RETURNING id, "resourceId", "userId", "ticketId", "startTime", "endTime", purpose, status, "decisionNote", "createdAt"`,
        [id, note]
      );
      await client.query('COMMIT');
      res.json(updated.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

export default router;