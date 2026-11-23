import cors from 'cors';
import express from 'express';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import bookingRoutes from './routes/bookings';
import resourceRoutes from './routes/resources';
import statsRoutes from './routes/stats';
import ticketRoutes from './routes/tickets';

export const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);