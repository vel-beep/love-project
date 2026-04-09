const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const path       = require('path');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'love-project-secret-2024';
const HAS_DB     = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

let sb = null;
if (HAS_DB) sb = require('./database');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ── helpers ── */
function requireAuth(req, res, next) {
  if (!HAS_DB) return res.status(503).json({ error: 'Base de datos no configurada' });
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido' }); }
}

async function dbGet(table, filters = {}, order = 'created_at') {
  let q = sb.from(table).select('*').order(order, { ascending: false });
  Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

async function dbInsert(table, doc) {
  const { data, error } = await sb.from(table).insert(doc).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function dbUpdate(table, id, patch) {
  const { error } = await sb.from(table).update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

async function dbDelete(table, id) {
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Seed data for static mode (no DB)
let _sid = 1;
function sid() { return String(_sid++); }
function withId(arr, extra = {}) {
  _sid = 1;
  return arr.map(d => ({ id: sid(), ...d, ...extra, display_name: '💕 Ejemplo', created_at: new Date().toISOString() }));
}

/* ══ AUTH ════════════════════════════════════════════════════════════════ */
app.post('/api/auth/register', async (req, res) => {
  if (!HAS_DB) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const { username, password, display_name } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
    const existing = await sb.from('users').select('id').eq('username', username).single();
    if (existing.data) return res.status(409).json({ error: 'El usuario ya existe' });
    const hash = bcrypt.hashSync(password, 10);
    const name = display_name || username;
    const { data, error } = await sb.from('users').insert({ username, password_hash: hash, display_name: name }).select().single();
    if (error) throw new Error(error.message);
    const token = jwt.sign({ id: data.id, username, display_name: name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: data.id, username, display_name: name } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  if (!HAS_DB) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const { username, password } = req.body;
    const { data: user } = await sb.from('users').select('*').eq('username', username).single();
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const token = jwt.sign({ id: user.id, username: user.username, display_name: user.display_name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

/* ══ COMMENTS ══════════════════════════════════════════════════════════ */
app.get('/api/comments/:section/:itemId', async (req, res) => {
  if (!HAS_DB) return res.json([]);
  try {
    const { data, error } = await sb.from('comments')
      .select('*')
      .eq('section', req.params.section)
      .eq('item_id', req.params.itemId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/comments', requireAuth, async (req, res) => {
  try {
    const { section, item_id, text } = req.body;
    if (!section || !item_id || !text) return res.status(400).json({ error: 'Faltan datos' });
    const data = await dbInsert('comments', { section, item_id: String(item_id), text, created_by: req.user.id, display_name: req.user.display_name });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ DATE IDEAS ═════════════════════════════════════════════════════════ */
app.get('/api/date-ideas', async (req, res) => {
  if (!HAS_DB) return res.json(withId(DATE_IDEAS_SEED, { done: false }));
  try { res.json(await dbGet('date_ideas')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/date-ideas', requireAuth, async (req, res) => {
  try {
    const { title, description, location, budget } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const data = await dbInsert('date_ideas', { title, description, location, budget, done: false, created_by: req.user.id, display_name: req.user.display_name });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/date-ideas/:id', requireAuth, async (req, res) => {
  try { await dbUpdate('date_ideas', req.params.id, { done: !!req.body.done }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/date-ideas/:id', requireAuth, async (req, res) => {
  try { await dbDelete('date_ideas', req.params.id); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ WISHLIST ═══════════════════════════════════════════════════════════ */
app.get('/api/wishlist', async (req, res) => {
  if (!HAS_DB) return res.json(withId(WISHLIST_SEED, { purchased: false }));
  try { res.json(await dbGet('wishlist')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/wishlist', requireAuth, async (req, res) => {
  try {
    const { title, url, price, priority, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const data = await dbInsert('wishlist', { title, url, price, priority: priority || 'media', notes, purchased: false, created_by: req.user.id, display_name: req.user.display_name });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/wishlist/:id', requireAuth, async (req, res) => {
  try { await dbUpdate('wishlist', req.params.id, { purchased: !!req.body.purchased }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/wishlist/:id', requireAuth, async (req, res) => {
  try { await dbDelete('wishlist', req.params.id); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ TALKS ══════════════════════════════════════════════════════════════ */
app.get('/api/talks', async (req, res) => {
  if (!HAS_DB) return res.json(withId(TALKS_SEED, { resolved: false }));
  try { res.json(await dbGet('talks')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/talks', requireAuth, async (req, res) => {
  try {
    const { title, description, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const data = await dbInsert('talks', { title, description, priority: priority || 'normal', resolved: false, created_by: req.user.id, display_name: req.user.display_name });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/talks/:id', requireAuth, async (req, res) => {
  try { await dbUpdate('talks', req.params.id, { resolved: !!req.body.resolved }); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/talks/:id', requireAuth, async (req, res) => {
  try { await dbDelete('talks', req.params.id); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ SAVINGS ════════════════════════════════════════════════════════════ */
app.get('/api/savings', async (req, res) => {
  if (!HAS_DB) return res.json([{
    id: '1', title: 'Viaje a la playa', destination: 'Cancún, México', emoji: '🏖️',
    target_amount: 20000, current_amount: 8500, target_date: '2025-12-01',
    best_dates: 'Julio o diciembre, temporada baja', activities: 'Snorkel, cenotes, zona hotelera',
    deadline_note: 'Reservar vuelos antes de octubre', display_name: '💕 Ejemplo',
    contributions: [
      { id: '1', amount: 5000, note: 'Enero', display_name: '💕 Ejemplo' },
      { id: '2', amount: 2000, note: 'Febrero', display_name: '💕 Ejemplo' },
      { id: '3', amount: 1500, note: 'Marzo', display_name: '💕 Ejemplo' },
    ]
  }, {
    id: '2', title: 'Europa juntos', destination: 'París + Roma', emoji: '🗼',
    target_amount: 80000, current_amount: 15000, target_date: '2026-06-01',
    best_dates: 'Primavera (abril-mayo)', activities: 'Torre Eiffel, Coliseo, museos, cafés',
    deadline_note: 'Vuelos con 6 meses de anticipación', display_name: '💕 Ejemplo',
    contributions: [
      { id: '3', amount: 10000, note: 'Ahorro inicial', display_name: '💕 Ejemplo' },
      { id: '4', amount: 5000, note: 'Extra de diciembre', display_name: '💕 Ejemplo' },
    ]
  }]);
  try {
    const goals = await dbGet('saving_goals');
    const result = await Promise.all(goals.map(async g => ({
      ...g,
      contributions: await dbGet('contributions', { goal_id: g.id })
    })));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savings', requireAuth, async (req, res) => {
  try {
    const { title, destination, target_amount, target_date, emoji } = req.body;
    if (!title || !target_amount) return res.status(400).json({ error: 'Faltan datos' });
    const data = await dbInsert('saving_goals', { title, destination, target_amount: Number(target_amount), current_amount: 0, target_date, emoji: emoji || '✈️', best_dates: '', activities: '', deadline_note: '', created_by: req.user.id, display_name: req.user.display_name });
    res.json({ ...data, contributions: [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/savings/:id', requireAuth, async (req, res) => {
  try {
    const allowed = ['best_dates', 'activities', 'deadline_note'];
    const patch = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    if (Object.keys(patch).length) await dbUpdate('saving_goals', req.params.id, patch);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/savings/:id/contribute', requireAuth, async (req, res) => {
  try {
    const { amount, note } = req.body;
    if (!amount) return res.status(400).json({ error: 'El monto es requerido' });
    const data = await dbInsert('contributions', { goal_id: req.params.id, amount: Number(amount), note, created_by: req.user.id, display_name: req.user.display_name });
    const { data: goal } = await sb.from('saving_goals').select('current_amount').eq('id', req.params.id).single();
    await dbUpdate('saving_goals', req.params.id, { current_amount: (goal?.current_amount || 0) + Number(amount) });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/savings/:id', requireAuth, async (req, res) => {
  try {
    await dbDelete('saving_goals', req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ GOALS ══════════════════════════════════════════════════════════════ */
app.get('/api/goals', async (req, res) => {
  if (!HAS_DB) return res.json(withId(GOALS_SEED));
  try { res.json(await dbGet('goals')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/goals', requireAuth, async (req, res) => {
  try {
    const { title, description, category, target_date, emoji, when_to_do } = req.body;
    if (!title) return res.status(400).json({ error: 'El título es requerido' });
    const data = await dbInsert('goals', { title, description, category: category || 'general', status: 'pendiente', target_date, when_to_do: when_to_do || '', emoji: emoji || '🎯', progress_percent: 0, photo: '', created_by: req.user.id, display_name: req.user.display_name });
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/goals/:id', requireAuth, async (req, res) => {
  try {
    const allowed = ['status', 'progress_percent', 'photo', 'when_to_do'];
    const patch = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
    if (Object.keys(patch).length) await dbUpdate('goals', req.params.id, patch);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/goals/:id', requireAuth, async (req, res) => {
  try { await dbDelete('goals', req.params.id); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

/* ══ SPA ════════════════════════════════════════════════════════════════ */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ══ SEED DATA ══════════════════════════════════════════════════════════ */
const DATE_IDEAS_SEED = [
  { title: "Cena a la luz de velas", description: "En casa con música romántica", location: "Casa", budget: "$200" },
  { title: "Noche de películas", description: "Maratón con palomitas y manta", location: "Casa", budget: "$100" },
  { title: "Cocinar juntos una receta nueva", description: "Algo que nunca hayan preparado", location: "Casa", budget: "$300" },
  { title: "Noche de juegos de mesa", description: "El que pierda lava los platos", location: "Casa", budget: "$150" },
  { title: "Picnic indoor", description: "Manta en la sala, comida rica en el piso", location: "Casa", budget: "$200" },
  { title: "Karaoke en casa", description: "YouTube karaoke, cantar sin parar", location: "Casa", budget: "$50" },
  { title: "Spa en casa", description: "Masajes, mascarillas, aromaterapia", location: "Casa", budget: "$200" },
  { title: "Cata de vinos con quesos", description: "3-4 vinos con tabla de quesos", location: "Casa", budget: "$400" },
  { title: "Pintar juntos", description: "Cada uno hace un cuadro para el otro", location: "Casa", budget: "$200" },
  { title: "Ver el amanecer juntos", description: "Madrugar para verlo en un lugar bonito", location: "A definir", budget: "$0" },
  { title: "Picnic en el parque", description: "Comida rica, manta y toda la tarde", location: "Parque", budget: "$200" },
  { title: "Senderismo en la mañana", description: "Caminar en la naturaleza antes del mediodía", location: "Montaña", budget: "$100" },
  { title: "Ver las estrellas", description: "Lugar oscuro, manta y observar el cielo", location: "Campo", budget: "$0" },
  { title: "Paseo en bici", description: "Recorrer un parque o ciclovía", location: "Parque", budget: "$200" },
  { title: "Día en la playa", description: "Sol, arena, mar y relajación total", location: "Playa", budget: "$500" },
  { title: "Campamento bajo las estrellas", description: "Tienda de campaña, dormir al aire libre", location: "Campo", budget: "$500" },
  { title: "Visitar un museo", description: "Recorrerlo sin prisa, el que más sabe paga el postre", location: "Museo", budget: "$200" },
  { title: "Obra de teatro", description: "Ya sea comedia o drama, juntos", location: "Teatro", budget: "$600" },
  { title: "Concierto en vivo", description: "Un artista que les guste a ambos", location: "Venue", budget: "$800" },
  { title: "Escalada o boulder", description: "Clase de escalada en gimnasio", location: "Rocódromo", budget: "$400" },
  { title: "Paintball", description: "Adrenalina y risas garantizadas", location: "Campo paintball", budget: "$500" },
  { title: "Go-karts", description: "Competir y apostar quién gana la cena", location: "Kartódromo", budget: "$400" },
  { title: "Escape room", description: "Resolver el misterio contra el reloj", location: "Escape room", budget: "$500" },
  { title: "Patinaje sobre hielo", description: "Aunque caigan al suelo cien veces", location: "Pista de hielo", budget: "$400" },
  { title: "Kayak o canoa al atardecer", description: "Remar por un río o lago", location: "Lago/Río", budget: "$500" },
  { title: "Probar un restaurante nuevo", description: "Aventurarse con la carta, pedir lo más raro", location: "Restaurante", budget: "$500" },
  { title: "Tacos de madrugada", description: "Cuando todo el mundo duerme", location: "Taquería", budget: "$150" },
  { title: "Desayuno largo de domingo", description: "Sin prisa, café, jugo y mucha comida", location: "Café", budget: "$250" },
  { title: "Clase de cocina", description: "De la gastronomía que más les guste", location: "Escuela de cocina", budget: "$600" },
  { title: "Cena en restaurante especial", description: "Una noche realmente especial", location: "Restaurante", budget: "$1,200" },
  { title: "Carta de amor manuscrita", description: "Escribirse una carta y leerla en voz alta", location: "Casa", budget: "$0" },
  { title: "Recrear su primera cita", description: "Volver al lugar y vivirla de nuevo", location: "Lugar especial", budget: "Variable" },
  { title: "Sesión de fotos juntos", description: "Vestirse bonito y fotografiarse por la ciudad", location: "Ciudad", budget: "$500" },
  { title: "Noche en hotel boutique", description: "Una noche sin salir para nada", location: "Hotel", budget: "$1,500" },
  { title: "Scrapbook de su relación", description: "Álbum físico con fotos y recuerdos", location: "Casa", budget: "$200" },
  { title: "Bailar en casa sin música", description: "Solo abrazados, balanceándose", location: "Casa", budget: "$0" },
  { title: "Clases de baile", description: "Salsa, bachata o tango juntos", location: "Estudio de baile", budget: "$400" },
  { title: "Clase de cerámica", description: "Moldear arcilla juntos, como en Ghost", location: "Taller", budget: "$400" },
  { title: "Yoga en pareja", description: "Conectar físicamente y relajarse", location: "Estudio", budget: "$300" },
  { title: "Boliche con apuestas", description: "Apuesta divertida entre ustedes", location: "Boliche", budget: "$300" },
  { title: "Mini golf", description: "El que pierda paga el helado", location: "Mini golf", budget: "$250" },
  { title: "Parque de diversiones", description: "Un día completo, subirse a todo", location: "Parque", budget: "$800" },
  { title: "Videojuegos competitivos", description: "El que pierde cocina la cena", location: "Casa", budget: "$0" },
  { title: "Trivia del uno al otro", description: "¿Quién conoce más al otro?", location: "Casa", budget: "$0" },
  { title: "Noche de pijamas con snacks", description: "En pijama toda la noche con muchos snacks", location: "Casa", budget: "$100" },
  { title: "Explorar un barrio nuevo", description: "Sin mapa, solo caminar y descubrir", location: "Ciudad", budget: "$200" },
  { title: "Café con vista bonita", description: "Ese café especial, pasar la tarde ahí", location: "Café", budget: "$200" },
  { title: "Ver puesta de sol en azotea", description: "Punto alto de la ciudad al atardecer", location: "Ciudad", budget: "$100" },
  { title: "Cine a medianoche", description: "La función de medianoche de lo que sea", location: "Cine", budget: "$300" },
  { title: "Bucket list juntos", description: "Café y las 100 cosas que quieren vivir", location: "Casa", budget: "$0" },
  { title: "Cápsula del tiempo", description: "Cartas al futuro para abrir en 5 años", location: "Casa", budget: "$0" },
  { title: "Vuelo en globo aerostático", description: "Al amanecer, una experiencia única", location: "A definir", budget: "$2,000" },
  { title: "Cabaña en el bosque", description: "Rentar una cabaña y desconectarse de todo", location: "Bosque", budget: "$1,500" },
  { title: "Buceo o snorkel", description: "Explorar el mundo submarino juntos", location: "Playa", budget: "$800" },
  { title: "Viaje sorpresa de fin de semana", description: "Uno planea, el otro no sabe el destino", location: "Sorpresa", budget: "$2,000" },
  { title: "Día de voluntariado juntos", description: "Hacer algo bueno para los demás como equipo", location: "ONG", budget: "$0" },
  { title: "Noche de confesiones", description: "Preguntas que nunca se han hecho — ya era hora", location: "Casa", budget: "$0" },
  { title: "Escribir los votos del uno al otro", description: "Sin presión, solo lo que sienten de verdad", location: "Casa", budget: "$0" },
  { title: "Mercado de pulgas o tianguis", description: "Buscar tesoros ocultos y curiosidades", location: "Tianguis", budget: "$200" },
  { title: "Aprender un idioma juntos", description: "Francés, italiano, japonés... lo que sea", location: "App/Casa", budget: "$0" },
  { title: "Hacer velas aromáticas", description: "Kit para velas personalizadas para casa", location: "Casa", budget: "$250" },
  { title: "Cata de café", description: "Distinguir orígenes y sabores del café", location: "Café", budget: "$300" },
  { title: "Ver álbum de fotos de la infancia", description: "Contar historias de cuando eran pequeños", location: "Casa", budget: "$0" },
  { title: "Paracaidismo en tándem", description: "Saltar juntos y gritarlo al mundo", location: "Aeródromo", budget: "$3,000" },
  { title: "Masaje en pareja en spa", description: "Masaje para dos en un spa bonito", location: "Spa", budget: "$800" },
  { title: "Cena bajo las estrellas", description: "Cenar afuera de noche con velas", location: "Jardín/Terraza", budget: "$300" },
  { title: "Playlist de su relación", description: "Las canciones que los identifican como pareja", location: "Casa", budget: "$0" },
  { title: "Clase de equitación", description: "Montar a caballo juntos por primera vez", location: "Rancho", budget: "$500" },
  { title: "Festival local", description: "Feria o festival de la ciudad", location: "Ciudad", budget: "$400" },
  { title: "Fotos en el centro histórico", description: "Caminar y fotografiar lugares emblemáticos", location: "Centro", budget: "$0" },
  { title: "Noche de cócteles caseros", description: "Aprender a preparar 3 cócteles nuevos", location: "Casa", budget: "$300" },
  { title: "Tirolesa entre árboles", description: "Volar por una tirolesa emocionante", location: "Parque aventura", budget: "$600" },
  { title: "Tour histórico de su ciudad", description: "Los lugares históricos con guía o solos", location: "Ciudad", budget: "$200" },
  { title: "Jardín botánico", description: "Plantas, flores y fotos bonitas", location: "Jardín", budget: "$150" },
  { title: "Librería enorme", description: "Elegir un libro para el otro", location: "Librería", budget: "$400" },
  { title: "Noche de comedia en vivo", description: "Stand-up comedy para reír hasta llorar", location: "Bar/Teatro", budget: "$400" },
  { title: "Tiro con arco", description: "Ver quién es mejor puntero", location: "Club deportivo", budget: "$300" },
  { title: "Clase de surf", description: "Aprender a surfear por primera vez", location: "Playa", budget: "$600" },
  { title: "Food truck crawl", description: "De food truck en food truck probando todo", location: "Ciudad", budget: "$300" },
  { title: "Mercado gastronómico gourmet", description: "Probar de todo un poco", location: "Mercado", budget: "$350" },
  { title: "Cervecería artesanal", description: "Probar cervezas y aprender el proceso", location: "Cervecería", budget: "$400" },
  { title: "Heladería artesanal", description: "Sabores raros — el más raro gana algo", location: "Heladería", budget: "$100" },
  { title: "Comprar libros y leer en café", description: "Cada uno elige un libro para el otro", location: "Librería/Café", budget: "$400" },
  { title: "Taller de meditación en pareja", description: "Técnicas de meditación y respiración", location: "Centro", budget: "$300" },
  { title: "Amanecer en la montaña", description: "Subir antes del amanecer y verlo desde arriba", location: "Montaña", budget: "$100" },
  { title: "Fotografía en la naturaleza", description: "El objetivo: la mejor foto del otro", location: "Parque/Bosque", budget: "$0" },
  { title: "Cena temática en casa", description: "Inspirada en un país que quieran visitar", location: "Casa", budget: "$300" },
  { title: "Panadería artesanal", description: "Pan recién hecho y pasteles artesanales", location: "Panadería", budget: "$200" },
  { title: "Sesión de Mario Kart", description: "El perdedor da un masaje de 15 minutos", location: "Casa", budget: "$0" },
  { title: "Billar", description: "No importa si no saben — ese es el chiste", location: "Bar/Billar", budget: "$200" },
  { title: "Feria de la ciudad", description: "Juegos, comida típica y ganar peluches", location: "Feria", budget: "$300" },
  { title: "Paseo nocturno por el centro", description: "El centro histórico iluminado de noche", location: "Centro", budget: "$100" },
  { title: "Día en acuario o zoológico", description: "Conocer animales y tomarse fotos", location: "Acuario/Zoo", budget: "$400" },
  { title: "Clase de cerámica Kintsugi", description: "El arte de reparar lo roto con oro", location: "Taller", budget: "$500" },
  { title: "Origami juntos", description: "El más difícil que puedan hacer", location: "Casa", budget: "$50" },
  { title: "Exposición de arte contemporáneo", description: "Galería o exposición temporal", location: "Galería", budget: "$150" },
  { title: "Baño en cascada o río", description: "Lugar natural con agua y refrescarse", location: "Naturaleza", budget: "$100" },
  { title: "Noche de pijamas con trivia", description: "Preguntas de cultura general y snacks", location: "Casa", budget: "$80" },
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
  { title: "Lo que me hace bien y lo que no", description: "Qué cosas me nutren emocionalmente y cuáles me drenan", priority: "normal" },
  { title: "Cómo me gusta que me hagan sentir querida", description: "Mis lenguajes del amor: palabras de afirmación, tiempo de calidad, actos de servicio, regalos o contacto físico", priority: "normal" },
  { title: "Mis metas personales para este año", description: "Lo que cada uno quiere lograr y cómo apoyarnos", priority: "cuando puedan" },
  { title: "Cómo manejar mejor los conflictos", description: "Cómo nos comunicamos cuando estamos enojados y qué mejorar", priority: "normal" },
  { title: "Nuestro futuro juntos", description: "¿Dónde nos vemos en 2-3 años como pareja?", priority: "cuando puedan" },
  { title: "Las cosas que más valoro de ti", description: "Decirse mutuamente lo que más admiran y aman del otro. Sin filtros", priority: "cuando puedan" },
];

const GOALS_SEED = [
  { title: "Bajar de peso juntos", description: "Meta: cada uno bajar al menos 5kg con ejercicio y mejor alimentación", category: "salud", emoji: "💪", status: "en progreso", progress_percent: 20, when_to_do: "Para antes del verano", photo: "" },
  { title: "Correr 100 km acumulados", description: "Registrar cada carrera y sumar el total entre los dos", category: "salud", emoji: "🏃", status: "pendiente", progress_percent: 0, when_to_do: "A lo largo del año", photo: "" },
  { title: "Leer 12 libros este año", description: "Un libro al mes. Comentarlo juntos con un café", category: "general", emoji: "📚", status: "en progreso", progress_percent: 25, when_to_do: "Diciembre de este año", photo: "" },
  { title: "Aprender a cocinar 10 recetas nuevas", description: "Una receta nueva cada mes de un país diferente", category: "hogar", emoji: "👨‍🍳", status: "en progreso", progress_percent: 30, when_to_do: "A lo largo del año", photo: "" },
  { title: "Primer viaje internacional juntos", description: "Elegir un destino y planear todo juntos", category: "viaje", emoji: "🌍", status: "pendiente", progress_percent: 10, when_to_do: "El próximo año", photo: "" },
  { title: "Montar en bici 200 km acumulados", description: "Salidas de bicicleta los fines de semana", category: "salud", emoji: "🚴", status: "pendiente", progress_percent: 0, when_to_do: "Este año", photo: "" },
];

async function seedDatabase() {
  if (!HAS_DB) return;
  try {
    const { count } = await sb.from('date_ideas').select('*', { count: 'exact', head: true });
    if (count > 0) return;
    console.log('🌱 Insertando datos de ejemplo...');
    const DEMO = '💕 Ejemplo';
    await sb.from('date_ideas').insert(DATE_IDEAS_SEED.map(d => ({ ...d, done: false, created_by: 'demo', display_name: DEMO })));
    await sb.from('wishlist').insert(WISHLIST_SEED.map(d => ({ ...d, purchased: false, created_by: 'demo', display_name: DEMO })));
    await sb.from('talks').insert(TALKS_SEED.map(d => ({ ...d, resolved: false, created_by: 'demo', display_name: DEMO })));
    await sb.from('goals').insert(GOALS_SEED.map(d => ({ ...d, created_by: 'demo', display_name: DEMO })));
    console.log('✅ Datos de ejemplo listos');
  } catch(e) { console.error('Seed error:', e.message); }
}

app.listen(PORT, async () => {
  console.log(`💕 Love Project corriendo en http://localhost:${PORT}`);
  if (HAS_DB) await seedDatabase();
});
