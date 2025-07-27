import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { sendPushNotification } from '../../utils/sendNotification';

const router = Router();

// Send notification to a specific user
const sendNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { targetUserId, title, body, data } = req.body;

    if (!targetUserId || !title || !body) {
      res.status(400).json({ 
        error: 'targetUserId, title, and body are required' 
      });
      return;
    }

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true }
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Target user not found' });
      return;
    }

    // Get target user's push tokens
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId: targetUserId },
      select: { token: true }
    });

    if (pushTokens.length === 0) {
      res.status(404).json({ 
        error: 'No push tokens found for target user',
        message: 'The user has not registered any devices for notifications'
      });
      return;
    }

    const tokens = pushTokens.map((pt: { token: string }) => pt.token);

    // Send the notification
    const notification = {
      title,
      body,
      data: {
        ...data,
        senderId: user!.id,
        senderName: user!.name,
        timestamp: new Date().toISOString()
      }
    };

    const tickets = await sendPushNotification(tokens, notification);

    res.json({
      success: true,
      message: 'Notification sent successfully',
      data: {
        targetUserId,
        targetUserName: targetUser.name,
        tokensCount: tokens.length,
        tickets,
        notification
      }
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    next(error);
  }
};

// Send notification to multiple users
const sendNotificationToMultiple = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { targetUserIds, title, body, data } = req.body;

    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      res.status(400).json({ 
        error: 'targetUserIds array is required and must not be empty' 
      });
      return;
    }

    if (!title || !body) {
      res.status(400).json({ 
        error: 'title and body are required' 
      });
      return;
    }

    const results = [];
    const errors = [];

    for (const targetUserId of targetUserIds) {
      try {
        // Verify the target user exists
        const targetUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, name: true }
        });

        if (!targetUser) {
          errors.push({
            userId: targetUserId,
            error: 'User not found'
          });
          continue;
        }

        // Get target user's push tokens
        const pushTokens = await prisma.pushToken.findMany({
          where: { userId: targetUserId },
          select: { token: true }
        });

        if (pushTokens.length === 0) {
          errors.push({
            userId: targetUserId,
            userName: targetUser.name,
            error: 'No push tokens found'
          });
          continue;
        }

        const tokens = pushTokens.map((pt: { token: string }) => pt.token);

        // Send the notification
        const notification = {
          title,
          body,
          data: {
            ...data,
            senderId: user!.id,
            senderName: user!.name,
            timestamp: new Date().toISOString()
          }
        };

        const tickets = await sendPushNotification(tokens, notification);

        results.push({
          userId: targetUserId,
          userName: targetUser.name,
          tokensCount: tokens.length,
          tickets,
          success: true
        });

      } catch (error) {
        errors.push({
          userId: targetUserId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      message: `Processed ${targetUserIds.length} users`,
      data: {
        total: targetUserIds.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('Error sending notifications to multiple users:', error);
    next(error);
  }
};

// Get notification statistics for a user
const getNotificationStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    const pushTokens = await prisma.pushToken.findMany({
      where: { userId: user!.id },
      select: {
        id: true,
        platform: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const platformStats = pushTokens.reduce((acc, token) => {
      acc[token.platform] = (acc[token.platform] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        totalTokens: pushTokens.length,
        platformStats,
        tokens: pushTokens
      }
    });

  } catch (error) {
    console.error('Error getting notification stats:', error);
    next(error);
  }
};

// Apply middleware
router.use(authenticateToken);

// Notification routes
router.post('/send', sendNotification);
router.post('/send-multiple', sendNotificationToMultiple);
router.get('/stats', getNotificationStats);

export default router; 