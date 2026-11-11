import { useState } from 'react';
import { settings, setSetting } from './settings';
import { IS_TOUCH, toggleFullscreen } from './util';

function Row({ title, hint, children }: Record<string, any>) {
  return (
    <div className="setrow">
      <div><b>{title}</b>{hint && <p className="sub tiny">{hint}</p>}</div>
      <div className="setctl">{children}</div>
    </div>
  );
}

export default function Settings({ onBack }: Record<string, any>) {
  const [, force] = useState(0);
  const set = (k, v) => { setSetting(k, v); force((n) => n + 1); };
  const Toggle = ({ k }: Record<string, any>) => (
    <button role="switch" aria-checked={settings[k]} className={'switch' + (settings[k] ? ' on' : '')} onClick={() => set(k, !settings[k])}><i /></button>
  );
  const Slider = ({ k, min = 0, max = 1, step = 0.05, fmt = (v) => Math.round(v * 100) + '%' }: Record<string, any>) => (
    <span className="slider"><input type="range" min={min} max={max} step={step} value={settings[k]} onChange={(e) => set(k, Number(e.target.value))} /><em>{fmt(settings[k])}</em></span>
  );

  return (
    <div className="shop settings">
      <div className="shop-top">
        <button className="ghost small" onClick={onBack}>← Back</button>
        <h2>Settings</h2>
        <span />
      </div>

      <h3>Fun</h3>
      <Row title="Funny chickens" hint="Chickens dress up as pirates, ninjas, wizards, zombies, robots and more. Turn off for plain chickens."><Toggle k="costumes" /></Row>

      <h3>Accessibility</h3>
      <Row title="Vest patterns" hint="Adds a stripe, dot, zigzag or cross-hatch pattern to each vest tier, so tiers never depend on colour alone."><Toggle k="patterns" /></Row>
      <Row title="Reduce flashing and motion" hint="No screen shake, bright flashes, lens ripples, slow-motion, or beat pulsing in the background."><Toggle k="reduceFlash" /></Row>
      <Row title="Auto-fire" hint="Keeps the trigger held down so you only have to steer."><Toggle k="autoFire" /></Row>

      <h3>Sound</h3>
      <Row title="Music volume"><Slider k="music" /></Row>
      <Row title="Effects volume"><Slider k="sfx" /></Row>

      <h3>Display</h3>
      <Row title="Start games in fullscreen" hint="Fills the whole screen. You can also press F (or tap the ⛶ button) during a game."><Toggle k="fullscreen" /></Row>
      <Row title="Fullscreen now"><button className="ghost small" onClick={toggleFullscreen}>Toggle fullscreen</button></Row>

      <h3>Touch controls {!IS_TOUCH && <em className="sub tiny">(shown on phones and tablets)</em>}</h3>
      <Row title="Joystick size" hint="The joystick appears wherever you touch on its half of the screen.">
        <span className="chips">{['small', 'medium', 'large'].map((v) => <button key={v} className={'chip' + (settings.stickSize === v ? ' on' : '')} onClick={() => set('stickSize', v)}>{v}</button>)}</span>
      </Row>
      <Row title="Swap sides" hint="Joystick on the right half, buttons on the left."><Toggle k="swapSides" /></Row>
      <Row title="Control opacity"><Slider k="controlOpacity" min={0.3} max={1} step={0.05} /></Row>
    </div>
  );
}
