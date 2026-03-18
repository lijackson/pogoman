import express from 'express';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import { OAuth2Client } from 'google-auth-library';

const jsonParser = bodyParser.json();

const app = express();
const port = process.env.PORT || 5000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || "default_change_me_37vkje4dxd90gs6s4uq98rt";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function createJwtForUser(user) {
    return jwt.sign({ user_id: user._id.toString(), display_name: user.display_name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyJwt(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

async function verifyGoogleIdToken(credential) {
    if (!credential) return null;
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    return ticket.getPayload();
}

async function loadUserFromToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }
    const token = authHeader.split(' ')[1];
    const payload = verifyJwt(token);
    if (!payload || !payload.user_id) {
        req.user = null;
        return next();
    }
    try {
        const user = await app.locals.db.collection('users').findOne({ _id: new ObjectId(payload.user_id) });
        req.user = user || null;
    } catch (err) {
        console.error('auth lookup failed', err);
        req.user = null;
    }
    return next();
}

app.use(jsonParser);
app.use(loadUserFromToken);

// async function createLevel( lvl) {
//     const result = await app.locals.db("pogoman").collection("levels").insertOne(lvl);
//     console.log(`Inserted new level into DB: ${result.insertedId}`);
// }

async function getRecordsByLevel(lvl_id) {
    const result = await app.locals.db.collection('scores').find({ level_id: lvl_id });
    return await result.toArray();
}

async function getRecord(lvl_id, username) {
    var result = await app.locals.db.collection("scores").findOne({level_id: lvl_id, username: username});
    if (!result)
        return null;
    console.log(`successfully got record: ${result}`);
    return await result;
}

function validate_replay(level, replay, reported_time) {
    if (!level || !replay || replay == []) {
        console.log("invalid info set");
        return false;
    }
    var real_time = 0;
    for (var t = 0; t < replay.length; t++) 
        real_time += replay[t][1];
    if (real_time*5 != reported_time) {
        console.log(`real time (${real_time*5}ms) != reported time (${reported_time}ms)`);
        return false;
    }
    // TODO: use the ReplayEngine to actually validate runs
    return true;
}

async function updateRecord(lvl_id, username, new_time, replay) {
    if (!lvl_id || !username || !new_time || !replay) {
        console.log(`Not a full dataset for record [lvl_id: ${lvl_id}, username: ${username}, time: ${new_time}], replay: ${replay}]`);
        return false;
    }
    if (!validate_replay(lvl_id, replay, new_time)) { // TODO: switch this to actually getting the level
        console.log(`User "${username}" submitted a time of ${new_time}ms for level ${lvl_id} without a valid replay`);
        return false;
    }
    
    var record = {level_id: lvl_id, username: username, time: new_time, replay:replay};
    const updated_record = await app.locals.db.collection("scores")
        .updateOne({level_id: lvl_id, username: username}, {$set: record}, {upsert: true});
    
    return updated_record;
}

app.get('/api/records/:lvl_id', async (req, res) => {
    var {lvl_id} = req.params;
    console.log(`retrieving records for level: ${lvl_id}`)
    var records = [];
    try {
        records = await getRecordsByLevel(lvl_id);
    } catch(e) {
        console.log(e);
        return res.status(500).json({ ok: false, message: "Bad request" });
    } finally {
    }
    records.forEach(rec => {
        console.log(rec);
    });
    return res.status(200).json(records);
});

app.post('/api/records/submit', async (req, res) => {
    const { level_id, username, time, replay } = req.body;
    if (!level_id || typeof time !== 'number' || !replay) {
        return res.status(400).json({ ok: false, message: 'Missing required fields' });
    }

    if (req.user) {
        const chosenUsername = req.user.display_name || username || 'Player';
        const current = await getCurrentRecord(level_id, null, req.user._id.toString());
        if (!current || time <= current.time) {
            const success = await updateRecord(level_id, chosenUsername, time, replay, req.user._id.toString());
            if (!success) return res.status(500).json({ ok: false, message: 'Unable to write authenticated score' });
        }
        return res.status(200).json({ ok: true, authenticated: true, username: chosenUsername });
    }

    if (!username) {
        return res.status(400).json({ ok: false, message: 'Missing username for anonymous score' });
    }
    const current = await getCurrentRecord(level_id, username, null);
    if (!current || time <= current.time) {
        const success = await updateRecord(level_id, username, time, replay, null);
        if (!success) return res.status(500).json({ ok: false, message: 'Unable to write anonymous score' });
    }
    return res.status(200).json({ ok: true, authenticated: false, username });
});

app.post('/api/auth/google', async (req, res) => {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ ok: false, message: 'Missing credential' });

    let payload;
    try {
        payload = await verifyGoogleIdToken(credential);
    } catch (err) {
        console.error('Google ID token verify failed', err);
        return res.status(401).json({ ok: false, message: 'Invalid Google credential' });
    }
    if (!payload || !payload.sub) {
        return res.status(401).json({ ok: false, message: 'Invalid Google credential payload' });
    }

    let user = await app.locals.db.collection('users').findOne({ google_sub: payload.sub });
    if (!user) {
        const insertResult = await app.locals.db.collection('users').insertOne({ google_sub: payload.sub, email: payload.email || '', display_name: payload.name || payload.email || 'Player', created_at: new Date() });
        user = await app.locals.db.collection('users').findOne({ _id: insertResult.insertedId });
    } else {
        const updateData = { display_name: payload.name || user.display_name, email: payload.email || user.email };
        await app.locals.db.collection('users').updateOne({ _id: user._id }, { $set: updateData });
        user = await app.locals.db.collection('users').findOne({ _id: user._id });
    }

    const token = createJwtForUser(user);
    return res.status(200).json({ ok: true, token, user: { id: user._id.toString(), display_name: user.display_name, email: user.email } });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(200).json({ ok: true, authenticated: false });
    return res.status(200).json({ ok: true, authenticated: true, user: { id: req.user._id.toString(), display_name: req.user.display_name, email: req.user.email } });
});

app.post('/api/auth/attach-username', async (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Not authenticated' });
    const { existing_username } = req.body;
    if (!existing_username) return res.status(400).json({ ok: false, message: 'existing_username required' });
    const updateResult = await app.locals.db.collection('scores').updateMany({ username: existing_username, account_id: { $exists: false } }, { $set: { account_id: req.user._id.toString() } });
    return res.status(200).json({ ok: true, modifiedCount: updateResult.modifiedCount });
});

// app.listen(port, () => {
//     console.log(`started server on port ${port}`);
// });
MongoClient.connect(process.env.POGO_MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })
    .catch(err => console.error(err.stack))
    .then(client => {
        app.locals.db = client.db("pogoman");
        app.listen(port, () => {
            console.log(`Pogoman listening on port ${port}!`);
        });
    });