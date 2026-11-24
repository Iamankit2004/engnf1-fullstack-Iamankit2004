export type Role = 'USER' | 'ADMIN';
export type TicketCategory = 'BILLING' | 'BUG' | 'FEATURE_REQUEST' | 'LOGIN' | 'DELIVERY';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type ResourceType = 'ROOM' | 'LAB' | 'EQUIPMENT';
export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface Ticket {
  id: string;
  externalId: string;
  subject: string;
  body: string;
  autoCategory: TicketCategory;
  category: TicketCategory;
  isHumanOverride: boolean;
  priority: TicketPriority;
  status: TicketStatus;
  assigneeId: string | null;
  isReviewed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  field: 'category' | 'priority' | 'status' | 'assigneeId';
  oldValue: string | null;
  newValue: string | null;
  actor: string;
  createdAt: string;
}

export interface TicketStats {
  byCategory: Record<TicketCategory, number>;
  byPriority: Record<TicketPriority, number>;
  byStatus: Record<TicketStatus, number>;
  reviewedCount: number;
  modelAgreementRate: number;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Booking {
  id: string;
  resourceId: string;
  userId: string;
  ticketId: string | null;
  startTime: string;
  endTime: string;
  purpose: string;
  status: BookingStatus;
  decisionNote: string | null;
  createdAt: string;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'APPROVED';
}

export interface AdminStats {
  activeResources: number;
  bookingsByStatus: Record<BookingStatus, number>;
  topResources: Array<{ id: string; name: string; type: ResourceType; bookingCount: number }>;
  ticketStats: TicketStats;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}