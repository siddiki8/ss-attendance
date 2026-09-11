import { getApp, getApps, initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)

const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : undefined
export const firebaseAuth = app ? getAuth(app) : undefined

export async function signInWithGoogle() {
  if (!firebaseAuth) throw new Error('Firebase is not configured yet.')
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  if (window.matchMedia('(max-width: 640px)').matches) {
    await signInWithRedirect(firebaseAuth, provider)
    return
  }
  await signInWithPopup(firebaseAuth, provider)
}

export async function getFirebaseIdToken() {
  return firebaseAuth?.currentUser ? firebaseAuth.currentUser.getIdToken() : undefined
}

export async function signOutOfFirebase() {
  if (firebaseAuth) await signOut(firebaseAuth)
}
