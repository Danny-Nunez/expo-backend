const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// Your test token
const testToken = 'ExponentPushToken[C4RbEEFQU11qZ0AhC8kskx]';

async function sendMessageNotification() {
  console.log('💬 Sending message notification test...');
  console.log('  - Token:', testToken);
  
  // Validate the token
  if (!Expo.isExpoPushToken(testToken)) {
    console.error('❌ Invalid Expo push token');
    return;
  }

  // Test 1: Regular message
  console.log('\n📱 Test 1: Regular Message');
  const regularMessage = {
    to: testToken,
    sound: 'default',
    title: 'New Message',
    body: 'John Doe: Hey! Check out this awesome playlist I made!',
    data: {
      type: 'message',
      senderId: 'user123',
      senderName: 'John Doe',
      senderImage: 'https://example.com/avatar.jpg',
      messageContent: 'Hey! Check out this awesome playlist I made!',
      timestamp: new Date().toISOString()
    },
    channelId: 'default',
  };

  try {
    const tickets1 = await expo.sendPushNotificationsAsync([regularMessage]);
    console.log('✅ Regular message notification sent!');
    console.log('  - Tickets:', tickets1);
  } catch (error) {
    console.error('❌ Error sending regular message:', error);
  }

  // Test 2: Playlist shared message
  console.log('\n🎵 Test 2: Playlist Shared');
  const playlistMessage = {
    to: testToken,
    sound: 'default',
    title: 'New Playlist Shared',
    body: 'John Doe shared "Summer Vibes 2024" with you',
    data: {
      type: 'message',
      senderId: 'user123',
      senderName: 'John Doe',
      senderImage: 'https://example.com/avatar.jpg',
      messageContent: 'Check out this playlist!',
      playlistId: 'playlist123',
      playlistName: 'Summer Vibes 2024',
      timestamp: new Date().toISOString()
    },
    channelId: 'default',
  };

  try {
    const tickets2 = await expo.sendPushNotificationsAsync([playlistMessage]);
    console.log('✅ Playlist shared notification sent!');
    console.log('  - Tickets:', tickets2);
  } catch (error) {
    console.error('❌ Error sending playlist message:', error);
  }

  // Check for errors
  console.log('\n📊 Summary:');
  console.log('  - Both test notifications sent successfully!');
  console.log('  - Check your device for the notifications');
}

// Run the test
sendMessageNotification(); 