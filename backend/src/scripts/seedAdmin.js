// src/scripts/seedAdmin.js
// ─────────────────────────────────────────────────────────────────────────────
//  Run ONCE on first deployment to create the initial admin account.
//  After this, all other users must be invited via the admin panel.
//
//  Usage:
//    node src/scripts/seedAdmin.js
//
//  Requires MONGO_URI, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD in .env
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGO_URI not set in .env');
    process.exit(1);
  }

  const email    = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const username = 'admin';

  if (!email || !password) {
    console.error('ERROR: ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { family: 4 });
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ $or: [{ email }, { role: 'admin' }] });
  if (existing) {
    console.log(`Admin already exists: ${existing.email} — skipping.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const admin = await User.create({
    username,
    email,
    password,
    displayName: 'Administrator',
    role: 'admin',
    status: 'approved',
    isEmailVerified: true,
    isActive: true,
  });

  console.log(`\n✅ Admin account created:`);
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Username: ${admin.username}`);
  console.log(`   Role:     ${admin.role}`);
  console.log(`   Status:   ${admin.status}`);
  console.log(`\n⚠️  Change the password immediately after first login.`);
  console.log(`   Remove ADMIN_SEED_PASSWORD from .env once done.\n`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
