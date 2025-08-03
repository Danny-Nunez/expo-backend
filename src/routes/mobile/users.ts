import { Router, Response, Request, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { sendFollowNotification, sendMessageNotification } from '../../utils/sendNotification';

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

    // Get playlist name if playlistId is provided
    let playlistName: string | undefined;
    if (playlistId) {
      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
        select: { name: true }
      });
      playlistName = playlist?.name;
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

    // Send push notification to recipient
    try {
      await sendMessageNotification(
        user!.id,
        user!.name || 'Someone',
        user!.image,
        toUserId,
        content.trim(),
        playlistId,
        playlistName
      );
    } catch (notificationError) {
      console.error('Failed to send message notification:', notificationError);
      // Don't fail the message request if notification fails
    }

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

      // Send push notification to the user being followed
      try {
        await sendFollowNotification(
          user!.id,
          user!.name || 'Someone',
          user!.image,
          userId
        );
      } catch (notificationError) {
        console.error('Failed to send follow notification:', notificationError);
        // Don't fail the follow request if notification fails
      }

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

// Get user's playlists with details
const getUserPlaylists = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Get the target user's information
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true
      }
    });

    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get user's playlists with songs
    const playlists = await prisma.playlist.findMany({
      where: {
        userId: userId,
        isPublic: true // Only show public playlists
      },
      include: {
        songs: {
          include: {
            song: {
              select: {
                videoId: true,
                title: true,
                artist: true,
                thumbnail: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    res.json({
      success: true,
      user: {
        id: targetUser.id,
        name: targetUser.name,
        image: targetUser.image
      },
      playlists: playlists.map(playlist => ({
        id: playlist.id,
        name: playlist.name,
        songCount: playlist.songs.length,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        songs: playlist.songs.map(ps => ({
          videoId: ps.song.videoId,
          title: ps.song.title,
          artist: ps.song.artist,
          thumbnail: ps.song.thumbnail
        }))
      }))
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

// Add favorite artist
const addFavoriteArtist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { browseId, name, thumbnails } = req.body;

    if (!browseId || !name || !thumbnails) {
      res.status(400).json({ error: 'Missing required fields: browseId, name, thumbnails' });
      return;
    }

    // Create or update favorite artist
    try {
      const favoriteArtist = await prisma.favoriteArtist.create({
        data: {
          userId: user!.id,
          browseId,
          name,
          thumbnails
        }
      });

      res.json({
        success: true,
        message: `Added ${name} to favorite artists`,
        favoriteArtist
      });
    } catch (error: any) {
      // If artist is already favorited, return success
      if (error.code === 'P2002') {
        res.json({
          success: true,
          message: `${name} is already in your favorite artists`
        });
        return;
      }
      throw error;
    }

  } catch (error) {
    next(error);
  }
};

// Remove favorite artist
const removeFavoriteArtist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { browseId } = req.params;

    if (!browseId || typeof browseId !== 'string') {
      res.status(400).json({ error: 'Browse ID is required' });
      return;
    }

    // Remove favorite artist
    const result = await prisma.favoriteArtist.deleteMany({
      where: {
        userId: user!.id,
        browseId: browseId
      }
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Artist not found in favorites' });
      return;
    }

    res.json({
      success: true,
      message: 'Artist removed from favorites'
    });

  } catch (error) {
    next(error);
  }
};

// Get user's favorite artists
const getFavoriteArtists = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;

    const favoriteArtists = await prisma.favoriteArtist.findMany({
      where: {
        userId: user!.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      content: favoriteArtists.map(artist => ({
        type: 'artist',
        browseId: artist.browseId,
        name: artist.name,
        thumbnails: artist.thumbnails
      }))
    });

  } catch (error) {
    next(error);
  }
};

// Add multiple favorite artists (batch)
const addFavoriteArtistsBatch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { artists } = req.body;

    if (!artists || !Array.isArray(artists) || artists.length === 0) {
      res.status(400).json({ error: 'Artists array is required and must not be empty' });
      return;
    }

    // Validate each artist has required fields
    for (const artist of artists) {
      if (!artist.browseId || !artist.name || !artist.thumbnails) {
        res.status(400).json({ 
          error: 'Each artist must have browseId, name, and thumbnails fields',
          invalidArtist: artist
        });
        return;
      }
    }

    const results = [];
    const errors = [];

    // Process each artist
    for (const artist of artists) {
      try {
        const favoriteArtist = await prisma.favoriteArtist.create({
          data: {
            userId: user!.id,
            browseId: artist.browseId,
            name: artist.name,
            thumbnails: artist.thumbnails
          }
        });

        results.push({
          browseId: artist.browseId,
          name: artist.name,
          status: 'added',
          favoriteArtist
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          // Artist already exists
          results.push({
            browseId: artist.browseId,
            name: artist.name,
            status: 'already_exists'
          });
        } else {
          errors.push({
            browseId: artist.browseId,
            name: artist.name,
            error: error.message
          });
        }
      }
    }

    res.json({
      success: true,
      message: `Processed ${artists.length} artists`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: artists.length,
        added: results.filter(r => r.status === 'added').length,
        alreadyExists: results.filter(r => r.status === 'already_exists').length,
        errors: errors.length
      }
    });

  } catch (error) {
    next(error);
  }
};

// Check if artist is favorited
const checkFavoriteArtist = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { browseId } = req.params;

    if (!browseId || typeof browseId !== 'string') {
      res.status(400).json({ error: 'Browse ID is required' });
      return;
    }

    const favoriteArtist = await prisma.favoriteArtist.findUnique({
      where: {
        userId_browseId: {
          userId: user!.id,
          browseId: browseId
        }
      }
    });

    res.json({
      success: true,
      isFavorited: !!favoriteArtist
    });

  } catch (error) {
    next(error);
  }
};

// Register push token
const registerPushToken = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { token, platform } = req.body;

    console.log('🔔 Push Token Registration Attempt:');
    console.log('  - User ID:', user!.id);
    console.log('  - User Name:', user!.name);
    console.log('  - Platform:', platform);
    console.log('  - Token (first 20 chars):', token ? `${token.substring(0, 20)}...` : 'undefined');

    if (!token || !platform) {
      console.log('❌ Registration Failed: Missing token or platform');
      res.status(400).json({ 
        error: 'Token and platform are required' 
      });
      return;
    }

    if (!['ios', 'android'].includes(platform)) {
      console.log('❌ Registration Failed: Invalid platform -', platform);
      res.status(400).json({ 
        error: 'Platform must be either "ios" or "android"' 
      });
      return;
    }

    // Check if token already exists for this user
    console.log('🔍 Checking for existing token...');
    const existingToken = await prisma.pushToken.findFirst({
      where: {
        userId: user!.id,
        token
      }
    });

    if (existingToken) {
      console.log('🔄 Updating existing token...');
      console.log('  - Existing Token ID:', existingToken.id);
      console.log('  - Old Platform:', existingToken.platform);
      console.log('  - New Platform:', platform);
      
      // Update existing token
      const updatedToken = await prisma.pushToken.update({
        where: { id: existingToken.id },
        data: {
          platform,
          updatedAt: new Date()
        }
      });
      
      console.log('✅ Token Updated Successfully:');
      console.log('  - Token ID:', updatedToken.id);
      console.log('  - Updated At:', updatedToken.updatedAt);
    } else {
      console.log('🆕 Creating new token...');
      
      // Create new token
      const newToken = await prisma.pushToken.create({
        data: {
          userId: user!.id,
          token,
          platform
        }
      });
      
      console.log('✅ New Token Created Successfully:');
      console.log('  - Token ID:', newToken.id);
      console.log('  - Created At:', newToken.createdAt);
    }

    // Get total tokens for this user
    const totalTokens = await prisma.pushToken.count({
      where: { userId: user!.id }
    });
    
    console.log('📊 User Token Summary:');
    console.log('  - Total tokens for user:', totalTokens);

    res.json({ 
      success: true, 
      message: 'Push token registered successfully' 
    });

  } catch (error) {
    console.error('❌ Error registering push token:', error);
    res.status(500).json({ 
      error: 'Failed to register push token' 
    });
  }
};

// Get user's push tokens (for debugging)
const getPushTokens = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    
    console.log('🔍 Fetching Push Tokens:');
    console.log('  - User ID:', user!.id);
    console.log('  - User Name:', user!.name);
    
    const tokens = await prisma.pushToken.findMany({
      where: { userId: user!.id },
      select: {
        id: true,
        token: true,
        platform: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log('📱 Found Tokens:');
    console.log('  - Count:', tokens.length);
    tokens.forEach((token, index) => {
      console.log(`  - Token ${index + 1}:`);
      console.log(`    ID: ${token.id}`);
      console.log(`    Platform: ${token.platform}`);
      console.log(`    Token: ${token.token.substring(0, 20)}...`);
      console.log(`    Created: ${token.createdAt}`);
      console.log(`    Updated: ${token.updatedAt}`);
    });

    res.json({ success: true, tokens });
  } catch (error) {
    console.error('❌ Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
};

// Delete push token (for logout)
const deletePushToken = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { tokenId } = req.params;

    console.log('🗑️ Delete Push Token Attempt:');
    console.log('  - User ID:', user!.id);
    console.log('  - User Name:', user!.name);
    console.log('  - Token ID to delete:', tokenId);

    const token = await prisma.pushToken.findFirst({
      where: {
        id: tokenId,
        userId: user!.id
      }
    });

    if (!token) {
      console.log('❌ Token not found for deletion');
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    console.log('🔍 Found token to delete:');
    console.log('  - Token ID:', token.id);
    console.log('  - Platform:', token.platform);
    console.log('  - Token (first 20 chars):', token.token.substring(0, 20) + '...');
    console.log('  - Created:', token.createdAt);

    await prisma.pushToken.delete({
      where: { id: tokenId }
    });

    console.log('✅ Token deleted successfully');

    res.json({ success: true, message: 'Token deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting token:', error);
    res.status(500).json({ error: 'Failed to delete token' });
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
router.post('/:userId/follow', followUser);
router.delete('/:userId/unfollow', unfollowUser);
router.get('/:userId/followers', getFollowers);
router.get('/:userId/following', getFollowing);
router.get('/:userId/follow-status', checkFollowStatus);
router.get('/:userId/playlists', getUserPlaylists); // Added this line
router.get('/:userId/follow-counts', getFollowCounts);
router.post('/:userId/favorite-artists', addFavoriteArtist);
router.post('/favorite-artists/batch', addFavoriteArtistsBatch); // Added this line
router.delete('/favorite-artists/:browseId', removeFavoriteArtist);
router.get('/favorite-artists', getFavoriteArtists);
router.get('/favorite-artists/:browseId/status', checkFavoriteArtist);
router.delete('/conversations/:userId', deleteConversation);
router.post('/register-push-token', registerPushToken);
router.get('/push-tokens', getPushTokens);
router.delete('/push-tokens/:tokenId', deletePushToken);

export default router;
