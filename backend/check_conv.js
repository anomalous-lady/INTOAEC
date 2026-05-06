import mongoose from 'mongoose';
import 'dotenv/config';

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/intoaec').then(async () => {
  const db = mongoose.connection.db;
  const convs = await db.collection('conversations').find({ isExternal: true }).toArray();
  console.log(JSON.stringify(convs, null, 2));
  process.exit(0);
});
