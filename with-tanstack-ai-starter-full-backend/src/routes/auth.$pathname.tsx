import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/lib/demo'
import { authClient } from '@/lib/neon'

/** Custom Hallmark-designed auth screen driving Neon Auth directly. */
export const Route = createFileRoute('/auth/$pathname')({ component: Auth })

function Auth() {
  const { pathname } = Route.useParams()
  const router = useRouter()
  const isSignup = pathname === 'sign-up'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = isSignup ? await authClient.signUp.email({ name: name || email.split('@')[0], email, password }) : await authClient.signIn.email({ email, password })
      if ((res as any)?.error) throw new Error((res as any).error.message || 'Authentication failed')
      router.navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  // Google OAuth via Neon Auth (enabled with shared keys in the Neon console, so
  // no client secret is needed in the app). signIn.social redirects the browser
  // to Google and back to callbackURL, so code after the await usually does not
  // run. `social` is not yet in the beta neon-js auth types, hence the cast.
  const googleLogin = async () => {
    setError('')
    setBusy(true)
    try {
      await (authClient.signIn as any).social({ provider: 'google', callbackURL: `${window.location.origin}/` })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed')
      setBusy(false)
    }
  }

  const demoLogin = async () => {
    setError('')
    setBusy(true)
    try {
      const res = await authClient.signIn.email({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      if ((res as any)?.error) throw new Error((res as any).error.message || 'Demo sign-in failed')
      router.navigate({ to: '/' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <a className="wordmark auth-mark" href="/">
          Atlas<span className="accent">.</span>
        </a>
        <h1 className="auth-title">{isSignup ? 'Create your library' : 'Welcome back'}</h1>
        <p className="auth-sub">{isSignup ? 'A private photo library, searchable by meaning.' : 'Sign in to search your photos by meaning and face.'}</p>
        {!isSignup && (
          <button type="button" className="btn auth-demo" onClick={demoLogin} disabled={busy}>
            Try the demo account
          </button>
        )}
        <div className="auth-divider">
          <span>or</span>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {isSignup && (
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              minLength={8}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="btn btn-lg auth-submit" type="submit" disabled={busy}>
            {busy ? <span className="spin" /> : null}
            {isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <div className="auth-divider">
          <span>or</span>
        </div>
        <button type="button" className="btn auth-social" onClick={googleLogin} disabled={busy}>
          <GoogleIcon />
          Continue with Google
        </button>
        <p className="auth-alt">
          {isSignup ? 'Already have an account? ' : 'New here? '}
          <a href={isSignup ? '/auth/sign-in' : '/auth/sign-up'} className="auth-link">
            {isSignup ? 'Sign in' : 'Create an account'}
          </a>
        </p>
      </div>
    </main>
  )
}

/** Google's multi-color "G" mark, inlined so it needs no external asset. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  )
}
