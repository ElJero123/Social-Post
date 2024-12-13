import dotenv from 'dotenv'

dotenv.config()

export const {
  PORT = 3102,
  SALT_ROUNDS = 10,
  ACCESS_KEY,
  REFRESH_KEY,
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_HOST = 'localhost',
  DB_PASSWORD,
  DB = 'social_media'
} = process.env

export const configObject = {
  port: DB_PORT,
  user: DB_USER,
  host: DB_HOST,
  password: DB_PASSWORD,
  database: DB,
  dateStrings: true
}
