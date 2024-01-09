import express from 'express';
import bodyParser from 'body-parser';

const jsonParser = bodyParser.json();

import { MongoClient, ServerApiVersion } from 'mongodb';
// async function createLevel( lvl) {
//     const result = await app.locals.db("pogoman").collection("levels").insertOne(lvl);
//     console.log(`Inserted new level into DB: ${result.insertedId}`);
// }

async function getRecordsByLevel(lvl_id) {
    var result = await app.locals.db.collection("scores").find({level_id: lvl_id});
    if (!result)
        return [];
    
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
    if (!level || !replay || replay == [])
        return false;
    var real_time = 0;
    for (var t = 0; t < replay.size(); t++)
        real_time += replay[t][1];
    if (real_time != reported_time)
        return false;
    // TODO: use the ReplayEngine to actually validate runs
    return true;
}

async function updateRecord(lvl_id, username, new_time, replay) {
    if (!lvl_id || !username || !new_time || !replay) {
        console.log(`Not a full dataset for record [lvl_id: ${lvl_id}, username: ${username}, time: ${new_time}], replay: ${replay}]`);
        return false;
    }
    console.log(`updating record with data:\n${lvl_id} : ${username} : ${new_time}\n${replay}\n`);
    // var real_time = 0;
    // for (var t = 0; t < replay.size(); t++)
    //     real_time += replay[t][1];
    // console.log(`time reported from replay: ${real_time}`);
    // if (!validate_replay(lvl_id, replay, new_time)) { // TODO: switch this to actually getting the level
    //     console.log(`User "${username}" submitted a time of ${new_time}ms for level ${lvl_id} without a valid replay`);
    //     return false;
    // }
    
    var record = {level_id: lvl_id, username: username, time: new_time, replay:replay};
    const updated_record = await app.locals.db.collection("scores")
        .updateOne({level_id: lvl_id, username: username}, {$set: record}, {upsert: true});
    
    return updated_record;
}

// Serving
const app = express();
const port = 5000;

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

app.post('/api/records/submit', jsonParser, async (req, res) => {
    const record = req.body;
    console.log(record);
    try {
        const curr_best = await getRecord(record.level_id, record.username);
        if (!curr_best || !curr_best.time || record.time <= curr_best.time) {
            var success = await updateRecord(record.level_id, record.username, record.time, record.replay);
            if (!success)
                return res.status(400).json({ ok: false, message: "Missing record information" });
        }
    } catch (e) {
        console.log(e);
        return res.status(400).json({ ok: false, message: "Bad request" });
    }
    console.log("finished updating record");
    return res.status(200).json({ ok: true });
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

// Testing
// main().catch(console.error);