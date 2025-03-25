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

// Apply middleware and routes
router.use(authenticateToken);
router.get('/me', getCurrentUser);
router.get('/search', searchUsers);
router.post('/messages', sendMessage);
router.get('/messages', getMessages);

export default router;
