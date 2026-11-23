declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      name: string;
      email: string;
      role: 'USER' | 'ADMIN';
      createdAt: string;
    }
    interface Request {
      user?: AuthUser;
    }
  }
}
export {};
