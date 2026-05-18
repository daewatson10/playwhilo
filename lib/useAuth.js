// lib/useAuth.js
import { useState, useEffect } from 'react'
import {
  signInWithPopup, GoogleAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Ensure user doc exists in Firestore
        const ref = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          await setDoc(ref, {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || '',
            createdAt: serverTimestamp(),
            streak: 0,
            longestStreak: 0,
            totalSolved: 0,
            totalPlayed: 0,
            journalCount: 0,
          })
        }
        setUser(firebaseUser)
      } else {
        setUser(null)
      }
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      console.error('Google sign in error:', e)
      throw e
    }
  }

  async function signInWithEmail(email, password) {
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      console.error('Email sign in error:', e)
      throw e
    }
  }

  async function signUpWithEmail(email, password) {
    try {
      await createUserWithEmailAndPassword(auth, email, password)
    } catch (e) {
      console.error('Email sign up error:', e)
      throw e
    }
  }

  async function logout() {
    await signOut(auth)
  }

  return { user, authLoading, signInWithGoogle, signInWithEmail, signUpWithEmail, logout }
}
