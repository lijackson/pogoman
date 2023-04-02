import express from 'express';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = 8080;
const DIR = fileURLToPath(dirname(import.meta.url));

app.use('/', express.static(path.join(DIR, '../frontend')));

app.get('/score', async (req, res) => {
    return res.json("hello world");
});

app.listen(port, () => {
    console.log(`started server on port ${port}`);
});