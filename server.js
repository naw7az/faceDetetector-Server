const express = require('express')
const bcrypt = require('bcrypt-nodejs')  // hash password
const cors = require('cors');
const knex = require('knex');
const Clarifai = require('clarifai');

//You must add your own API key here from Clarifai.
const face = new Clarifai.App({
  apiKey: process.env.API_CLARIFAI
 });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0

const db = knex({
  client: 'pg',
  connection: {
    connectionString : process.env.DATABASE_URL,
    ssl: true
  }  
});

const app = express();
app.use(express.json());
app.use(cors())

app.get('/', (req, res) => {
  res.send('Success')
})

app.post('/signin', (req, res) => {
  const {email, password} = req.body;
  if (!email || !password) {
    return res.status(400).json('Incorrect Form Submission')
  }
  db.select('email', 'hash').from('login')
    .where('email', '=', email)
    .then(data => {
      const isValid = bcrypt.compareSync(password, data[0].hash);
      if (isValid) {
        return db.select('*').from('users')
          .where('email', '=', email)
          .then(user => res.json(user[0]))
          .catch(() => res.status(400).json('Unable to get User'))
      }
      res.status(400).json('Wrong credentials')
    })
    .catch(() => res.status(400).json('Wrong credentials'))
})

app.post('/register', (req, res) => {
  const {name, email, password} = req.body;
  if (!name || !email || !password) {
    return res.status(400).json('Incorrect Form Submission')
  }
  const hash = bcrypt.hashSync(password);
  // transaction is needed to fill two table at once
  db.transaction(trx => {
    trx.insert({
      hash: hash,
      email: email
    })
    .into('login')
    .returning('email')
    .then(loginEmail => {
      return trx('users')
        .returning("*")
        .insert({
        email: loginEmail[0],
        name: name,
        joined: new Date()
        })
        .then(user => res.json(user[0]))
    })
    .then(trx .commit)
    .catch(trx.rollback)
  })
  .catch(() => res.status(400).json('Unable to Register'))
})

app.get('/profile/:id', (req, res) => {
  const { id } = req.params;
  db.select('*').from('users').where({
    id: id
  }).then(user => {
    if (user.length) {
      res.json(user[0])
    }
    res.status(400).json('User Not Found!')
  })
})

app.put('/image', (req, res) => {
  const { id } = req.body;
  db('users').where('id', '=', id)
  .increment('entries', 1)
  .returning('entries')
  .then(entries => res.json(entries))
  .catch(() => res.status(400).json('Unable to get Entries'))
})

app.post('/imageurl', (req, res) => {
  face.models
    .predict(Clarifai.FACE_DETECT_MODEL, req.body.input)
    .then(data => res.json(data))
    .catch(() => res.status(400).json('Unable to Work with API'))
})

app.listen(process.env.PORT || 5000, () => {
  console.log(`server is running on port ${process.env.PORT}`)
})


/* API structure :
/                --> GET = this is working
/signin          --> POST = success/fail
/register        --> POST = user
/profile/:userId --> GET = user
/image           --> PUT = user  */ 
