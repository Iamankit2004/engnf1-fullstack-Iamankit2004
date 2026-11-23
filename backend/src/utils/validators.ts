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
