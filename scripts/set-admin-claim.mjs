import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const [action, email] = process.argv.slice(2)
if (!['grant', 'revoke'].includes(action) || !email) {
  console.error('Usage: pnpm admin:grant <email>  |  pnpm admin:revoke <email>')
  process.exit(1)
}
if (!process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT_PATH to a local Firebase service-account JSON file.')
  process.exit(1)
}

const credentials = JSON.parse(await readFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'))
if (!getApps().length) initializeApp({ credential: cert(credentials) })

const auth = getAuth()
const user = await auth.getUserByEmail(email)
await auth.setCustomUserClaims(user.uid, action === 'grant' ? { admin: true } : {})
console.log(`${action === 'grant' ? 'Approved' : 'Revoked'} ${email}. They must sign out and back in to refresh their token.`)
