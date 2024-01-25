const express = require('express');
const app = express();
const methodOverride = require('method-override')
const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const bcrypt = require('bcrypt')
const MongoStore = require('connect-mongo')
const { createServer } = require('http')
const { Server } = require('socket.io')
const server = createServer(app)
const io = new Server(server)



require('dotenv').config();

const { MongoClient, ObjectId } = require('mongodb')
let db
const url = process.env.mongodb_Url;
new MongoClient(url).connect().then((client)=>{
  console.log('DB연결성공');
  db = client.db('forum');
  server.listen(process.env.PORT, () => {
    console.log("http://localhost:" + process.env.PORT)
});
}).catch((err)=>{
  console.log(err)
})

app.set('view engine', 'ejs'); 

app.use(express.json()); 
app.use(express.urlencoded({extended:true}));
app.use(methodOverride('_method'))
app.use(passport.initialize())
const sessionMiddleware = session({
  resave : false,
  saveUninitialized : false,
  secret: '0011223', //세션 암호화 비밀번호
  cookie : {maxAge : 1000 * 60 * 60},
  store: MongoStore.create({
    mongoUrl : process.env.mongodb_Url, //홈페이지 DB접속용 URL'
    dbName: 'forum', //DB 이름
  })
})
app.use(sessionMiddleware)

  passport.use(new LocalStrategy(async (ID, PASSWORD, cb) => {
    let result = await db.collection('user').findOne({ username : ID})
    if (!result) {
      return cb(null, false, { message: '아이디 DB에 없음' })
    }
  
    if (await bcrypt.compare(PASSWORD, result.password)) {
      return cb(null, result)
    } else {
      return cb(null, false, { message: '비번불일치' });
    }
  }))
  

passport.serializeUser((user, done) => {
    process.nextTick(() => {
      done(null, { id: user._id, username: user.username })
    })
  })
passport.deserializeUser(async (user, done) => {
    let result = await db.collection('user').findOne({_id : new ObjectId(user.id) })
    delete result.password
    process.nextTick(() => {
      return done(null, result)
    })
  })
  
  

app.use(passport.session())


function addUserToLocal(req, res, next){
  res.locals.user = req.user || null;
  next();
}

function loggedIn(req, res, next) {
  if (req.user) {
      next();
  } else {
      res.redirect('/login');
  }
}

app.use(addUserToLocal);


app.get('/', (req, res) => {

    // if(req.user){
    //     res.render('index', { user : req.user.username})
    // } else {
    //     res.render('index', { user : "" })
    // }

    // const user = res.locals.user;
    res.render('index')
})

app.get("/list", loggedIn, async (req, res, next) => {
  let result = await db.collection('post').find().toArray();
  res.render('list', { result});
})

app.get("/write", loggedIn, (req, res, next) => {
  res.render("write");
})
app.post("/add_post", loggedIn, async (req, res, next) => {
  await db.collection('post').insertOne({ title: req.body.title, content: req.body.content});
  res.redirect("/list");
})

app.get("/detail/:id", loggedIn, async (req, res, next) => {
  let result = await db.collection('post').findOne({ _id : new ObjectId( req.params.id)});
  res.render('detail', { result})
})



app.get("/register", (req, res) => {
    res.render("register.ejs");
})
app.post('/register', async (req, res) => {
    let hash = await bcrypt.hash(req.body.password, 10) 
    await db.collection('user').insertOne({
      username : req.body.username,
      password : hash
    })
    res.redirect('/')
  })

app.get("/login", (req, res) => {
    res.render("login.ejs");
})
app.post('/login', async (req, res, next) => {

    passport.authenticate('local', (error, user, info) => {
        if (error) return res.status(500).json(error)
        if (!user) return res.status(401).json(info.message)
        req.logIn(user, (err) => {
          if (err) return next(err)
          res.redirect('/')
        })
    })(req, res, next)
  })


app.get('/logout', (req, res, next) => {
    req.logout((err) => {
      if(err) { return next(err); }
      req.session.destroy();
      res.redirect("/");
    })
  });  


io.engine.use(sessionMiddleware)

app.get("/chat-list", loggedIn, async (req, res, next) => {
  console.log(req.user._id.toString());
  let result = await db.collection('chat-room').find( {user : req.user._id.toString()} ).toArray() || 0
  console.log(result)
  res.render('chat-list', { result })
})

app.get("/chat_creat/:id", loggedIn, async (req, res, next) => {
  await db.collection('chat-room').insertOne({ carated: req.params.id, user: [req.params.id], creat_date: new Date(), title: req.user.username});
  res.redirect('back');
})

io.on('connection', (socket) => {
  
  socket.on('join', async (data) =>{
    let result = await db.collection('chat-room').findOne({ _id: new ObjectId(data)})

    if(result.user == socket.request.session.passport.user.id){
      socket.join(data);
    }
    
  })
  socket.on('msg', (data) => {
    io.to(data.room).emit('boradcast', data.msg)
  })
})

app.get("/chat/:id", loggedIn, (req, res, next) => {

  res.render('chat', { room_id : req.params.id })
})

  // router.get('/logout', isLoggedIn, (req, res) => {
  //   req.logout((err) => {
  //     if (err) { return next(err); }
  //     req.session.destroy();
  //     res.redirect('/');
  //   });
  // });