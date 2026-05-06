// One-off script to clean up stale call records stuck in ringing/active status
import mongoose from 'mongoose';

await mongoose.connect('mongodb://localhost:27017/intoaec');

const result = await mongoose.connection.db.collection('calls').updateMany(
  { status: { $in: ['ringing', 'active'] } },
  { $set: { status: 'ended', endedAt: new Date(), endReason: 'stale_cleanup' } }
);

console.log('Cleaned up stale calls:', result.modifiedCount);
await mongoose.disconnect();
process.exit(0);
