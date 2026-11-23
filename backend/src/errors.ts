export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string) {
    super(message);
  }
}

export const validationError = (m: string) => new AppError(400, 'VALIDATION_ERROR', m);
export const unauthenticated = (m = 'Authentication required') => new AppError(401, 'UNAUTHENTICATED', m);
export const forbidden = (m = 'You do not have permission') => new AppError(403, 'FORBIDDEN', m);
export const notFound = (m = 'Resource not found') => new AppError(404, 'NOT_FOUND', m);
export const conflict = (m: string) => new AppError(409, 'CONFLICT', m);
