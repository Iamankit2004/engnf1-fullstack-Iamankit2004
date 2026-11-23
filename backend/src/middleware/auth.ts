import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { pool } from '../db/pool';
import { forbidden, unauthenticated } from '../errors';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) throw unauthenticated();

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(header.slice(7), config.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw unauthenticated('Invalid or expired token');
    }

    // Load fresh user so role changes / deleted users are respected.
    const { rows } = await pool.query(
      `SELECT id, name, email, role, "createdAt" FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (rows.length === 0) throw unauthenticated('User no longer exists');
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole =
  (role: 'USER' | 'ADMIN') => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (req.user.role !== role) return next(forbidden());
    next();
  };
