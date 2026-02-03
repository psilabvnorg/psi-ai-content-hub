/**
 * Server process - runs in background and handles requests via Node IPC
 */
const { handlers, setBroadcast } = require('./server-handlers.cjs');

console.log('Server process starting...');

// Broadcast function to send push messages to main process
function broadcast(name, data) {
  if (process.send) {
    process.send({ type: 'push', data: { name, ...data } });
  }
}

// Set broadcast function for handlers
setBroadcast(broadcast);

// Handle messages from main process
process.on('message', async (msg) => {
  if (msg.type === 'request') {
    const { id, name, args } = msg;
    
    try {
      if (handlers[name]) {
        const result = await handlers[name](args || {});
        process.send({ type: 'reply', id, result });
      } else {
        console.warn('Unknown handler:', name);
        process.send({ type: 'reply', id, result: null });
      }
    } catch (error) {
      console.error(`Handler error for ${name}:`, error);
      process.send({ type: 'reply', id, error: error.message });
    }
  }
});

console.log('Server process ready');
