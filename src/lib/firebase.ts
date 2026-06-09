import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCUYJ9SMnbvqT4z9zlVXe-dfyNpgQKKfc8",
  authDomain: "agrimensura-b6a6a.firebaseapp.com",
  projectId: "agrimensura-b6a6a",
  storageBucket: "agrimensura-b6a6a.firebasestorage.app",
  messagingSenderId: "958680733793",
  appId: "1:958680733793:web:db7423046d03c2232a3220",
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

let dbInstance
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  })
} catch (e) {
  console.warn('Fallback to default memory cache due to offline strict mode', e)
  dbInstance = getFirestore(app)
}

export const db = dbInstance