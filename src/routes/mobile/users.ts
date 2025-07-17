import { Router, Response, Request, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';

const router = Router();

interface SendMessageBody {
  toUserId: string;
  content: string;
  playlistId?: string;
}

// Search users
const searchUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const query = req.query.q as string;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } }
            ]
          },
          { NOT: { id: user!.id } } // Exclude current user
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true
      },
      take: 10 // Limit results
    });

    res.json({
      success: true,
      users
    });

  } catch (error) {
    next(error);
  }
};

// Send message
const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { toUserId, content, playlistId } = req.body as SendMessageBody;

    if (!toUserId || !content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Invalid message data' });
      return;
    }

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: toUserId }
    });

    if (!recipient) {
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    // If playlistId is provided, verify it exists and sender has access
    if (playlistId) {
      const playlist = await prisma.playlist.findFirst({
        where: {
          id: playlistId,
          userId: user!.id
        }
      });

      if (!playlist) {
        res.status(404).json({ error: 'Playlist not found or unauthorized' });
        return;
      }
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        content: content.trim(),
        fromId: user!.id,
        toId: toUserId,
        playlistId
      },
      include: {
        from: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        to: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        playlist: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      success: true,
      message
    });

  } catch (error) {
    next(error);
  }
};

// Get messages
const getMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { fromId: user!.id },
          { toId: user!.id }
        ]
      },
      include: {
        from: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        to: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        playlist: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      messages
    });

  } catch (error) {
    next(error);
  }
};

// Get current user profile
const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    const currentUser = await prisma.user.findUnique({
      where: { id: user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true
      }
    });

    if (!currentUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: currentUser
    });

  } catch (error) {
    next(error);
  }
};

// Get unread message count
const getUnreadMessageCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    const count = await prisma.message.count({
      where: {
        toId: user!.id,
        isRead: false
      }
    });

    res.json({
      success: true,
      count
    });

  } catch (error) {
    next(error);
  }
};

// Mark message as read
const markMessageAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { messageId } = req.params;

    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        toId: user!.id
      }
    });

    if (!message) {
      res.status(404).json({ error: 'Message not found or unauthorized' });
      return;
    }

    await prisma.message.update({
      where: { id: messageId },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Message marked as read'
    });

  } catch (error) {
    next(error);
  }
};

// Mark all messages as read
const markAllMessagesAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    await prisma.message.updateMany({
      where: {
        toId: user!.id,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'All messages marked as read'
    });

  } catch (error) {
    next(error);
  }
};

// Follow a user
const followUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Prevent self-following
    if (userId === user!.id) {
      res.status(400).json({ error: 'Cannot follow yourself' });
      return;
    }

    // Verify the user to follow exists
    const userToFollow = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, image: true }
    });

    if (!userToFollow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Create follow relationship
    try {
      await prisma.follow.create({
        data: {
          followerId: user!.id,
          followingId: userId
        }
      });

      res.json({
        success: true,
        message: `Successfully followed ${userToFollow.name || 'user'}`,
        followedUser: userToFollow
      });
    } catch (error: any) {
      // If already following, return success
      if (error.code === 'P2002') {
        res.json({
          success: true,
          message: `Already following ${userToFollow.name || 'user'}`,
          followedUser: userToFollow
        });
        return;
      }
      throw error;
    }

  } catch (error) {
    next(error);
  }
};

// Unfollow a user
const unfollowUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Verify the user to unfollow exists
    const userToUnfollow = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true }
    });

    if (!userToUnfollow) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Remove follow relationship
    const result = await prisma.follow.deleteMany({
      where: {
        followerId: user!.id,
        followingId: userId
      }
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Not following this user' });
      return;
    }

    res.json({
      success: true,
      message: `Successfully unfollowed ${userToUnfollow.name || 'user'}`
    });

  } catch (error) {
    next(error);
  }
};

// Get user's followers
const getFollowers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { userId } = req.params;

    const targetUserId = userId || user!.id;

    const followers = await prisma.follow.findMany({
      where: {
        followingId: targetUserId
      },
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      followers: followers.map(follow => ({
        id: follow.follower.id,
        name: follow.follower.name,
        image: follow.follower.image,
        followedAt: follow.createdAt
      }))
    });

  } catch (error) {
    next(error);
  }
};

// Get users that the user is following
const getFollowing = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { userId } = req.params;

    const targetUserId = userId || user!.id;

    const following = await prisma.follow.findMany({
      where: {
        followerId: targetUserId
      },
      include: {
        following: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      following: following.map(follow => ({
        id: follow.following.id,
        name: follow.following.name,
        image: follow.following.image,
        followedAt: follow.createdAt
      }))
    });

  } catch (error) {
    next(error);
  }
};

// Check if current user is following another user
const checkFollowStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: user!.id,
          followingId: userId
        }
      }
    });

    res.json({
      success: true,
      isFollowing: !!follow
    });

  } catch (error) {
    next(error);
  }
};

// Get follow counts for a user
const getFollowCounts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { userId } = req.params;

    const targetUserId = userId || user!.id;

    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({
        where: { followingId: targetUserId }
      }),
      prisma.follow.count({
        where: { followerId: targetUserId }
      })
    ]);

    res.json({
      success: true,
      counts: {
        followers: followersCount,
        following: followingCount
      }
    });

  } catch (error) {
    next(error);
  }
};

// Delete conversation with a specific user
const deleteConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Verify the other user exists
    const otherUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!otherUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Delete all messages between the current user and the specified user
    const result = await prisma.message.deleteMany({
      where: {
        OR: [
          {
            fromId: user!.id,
            toId: userId
          },
          {
            fromId: userId,
            toId: user!.id
          }
        ]
      }
    });

    res.json({
      success: true,
      message: `Conversation deleted successfully. ${result.count} messages removed.`,
      deletedCount: result.count
    });

  } catch (error) {
    next(error);
  }
};

// Apply middleware and routes
router.use(authenticateToken);
router.get('/me', getCurrentUser);
router.get('/search', searchUsers);
router.post('/messages', sendMessage);
router.get('/messages', getMessages);
router.get('/messages/unread-count', getUnreadMessageCount);
router.patch('/messages/:messageId/read', markMessageAsRead);
router.patch('/messages/read-all', markAllMessagesAsRead);
router.post('/users/:userId/follow', followUser);
router.delete('/users/:userId/unfollow', unfollowUser);
router.get('/users/:userId/followers', getFollowers);
router.get('/users/:userId/following', getFollowing);
router.get('/users/:userId/follow-status', checkFollowStatus);
router.get('/users/:userId/follow-counts', getFollowCounts);
router.delete('/conversations/:userId', deleteConversation);

export default router;
