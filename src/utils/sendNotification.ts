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