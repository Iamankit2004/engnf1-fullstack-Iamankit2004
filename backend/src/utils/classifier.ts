export type TicketCategory = 'BILLING' | 'BUG' | 'FEATURE_REQUEST' | 'LOGIN' | 'DELIVERY';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

const CATEGORY_RULES: Array<{ category: TicketCategory; keywords: string[] }> = [
  { category: 'BILLING', keywords: ['refund', 'invoice', 'charge', 'payment'] },
  { category: 'LOGIN', keywords: ['password', '2fa', 'sign in', 'locked out', 'login'] },
  { category: 'DELIVERY', keywords: ['package', 'arrived', 'shipping', 'tracking', 'delivery'] },
  { category: 'BUG', keywords: ['crash', 'error', '500', 'exception', 'broken'] },
];

const URGENT_KEYWORDS = ['urgent', 'production down', 'locked out'];
const HIGH_KEYWORDS = ['error', 'refund', 'not arrived'];

export function classifyTicket(subject: string, body: string): {
  category: TicketCategory;
  priority: TicketPriority;
} {
  const text = `${subject} ${body}`.toLowerCase();

  let category: TicketCategory = 'FEATURE_REQUEST';
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      category = rule.category;
      break;
    }
  }

  let priority: TicketPriority = 'MEDIUM';
  if (URGENT_KEYWORDS.some((kw) => text.includes(kw))) {
    priority = 'URGENT';
  } else if (HIGH_KEYWORDS.some((kw) => text.includes(kw))) {
    priority = 'HIGH';
  }

  return { category, priority };
}