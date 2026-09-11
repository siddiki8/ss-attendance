import { createMiddleware } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { getFirebaseIdToken } from '../lib/firebase'

type FirebaseClaims = {
  uid: string
  email: string
  admin: true
}

const firebaseJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

function projectId() {
  const configured = (env as unknown as { FIREBASE_PROJECT_ID?: string }).FIREBASE_PROJECT_ID
  if (!configured) throw new Error('FIREBASE_PROJECT_ID has not been configured on this Worker.')
  return configured
}

async function verifyFirebaseToken(token: string): Promise<FirebaseClaims> {
  const id = projectId()
  const { payload } = await jwtVerify(token, firebaseJwks, {
    algorithms: ['RS256'],
    audience: id,
    issuer: `https://securetoken.google.com/${id}`,
  })
  if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true || payload.admin !== true) {
    throw new Error('Your Google account has not been approved for this school.')
  }
  return { uid: payload.sub, email: payload.email, admin: true }
}

export const adminMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    const token = await getFirebaseIdToken()
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} })
  })
  .server(async ({ next }) => {
    const authorization = getRequestHeader('authorization')
    if (!authorization?.startsWith('Bearer ')) throw new Error('Please sign in with an approved Google account.')
    const user = await verifyFirebaseToken(authorization.slice(7))
    return next({ context: { user } })
  })
