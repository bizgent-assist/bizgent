// Local development without MongoDB Atlas: starts an in-memory MongoDB, then the API.
// Data is lost on exit. Never used in production.
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri('bizgent');
console.log(`[dev] in-memory MongoDB at ${process.env.MONGODB_URI}`);
const { start } = await import('../src/server.js');
await start();
const stop = async () => { await mongod.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
