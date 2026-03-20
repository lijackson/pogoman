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
    return jwt.sign({ account_id: user._id.toString(), display_name: user.display_name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
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
    if (!payload || !payload.account_id) {
        req.user = null;
        return next();
    }
    try {
        const user = await app.locals.db.collection('users').findOne({ _id: new ObjectId(payload.account_id) });
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

function mapDBRecordToClientRecord(dbRecord, user) {
    const record = {
        level_id: dbRecord.level_id,
        time: dbRecord.time,
        replay: dbRecord.replay,
        display_name: user
            ? user.display_name
            : dbRecord.username
                ? dbRecord.username
                : "Unknown Player"
    };
    console.log(`mapping db record ${JSON.stringify(dbRecord)} with user ${JSON.stringify(user)} to client record: ${JSON.stringify(record)}`);
    return record;
}

async function getRecordsByLevel(lvl_id) {
    const records = await app.locals.db.collection('scores').find({ level_id: lvl_id });
    const users = await app.locals.db.collection('users').find({}).toArray();
    const client_facing_records = records.map(dbRecord => {
        const user = dbRecord.account_id
            ? users.find(u => u._id.toString() === dbRecord.account_id)
            : null;
        return mapDBRecordToClientRecord(dbRecord, user);
    }).toArray();
    console.log(`got records for level ${lvl_id}: `, client_facing_records);
    return client_facing_records;
}

async function getRecord(lvl_id, account_id) {
    const record = await app.locals.db.collection("scores").findOne({level_id: lvl_id, account_id: account_id});
    const user = await app.locals.db.collection('users').findOne({account_id: account_id});
    console.log(`successfully got record: ${JSON.stringify(record)}`);
    if (!record)
        return null;
    const result = mapDBRecordToClientRecord(record, user);
    console.log(`converted to client record: ${JSON.stringify(result)}`);
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

async function google_id_to_user(google_id) {
    if (!google_id)
        return null;
    const user = await app.locals.db.collection("users").findOne({ google_sub: google_id });
    if (!user) {
        console.log(`Could not find user with google_id ${google_id}`);
        return null;
    }
    return user;
}

async function updateRecord(lvl_id, account_id, new_time, replay) {
    if (!lvl_id || !account_id || !new_time || !replay) {
        console.log(`Not a full dataset for record [lvl_id: ${lvl_id}, account_id: ${account_id}, time: ${new_time}], replay: ${replay}]`);
        return false;
    }
    
    if (!validate_replay(lvl_id, replay, new_time)) { // TODO: switch this to actually getting the level
        console.log(`User "${account_id} submitted a time of ${new_time}ms for level ${lvl_id} with an invalid replay`);
        return false;
    }
    
    var record = {level_id: lvl_id, account_id: account_id, time: new_time, replay:replay};
    const updated_record = await app.locals.db.collection("scores")
        .updateOne({level_id: lvl_id, account_id: account_id}, {$set: record}, {upsert: true});
    
    return updated_record;
}

async function attachUsername(existing_username, new_account_id) {
    if (!existing_username || !new_account_id) {
        console.log(`Not a full dataset for attachUsername [existing_username: ${existing_username}, new_account_id: ${new_account_id}]`);
        return false;
    }
    // original username will be kept as a legacy field for reference but will no longer be used for lookups
    const result = await app.locals.db.collection("scores").updateMany({ username: existing_username, account_id: { $exists: false } }, { $set: { account_id: new_account_id } });
    console.log(`Attached ${result.modifiedCount} record(s) from ${existing_username} to account_id ${new_account_id}`);
    return result;
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
    const { level_id, time, replay } = req.body;
    if (!level_id || typeof time !== 'number' || !replay) {
        return res.status(400).json({ ok: false, message: 'Missing required fields' });
    }

    if (req.user) {
        const user = await google_id_to_user(req.user.google_sub);
        if (!user)
            return res.status(401).json({ ok: false, message: 'User not found' });
        const account_id = user._id.toString();

        const current = await getRecord(level_id, account_id);
        if (!current || time <= current.time) {
            const success = await updateRecord(level_id, account_id, time, replay);
            if (!success) return res.status(500).json({ ok: false, message: 'Unable to write authenticated score' });
        }
        return res.status(200).json({ ok: true, authenticated: true, username: user.display_name });
    }
    return res.status(500).json({ ok: false, message: 'Attempted to submit a score without being authenticated' });
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

    let user = await google_id_to_user(payload.sub);
    if (!user) {
        const time = new Date();
        const insertResult = await app.locals.db.collection('users').insertOne({ google_sub: payload.sub, email: payload.email || '', display_name: payload.name || payload.email || "Player-"+time.getMilliseconds(), created_at: time });
        user = await app.locals.db.collection('users').findOne({ _id: insertResult.insertedId });
    }

    const token = createJwtForUser(user);
    return res.status(200).json({ ok: true, token, user: { id: user._id.toString(), display_name: user.display_name, email: user.email } });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.user) return res.status(200).json({ ok: true, authenticated: false });
    return res.status(200).json({ ok: true, authenticated: true, user: { id: req.user._id.toString(), display_name: req.user.display_name, email: req.user.email } });
});

app.post('/api/auth/set-username', async (req, res) => {
    if (!req.user) return res.status(401).json({ ok: false, message: 'Not authenticated' });
    const { new_display_name } = req.body;
    if (!new_display_name) return res.status(400).json({ ok: false, message: 'new_display_name required' });
    const updateResult = await app.locals.db.collection('users').updateOne({ google_sub: req.user.google_sub }, { $set: { display_name: new_display_name } });

    // attach existing records with the old username to this account_id for legacy support (can be removed in the future when we switch fully to account_id based lookups)
    const attachResult = await attachUsername(req.user.display_name, req.user._id.toString());
    
    return res.status(200).json({ ok: true });
});

MongoClient.connect(process.env.POGO_MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })
    .catch(err => console.error(err.stack))
    .then(client => {
        app.locals.db = client.db("pogoman");
        app.listen(port, () => {
            console.log(`Pogoman listening on port ${port}!`);
        });
    });

