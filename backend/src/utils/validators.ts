import { validationError } from '../errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`);
  return value;
}

export function validateName(value: unknown): string {
  const name = asString(value, 'name').trim();
  if (name.length < 2 || name.length > 50) throw validationError('name must be 2-50 characters');
  return name;
}

export function validateEmail(value: unknown): string {
  const email = asString(value, 'email').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw validationError('email is invalid');
  return email;
}

export function validatePassword(value: unknown): string {
  const password = asString(value, 'password');
  if (password.length < 8 || password.length > 64) throw validationError('password must be 8-64 characters');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw validationError('password must contain at least one letter and one digit');
  }
  return password;
}
export const RESOURCE_TYPES = ['ROOM', 'LAB', 'EQUIPMENT'] as const;
export const BOOKING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const TICKET_CATEGORIES = ['BILLING', 'BUG', 'FEATURE_REQUEST', 'LOGIN', 'DELIVERY'] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw validationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function parsePage(value: unknown): number {
  if (value === undefined || value === '') return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw validationError('page must be a positive integer');
  return n;
}

export function parseIsoUtc(value: unknown, field: string): Date {
  if (typeof value !== 'string') throw validationError(`${field} must be an ISO 8601 UTC string`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw validationError(`${field} is not a valid date`);
  return d;
}