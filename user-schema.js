import z from 'zod'

const Schema = z.object({
  username: z.string({
    invalid_type_error: 'Username must be a string'
  }).min(3).max(75),
  password: z.string({
    invalid_type_error: 'Password must be a string'
  }).min(8)
})

export function ValidateUser (object) {
  return Schema.safeParse(object)
}
