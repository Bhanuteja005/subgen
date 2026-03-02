const { MongoClient } = require('mongodb');
const fs = require('fs');

// Simple .env.local parser to avoid adding dotenv dependency
function loadEnv(path) {
  try {
    const txt = fs.readFileSync(path, 'utf8');
    const lines = txt.split(/\r?\n/);
    const env = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      env[key] = val;
    }
    return env;
  } catch (e) {
    return {};
  }
}

const localEnv = loadEnv('./.env.local');
process.env = { ...process.env, ...localEnv };

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in .env.local');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c=>c.name));

    // Try common Better Auth collection names
    const possibleNames = ['users', 'better_auth_users', 'auth_users', 'accounts', 'users_accounts', 'accounts_users'];
    for (const name of possibleNames) {
      const exists = collections.some(c => c.name === name);
      if (!exists) continue;
      const col = db.collection(name);
      const user = await col.findOne({ email: 'admin@subgen.com' });
      console.log(`Collection ${name} ->`, user ? 'FOUND' : 'not found');
      if (user) {
        console.log('User doc:', user);
      }
    }

    // Fallback: search all collections for the user (limits to first 10 collections)
    for (const c of collections.slice(0, 10)) {
      try {
        const col = db.collection(c.name);
        const user = await col.findOne({ email: 'admin@subgen.com' });
        if (user) {
          console.log(`Found in collection ${c.name}:`, user);
        }
      } catch (e) { /* ignore */ }
    }
    
    // If user exists but role !== 'admin', promote them now
    const userCol = db.collection('user');
    const existing = await userCol.findOne({ email: 'admin@subgen.com' });
    if (existing) {
      if (existing.role !== 'admin') {
        await userCol.updateOne({ _id: existing._id }, { $set: { role: 'admin' } });
        console.log('Promoted admin@subgen.com to role=admin');
      } else {
        console.log('User already has role=admin');
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

main();
