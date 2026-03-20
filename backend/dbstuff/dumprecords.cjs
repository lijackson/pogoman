const { MongoClient, ServerApiVersion } = require('mongodb');
const fs = require('fs');
const uri = process.env.POGO_MONGODB_URL;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    const db = client.db("pogoman");
    const scores = await db.collection("scores").find({}).toArray();
    fs.writeFile("scores_dump.json", JSON.stringify(scores, null, 2), (err) => {
        if (err) {
            console.error("Error writing scores_dump.json: ", err);
        } else {
          console.log("Successfully wrote scores_dump.json");
        }
      });
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);