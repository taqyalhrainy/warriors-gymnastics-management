const mongoose = require('mongoose');
const dns = require('dns');

const connectDB = async () => {
  try {
    let uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (uri?.startsWith('mongodb+srv://')) {
      dns.setServers((process.env.MONGO_DNS_SERVERS || '1.1.1.1,8.8.8.8').split(',').map((server) => server.trim()).filter(Boolean));
    }
    if (!uri) {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      console.log('Using in-memory MongoDB for local testing');
    }
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
