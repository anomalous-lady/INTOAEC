// src/scripts/seedUser.js
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGO_URI not set in .env');
    process.exit(1);
  }

  // Pre-defined values for the second user
  const email = 'testuser2@domain.com';
  const password = 'Password123!';
  const username = 'testuser2';
  const displayName = 'Test User Two';

  // Pre-defined values for the third user
  const email = 'testuser3@domain.com';
  const password = 'Password123!';
  const username = 'testuser3';
  const displayName = 'Test User three';


  await mongoose.connect(uri, { family: 4 });
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    console.log(`User already exists: ${existing.email} — skipping.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const user = await User.create({
    username,
    email,
    password,
    displayName,
    role: 'user',
    status: 'approved',
    isEmailVerified: true,
    isActive: true,
  });

  console.log(`\n✅ Second user account created successfully:`);
  console.log(`   Email:    ${user.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Username: ${user.username}`);
  console.log(`   Role:     ${user.role}`);
  console.log(`\nUse these credentials on the second device.\n`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
