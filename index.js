const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

// middleware
app.use(cors());
app.use(express.json())


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  //  bearer token
  const token = authorization.split(' ')[1];


  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })

}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xdyi47s.mongodb.net/?retryWrites=true&w=majority`;

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
    // await client.connect();


    const classesCollection = client.db("sportsDB").collection("classes");
    const instructorsCollection = client.db("sportsDB").collection("instructors");
    const selectedClassCollection = client.db("sportsDB").collection("selectedClass");
    const usersCollection = client.db('sportsDB').collection('users')
    const paymentCollection = client.db('sportsDB').collection('payments')

    // JWT
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token })
    })


    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' })
      }
      next()
    }
   

    // users api
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
    })

    // check admin



    // make admin
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // check admin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result)
    })




    // payment
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseFloat(price) * 100;
      if (!price) return;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", async (req, res) => {
      try {
        const data = req.body;
        const classId = data.classId; // Since you're sending a single classId from the client side

        // Insert enrollment data into the collection
        const result = await paymentCollection.insertOne(data);

        // Update the class document for the given classId
        const filter = { _id: new ObjectId(classId) };
        const update = [
          {
            $set: {
              availableSeats: { $toInt: "$availableSeats" },
              totalStudents: { $toInt: "$totalStudents" },
            },
          },
          // { $inc: { number_of_students: 1, available_seats: -1 } },
        ];
        await classesCollection.updateOne(filter, update);

        // Delete the corresponding addedClass document
        const deletedRes = await selectedClassCollection.deleteOne({ _id: new ObjectId(data.classId) });

        res.send({ result, deletedRes });
      } catch (error) {
        res.status(500).send({ error: "An error occurred while processing the payment." });
      }
    });


    app.get("/payment", async (req, res) => {
      const email = req.query.email;
      const result = await paymentCollection
        .find({ email: email })
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });




    // make instructor
    app.put('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // approve
    app.put('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateStatus = {
        $set: {
          status: 'Approved'
        }
      };
      const result = await classesCollection.updateOne(filter, updateStatus);
      res.send(result)
    })
    // denied
    app.patch('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateStatus = {
        $set: {
          status: 'Denied'
        }
      };
      const result = await classesCollection.updateOne(filter, updateStatus);
      res.send(result)
    })


    
    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'instructor' }
      res.send(result)
    })



    app.delete('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result)
    })





    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const remainingUser = await usersCollection.findOne(query);
      if (remainingUser) {
        return res.send({ message: 'This user already exists' })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result)
    })


    // get classes
    app.get('/classes', async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result)
    })

    // post classes

    app.post('/classes', verifyJWT, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass)
      res.send(result)
    })

    // get instructors
    app.get('/instructors', async (req, res) => {
      const result = await instructorsCollection.find().toArray();
      res.send(result)
    })

    // select classes
    app.get('/selectedClass', verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'illegal access' })
      }
      const query = { email: email };
      const result = await selectedClassCollection.find(query).toArray();
      res.send(result)
    })


    app.get('/instructorClass', verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'illegal access' })
      }
      const query = { email: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result)
    })


    app.post('/selectedClass', async (req, res) => {
      const item = req.body;
      const result = await selectedClassCollection.insertOne(item);
      res.send(result)
    })

    app.delete('/selectedClass/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassCollection.deleteOne(query);
      res.send(result)
    })




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('summer camp is sitting')
})


app.listen(port, () => {
  console.log(`summer camp is sitting on post ${port}`);
})






