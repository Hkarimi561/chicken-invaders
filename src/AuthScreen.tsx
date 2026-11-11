import { useState, type FormEvent } from 'react';
import * as store from './profile';

/** Sign in / create an account: a username and a password, nothing else. */
export default function AuthScreen({ onDone }: { onDone: (user: store.AccountUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const register = mode === 'register';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const user = await (register ? store.register : store.login)(username.trim(), password);
      onDone(user);
    } catch (ex: any) {
      setErr(ex.message || 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <form className="card menu auth" onSubmit={submit}>
      <h1>🐔 Chicken Blasters</h1>
      <p className="sub">{register ? 'Create your pilot account' : 'Sign in to fly'}</p>
      <label>Username
        <input
          name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          maxLength={16} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required
        />
      </label>
      <label>Password
        <input
          name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'}
          maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} required
        />
      </label>
      {err && <p className="err" role="alert">{err}</p>}
      <button type="submit" disabled={busy || !username || !password}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      <button type="button" className="ghost small" onClick={() => { setMode(register ? 'login' : 'register'); setErr(''); }}>
        {register ? 'I already have an account' : 'New here? Create an account'}
      </button>
    </form>
  );
}
