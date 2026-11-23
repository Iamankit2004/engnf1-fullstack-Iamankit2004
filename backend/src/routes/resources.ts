import { Router } from 'express';
import { pool } from '../db/pool';
import { conflict, notFound, validationError } from '../errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  asString,
  escapeLike,
  isUuid,
  optionalEnum,
  parseIsoUtc,
  parsePage,
  RESOURCE_TYPES,
} from '../utils/validators';

const router = Router();
const PAGE_SIZE = 10;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function validateResourceName(value: unknown): string {
  const name = asString(value, 'name').trim();
  if (name.length < 3 || name.length > 60) throw validationError('name must be 3-60 characters');
  return name;
}

function validateCapacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 500) {
    throw validationError('capacity must be an integer between 1 and 500');
  }
  return value;
}

function validateDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const desc = asString(value, 'description').trim();
  if (desc.length > 300) throw validationError('description must be at most 300 characters');
  return desc;
}

// 9. GET /api/resources
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page);
    const type = optionalEnum(req.query.type, RESOURCE_TYPES, 'type');

    let minCapacity: number | undefined;
    if (req.query.minCapacity !== undefined && req.query.minCapacity !== '') {
      const n = Number(req.query.minCapacity);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        throw validationError('minCapacity must be an integer between 1 and 500');
      }
      minCapacity = n;
    }

    const search =
      typeof req.query.search === 'string' && req.query.search.trim()
        ? req.query.search.trim()
        : undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (req.user!.role !== 'ADMIN') {
      conditions.push(`"isActive" = true`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (minCapacity !== undefined) {
      params.push(minCapacity);
      conditions.push(`capacity >= $${params.length}`);
    }
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      conditions.push(`(name ILIKE $${params.length} ESCAPE '\\' OR COALESCE(description, '') ILIKE $${params.length} ESCAPE '\\')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM resources ${where}`, params);
    const total = countRes.rows[0].total;

    params.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const { rows } = await pool.query(
      `SELECT id, name, type, capacity, description, "isActive", "createdAt"
       FROM resources ${where}
       ORDER BY lower(name) ASC, name ASC
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

// 10. GET /api/resources/:id
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Resource not found');

    const { rows } = await pool.query(
      `SELECT id, name, type, capacity, description, "isActive", "createdAt"
       FROM resources WHERE id = $1`,
      [id]
    );
    const resource = rows[0];
    if (!resource || (req.user!.role !== 'ADMIN' && !resource.isActive)) {
      throw notFound('Resource not found');
    }
    res.json(resource);
  })
);

// 11. POST /api/resources (ADMIN)
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const name = validateResourceName(body.name);
    const type = optionalEnum(body.type, RESOURCE_TYPES, 'type');
    if (!type) throw validationError('type is required');
    const capacity = validateCapacity(body.capacity);
    const description = validateDescription(body.description);

    try {
      const { rows } = await pool.query(
        `INSERT INTO resources (name, type, capacity, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, type, capacity, description, "isActive", "createdAt"`,
        [name, type, capacity, description]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code === '23505') throw conflict('Resource name already exists');
      throw err;
    }
  })
);

// 12. PATCH /api/resources/:id (ADMIN)
router.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Resource not found');

    const existing = await pool.query(`SELECT id FROM resources WHERE id = $1`, [id]);
    if (!existing.rowCount) throw notFound('Resource not found');

    const body = req.body ?? {};
    const updates: string[] = [];
    const params: unknown[] = [];

    if (body.name !== undefined) {
      params.push(validateResourceName(body.name));
      updates.push(`name = $${params.length}`);
    }
    if (body.type !== undefined) {
      const type = optionalEnum(body.type, RESOURCE_TYPES, 'type');
      if (!type) throw validationError('type is invalid');
      params.push(type);
      updates.push(`type = $${params.length}`);
    }
    if (body.capacity !== undefined) {
      params.push(validateCapacity(body.capacity));
      updates.push(`capacity = $${params.length}`);
    }
    if (body.description !== undefined) {
      params.push(validateDescription(body.description));
      updates.push(`description = $${params.length}`);
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw validationError('isActive must be a boolean');
      params.push(body.isActive);
      updates.push(`"isActive" = $${params.length}`);
    }

    if (!updates.length) throw validationError('No valid fields provided to update');

    params.push(id);
    try {
      const { rows } = await pool.query(
        `UPDATE resources SET ${updates.join(', ')}
         WHERE id = $${params.length}
         RETURNING id, name, type, capacity, description, "isActive", "createdAt"`,
        params
      );
      res.json(rows[0]);
    } catch (err: any) {
      if (err.code === '23505') throw conflict('Resource name already exists');
      throw err;
    }
  })
);

// 13. GET /api/resources/:id/availability
router.get(
  '/:id/availability',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Resource not found');

    const resCheck = await pool.query(`SELECT id, "isActive" FROM resources WHERE id = $1`, [id]);
    const resource = resCheck.rows[0];
    if (!resource || (req.user!.role !== 'ADMIN' && !resource.isActive)) {
      throw notFound('Resource not found');
    }

    const from = parseIsoUtc(req.query.from, 'from');
    const to = parseIsoUtc(req.query.to, 'to');
    if (to <= from) throw validationError('to must be after from');
    if (to.getTime() - from.getTime() > SEVEN_DAYS_MS) {
      throw validationError('Requested range cannot exceed 7 days');
    }

    const { rows } = await pool.query(
      `SELECT "startTime", "endTime", status
       FROM bookings
       WHERE "resourceId" = $1
         AND status IN ('PENDING', 'APPROVED')
         AND "startTime" < $3
         AND "endTime" > $2
       ORDER BY "startTime" ASC`,
      [id, from.toISOString(), to.toISOString()]
    );

    res.json({
      resourceId: id,
      from: from.toISOString(),
      to: to.toISOString(),
      bookings: rows,
    });
  })
);

export default router;