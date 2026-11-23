import { NextFunction, Request, Response } from 'express';
import { AppError, notFound } from '../errors';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(notFound('Route not found'));
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}
