import type { Request } from 'express';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  permissions: string[];
}

export interface AuthenticatedAdminRequest extends Request {
  admin?: AuthenticatedAdmin;
}
