import { Router } from 'express';
import { pool } from '../db/pool';
import { notFound, validationError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { classifyTicket } from '../utils/classifier';
import {
  asString,
  escapeLike,
  isUuid,
  optionalEnum,
  parsePage,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../utils/validators';

const router = Router();
const MAX_IMPORT_BATCH = 5000;

const TICKET_COLS = `id, "externalId", subject, body, "autoCategory", category, "isHumanOverride", priority, status, "assigneeId", "isReviewed", "createdAt", "updatedAt"`;

// 4. POST /api/tickets/import (T-B1, T-B2)
router.post(
  '/import',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rawList = Array.isArray(req.body) ? req.body : req.body?.tickets;
    if (!Array.isArray(rawList)) {
      throw validationError('Body must be { tickets: [...] } or an array of tickets');
    }
    if (rawList.length > MAX_IMPORT_BATCH) {
      throw validationError(`Cannot import more than ${MAX_IMPORT_BATCH} tickets at once`);
    }

    // Validate full batch before touching the DB
    const items = rawList.map((item, i) => {
      if (!item || typeof item !== 'object') {
        throw validationError(`tickets[${i}]: must be an object`);
      }
      const externalId = asString((item as any).externalId, `tickets[${i}].externalId`).trim();
      if (!externalId) throw validationError(`tickets[${i}].externalId cannot be empty`);

      const subject = asString((item as any).subject, `tickets[${i}].subject`).trim();
      if (subject.length < 3 || subject.length > 150) {
        throw validationError(`tickets[${i}].subject must be 3-150 characters`);
      }

      const body = asString((item as any).body, `tickets[${i}].body`).trim();
      if (body.length < 5 || body.length > 2000) {
        throw validationError(`tickets[${i}].body must be 5-2000 characters`);
      }

      return { externalId, subject, body };
    });

    // Sort by externalId for consistent lock ordering (prevents deadlocks on concurrent imports)
    items.sort((a, b) => a.externalId.localeCompare(b.externalId));

    const client = await pool.connect();
    let importedCount = 0;
    let updatedCount = 0;
    let skippedOverrideCount = 0;

    try {
      await client.query('BEGIN');
      for (const item of items) {
        const { category, priority } = classifyTicket(item.subject, item.body);
        const { rows } = await client.query(
          `INSERT INTO tickets ("externalId", subject, body, "autoCategory", category, priority)
           VALUES ($1, $2, $3, $4, $4, $5)
           ON CONFLICT ("externalId") DO UPDATE SET
             subject = EXCLUDED.subject,
             body = EXCLUDED.body,
             "autoCategory" = CASE WHEN tickets."isHumanOverride" THEN tickets."autoCategory" ELSE EXCLUDED."autoCategory" END,
             category = CASE WHEN tickets."isHumanOverride" THEN tickets.category ELSE EXCLUDED.category END,
             priority = CASE WHEN tickets."isHumanOverride" THEN tickets.priority ELSE EXCLUDED.priority END,
             "updatedAt" = now()
           RETURNING (xmax = 0) AS inserted, "isHumanOverride"`,
          [item.externalId, item.subject, item.body, category, priority]
        );
        if (rows[0].inserted) {
          importedCount++;
        } else if (rows[0].isHumanOverride) {
          skippedOverrideCount++;
        } else {
          updatedCount++;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({
      importedCount,
      updatedCount,
      skippedOverrideCount,
      total: items.length,
    });
  })
);

// 5. GET /api/tickets (T-B4)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page);
    let limit = 10;
    if (req.query.limit !== undefined && req.query.limit !== '') {
      const n = Number(req.query.limit);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        throw validationError('limit must be an integer between 1 and 100');
      }
      limit = n;
    }

    const status = optionalEnum(req.query.status, TICKET_STATUSES, 'status');
    const category = optionalEnum(req.query.category, TICKET_CATEGORIES, 'category');
    const priority = optionalEnum(req.query.priority, TICKET_PRIORITIES, 'priority');
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (priority) {
      params.push(priority);
      conditions.push(`priority = $${params.length}`);
    }
    if (q) {
      params.push(`%${escapeLike(q)}%`);
      conditions.push(`(subject ILIKE $${params.length} ESCAPE '\\' OR body ILIKE $${params.length} ESCAPE '\\')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM tickets ${where}`, params);
    const total = countRes.rows[0].total;

    params.push(limit, (page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT ${TICKET_COLS}
       FROM tickets ${where}
       ORDER BY "createdAt" DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      data: rows,
      page,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  })
);

// 6. GET /api/tickets/:id
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Ticket not found');

    const { rows } = await pool.query(`SELECT ${TICKET_COLS} FROM tickets WHERE id = $1`, [id]);
    if (!rows.length) throw notFound('Ticket not found');

    const eventsRes = await pool.query(
      `SELECT id, "ticketId", field, "oldValue", "newValue", actor, "createdAt"
       FROM ticket_events
       WHERE "ticketId" = $1
       ORDER BY "createdAt" DESC`,
      [id]
    );

    res.json({ ticket: rows[0], events: eventsRes.rows });
  })
);

// 7. PATCH /api/tickets/:id (T-B3)
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw notFound('Ticket not found');

    const body = req.body ?? {};
    const hasCategory = body.category !== undefined;
    const hasPriority = body.priority !== undefined;
    const hasStatus = body.status !== undefined;
    const hasAssignee = body.assigneeId !== undefined;

    if (!hasCategory && !hasPriority && !hasStatus && !hasAssignee) {
      throw validationError('Provide at least one of category, priority, status, assigneeId');
    }

    const nextCategory = hasCategory
      ? optionalEnum(body.category, TICKET_CATEGORIES, 'category')
      : undefined;
    if (hasCategory && !nextCategory) throw validationError('category is invalid');

    const nextPriority = hasPriority
      ? optionalEnum(body.priority, TICKET_PRIORITIES, 'priority')
      : undefined;
    if (hasPriority && !nextPriority) throw validationError('priority is invalid');

    const nextStatus = hasStatus
      ? optionalEnum(body.status, TICKET_STATUSES, 'status')
      : undefined;
    if (hasStatus && !nextStatus) throw validationError('status is invalid');

    let nextAssigneeId: string | null | undefined;
    if (hasAssignee) {
      if (body.assigneeId === null || body.assigneeId === '') {
        nextAssigneeId = null;
      } else if (isUuid(body.assigneeId)) {
        nextAssigneeId = body.assigneeId;
      } else {
        throw validationError('assigneeId must be a valid UUID or null');
      }
    }

    const rawAgent = req.header('X-Agent')?.trim();
    const actor = rawAgent || req.user!.email;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const curRes = await client.query(
        `SELECT ${TICKET_COLS} FROM tickets WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const current = curRes.rows[0];
      if (!current) throw notFound('Ticket not found');

      if (nextAssigneeId) {
        const userCheck = await client.query(`SELECT id FROM users WHERE id = $1`, [nextAssigneeId]);
        if (!userCheck.rowCount) throw notFound('Assignee user not found');
      }

      const changes: Array<{ field: string; oldVal: string | null; newVal: string | null }> = [];
      if (nextCategory && nextCategory !== current.category) {
        changes.push({ field: 'category', oldVal: current.category, newVal: nextCategory });
      }
      if (nextPriority && nextPriority !== current.priority) {
        changes.push({ field: 'priority', oldVal: current.priority, newVal: nextPriority });
      }
      if (nextStatus && nextStatus !== current.status) {
        changes.push({ field: 'status', oldVal: current.status, newVal: nextStatus });
      }
      if (hasAssignee && nextAssigneeId !== current.assigneeId) {
        changes.push({
          field: 'assigneeId',
          oldVal: current.assigneeId,
          newVal: nextAssigneeId ?? null,
        });
      }

      let updatedTicket = current;
      if (changes.length > 0) {
        const categoryChanged = changes.some((c) => c.field === 'category');
        const movedFromOpen = current.status === 'OPEN' && nextStatus && nextStatus !== 'OPEN';

        const isHumanOverride = current.isHumanOverride || categoryChanged;
        const isReviewed = current.isReviewed || categoryChanged || Boolean(movedFromOpen);

        const updRes = await client.query(
          `UPDATE tickets
           SET category = $2,
               priority = $3,
               status = $4,
               "assigneeId" = $5,
               "isHumanOverride" = $6,
               "isReviewed" = $7,
               "updatedAt" = now()
           WHERE id = $1
           RETURNING ${TICKET_COLS}`,
          [
            id,
            nextCategory ?? current.category,
            nextPriority ?? current.priority,
            nextStatus ?? current.status,
            hasAssignee ? nextAssigneeId : current.assigneeId,
            isHumanOverride,
            isReviewed,
          ]
        );
        updatedTicket = updRes.rows[0];

        for (const ch of changes) {
          await client.query(
            `INSERT INTO ticket_events ("ticketId", field, "oldValue", "newValue", actor, "createdAt")
             VALUES ($1, $2, $3, $4, $5, clock_timestamp())`,
            [id, ch.field, ch.oldVal, ch.newVal, actor]
          );
        }
      }

      const eventsRes = await client.query(
        `SELECT id, "ticketId", field, "oldValue", "newValue", actor, "createdAt"
         FROM ticket_events
         WHERE "ticketId" = $1
         ORDER BY "createdAt" DESC`,
        [id]
      );

      await client.query('COMMIT');
      res.json({ ticket: updatedTicket, events: eventsRes.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

export default router;