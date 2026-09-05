import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  coins: number;
  avatar: string;       // emoji avatar e.g. "🦊"
  friends: string[];
  createdAt: Date;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  coins: number;
  avatar: string;
  friends: string[];
  createdAt: Date;
}

const DEFAULT_AVATARS = ['🦊','🐯','🐻','🦁','🐸','🐧','🦄','🐲','🦋','🐙'];

const users: Map<string, User> = new Map();
const emailIndex: Map<string, string> = new Map();
const usernameIndex: Map<string, string> = new Map();

export const UserModel = {
  async create(username: string, email: string, password: string): Promise<User> {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    const avatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
    const user: User = {
      id, username, email: email.toLowerCase(),
      passwordHash, coins: 1000, avatar, friends: [],
      createdAt: new Date(),
    };
    users.set(id, user);
    emailIndex.set(email.toLowerCase(), id);
    usernameIndex.set(username.toLowerCase(), id);
    return user;
  },

  findById(id: string): User | undefined { return users.get(id); },

  findByEmail(email: string): User | undefined {
    const id = emailIndex.get(email.toLowerCase());
    return id ? users.get(id) : undefined;
  },

  findByUsername(username: string): User | undefined {
    const id = usernameIndex.get(username.toLowerCase());
    return id ? users.get(id) : undefined;
  },

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  },

  toPublic(user: User): PublicUser {
    const { passwordHash, ...publicUser } = user;
    return publicUser;
  },

  adjustCoins(userId: string, amount: number): number {
    const user = users.get(userId);
    if (!user) return 0;
    user.coins = Math.max(0, user.coins + amount);
    return user.coins;
  },

  updateAvatar(userId: string, avatar: string): boolean {
    const user = users.get(userId);
    if (!user) return false;
    user.avatar = avatar;
    return true;
  },

  async updatePassword(userId: string, newPassword: string): Promise<boolean> {
    const user = users.get(userId);
    if (!user) return false;
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    return true;
  },

  updateUsername(userId: string, newUsername: string): { success: boolean; error?: string } {
    if (usernameIndex.has(newUsername.toLowerCase())) {
      return { success: false, error: 'Username already taken' };
    }
    const user = users.get(userId);
    if (!user) return { success: false, error: 'User not found' };
    usernameIndex.delete(user.username.toLowerCase());
    user.username = newUsername;
    usernameIndex.set(newUsername.toLowerCase(), userId);
    return { success: true };
  },

  addFriend(userId: string, friendId: string): void {
    const user = users.get(userId);
    if (user && !user.friends.includes(friendId)) user.friends.push(friendId);
  },

  emailExists(email: string): boolean { return emailIndex.has(email.toLowerCase()); },
  usernameExists(username: string): boolean { return usernameIndex.has(username.toLowerCase()); },
};
