const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const path       = require('path');
const { getDb }  = require('./database');
const { ObjectId } = require('mongodb');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'love-project-secret-2024';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ── helpers ── */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

function fmt(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}
const fmtAll = docs => docs.map(fmt);

/* ══ AUTH ════════════════════════════════════════════════════════════════ */
app.post('/api/auth/register', async (req, res) => {
  try {
    const db = await getDb();
    const { username, password, display_name } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
    const existing = await db.collection('users').findOne({ username });
    if (existing) return res.status(409).json({ error: 'El usuario ya existe' });
    const hash = bcrypt.hashSync(password, 10);
    const name = display_name || username;
    const result = await db.collection('users').insertOne({ username, password_hash: hash, display_name: name, created_at: new Date() });
    const id = result.insertedId.toString();
    const token = jwt.sign({ id, username, display_name: name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, username, display_name: name } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const db = await getDb();
    const { username, password } = req.body;
    const user = await db.collection('users').findOne({ username });
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const id = user._id.toString();
    const token = jwt.sign({ id, username: user.username, display_name: user.display_name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, username: user.username, display_name: user.display_name } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

/* ══ COMMENTS ══════════════════════════════════════════════════════════ */
app.get('/api/comments/:section/:itemId', async (req, res) => {
  try {
    const db = await getDb();
    const docs = await db.collection('comments')
      .find({ section: req.params.section, item_id: req.params.itemId })
      .sort({ created_at: 1 }).toArray();
    res.json(fmtAll(docs));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comments', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { section, item_id, text } = req.body;
    if (!section || !item_id || !text) return res.status(400).json({ error: 'Faltan datos' });
    const doc = { section, item_id: String(item_id), text, created_by: req.user.id, display_name: req.user.display_name, created_at: new Date() };
    const result = await db.collection('comments').insertOne(doc);
    res.json(fmt({ ...doc, _id: result.insertedId }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ DATE IDEAS ═════════════════════════════════════════════════════════ */
app.get('/api/date-ideas', async (req, res) => {
  try {
    const db = await getDb();
    res.json(fmtAll(await db.collection('date_ideas').find({}).sort({ created_at: -1 }).toArray()));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/date-ideas', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { title, description, location, budget } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const doc = { title, description, location, budget, done: false, created_by: req.user.id, display_name: req.user.display_name, created_at: new Date() };
    const result = await db.collection('date_ideas').insertOne(doc);
    res.json(fmt({ ...doc, _id: result.insertedId }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/date-ideas/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('date_ideas').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { done: !!req.body.done } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/date-ideas/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('date_ideas').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ WISHLIST ═══════════════════════════════════════════════════════════ */
app.get('/api/wishlist', async (req, res) => {
  try {
    const db = await getDb();
    res.json(fmtAll(await db.collection('wishlist').find({}).sort({ created_at: -1 }).toArray()));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wishlist', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { title, url, price, priority, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const doc = { title, url, price, priority: priority || 'media', notes, purchased: false, created_by: req.user.id, display_name: req.user.display_name, created_at: new Date() };
    const result = await db.collection('wishlist').insertOne(doc);
    res.json(fmt({ ...doc, _id: result.insertedId }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/wishlist/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('wishlist').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { purchased: !!req.body.purchased } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/wishlist/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('wishlist').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ TALKS ══════════════════════════════════════════════════════════════ */
app.get('/api/talks', async (req, res) => {
  try {
    const db = await getDb();
    res.json(fmtAll(await db.collection('talks').find({}).sort({ created_at: -1 }).toArray()));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/talks', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { title, description, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const doc = { title, description, priority: priority || 'normal', resolved: false, created_by: req.user.id, display_name: req.user.display_name, created_at: new Date() };
    const result = await db.collection('talks').insertOne(doc);
    res.json(fmt({ ...doc, _id: result.insertedId }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/talks/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('talks').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { resolved: !!req.body.resolved } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/talks/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('talks').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ SAVINGS ════════════════════════════════════════════════════════════ */
app.get('/api/savings', async (req, res) => {
  try {
    const db = await getDb();
    const goals = fmtAll(await db.collection('saving_goals').find({}).sort({ created_at: -1 }).toArray());
    const result = await Promise.all(goals.map(async g => ({
      ...g,
      contributions: fmtAll(await db.collection('contributions').find({ goal_id: g.id }).sort({ created_at: -1 }).toArray())
    })));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savings', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { title, destination, target_amount, target_date, emoji } = req.body;
    if (!title || !target_amount) return res.status(400).json({ error: 'Faltan datos' });
    const doc = { title, destination, target_amount: Number(target_amount), current_amount: 0, target_date, emoji: emoji || '✈️', best_dates: '', activities: '', deadline_note: '', created_by: req.user.id, display_name: req.user.display_name, created_at: new Date() };
    const result = await db.collection('saving_goals').insertOne(doc);
    res.json({ ...fmt({ ...doc, _id: result.insertedId }), contributions: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/savings/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const allowed = ['best_dates', 'activities', 'deadline_note'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (Object.keys(update).length) await db.collection('saving_goals').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savings/:id/contribute', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { amount, note } = req.body;
    if (!amount) return res.status(400).json({ error: 'El monto es requerido' });
    const doc = { goal_id: req.params.id, amount: Number(amount), note, created_by: req.user.id, display_name: req.user.display_name, created_at: new Date() };
    const result = await db.collection('contributions').insertOne(doc);
    await db.collection('saving_goals').updateOne({ _id: new ObjectId(req.params.id) }, { $inc: { current_amount: Number(amount) } });
    res.json(fmt({ ...doc, _id: result.insertedId }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/savings/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('saving_goals').deleteOne({ _id: new ObjectId(req.params.id) });
    await db.collection('contributions').deleteMany({ goal_id: req.params.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ GOALS ══════════════════════════════════════════════════════════════ */
app.get('/api/goals', async (req, res) => {
  try {
    const db = await getDb();
    res.json(fmtAll(await db.collection('goals').find({}).sort({ created_at: -1 }).toArray()));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/goals', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { title, description, category, target_date, emoji, when_to_do } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const doc = { title, description, category: category || 'general', status: 'pendiente', target_date, when_to_do: when_to_do || '', emoji: emoji || '🎯', progress_percent: 0, photo: '', created_by: req.user.id, display_name: req.user.display_name, created_at: new Date() };
    const result = await db.collection('goals').insertOne(doc);
    res.json(fmt({ ...doc, _id: result.insertedId }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/goals/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const allowed = ['status', 'progress_percent', 'photo', 'when_to_do'];
    const update = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    if (Object.keys(update).length) await db.collection('goals').updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/goals/:id', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('goals').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ SPA ════════════════════════════════════════════════════════════════ */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ══ SEED & START ═══════════════════════════════════════════════════════ */
const DATE_IDEAS_SEED = [
  { title: "Cena a la luz de velas", description: "En casa con música romántica y su platillo favorito", location: "Casa", budget: "$200" },
  { title: "Noche de películas", description: "Maratón de sus películas favoritas con palomitas y manta", location: "Casa", budget: "$100" },
  { title: "Cocinar juntos una receta nueva", description: "Elegir algo que nunca hayan preparado y hacerlo juntos", location: "Casa", budget: "$300" },
  { title: "Noche de juegos de mesa", description: "El que pierda lava los platos", location: "Casa", budget: "$150" },
  { title: "Picnic indoor", description: "Tender una manta en la sala, poner comida rica y comer en el piso", location: "Casa", budget: "$200" },
  { title: "Karaoke en casa", description: "Buscar karaoke en YouTube y cantar sin parar", location: "Casa", budget: "$50" },
  { title: "Spa en casa", description: "Masajes, mascarillas, aromaterapia y total relajación", location: "Casa", budget: "$200" },
  { title: "Noche de cócteles caseros", description: "Aprender a preparar 3 cócteles nuevos", location: "Casa", budget: "$300" },
  { title: "Cata de vinos con quesos", description: "3-4 vinos distintos con tabla de quesos", location: "Casa", budget: "$400" },
  { title: "Pintar juntos", description: "Cada uno hace un cuadro para el otro", location: "Casa", budget: "$200" },
  { title: "Ver el amanecer juntos", description: "Madrugar para ver el amanecer en un lugar bonito", location: "A definir", budget: "$0" },
  { title: "Picnic en el parque", description: "Llevar comida rica, manta y pasar toda la tarde", location: "Parque", budget: "$200" },
  { title: "Senderismo en la mañana", description: "Elegir una ruta y caminar en la naturaleza", location: "Montaña/Bosque", budget: "$100" },
  { title: "Ver las estrellas", description: "Ir a un lugar oscuro, tenderse en una manta y observar el cielo", location: "Campo", budget: "$0" },
  { title: "Paseo en bici", description: "Alquilar bicicletas y recorrer un parque o ciclovía", location: "Parque", budget: "$200" },
  { title: "Baño en cascada o río", description: "Encontrar un lugar natural con agua y refrescarse juntos", location: "Naturaleza", budget: "$100" },
  { title: "Día en la playa", description: "Sol, arena, mar y toda la relajación del mundo", location: "Playa", budget: "$500" },
  { title: "Fotografía en la naturaleza", description: "Salir a tomar fotos, el objetivo: la mejor foto del otro", location: "Parque", budget: "$0" },
  { title: "Amanecer en la montaña", description: "Subir antes del amanecer y verlo desde arriba", location: "Montaña", budget: "$100" },
  { title: "Campamento bajo las estrellas", description: "Armar tienda de campaña y dormir al aire libre", location: "Campo", budget: "$500" },
  { title: "Visitar un museo", description: "Recorrerlo sin prisa, el que más sabe paga el postre", location: "Museo", budget: "$200" },
  { title: "Exposición de arte", description: "Visitar una galería o exposición temporal", location: "Galería", budget: "$150" },
  { title: "Obra de teatro", description: "Ver una obra juntos, ya sea comedia o drama", location: "Teatro", budget: "$600" },
  { title: "Concierto en vivo", description: "Asistir al concierto de un artista que les guste", location: "Venue", budget: "$800" },
  { title: "Tour histórico de su ciudad", description: "Recorrer los lugares históricos con guía o solos", location: "Ciudad", budget: "$200" },
  { title: "Jardín botánico", description: "Pasear entre plantas y flores, tomarse fotos bonitas", location: "Jardín", budget: "$150" },
  { title: "Festival local", description: "Asistir a un festival o feria de la ciudad", location: "Ciudad", budget: "$400" },
  { title: "Librería enorme", description: "Perderse en una librería y elegir un libro para el otro", location: "Librería", budget: "$400" },
  { title: "Noche de comedia en vivo", description: "Show de stand-up comedy para reír hasta llorar", location: "Bar/Teatro", budget: "$400" },
  { title: "Mercado de artesanías", description: "Explorar un mercado y comprar algo especial como recuerdo", location: "Mercado", budget: "$300" },
  { title: "Escalada o boulder", description: "Tomar una clase de escalada en un gimnasio", location: "Rocódromo", budget: "$400" },
  { title: "Paintball", description: "Una sesión llena de adrenalina y risas", location: "Campo paintball", budget: "$500" },
  { title: "Go-karts", description: "Competir y apostar quién gana la cena", location: "Kartódromo", budget: "$400" },
  { title: "Escape room", description: "Resolver el misterio juntos contra el reloj", location: "Escape room", budget: "$500" },
  { title: "Tirolesa", description: "Volar por una tirolesa emocionante entre árboles", location: "Parque aventura", budget: "$600" },
  { title: "Tiro con arco", description: "Clase de tiro con arco, ver quién es mejor puntero", location: "Club deportivo", budget: "$300" },
  { title: "Patinaje sobre hielo", description: "Patinar juntos aunque caigan al suelo cien veces", location: "Pista de hielo", budget: "$400" },
  { title: "Kayak o canoa", description: "Remar juntos por un río o lago al atardecer", location: "Río/Lago", budget: "$500" },
  { title: "Clase de surf", description: "Aprender a surfear juntos por primera vez", location: "Playa", budget: "$600" },
  { title: "Vuelo en globo aerostático", description: "Volar al amanecer, una experiencia única", location: "A definir", budget: "$2,000" },
  { title: "Probar un restaurante nuevo", description: "Ser aventureros con la carta, pedir lo más raro", location: "Restaurante", budget: "$500" },
  { title: "Tacos de madrugada", description: "Salir a comer tacos cuando todo el mundo duerme", location: "Taquería", budget: "$150" },
  { title: "Desayuno especial de fin de semana", description: "Un café lindo, sin prisa, el domingo en la mañana", location: "Café", budget: "$250" },
  { title: "Food truck crawl", description: "Ir de food truck en food truck probando cosas diferentes", location: "Ciudad", budget: "$300" },
  { title: "Clase de cocina", description: "Tomar una clase de gastronomía que les encante", location: "Escuela de cocina", budget: "$600" },
  { title: "Cena en restaurante de alta cocina", description: "Una noche especial en el mejor restaurante de la ciudad", location: "Restaurante", budget: "$1,200" },
  { title: "Brunch dominical largo", description: "Café, jugo y mucha comida sin prisa de domingo", location: "Café/Restaurante", budget: "$400" },
  { title: "Cervecería artesanal", description: "Probar cervezas artesanales y aprender sobre el proceso", location: "Cervecería", budget: "$400" },
  { title: "Cena temática en casa", description: "Cocinar inspirados en un país que quieran visitar", location: "Casa", budget: "$300" },
  { title: "Panadería artesanal", description: "Explorar y comprar pan recién hecho y pasteles artesanales", location: "Panadería", budget: "$200" },
  { title: "Carta de amor manuscrita", description: "Escribirse una carta y leerla en voz alta el uno al otro", location: "Casa", budget: "$0" },
  { title: "Recrear su primera cita", description: "Volver al lugar de su primera cita y vivirla de nuevo", location: "Lugar especial", budget: "Variable" },
  { title: "Sesión de fotos juntos", description: "Vestirse bonito y hacer una sesión en la ciudad", location: "Ciudad", budget: "$500" },
  { title: "Masaje en pareja en spa", description: "Ir a un spa y pedir un masaje para dos", location: "Spa", budget: "$800" },
  { title: "Noche en hotel boutique", description: "Quedarse una noche en un hotel bonito sin salir para nada", location: "Hotel", budget: "$1,500" },
  { title: "Cena bajo las estrellas", description: "Cenar afuera de noche con velas", location: "Jardín/Terraza", budget: "$300" },
  { title: "Scrapbook de su relación", description: "Álbum físico con fotos y recuerdos de su historia", location: "Casa", budget: "$200" },
  { title: "Playlist de su relación", description: "Las canciones que los identifican como pareja", location: "Casa", budget: "$0" },
  { title: "Álbum de fotos de la infancia", description: "Compartir fotos de pequeños y contar historias", location: "Casa", budget: "$0" },
  { title: "Bailar en casa sin música", description: "Solo abrazados, balanceándose, sin necesitar nada más", location: "Casa", budget: "$0" },
  { title: "Clases de baile", description: "Aprender salsa, bachata o tango juntos", location: "Estudio de baile", budget: "$400" },
  { title: "Clase de cerámica", description: "Moldear arcilla juntos, como en la película Ghost", location: "Taller", budget: "$400" },
  { title: "Yoga en pareja", description: "Conectar físicamente y relajarse juntos", location: "Estudio", budget: "$300" },
  { title: "Aprender origami juntos", description: "El más difícil que puedan", location: "Casa", budget: "$50" },
  { title: "Clase de pintura", description: "Al final comparar sus cuadros y reírse", location: "Taller", budget: "$400" },
  { title: "Aprender un idioma juntos", description: "Francés, italiano, japonés... lo que sea", location: "App/Casa", budget: "$0" },
  { title: "Hacer velas aromáticas", description: "Kit para hacer velas personalizadas para casa", location: "Casa", budget: "$250" },
  { title: "Cata de café", description: "Aprender a distinguir orígenes y sabores del café", location: "Café", budget: "$300" },
  { title: "Clase de fotografía", description: "Tomar una clase básica y practicar juntos", location: "Escuela/Online", budget: "$300" },
  { title: "Cerámica Kintsugi", description: "El arte de reparar lo roto con oro, una clase especial", location: "Taller", budget: "$500" },
  { title: "Boliche", description: "Noche de boliche con apuestas divertidas", location: "Boliche", budget: "$300" },
  { title: "Mini golf", description: "El que pierda paga el helado", location: "Mini golf", budget: "$250" },
  { title: "Parque de diversiones", description: "Un día completo, subirse a todo sin excepción", location: "Parque", budget: "$800" },
  { title: "Acuario o zoológico", description: "Pasar el día conociendo animales y tomando fotos", location: "Acuario/Zoo", budget: "$400" },
  { title: "Videojuegos competitivos", description: "El que pierde cocina la cena", location: "Casa", budget: "$0" },
  { title: "Trivia del uno al otro", description: "¿Quién conoce más al otro? Hay que saberlo", location: "Casa", budget: "$0" },
  { title: "Noche de pijamas con snacks", description: "En pijama toda la noche, con muchos snacks y risas", location: "Casa", budget: "$100" },
  { title: "Billar", description: "Jugar billar, no importa si no saben, ese es el chiste", location: "Bar/Billar", budget: "$200" },
  { title: "Mario Kart con apuestas", description: "El perdedor da un masaje de 15 minutos", location: "Casa", budget: "$0" },
  { title: "Feria de la ciudad", description: "Juegos de la feria, comida típica y ganar peluches", location: "Feria", budget: "$300" },
  { title: "Explorar un barrio nuevo", description: "Sin mapa, solo caminar y descubrir", location: "Ciudad", budget: "$200" },
  { title: "Café con vista bonita", description: "Encontrar ese café especial y pasar la tarde ahí", location: "Café", budget: "$200" },
  { title: "Mercado de pulgas", description: "Buscar tesoros ocultos y curiosidades", location: "Tianguis", budget: "$200" },
  { title: "Ver puesta de sol en azotea", description: "Algún punto alto de la ciudad para ver el atardecer", location: "Ciudad", budget: "$100" },
  { title: "Paseo nocturno por el centro", description: "El centro histórico de noche cuando está iluminado", location: "Centro histórico", budget: "$100" },
  { title: "Heladería artesanal", description: "Probar sabores raros, el más raro gana algo", location: "Heladería", budget: "$100" },
  { title: "Cine a medianoche", description: "La función de medianoche de lo que sea que estén dando", location: "Cine", budget: "$300" },
  { title: "Libros y café", description: "Cada uno elige un libro para el otro y leen juntos", location: "Librería/Café", budget: "$400" },
  { title: "Fotos en el centro histórico", description: "Caminar y tomar fotos en lugares emblemáticos", location: "Centro", budget: "$0" },
  { title: "Mercado gastronómico", description: "Explorar un mercado gourmet y probar de todo", location: "Mercado gourmet", budget: "$350" },
  { title: "Paracaidismo en tándem", description: "Saltar en paracaídas juntos y gritarlo al mundo", location: "Aeródromo", budget: "$3,000" },
  { title: "Viaje sorpresa de fin de semana", description: "Uno planea, el otro no sabe el destino hasta llegar", location: "Sorpresa", budget: "$2,000" },
  { title: "Clase de equitación", description: "Montar a caballo juntos por primera vez", location: "Rancho", budget: "$500" },
  { title: "Buceo o snorkel", description: "Explorar el mundo submarino juntos", location: "Playa", budget: "$800" },
  { title: "Cabaña en el bosque", description: "Rentar una cabaña para desconectarse de todo", location: "Bosque", budget: "$1,500" },
  { title: "Día de voluntariado juntos", description: "Hacer algo bueno para los demás como equipo", location: "ONG", budget: "$0" },
  { title: "Taller de meditación", description: "Técnicas de meditación y respiración juntos", location: "Centro", budget: "$300" },
  { title: "Bucket list juntos", description: "Sentarse con café y escribir las 100 cosas que quieren vivir", location: "Casa", budget: "$0" },
  { title: "Cápsula del tiempo", description: "Escribir cartas al futuro para abrirlas en 5 años", location: "Casa", budget: "$0" },
  { title: "Noche de confesiones", description: "Preguntas que nunca se han hecho — ya era hora", location: "Casa", budget: "$0" },
];

const WISHLIST_SEED = [
  { title: "Vestido floral de verano", priority: "alta", notes: "Talla S, colores pasteles o blanco" },
  { title: "Set de labiales matte", priority: "media", price: "$350", notes: "3 colores: nude, rosa palo y borgoña" },
  { title: "Perfume Dior Miss Dior", priority: "alta", price: "$2,500", notes: "Blooming Bouquet, el que huele a flores" },
  { title: "Bolsa de piel pequeña cruzada", priority: "media", price: "$800", notes: "Color camel o nude" },
  { title: "Aretes de perla pequeños", priority: "baja", price: "$300", notes: "Clásicos, para uso diario" },
  { title: "Crema hidratante facial SPF", priority: "alta", price: "$1,200", notes: "Para piel seca" },
  { title: "Zapatos blancos de plataforma", priority: "media", price: "$600", notes: "Talla 24, que combinen con todo" },
  { title: "Set de pinceles de maquillaje", priority: "media", price: "$400", notes: "Al menos 10 piezas, con estuche" },
  { title: "Libro: El alquimista", priority: "baja", price: "$150" },
  { title: "Audífonos inalámbricos", priority: "alta", price: "$1,200", notes: "Con cancelación de ruido" },
  { title: "Pijama de satín rosa", priority: "media", price: "$350", notes: "Con shorts, para el verano" },
  { title: "Mascarillas de colágeno (caja)", priority: "baja", price: "$200", notes: "Para el skin care de los viernes" },
];

const TALKS_SEED = [
  { title: "Lo que me hace bien y lo que no", description: "Hablar sobre qué cosas me nutren emocionalmente y cuáles me drenan", priority: "normal" },
  { title: "Cómo me gusta que me hagan sentir querida", description: "Mis lenguajes del amor: palabras de afirmación, tiempo de calidad, actos de servicio, regalos o contacto físico", priority: "normal" },
  { title: "Mis metas personales para este año", description: "Compartir lo que cada uno quiere lograr y cómo apoyarnos", priority: "cuando puedan" },
  { title: "Cómo manejar mejor los conflictos", description: "Cómo nos comunicamos cuando estamos enojados y qué podemos mejorar", priority: "normal" },
  { title: "Nuestro futuro juntos", description: "¿Dónde nos vemos en 2-3 años como pareja?", priority: "cuando puedan" },
  { title: "Las cosas que más valoro de ti", description: "Decirse mutuamente qué es lo que más admiran y aman del otro. Sin filtros", priority: "cuando puedan" },
];

const GOALS_SEED = [
  { title: "Bajar de peso juntos", description: "Meta: cada uno bajar al menos 5kg con ejercicio y mejor alimentación", category: "salud", emoji: "💪", status: "en progreso", progress_percent: 20, when_to_do: "Para antes del verano" },
  { title: "Correr 100 km acumulados", description: "Registrar cada carrera y sumar el total entre los dos", category: "salud", emoji: "🏃", status: "pendiente", progress_percent: 0, when_to_do: "A lo largo del año" },
  { title: "Leer 12 libros este año", description: "Un libro al mes. Comentarlo juntos con un café", category: "general", emoji: "📚", status: "en progreso", progress_percent: 25, when_to_do: "Diciembre de este año" },
  { title: "Aprender a cocinar 10 recetas nuevas", description: "Una receta nueva juntos cada mes de un país diferente", category: "hogar", emoji: "👨‍🍳", status: "en progreso", progress_percent: 30, when_to_do: "A lo largo del año" },
  { title: "Primer viaje internacional juntos", description: "Elegir un destino y planear todo juntos", category: "viaje", emoji: "🌍", status: "pendiente", progress_percent: 10, when_to_do: "El próximo año" },
  { title: "Montar en bici 200 km acumulados", description: "Salidas de bicicleta los fines de semana", category: "salud", emoji: "🚴", status: "pendiente", progress_percent: 0, when_to_do: "Este año" },
];

async function seedDatabase() {
  try {
    const db = await getDb();
    const count = await db.collection('date_ideas').countDocuments();
    if (count > 0) return;
    console.log('🌱 Insertando datos de ejemplo...');
    const DEMO = '💕 Ejemplo';
    const now = new Date();
    if (DATE_IDEAS_SEED.length) await db.collection('date_ideas').insertMany(DATE_IDEAS_SEED.map(d => ({ ...d, done: false, created_by: 'demo', display_name: DEMO, created_at: now })));
    if (WISHLIST_SEED.length)   await db.collection('wishlist').insertMany(WISHLIST_SEED.map(d => ({ ...d, purchased: false, created_by: 'demo', display_name: DEMO, created_at: now })));
    if (TALKS_SEED.length)      await db.collection('talks').insertMany(TALKS_SEED.map(d => ({ ...d, resolved: false, created_by: 'demo', display_name: DEMO, created_at: now })));
    if (GOALS_SEED.length)      await db.collection('goals').insertMany(GOALS_SEED.map(d => ({ ...d, photo: '', created_by: 'demo', display_name: DEMO, created_at: now })));
    console.log('✅ Datos de ejemplo listos');
  } catch(e) { console.error('Seed error:', e.message); }
}

app.listen(PORT, async () => {
  console.log(`💕 Love Project corriendo en http://localhost:${PORT}`);
  if (process.env.MONGODB_URI) {
    await seedDatabase();
  } else {
    console.log('⚠️  Sin MONGODB_URI — modo sin base de datos');
  }
});
