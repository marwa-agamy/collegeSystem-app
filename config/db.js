const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 50,          // Limits total connections
      socketTimeoutMS: 30000,   // 30 seconds socket timeout
      connectTimeoutMS: 5000,   // 5 seconds connection timeout
      serverSelectionTimeoutMS: 5000, // 5 seconds to select server
      waitQueueTimeoutMS: 5000  // 5 seconds max wait time
    });
    console.log('MongoDB Connected');
  } catch (err) {
    console.error('Database connection error:', err.message);
    process.exit(1);
  }
};

// Close connection on process termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

module.exports = connectDB;
