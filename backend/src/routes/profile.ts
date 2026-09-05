import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { UserModel } from '../models/User';
import { GameHistoryModel } from '../models/GameHistory';

const router = Router();

const ALLOWED_AVATARS = [
  '🦊','🐯','🐻','🦁','🐸','🐧','🦄','🐲','🦋','🐙',
  '🎭','🎪','🎯','🃏','🎲','🎮','👾','🤖','🦸','🧙',
  '🐼','🐨','🦊','🦝','🦦','🦥','🐮','🐷','🐔','🦆',
];

// GET /api/profile  — own full profile + stats
router.get('/', authMiddleware, (req: AuthRequest, res: Response): void => {
  const user = UserModel.findById(req.user!.userId);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const stats = GameHistoryModel.getStats(user.id);
  const recentGames = GameHistoryModel.getForUser(user.id, 20);

  res.json({
    user: UserModel.toPublic(user),
    stats,
    recentGames,
  });
});

// GET /api/profile/:userId  — public profile of any user
router.get('/:userId', authMiddleware, (req: AuthRequest, res: Response): void => {
  const user = UserModel.findById(req.params.userId);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const stats = GameHistoryModel.getStats(user.id);
  const recentGames = GameHistoryModel.getForUser(user.id, 10);

  res.json({
    user: UserModel.toPublic(user),
    stats,
    recentGames,
  });
});

// PATCH /api/profile/avatar  — change avatar emoji
router.patch('/avatar', authMiddleware, (req: AuthRequest, res: Response): void => {
  const { avatar } = req.body;
  if (!avatar || !ALLOWED_AVATARS.includes(avatar)) {
    res.status(400).json({ error: 'Invalid avatar' }); return;
  }
  UserModel.updateAvatar(req.user!.userId, avatar);
  const user = UserModel.findById(req.user!.userId)!;
  res.json({ user: UserModel.toPublic(user) });
});

// PATCH /api/profile/username  — change display name
router.patch('/username', authMiddleware, (req: AuthRequest, res: Response): void => {
  const { username } = req.body;
  if (!username || username.length < 3 || username.length > 20) {
    res.status(400).json({ error: 'Username must be 3–20 characters' }); return;
  }
  const result = UserModel.updateUsername(req.user!.userId, username);
  if (!result.success) { res.status(409).json({ error: result.error }); return; }
  const user = UserModel.findById(req.user!.userId)!;
  res.json({ user: UserModel.toPublic(user) });
});

// PATCH /api/profile/password  — change password
router.patch('/password', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword required' }); return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' }); return;
  }
  const user = UserModel.findById(req.user!.userId);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const valid = await UserModel.verifyPassword(user, currentPassword);
  if (!valid) { res.status(401).json({ error: 'Current password is incorrect' }); return; }

  await UserModel.updatePassword(user.id, newPassword);
  res.json({ message: 'Password updated successfully' });
});

// GET /api/profile/history  — game history with pagination
router.get('/history/list', authMiddleware, (req: AuthRequest, res: Response): void => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const games = GameHistoryModel.getForUser(req.user!.userId, limit);
  const stats = GameHistoryModel.getStats(req.user!.userId);
  res.json({ games, stats });
});

export default router;
