import bcrypt from 'bcrypt'
import mysql from 'mysql2/promise'
import { ValidateUser } from './user-schema.js'
import { configObject, SALT_ROUNDS } from './config.js'

const connection = await mysql.createConnection(configObject)

export class UserRepository {
  static async login ({ username, password }) {
    ValidateUser({ username, password })

    const [user] = await connection.query(`
      SELECT * FROM users WHERE username = ?;
    `, [username])

    if (user.length === 0) throw new Error('User does not exists')

    const isValidPassword = bcrypt.compare(password, user[0].password)
    if (!isValidPassword) throw new Error('Password is incorrect')

    const { password: _, ...publicUser } = user[0]

    return publicUser
  }

  static async register ({ username, password }) {
    const result = ValidateUser({ username, password })

    const [user] = await connection.query(`
      SELECT * FROM users WHERE username = ?;
    `, [username])

    if (user.length > 0) throw new Error('username already exists')
    const hashPassword = await bcrypt.hash(password, SALT_ROUNDS)

    await connection.query(`
      INSERT INTO users (username, password) VALUES
      (?, ?);
    `, [result.data.username, hashPassword])

    const [id] = await connection.query(`
      SELECT BIN_TO_UUID(_id) id FROM users WHERE username = ?
    `, [username])

    return { id: id[0].id }
  }

  static async addComment ({ id, msg }) {
    const [result] = await connection.query(`
      INSERT INTO comments (user_id ,text_comment) VALUES
      (UUID_TO_BIN(?) ,?);
    `, [id, msg])

    return result
  }

  static async getId ({ username }) {
    const [result] = await connection.query(`
      SELECT BIN_TO_UUID(_id) id FROM users WHERE username = ?; 
    `, [username])

    return { id: result }
  }

  static async getLikesByCommentId ({ id }) {
    const [result] = await connection.query(`
      SELECT num_likes FROM comments WHERE comment_id = ?;
    `, [id])

    return { likes: result }
  }

  static async getLastInsertId () {
    const [result] = await connection.execute(`
      SELECT comment_id 
      FROM comments
      ORDER BY comment_id DESC
      LIMIT 1;
    `)

    return { lastInsertId: result }
  }

  static async getMessages ({ serverOffSet }) {
    const [result] = await connection.query(`
      SELECT * FROM comments WHERE comment_id > ?;
    `, [serverOffSet])

    return result
  }

  static async searchUsername ({ id }) {
    const [result] = await connection.query(`
      SELECT username FROM users WHERE _id = ?;
    `, [id])

    return result
  }

  static async addLike ({ userId, commentId }) {
    await connection.query(`
      INSERT INTO comment_likes (user_id, comment_id)
      VALUES (UUID_TO_BIN(?), ?);  
    `, [userId, commentId])

    await connection.query(`
      UPDATE comments SET num_likes = num_likes + 1
      WHERE comment_id = ?;
    `, [commentId])
  }

  static async quitLike ({ userId, commentId }) {
    await connection.query(`
      DELETE FROM comment_likes
      WHERE user_id = UUID_TO_BIN(?) AND comment_id = ?;
    `, [userId, commentId])

    await connection.query(`
      UPDATE comments SET num_likes = num_likes - 1
      WHERE comment_id = ?;
    `, [commentId])
  }

  static async hasUserLiked ({ userId, commentId }) {
    const [result] = await connection.query(`
      SELECT COUNT(*) AS count FROM comment_likes
      WHERE user_id = UUID_TO_BIN(?) AND comment_id = ?;     
    `, [userId, commentId])

    return result[0].count > 0
  }

  static async getMostLikedComments () {
    const [result] = await connection.query(`
      SELECT comment_id, text_comment, num_likes, created_at, user_id 
      FROM comments 
      ORDER BY num_likes DESC;
    `)

    return result
  }

  static async getUsernameById ({ id }) {
    const [result] = await connection.query(`
      SELECT username FROM users WHERE BIN_TO_UUID(_id) = ?;
    `, [id])

    return result
  }
}
