const express = require("express");
const app = express();
const { MongoClient } = require("mongodb");
const port = process.env.PORT || 5000;
const cors = require("cors");
const ObjectId = require("mongodb").ObjectId;
const admin = require("firebase-admin");
const { query, request } = require("express");
const stripe = require("stripe")(
  "sk_test_51JwgBdGiEGQOdu5ahTwZo95Z9OhJBaQv1ELNuRoonS49tFQcV1q0CFUPhfgxcvRjVd9j3uNaXVJfJhqbQhMJfOEu00fBLBaCi1"
);
require("dotenv").config();

/* DB_USER=Doctor-portal
DB_PASS=5FWmJozKiFjRZD3d
STRIPE_SECRET=sk_test_51JwgBdGiEGQOdu5ahTwZo95Z9OhJBaQv1ELNuRoonS49tFQcV1q0CFUPhfgxcvRjVd9j3uNaXVJfJhqbQhMJfOEu00fBLBaCi1 */

// middleware
app.use(cors());
app.use(express.json());

// doctor-portals-firebase-adminsdk.json;
const serviceAccount = require("./doctor-portals-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// connect with mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.14uaf.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
console.log(uri);
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function varifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers?.authorization?.split(" ")[1];

    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }

  next();
}

// connect with function
async function run() {
  try {
    await client.connect();
    const database = client.db("doctor-portal");
    const appointmentCollection = database.collection("appointments");
    const usersCollection = database.collection("users");

    // app.get
    app.get("/appointments", varifyToken, async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;
      console.log("date", date);
      const query = { email: email, date: date };
      const cursor = appointmentCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    });

    // app post
    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await appointmentCollection.insertOne(appointment);
      console.log(result);
      res.json(result);
    });

    //app.post for user info
    app.post("/users", async (req, res) => {
      const users = req.body;
      const result = await usersCollection.insertOne(users);
      console.log(result);
      res.json(result);
    });

    // app.update for users
    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    // app.update for admin
    app.put("/users/admin", varifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res.status(403).json({ message: "you don't have to make an admin" });
      }
    });

    // addmin find
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });

    // appoint get for payment
    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentCollection.findOne(query);
      res.json(result);
    });
    // update doc
    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await appointmentCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    // payment
    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.json({
        clientSecret: paymentIntent.client_secret,
      });
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("hello from the doctor portal server");
});

app.listen(port, () => {
  console.log("listening form the port", port);
});
