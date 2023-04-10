import express from 'express';
import bodyParser from 'body-parser';

const jsonParser = bodyParser.json();

import MongoClient from 'mongodb';
// async function createLevel(client, lvl) {
//     const result = await client.db("pogoman").collection("levels").insertOne(lvl);
//     console.log(`Inserted new level into DB: ${result.insertedId}`);
// }

async function getRecordsByLevel(client, lvl_id) {
    var result = await client.db("pogoman").collection("scores").find({level_id: lvl_id});
    if (!result)
        return [];
    
    return await result.toArray();
}

async function getRecord(client, lvl_id, username) {
    var result = await client.db("pogoman").collection("scores").findOne({level_id: lvl_id, username: username});
    if (!result)
        return null;
    console.log(`successfully got record: ${result}`);
    return await result.toArray();
}
async function updateRecord(client, lvl_id, username, new_time) {
    var record = {level_id: lvl_id, username: username, time: new_time};
    const updated_record = await client.db("pogoman").collection("scores")
        .updateOne({level_id: lvl_id, username: username}, {$set: record}, {upsert: true});
}

// async function listdbs(client) {
//     const databaseslist = await client.db().admin().listDatabases();

//     console.log("Databases:");
//     databaseslist.databases.forEach(db => {
//         console.log(`- ${db.name}`);
//     });
// }


// Serving
const app = express();
const port = 5000;

app.get('/api/records/:lvl_id', async (req, res) => {
    var {lvl_id} = req.params;
    console.log(`retrieving records for level: ${lvl_id}`)
    var records = [];
    const client = new MongoClient.MongoClient(process.env.POGO_MONGODB_URL);
    try {
        await client.connect();
        records = await getRecordsByLevel(client, lvl_id);
    } catch(e) {
        console.log(e);
        return res.status(500).json({ ok: false, message: "Bad request" });
    } finally {
        await client.close();
    }
    return res.json(records);
});

app.post('/api/records/submit', jsonParser, async (req, res) => {
    const record = req.body;
    const client = new MongoClient.MongoClient(process.env.POGO_MONGODB_URL);
    try {
        await client.connect();
        const curr_best = await getRecord(client, record.level_id, record.username);
        if (!curr_best || !curr_best.time || record.time < curr_best.time)
            await updateRecord(client, record.level_id, record.username, record.time);
    } catch (e) {
        console.log(e);
        return res.status(400).json({ ok: false, message: "Bad request" });
    } finally {
        await client.close();
    }

    return res.status(200);
});

app.listen(port, () => {
    console.log(`started server on port ${port}`);
});

// Testing
// main().catch(console.error);