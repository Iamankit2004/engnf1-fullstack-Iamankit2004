import { Router } from 'express';
import { pool } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  BOOKING_STATUSES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '../utils/validators';

const router = Router();

// 21. GET /api/admin/stats (ADMIN)
router.get(
  '/stats',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const [activeRes, bookingStatusRes, topRes, catRes, priRes, statRes, reviewRes] =
      await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS count FROM resources WHERE "isActive" = true`),
        pool.query(`SELECT status, COUNT(*)::int AS count FROM bookings GROUP BY status`),
        pool.query(
          `SELECT r.id, r.name, r.type, COUNT(b.id)::int AS "bookingCount"
           FROM resources r
           LEFT JOIN bookings b ON b."resourceId" = r.id
           GROUP BY r.id
           ORDER BY "bookingCount" DESC, lower(r.name) ASC
           LIMIT 3`
        ),
        pool.query(`SELECT category, COUNT(*)::int AS count FROM tickets GROUP BY category`),
        pool.query(`SELECT priority, COUNT(*)::int AS count FROM tickets GROUP BY priority`),
        pool.query(`SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status`),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE "isReviewed" = true)::int AS "reviewedCount",
             COUNT(*) FILTER (WHERE "isReviewed" = true AND category = "autoCategory")::int AS "agreedCount"
           FROM tickets`
        ),
      ]);

    const bookingsByStatus = Object.fromEntries(BOOKING_STATUSES.map((s) => [s, 0]));
    for (const row of bookingStatusRes.rows) bookingsByStatus[row.status] = row.count;

    const byCategory = Object.fromEntries(TICKET_CATEGORIES.map((c) => [c, 0]));
    for (const row of catRes.rows) byCategory[row.category] = row.count;

    const byPriority = Object.fromEntries(TICKET_PRIORITIES.map((p) => [p, 0]));
    for (const row of priRes.rows) byPriority[row.priority] = row.count;

    const byStatus = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0]));
    for (const row of statRes.rows) byStatus[row.status] = row.count;

    const { reviewedCount, agreedCount } = reviewRes.rows[0];
    const modelAgreementRate =
      reviewedCount > 0 ? Number(((agreedCount / reviewedCount) * 100).toFixed(1)) : 0;

    res.json({
      activeResources: activeRes.rows[0].count,
      bookingsByStatus,
      topResources: topRes.rows,
      ticketStats: {
        byCategory,
        byPriority,
        byStatus,
        reviewedCount,
        modelAgreementRate,
      },
    });
  })
);

export default router;