const { Expo } = require('expo-server-sdk');

const expo = new Expo();

// Test tokens from different projects (development and production)
const testTokens = [
  'ExponentPushToken[f0ASTxDVKkZxv8mGHBG3Y5]', // Your current token
  'ExponentPushToken[C4RbEEFQU11qZ0AhC8kskx]', // Previous token (different project)
];

async function testMultiProjectNotifications() {
  console.log('🧪 Testing Multi-Project Notifications...');
  console.log('  - Tokens:', testTokens.length);
  
  // Validate all tokens
  const validTokens = [];
  for (const token of testTokens) {
    if (Expo.isExpoPushToken(token)) {
      validTokens.push(token);
      console.log(`  ✅ Valid token: ${token.substring(0, 20)}...`);
    } else {
      console.log(`  ❌ Invalid token: ${token}`);
    }
  }

  if (validTokens.length === 0) {
    console.error('❌ No valid tokens found');
    return;
  }

  // Group tokens by project
  const tokensByProject = {};
  
  validTokens.forEach(token => {
    const projectMatch = token.match(/ExponentPushToken\[([^\]]+)\]/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      if (!tokensByProject[projectId]) {
        tokensByProject[projectId] = [];
      }
      tokensByProject[projectId].push(token);
    }
  });

  console.log('\n📱 Project Groups:');
  Object.entries(tokensByProject).forEach(([projectId, tokens]) => {
    console.log(`  - Project ${projectId}: ${tokens.length} tokens`);
  });

  // Create test notification
  const notification = {
    title: 'Multi-Project Test',
    body: 'This notification should work across different project builds! 🚀',
    data: {
      type: 'test',
      timestamp: new Date().toISOString(),
      message: 'Testing multi-project notification delivery'
    }
  };

  console.log('\n🚀 Sending notifications to all projects...');

  // Send to each project separately
  for (const [projectId, projectTokens] of Object.entries(tokensByProject)) {
    console.log(`\n📤 Sending to project ${projectId} (${projectTokens.length} tokens)`);
    
    const messages = projectTokens.map(token => ({
      to: token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data,
      channelId: 'default',
    }));

    try {
      const tickets = await expo.sendPushNotificationsAsync(messages);
      
      // Check for errors
      const errors = tickets.filter(ticket => ticket.status === 'error');
      if (errors.length > 0) {
        console.log(`  ⚠️  ${errors.length} errors in project ${projectId}:`);
        errors.forEach(error => {
          console.log(`    - ${error.message}`);
        });
      } else {
        console.log(`  ✅ All ${tickets.length} notifications sent successfully to project ${projectId}`);
      }
      
    } catch (error) {
      console.error(`  ❌ Error sending to project ${projectId}:`, error.message);
    }
  }

  console.log('\n📊 Test Summary:');
  console.log('  - Multi-project notification system tested');
  console.log('  - Check your devices for notifications');
  console.log('  - Only valid project tokens should receive notifications');
}

// Run the test
testMultiProjectNotifications(); 