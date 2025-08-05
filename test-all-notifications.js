const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// Your test token
const testToken = 'ExponentPushToken[f0ASTxDVKkZxv8mGHBG3Y5]';

async function testAllNotifications() {
  console.log('🧪 Testing All Notification Types...');
  console.log('  - Token:', testToken);
  
  // Validate the token
  if (!Expo.isExpoPushToken(testToken)) {
    console.error('❌ Invalid Expo push token');
    return;
  }

  const notifications = [
    {
      name: '📱 Regular Message',
      message: {
        to: testToken,
        sound: 'default',
        title: 'New Message',
        body: 'John Doe: Hey! How are you doing?',
        data: {
          type: 'message',
          senderId: 'user123',
          senderName: 'John Doe',
          senderImage: 'https://example.com/avatar.jpg',
          messageContent: 'Hey! How are you doing?',
          timestamp: new Date().toISOString()
        },
        channelId: 'default',
      }
    },
    {
      name: '🎵 Playlist Shared',
      message: {
        to: testToken,
        sound: 'default',
        title: 'New Playlist Shared',
        body: 'John Doe shared "Summer Vibes 2024" with you',
        data: {
          type: 'message',
          senderId: 'user123',
          senderName: 'John Doe',
          senderImage: 'https://example.com/avatar.jpg',
          messageContent: 'Check out this awesome playlist!',
          playlistId: 'playlist123',
          playlistName: 'Summer Vibes 2024',
          timestamp: new Date().toISOString()
        },
        channelId: 'default',
      }
    },
    {
      name: '❤️ Playlist Liked',
      message: {
        to: testToken,
        sound: 'default',
        title: 'Playlist Liked',
        body: 'Sarah Wilson liked your playlist "Workout Mix"',
        data: {
          type: 'playlist_like',
          likerId: 'user456',
          likerName: 'Sarah Wilson',
          likerImage: 'https://example.com/sarah.jpg',
          playlistId: 'playlist789',
          playlistName: 'Workout Mix',
          timestamp: new Date().toISOString()
        },
        channelId: 'default',
      }
    },
    {
      name: '💬 New Comment',
      message: {
        to: testToken,
        sound: 'default',
        title: 'New Comment',
        body: 'Mike Johnson commented on "Chill Vibes": "This is amazing! 🔥"',
        data: {
          type: 'playlist_comment',
          commenterId: 'user789',
          commenterName: 'Mike Johnson',
          commenterImage: 'https://example.com/mike.jpg',
          playlistId: 'playlist456',
          playlistName: 'Chill Vibes',
          commentContent: 'This is amazing! 🔥',
          timestamp: new Date().toISOString()
        },
        channelId: 'default',
      }
    },
    {
      name: '👥 New Follower',
      message: {
        to: testToken,
        sound: 'default',
        title: 'New Follower',
        body: 'Alex Thompson started following you',
        data: {
          type: 'follow',
          followerId: 'user101',
          followerName: 'Alex Thompson',
          followerImage: 'https://example.com/alex.jpg',
          timestamp: new Date().toISOString()
        },
        channelId: 'default',
      }
    }
  ];

  console.log(`\n📋 Sending ${notifications.length} test notifications...\n`);

  for (let i = 0; i < notifications.length; i++) {
    const notification = notifications[i];
    
    console.log(`${i + 1}. ${notification.name}`);
    
    try {
      // Add a small delay between notifications
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const tickets = await expo.sendPushNotificationsAsync([notification.message]);
      
      // Check for errors
      const errors = tickets.filter(ticket => ticket.status === 'error');
      if (errors.length > 0) {
        console.log(`   ❌ Failed: ${errors[0].message}`);
      } else {
        console.log('   ✅ Sent successfully');
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n📊 Test Summary:');
  console.log('  - All notification types tested');
  console.log('  - Check your device for the notifications');
  console.log('  - Each notification should have different content and data');
}

// Run the test
testAllNotifications(); 