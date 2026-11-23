import bcrypt from 'bcryptjs';
import { pool } from './pool';

type SeedTicket = {
  externalId: string;
  subject: string;
  body: string;
  autoCategory: string;
  category: string;
  priority: string;
  status: string;
  isReviewed: boolean;
  isHumanOverride: boolean;
};

const t = (
  n: number,
  subject: string,
  body: string,
  category: string,
  priority: string,
  status = 'OPEN',
  extra: Partial<SeedTicket> = {}
): SeedTicket => ({
  externalId: `SEED-${String(n).padStart(3, '0')}`,
  subject,
  body,
  autoCategory: category,
  category,
  priority,
  status,
  isReviewed: false,
  isHumanOverride: false,
  ...extra,
});

const tickets: SeedTicket[] = [
  t(1, 'Refund for duplicate charge', 'I was charged twice for my subscription, please refund one.', 'BILLING', 'HIGH'),
  t(2, 'Invoice missing for October', 'I cannot find the invoice for October in my account.', 'BILLING', 'MEDIUM'),
  t(3, 'Payment failed at checkout', 'My card was declined but the bank says no issue.', 'BILLING', 'HIGH', 'IN_PROGRESS', { isReviewed: true }),
  // Agent overrode the classifier: LOGIN -> BUG
  t(4, 'Cannot sign in after reset', 'Sign in page throws a blank screen after password reset.', 'LOGIN', 'MEDIUM', 'IN_PROGRESS', {
    category: 'BUG',
    isHumanOverride: true,
    isReviewed: true,
  }),
  t(5, 'Locked out of my account', 'Too many attempts and now I am locked out, need access today.', 'LOGIN', 'URGENT'),
  t(6, '2FA codes are slow', 'The 2FA code SMS takes ten minutes to show up.', 'LOGIN', 'MEDIUM', 'RESOLVED', { isReviewed: true }),
  t(7, 'My package has not arrived', 'Order placed two weeks ago and the package has not arrived.', 'DELIVERY', 'HIGH'),
  t(8, 'Tracking shows wrong address', 'Tracking page lists an address that is not mine.', 'DELIVERY', 'MEDIUM'),
  t(9, 'Shipping delay on order 4412', 'Would like an estimate on the delayed shipping.', 'DELIVERY', 'LOW'),
  t(10, 'App crashes on startup', 'The mobile app crash happens right after the splash screen.', 'BUG', 'HIGH'),
  t(11, 'Error 500 when saving profile', 'Saving my profile returns a 500 error every time.', 'BUG', 'HIGH'),
  t(12, 'Production down: dashboard broken', 'Our production dashboard is broken and customers are affected.', 'BUG', 'URGENT'),
  t(13, 'Add dark mode', 'It would be great to have a dark theme option.', 'FEATURE_REQUEST', 'LOW'),
  t(14, 'Export reports to CSV', 'Please allow exporting the weekly report as a CSV file.', 'FEATURE_REQUEST', 'MEDIUM'),
  // XSS payload ticket (T-B5)
  t(
    15,
    "<script>alert('xss')</script> Invoice question",
    '<img src=x onerror=alert(1)> please check my invoice <b>bold</b> & 100% sure',
    'BILLING',
    'LOW'
  ),
];

const resources = [
  ['Conference Room A', 'ROOM', 12, 'Large meeting room with projector', true],
  ['Focus Room B', 'ROOM', 4, 'Quiet room for small calls', true],
  ['Hardware Lab', 'LAB', 8, 'Bench space with soldering stations', true],
  ['Network Lab', 'LAB', 10, 'Switches and routers for live debugging', true],
  ['Oscilloscope Kit', 'EQUIPMENT', 1, 'Portable 4-channel oscilloscope', true],
  ['Packet Analyzer', 'EQUIPMENT', 1, 'Under maintenance', false], // inactive
] as const;

async function main() {
  const users = [
    ['Admin Lead', 'admin@triagesync.test', 'Admin@123', 'ADMIN'],
    ['Agent Demo', 'user@triagesync.test', 'User@123', 'USER'],
  ];
  for (const [name, email, password, role] of users) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (name, email, "passwordHash", role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ((lower(email))) DO NOTHING`,
      [name, email, hash, role]
    );
  }

  for (const [name, type, capacity, description, isActive] of resources) {
    await pool.query(
      `INSERT INTO resources (name, type, capacity, description, "isActive")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ((lower(name))) DO NOTHING`,
      [name, type, capacity, description, isActive]
    );
  }

  for (const k of tickets) {
    await pool.query(
      `INSERT INTO tickets ("externalId", subject, body, "autoCategory", category,
                            "isHumanOverride", priority, status, "isReviewed")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT ("externalId") DO NOTHING`,
      [k.externalId, k.subject, k.body, k.autoCategory, k.category, k.isHumanOverride, k.priority, k.status, k.isReviewed]
    );
  }

  const counts = await pool.query(
    `SELECT (SELECT count(*) FROM users) AS users,
            (SELECT count(*) FROM resources) AS resources,
            (SELECT count(*) FROM tickets) AS tickets`
  );
  console.log('Seed complete:', counts.rows[0]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
