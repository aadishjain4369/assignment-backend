import bcrypt from 'bcrypt';

import { User } from '../models/user.js';

const SALT_ROUNDS = 10;

export async function createUser(
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const doc = await User.create({ email, passwordHash });
  return { id: doc._id.toString(), email: doc.email };
}

export async function findUserByEmail(email: string) {
  return User.findOne({ email: email.toLowerCase() });
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
