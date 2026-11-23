import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { pool } from '../db/pool';
import { conflict, unauthenticated, validationError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { asString, validateEmail, validateName, validatePassword } from '../utils/validators';

const router = Router();

const publicUser = (row: any) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.createdAt,
});

// 1. POST /api/auth/register  (always creates role USER)
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const name = validateName(body.name);
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);

    const existing = await pool.query(`SELECT 1 FROM users WHERE lower(email) = $1`, [email]);
    if (existing.rowCount) throw conflict('Email already registered');

    const hash = await bcrypt.hash(password, 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, "passwordHash", role)
         VALUES ($1, $2, $3, 'USER')
         RETURNING id, name, email, role, "createdAt"`,
        [name, email, hash]
      );
      res.status(201).json({ user: publicUser(rows[0]) });
    } catch (err: any) {
      // Two simultaneous registrations: unique index is the final guard.
      if (err.code === '23505') throw conflict('Email already registered');
      throw err;
    }
  })
);

// 2. POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const email = asString(body.email, 'email').trim().toLowerCase();
    const password = asString(body.password, 'password');
    if (!email || !password) throw validationError('email and password are required');

    const { rows } = await pool.query(`SELECT * FROM users WHERE lower(email) = $1`, [email]);
    const user = rows[0];
    // Same message for unknown email and wrong password (no user enumeration).
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!ok) throw unauthenticated('Invalid email or password');

    const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });
    res.status(200).json({ token, user: publicUser(user) });
  })
);

// 3. GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

export default router;
