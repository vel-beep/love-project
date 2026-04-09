const { MongoClient } = require('mongodb');

let client;
let db;

async function getDb() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI no configurado');
  client = new MongoClient(uri);
  await client.connect();
  db = client.db('love_project');
  await db.collection('users').createIndex({ username: 1 }, { unique: true });
  await db.collection('comments').createIndex({ section: 1, item_id: 1 });
  return db;
}

module.exports = { getDb };
