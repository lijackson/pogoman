import express from 'express';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = 5000;
const DIR = fileURLToPath(dirname(import.meta.url));

// app.use('/', express.static('frontend'));

app.get('/api/score', async (req, res) => {
    return res.json("hello world");
});

app.listen(port, () => {
    console.log(`started server on port ${port}`);
});