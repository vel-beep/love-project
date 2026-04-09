const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Falta la variable de entorno MONGODB_URI');

let client;
let db;

async function getDb() {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('love_project');
  // Indexes
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('comments').createIndex({ section: 1, item_id: 1 });
  return db;
}

module.exports = { getDb };
