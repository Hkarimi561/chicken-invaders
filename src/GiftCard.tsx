import { useState, type FormEvent } from 'react';
import * as store from './profile';

/** Redeem a gift card code for keys. */
export default function GiftCard({ profile, setProfile, onBack }: Record<string, any>) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const offline = !!profile.offline;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await store.redeemGift(code);
      setProfile(r.profile);
      setMsg({ ok: true, text: `Gift card redeemed: +${r.keys} 🔑` });
      setCode('');
    } catch (ex: any) {
      setMsg({ ok: false, text: ex.message || 'Could not redeem that code' });
    }
    setBusy(false);
  };

  return (
    <div className="shop gift">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>🎁 Gift card</h2>
        <span className="keychip">🔑 {profile.keys}</span>
      </div>
      <form className="card giftcard" onSubmit={submit}>
        <p className="sub">Got a gift card? Enter its code to add keys to your account. Each code works once per account.</p>
        <label>Gift card code
          <input
            value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={29} autoFocus
          />
        </label>
        {offline && <p className="err">Server unreachable. Try again when it is back.</p>}
        {msg && <p className={msg.ok ? 'toast' : 'err'} role="status">{msg.text}</p>}
        <button type="submit" disabled={busy || offline || code.trim().length < 4}>{busy ? 'Checking…' : 'Redeem'}</button>
      </form>
    </div>
  );
}
