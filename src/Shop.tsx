import { useState } from 'react';
import {
  PALETTE, SKINS, UPGRADES, GUNS, SKIN_INFO, TRAIL_INFO, PAINT_COST, SHOP_GUN_IDS,
  loadoutOf, quote, upgradeLevel,
} from '../shared/catalog';
import { EVENTS, fmtWindow } from '../shared/events';
import * as store from './profile';
import { ShipView, shipOpts, Keys } from './ui';

// ---------------- Shop & Hangar ----------------
const TABS = ['Upgrades', 'Guns', 'Skins', 'Events', 'Paint', 'Trails'];

export default function Shop({ profile, setProfile, onBack, event }: Record<string, any>) {
  const [tab, setTab] = useState('Upgrades');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const offline = !!profile.offline;
  const l = loadoutOf(profile);

  const act = async (fn: () => Promise<any>, ok?: string) => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { const r = await fn(); setProfile(r.profile || r); if (ok) setMsg(ok); }
    catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const buyIt = (item, what) => act(() => store.buy(item), `Bought ${what}!`);
  const equipIt = (slot, value) => act(() => store.equip(slot, value));
  const claim = () => act(async () => { const r = await store.claim(); setMsg(`Claimed ${r.claimed} key${r.claimed === 1 ? '' : 's'}!`); return r.profile; });

  const Buy = ({ item, label }: Record<string, any>) => {
    const q = quote(profile, item, { event });
    if (q.error) return <button disabled>{q.error}</button>;
    return <button disabled={offline || busy || profile.keys < q.cost} onClick={() => buyIt(item, label)}>Buy · 🔑 {q.cost}</button>;
  };
  const Pick = ({ slot, value, current, allowNone }: Record<string, any>) => (
    current === value
      ? <button className="ghost" disabled={!allowNone || offline || busy} onClick={() => equipIt(slot, null)}>{allowNone ? 'Equipped · tap to remove' : 'Equipped'}</button>
      : <button disabled={offline || busy} onClick={() => equipIt(slot, value)}>Equip</button>
  );

  return (
    <div className="shop">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Hangar &amp; Shop</h2>
        <Keys n={profile.keys} />
      </div>

      {profile.pending > 0 && (
        <div className="claimbar">
          <span>You have <b>🔑 {profile.pending}</b> unclaimed from your runs.</span>
          <button disabled={offline || busy} onClick={claim}>Claim keys</button>
        </div>
      )}
      {offline && <p className="err">Server unreachable — shop and key claiming are disabled until it is back.</p>}
      {msg && <p className="toast">{msg}</p>}

      <div className="shop-body">
        <div className="shop-side">
          <ShipView opts={shipOpts(l)} size={160} />
          <p className="sub">Equipped: {SKIN_INFO[l.skin].name}{l.gun ? ` · ${GUNS[l.gun].name}` : ' · Blaster'}</p>
          <p className="sub">Lives {3 + l.mods.hull} · Power {1 + l.mods.reactor} · Speed +{l.mods.engine * 6}%</p>
          <p className="sub tiny">Keys drop from chickens (tougher vests and bosses drop more). Collect them in a run, then claim them here.</p>
        </div>

        <div className="shop-main">
          <div className="tabs" role="tablist">
            {TABS.map((t) => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? 'tab on' : 'tab'} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          <div className="grid">
            {tab === 'Upgrades' && Object.entries(UPGRADES).map(([id, u]) => {
              const lvl = upgradeLevel(profile, id);
              return (
                <div className="item" key={id}>
                  <div className="item-h"><b>{u.name}</b><span className="pips">{u.costs.map((_, i) => <i key={i} className={i < lvl ? 'on' : ''} />)}</span></div>
                  <p className="sub">{u.desc}</p>
                  <Buy item={`up:${id}`} label={u.name} />
                </div>
              );
            })}

            {tab === 'Guns' && (<>
              <div className="item wide"><p className="sub">These start every run in your hands. The blaster, pulse, laser and missile still drop from chickens during a run and replace your gun until you lose all your lives.</p></div>
              {SHOP_GUN_IDS.map((id) => (
                <div className="item" key={id}>
                  <div className="item-h"><b>{GUNS[id].name}</b></div>
                  <ShipView still size={76} opts={{ ...shipOpts(l), weapon: id }} />
                  <p className="sub">{GUNS[id].desc}</p>
                  {profile.owned.gun.includes(id) ? <Pick slot="gun" value={id} current={l.gun} allowNone /> : <Buy item={`gun:${id}`} label={GUNS[id].name} />}
                </div>
              ))}
            </>)}

            {tab === 'Skins' && SKINS.filter((id) => !SKIN_INFO[id].event).map((id) => (
              <div className={SKIN_INFO[id].special ? 'item special' : 'item'} key={id}>
                <div className="item-h"><b>{SKIN_INFO[id].name}</b>{SKIN_INFO[id].special && <em>special</em>}</div>
                <ShipView still size={76} opts={{ ...shipOpts(l), skin: id }} />
                {profile.owned.skin.includes(id) ? <Pick slot="skin" value={id} current={l.skin} /> : <Buy item={`skin:${id}`} label={SKIN_INFO[id].name} />}
              </div>
            ))}

            {tab === 'Events' && (<>
              <div className="item wide"><p className="sub">Limited-time ship skins: sold only while their event is running, yours to keep afterwards.{event ? ' Right now: ' + EVENTS[event].icon + ' ' + EVENTS[event].name + '.' : ' No event is running at the moment.'}</p></div>
              {SKINS.filter((id) => SKIN_INFO[id].event).map((id) => {
                const info = SKIN_INFO[id], ev = EVENTS[info.event];
                return (
                  <div className="item special" key={id}>
                    <div className="item-h"><b>{info.name}</b><em>{ev.icon} {ev.name}</em></div>
                    <ShipView still size={76} opts={{ ...shipOpts(l), skin: id }} />
                    <p className="sub tiny">On sale {fmtWindow(info.event)}</p>
                    {profile.owned.skin.includes(id) ? <Pick slot="skin" value={id} current={l.skin} /> : <Buy item={'skin:' + id} label={info.name} />}
                  </div>
                );
              })}
            </>)}

            {tab === 'Paint' && (<>
              <div className="item">
                <div className="item-h"><b>Auto colour</b></div>
                <ShipView still size={76} opts={{ ...shipOpts(l), color: PALETTE[0] }} />
                <p className="sub">Default blue. In co-op each seat gets its own colour.</p>
                <Pick slot="paint" value={null} current={l.color} />
              </div>
              {PALETTE.slice(1).map((c) => (
                <div className="item" key={c}>
                  <div className="item-h"><b><i className="dot" style={{ background: c }} /> Paint</b></div>
                  <ShipView still size={76} opts={{ ...shipOpts(l), color: c }} />
                  {profile.owned.paint.includes(c) ? <Pick slot="paint" value={c} current={l.color} /> : <Buy item={`paint:${c}`} label="paint" />}
                </div>
              ))}
              <p className="sub tiny wide">Each paint costs 🔑 {PAINT_COST}.</p>
            </>)}

            {tab === 'Trails' && Object.entries(TRAIL_INFO).map(([id, t]) => (
              <div className="item" key={id}>
                <div className="item-h"><b>{t.name}</b></div>
                <ShipView still size={76} opts={{ ...shipOpts(l), trail: id }} />
                {profile.owned.trail.includes(id) ? <Pick slot="trail" value={id} current={l.trail} /> : <Buy item={`trail:${id}`} label={t.name} />}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

