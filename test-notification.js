const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// Your test token
const testToken = 'ExponentPushToken[f0ASTxDVKkZxv8mGHBG3Y5]';

async function sendTestNotification() {
  console.log('🧪 Sending test notification...');
  console.log('  - Token:', testToken);
  
  // Validate the token
  if (!Expo.isExpoPushToken(testToken)) {
    console.error('❌ Invalid Expo push token');
    return;
  }

  // Create the notification message
  const message = {
    to: testToken,
    sound: 'default',
    title: 'Test Notification',
    body: 'This is a test notification from your BeatInBox server! 🎵',
    data: {
      type: 'test',
      timestamp: new Date().toISOString(),
      message: 'Hello from your backend!'
    },
    channelId: 'default',
  };

  try {
    // Send the notification
    const tickets = await expo.sendPushNotificationsAsync([message]);
    
    console.log('✅ Notification sent successfully!');
    console.log('  - Tickets:', tickets);
    
    // Check for errors
    const errors = tickets.filter(ticket => ticket.status === 'error');
    if (errors.length > 0) {
      console.log('⚠️  Some notifications failed:');
      errors.forEach(error => {
        console.log('  - Error:', error.message);
      });
    }
    
  } catch (error) {
    console.error('❌ Error sending notification:', error);
  }
}

// Run the test
sendTestNotification(); 