import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotification(tokens: string[], notification: {
  title: string;
  body: string;
  data?: any;
}) {
  const messages: ExpoPushMessage[] = [];

  // Create messages for each token
  for (let pushToken of tokens) {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      continue;
    }

    messages.push({
      to: pushToken,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      channelId: 'default',
    });
  }

  // Send messages in chunks
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (let chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  return tickets;
}

// Function to send follow notification
export async function sendFollowNotification(
  followerId: string, 
  followerName: string, 
  followerImage: string | null, 
  targetUserId: string
) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Get target user's push tokens
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId: targetUserId },
      select: { token: true }
    });

    if (pushTokens.length === 0) {
      console.log('No push tokens found for user:', targetUserId);
      return;
    }

    const tokens = pushTokens.map((pt: { token: string }) => pt.token);

    const notification = {
      title: 'New Follower',
      body: `${followerName} started following you`,
      data: {
        type: 'follow',
        followerId,
        followerName,
        followerImage
      }
    };

    const tickets = await sendPushNotification(tokens, notification);
    console.log('Follow notification sent:', tickets);

    return tickets;
  } catch (error) {
    console.error('Error sending follow notification:', error);
    throw error;
  }
}

// Function to send message notification
export async function sendMessageNotification(
  senderId: string,
  senderName: string,
  senderImage: string | null,
  recipientId: string,
  messageContent: string,
  playlistId?: string,
  playlistName?: string
) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Get recipient's push tokens
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId: recipientId },
      select: { token: true }
    });

    if (pushTokens.length === 0) {
      console.log('No push tokens found for recipient:', recipientId);
      return;
    }

    const tokens = pushTokens.map((pt: { token: string }) => pt.token);

    // Create notification content
    let title = 'New Message';
    let body = `${senderName}: ${messageContent}`;
    
    // If message includes a playlist, mention it
    if (playlistId && playlistName) {
      title = 'New Playlist Shared';
      body = `${senderName} shared "${playlistName}" with you`;
    }

    const notification = {
      title,
      body,
      data: {
        type: 'message',
        senderId,
        senderName,
        senderImage,
        messageContent,
        playlistId,
        playlistName,
        timestamp: new Date().toISOString()
      }
    };

    const tickets = await sendPushNotification(tokens, notification);
    console.log('Message notification sent:', tickets);

    return tickets;
  } catch (error) {
    console.error('Error sending message notification:', error);
    throw error;
  }
}

// Function to send playlist like notification
export async function sendPlaylistLikeNotification(
  likerId: string,
  likerName: string,
  likerImage: string | null,
  playlistOwnerId: string,
  playlistId: string,
  playlistName: string
) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Don't send notification if user likes their own playlist
    if (likerId === playlistOwnerId) {
      return;
    }

    // Get playlist owner's push tokens
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId: playlistOwnerId },
      select: { token: true }
    });

    if (pushTokens.length === 0) {
      console.log('No push tokens found for playlist owner:', playlistOwnerId);
      return;
    }

    const tokens = pushTokens.map((pt: { token: string }) => pt.token);

    const notification = {
      title: 'Playlist Liked',
      body: `${likerName} liked your playlist "${playlistName}"`,
      data: {
        type: 'playlist_like',
        likerId,
        likerName,
        likerImage,
        playlistId,
        playlistName,
        timestamp: new Date().toISOString()
      }
    };

    const tickets = await sendPushNotification(tokens, notification);
    console.log('Playlist like notification sent:', tickets);

    return tickets;
  } catch (error) {
    console.error('Error sending playlist like notification:', error);
    throw error;
  }
}

// Function to send playlist comment notification
export async function sendPlaylistCommentNotification(
  commenterId: string,
  commenterName: string,
  commenterImage: string | null,
  playlistOwnerId: string,
  playlistId: string,
  playlistName: string,
  commentContent: string
) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Don't send notification if user comments on their own playlist
    if (commenterId === playlistOwnerId) {
      return;
    }

    // Get playlist owner's push tokens
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId: playlistOwnerId },
      select: { token: true }
    });

    if (pushTokens.length === 0) {
      console.log('No push tokens found for playlist owner:', playlistOwnerId);
      return;
    }

    const tokens = pushTokens.map((pt: { token: string }) => pt.token);

    // Truncate comment if too long
    const truncatedComment = commentContent.length > 50 
      ? commentContent.substring(0, 50) + '...' 
      : commentContent;

    const notification = {
      title: 'New Comment',
      body: `${commenterName} commented on "${playlistName}": "${truncatedComment}"`,
      data: {
        type: 'playlist_comment',
        commenterId,
        commenterName,
        commenterImage,
        playlistId,
        playlistName,
        commentContent,
        timestamp: new Date().toISOString()
      }
    };

    const tickets = await sendPushNotification(tokens, notification);
    console.log('Playlist comment notification sent:', tickets);

    return tickets;
  } catch (error) {
    console.error('Error sending playlist comment notification:', error);
    throw error;
  }
}

// Function to send unfollow notification (optional - some apps don't send these)
export async function sendUnfollowNotification(
  followerId: string, 
  followerName: string, 
  targetUserId: string
) {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    // Get target user's push tokens
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId: targetUserId },
      select: { token: true }
    });

    if (pushTokens.length === 0) {
      console.log('No push tokens found for user:', targetUserId);
      return;
    }

    const tokens = pushTokens.map((pt: { token: string }) => pt.token);

    const notification = {
      title: 'User Unfollowed',
      body: `${followerName} unfollowed you`,
      data: {
        type: 'unfollow',
        followerId,
        followerName
      }
    };

    const tickets = await sendPushNotification(tokens, notification);
    console.log('Unfollow notification sent:', tickets);

    return tickets;
  } catch (error) {
    console.error('Error sending unfollow notification:', error);
    throw error;
  }
} 