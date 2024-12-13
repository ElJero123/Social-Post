import express from 'express'
import { ACCESS_KEY, PORT, REFRESH_KEY } from './config.js'
import { UserRepository } from './user-repository.js'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import logger from 'morgan'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { getActualTime } from './getActualTime.js'

const app = express()
const server = createServer(app)
const io = new Server(server, {
  connectionStateRecovery: {}
})

let otherUsername = ''

app.set('view engine', 'ejs')

app.use(express.json())
app.use(cookieParser())

app.disable('x-powered-by')

app.use(logger('dev'))

app.use(async (req, res, next) => {
  const token = req.cookies.refresh_token
  req.session = { user: null }

  try {
    const userToken = jwt.verify(token, REFRESH_KEY)
    req.session.user = userToken
    otherUsername = req.session.user.username
  } catch {}

  next()
})

app.use(async (req, res, next) => {
  const token = req.cookies.refresh_token

  if (!token) return next()

  jwt.verify(token, REFRESH_KEY, (err, user) => {
    if (err) return next()

    const newRefreshToken = jwt.sign({
      id: user._id,
      username: user.username,
      password: user.password
    }, REFRESH_KEY, {
      expiresIn: '7d'
    })

    res
      .cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24 * 7
      })

    next()
  })
})

app.get('/', (req, res) => {
  const user = req.session.user
  res.render('index', user)
})

app.post('/login', async (req, res) => {
  const { username, password } = req.body

  try {
    const publicUser = await UserRepository.login({ username, password })
    const accessToken = jwt.sign({
      id: publicUser._id,
      username: publicUser.username,
      password: publicUser.password
    }, ACCESS_KEY, {
      expiresIn: '1h'
    })

    const refreshToken = jwt.sign({
      id: publicUser._id,
      username: publicUser.username,
      password: publicUser.password
    }, REFRESH_KEY, {
      expiresIn: '7d'
    })

    otherUsername = username

    res
      .cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24 * 7
      })
      .send({ publicUser, accessToken })
  } catch (e) {
    res.status(400).send(e.message)
  }
})

app.post('/register', async (req, res) => {
  const { username, password } = req.body

  try {
    const id = await UserRepository.register({ username, password })
    res.send({ id })
  } catch (e) {
    res.status(400).send(e.message)
  }
})

app.get('/protected', (req, res) => {
  const user = req.session.user
  if (!user) return res.status(403).send('Access not authorized, if you have just registered, back to home page to log in')
  res.render('protected', user)
})

app.get('/settings', (req, res) => {
  const user = req.session.user
  if (!user) return res.status(403).send('Access not authorized, if you have just registered, back to home page to log in')
  res.render('settings', user)
})

app.post('/logout', (req, res) => {
  res
    .clearCookie('refresh_token')
    .send('Logout success')
})

app.get('/most-liked-comments', async (req, res) => {
  try {
    const result = await UserRepository.getMostLikedComments()
    res.status(200).send({ result })
  } catch (e) {
    res.status(400).send({ message: e.message })
  }
})

io.on('connection', async (socket) => {
  socket.handshake.auth.username = otherUsername
  const username = socket.handshake.auth.username
  console.log('User has connected')

  socket.on('disconnect', () => {
    console.log('User  has disconnected')
  })

  socket.on('message', async (msg) => {
    let result
    const actualTime = getActualTime()
    const { id } = await UserRepository.getId({ username })
    const userId = id[0].id
    const user = socket.handshake.auth.username

    try {
      await UserRepository.addComment({ id: userId, msg })
      result = await UserRepository.getLastInsertId()
    } catch (e) {
      console.error(e)
    }
    io.emit('message', msg, result.lastInsertId[0].comment_id, user, 0, actualTime)
  })

  socket.on('like', async (commentId) => {
    const { id } = await UserRepository.getId({ username })
    const userId = id[0].id

    const hasLiked = await UserRepository.hasUserLiked({ userId, commentId })

    if (!hasLiked) {
      try {
        await UserRepository.addLike({ userId, commentId })
        const numLikes = await UserRepository.getLikesByCommentId({ id: commentId })
        socket.emit('like', numLikes.likes[0].num_likes, commentId, hasLiked)
      } catch (e) {
        console.error('Error al procesar el like:', e)
      }
    } else {
      try {
        await UserRepository.quitLike({ userId, commentId })
        const { likes } = await UserRepository.getLikesByCommentId({ id: commentId })

        socket.emit('like', likes[0].num_likes, commentId, hasLiked)
      } catch (e) {
        console.error('Error al procesar el quit-like:', e)
      }
    }
  })

  socket.on('most-liked', async () => {
    try {
      const rows = await UserRepository.getMostLikedComments()
      rows.forEach(async row => {
        const user = await UserRepository.searchUsername({ id: row.user_id })
        io.emit('most-liked', row.text_comment, row.comment_id, user[0].username, row.num_likes, row.created_at)
      })
    } catch (e) {
      console.log(e)
    }
  })

  if (!socket.recovered) {
    try {
      const rows = await UserRepository.getMessages({ serverOffSet: socket.handshake.auth.serverOffSet ?? 0 })
      rows.forEach(async row => {
        const user = await UserRepository.searchUsername({ id: row.user_id })
        socket.emit('message', row.text_comment, row.comment_id.toString(), user[0].username, row.num_likes, row.created_at)
      })
    } catch (e) {
      console.log(e)
    }
  }
})

server.listen(PORT, () => {
  console.log('Server running on port', PORT)
})
