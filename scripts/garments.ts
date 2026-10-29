/**
 * Original studio flat-lay illustrations for the DEMO catalogue only.
 * Every image is clearly marked "Sample image" so it can't be mistaken for a
 * real product photo. Replace demo products with real photos via the admin.
 */

export type GarmentKind = 'tee' | 'oversized' | 'hoodie' | 'sweatshirt' | 'shirt' | 'cargo' | 'trouser' | 'jeans';
export type View = 'front' | 'back' | 'detail';

function mix(hex: string, target: string, amount: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(target);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

interface Shape {
  body: string;
  details: (c: Palette) => string;
  under?: (c: Palette) => string;
  folds: string;
  detailBox: string;
}

interface Palette {
  base: string;
  dark: string;
  darker: string;
  light: string;
  stitch: string;
}

const TEE_FOLDS = 'M232 330 Q246 430 236 540 M372 320 Q356 430 366 548 M300 220 Q296 300 304 380';

function tee(oversized: boolean, view: View): Shape {
  const o = oversized;
  const neckDip = view === 'back' ? 166 : o ? 182 : 186;
  const body = o
    ? `M256 150 C272 ${neckDip} 328 ${neckDip} 344 150 L428 172 L508 258 L470 334 L430 310 L432 592 Q300 604 168 592 L170 310 L130 334 L92 258 L172 172 Z`
    : `M258 158 C272 ${neckDip} 328 ${neckDip} 342 158 L410 176 L486 238 L456 302 L410 280 L412 562 Q300 574 188 562 L190 280 L144 302 L114 238 L190 176 Z`;
  return {
    body,
    folds: o ? 'M226 340 Q240 460 230 580 M378 330 Q362 460 372 584 M140 290 Q170 280 178 300' : TEE_FOLDS,
    detailBox: o ? '170 110 260 325' : '180 120 240 300',
    details: (c) => {
      const neck = o
        ? `<path d="M256 150 C272 ${neckDip} 328 ${neckDip} 344 150" fill="none" stroke="${c.dark}" stroke-width="12" stroke-linecap="round"/>`
        : `<path d="M258 158 C272 ${neckDip} 328 ${neckDip} 342 158" fill="none" stroke="${c.dark}" stroke-width="10" stroke-linecap="round"/>`;
      const hems = o
        ? `<path d="M436 322 L472 342 M164 322 L128 342" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5" fill="none"/>
           <path d="M172 578 Q300 590 428 578" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5" fill="none"/>`
        : `<path d="M414 290 L452 310 M186 290 L148 310" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5" fill="none"/>
           <path d="M190 548 Q300 560 410 548" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5" fill="none"/>`;
      const inner =
        view === 'back'
          ? ''
          : o
            ? `<path d="M266 156 C280 172 320 172 334 156 C320 166 280 166 266 156 Z" fill="${c.darker}" opacity="0.7"/>`
            : `<path d="M268 162 C282 176 318 176 332 162 C318 170 282 170 268 162 Z" fill="${c.darker}" opacity="0.7"/>`;
      const print =
        view === 'back'
          ? `<g transform="translate(300 330)" opacity="0.92">
               <circle r="62" fill="none" stroke="${c.light}" stroke-width="6"/>
               <circle r="40" fill="none" stroke="${c.light}" stroke-width="3"/>
               <path d="M-90 0 H90 M0 -90 V90" stroke="${c.light}" stroke-width="3"/>
               <rect x="-70" y="96" width="140" height="10" fill="${c.light}"/>
               <rect x="-46" y="116" width="92" height="6" fill="${c.light}" opacity="0.7"/>
             </g>`
          : '';
      return neck + inner + hems + print;
    },
  };
}

function hoodie(view: View): Shape {
  return {
    under: (c) =>
      view === 'back'
        ? ''
        : `<path d="M236 186 C214 86 386 86 364 186 Z" fill="${c.dark}"/>`,
    body:
      view === 'back'
        ? 'M232 188 C220 92 380 92 368 188 L438 200 L508 420 L522 548 L476 556 L460 432 L428 306 L428 566 L172 566 L172 306 L140 432 L124 556 L78 548 L92 420 L162 200 Z'
        : 'M240 176 L162 200 L92 420 L78 548 L124 556 L140 432 L172 306 L172 566 L428 566 L428 306 L460 432 L476 556 L522 548 L508 420 L438 200 L360 176 Z',
    folds: 'M226 330 Q238 430 230 530 M376 330 Q362 430 372 530 M120 420 Q132 470 128 520 M480 420 Q468 470 472 520',
    detailBox: '170 90 260 325',
    details: (c) => {
      const rib = `<path d="M172 532 L428 532 L428 566 L172 566 Z" fill="${c.dark}"/>
        <path d="M78 530 L124 538 L122 556 L78 548 Z M522 530 L476 538 L478 556 L522 548 Z" fill="${c.dark}"/>
        <g stroke="${c.darker}" stroke-width="1.5" opacity="0.5">${Array.from({ length: 25 }, (_, i) => `<path d="M${180 + i * 10} 536 V562"/>`).join('')}</g>`;
      if (view === 'back') {
        return `<path d="M246 190 C252 120 348 120 354 190" fill="none" stroke="${c.dark}" stroke-width="3"/>
          <path d="M300 104 V188" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5"/>` + rib;
      }
      return `<path d="M250 182 C254 128 346 128 350 182 C334 214 266 214 250 182 Z" fill="${c.darker}"/>
        <path d="M240 176 C244 120 356 120 360 176" fill="none" stroke="${c.dark}" stroke-width="8"/>
        <path d="M282 206 C280 240 284 270 280 300 M318 206 C320 240 316 270 320 300" stroke="${c.light}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <rect x="275" y="298" width="10" height="20" rx="3" fill="${c.light}"/><rect x="315" y="298" width="10" height="20" rx="3" fill="${c.light}"/>
        <path d="M218 420 L382 420 L408 518 L192 518 Z" fill="none" stroke="${c.dark}" stroke-width="3"/>
        <path d="M222 426 L378 426 L402 512 L198 512 Z" fill="none" stroke="${c.stitch}" stroke-width="1.6" stroke-dasharray="5 5"/>` + rib;
    },
  };
}

function sweatshirt(view: View): Shape {
  const dip = view === 'back' ? 176 : 196;
  return {
    body: `M252 166 C268 ${dip} 332 ${dip} 348 166 L432 190 L506 420 L520 548 L474 556 L458 432 L428 306 L428 566 L172 566 L172 306 L142 432 L126 556 L80 548 L94 420 L168 190 Z`,
    folds: 'M226 330 Q238 430 230 530 M376 330 Q362 430 372 530 M300 230 Q296 300 302 360',
    detailBox: '170 110 260 325',
    details: (c) =>
      `<path d="M252 166 C268 ${dip} 332 ${dip} 348 166" fill="none" stroke="${c.dark}" stroke-width="16" stroke-linecap="round"/>
       ${view === 'back' ? '' : `<path d="M290 190 L300 206 L310 190 Z" fill="${c.dark}"/>`}
       <path d="M172 532 L428 532 L428 566 L172 566 Z" fill="${c.dark}"/>
       <path d="M80 530 L126 538 L124 556 L80 548 Z M520 530 L474 538 L476 556 L520 548 Z" fill="${c.dark}"/>
       <g stroke="${c.darker}" stroke-width="1.5" opacity="0.5">${Array.from({ length: 25 }, (_, i) => `<path d="M${180 + i * 10} 536 V562"/>`).join('')}</g>
       <path d="M168 190 L172 306 M432 190 L428 306" stroke="${c.stitch}" stroke-width="1.8" stroke-dasharray="5 5" fill="none"/>`,
  };
}

function shirt(view: View): Shape {
  return {
    body: 'M246 160 L170 184 L108 420 L98 546 L140 552 L152 432 L178 304 L178 584 Q240 602 300 590 Q360 602 422 584 L422 304 L448 432 L460 552 L502 546 L492 420 L430 184 L354 160 Z',
    folds: 'M230 330 Q242 450 232 570 M372 330 Q360 450 370 570 M126 400 Q140 460 134 520',
    detailBox: '170 110 260 325',
    details: (c) => {
      if (view === 'back') {
        return `<path d="M250 160 C270 178 330 178 350 160 L346 182 C326 196 274 196 254 182 Z" fill="${c.light}" stroke="${c.dark}" stroke-width="2"/>
          <path d="M178 238 Q300 252 422 238" fill="none" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5"/>
          <path d="M290 240 L300 268 L310 240" fill="none" stroke="${c.dark}" stroke-width="2"/>
          <path d="M98 528 L140 534 M502 528 L460 534" stroke="${c.dark}" stroke-width="3"/>`;
      }
      const buttons = [244, 302, 360, 418, 476, 534].map((y) => `<circle cx="300" cy="${y}" r="5.5" fill="${c.light}" stroke="${c.dark}" stroke-width="1.5"/>`).join('');
      return `<path d="M246 160 L300 208 L354 160" fill="${c.darker}"/>
        <path d="M244 156 L300 206 L262 228 L238 170 Z" fill="${c.light}" stroke="${c.dark}" stroke-width="2"/>
        <path d="M356 156 L300 206 L338 228 L362 170 Z" fill="${c.light}" stroke="${c.dark}" stroke-width="2"/>
        <path d="M290 206 L290 592 M310 206 L310 592" stroke="${c.dark}" stroke-width="1.6" opacity="0.8"/>
        ${buttons}
        <path d="M330 262 H386 V322 Q358 334 330 322 Z" fill="none" stroke="${c.dark}" stroke-width="2"/>
        <path d="M330 274 H386" stroke="${c.stitch}" stroke-width="1.6" stroke-dasharray="4 4"/>
        <path d="M98 520 L140 526 L140 552 L98 546 Z M502 520 L460 526 L460 552 L502 546 Z" fill="${c.dark}" opacity="0.7"/>`;
    },
  };
}

function bottoms(kind: 'cargo' | 'trouser' | 'jeans', view: View): Shape {
  const wide = kind === 'jeans' ? 18 : kind === 'cargo' ? 12 : 6;
  return {
    body: `M204 112 L396 112 L${404 + wide} 664 L${318 - 2} 664 L300 300 L${284 + 2} 664 L${196 - wide} 664 Z`,
    folds: 'M246 200 Q236 420 250 640 M354 200 Q364 420 350 640 M300 270 Q300 285 300 300',
    detailBox: '180 90 240 300',
    details: (c) => {
      const band = `<path d="M204 112 L396 112 L397 146 L203 146 Z" fill="${c.dark}"/>
        ${[226, 272, 328, 374].map((x) => `<rect x="${x - 4}" y="108" width="8" height="42" rx="2" fill="${c.base}" stroke="${c.dark}" stroke-width="1.5"/>`).join('')}`;
      const hem = `<path d="M${196 - wide} 648 L${284 + 2} 648 M${318 - 2} 648 L${404 + wide} 648" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5"/>`;
      if (view === 'back') {
        return band + hem + `<path d="M222 190 H286 V258 L254 270 L222 258 Z M314 190 H378 V258 L346 270 L314 258 Z" fill="none" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="5 5"/>
          <path d="M204 170 Q300 186 396 170" fill="none" stroke="${c.dark}" stroke-width="2"/>`;
      }
      let extra = `<path d="M300 146 L300 262 Q300 276 288 280" fill="none" stroke="${c.dark}" stroke-width="2.4"/>
        <path d="M312 146 L312 258" stroke="${c.stitch}" stroke-width="1.8" stroke-dasharray="4 4"/>
        <circle cx="300" cy="130" r="6" fill="${kind === 'jeans' ? '#b8873f' : c.light}" stroke="${c.dark}" stroke-width="1.5"/>`;
      if (kind === 'jeans') {
        extra += `<path d="M212 150 Q250 170 262 210" fill="none" stroke="${c.stitch}" stroke-width="2.2"/>
          <path d="M388 150 Q350 170 338 210" fill="none" stroke="${c.stitch}" stroke-width="2.2"/>
          <path d="M346 156 H374 V182 H346 Z" fill="none" stroke="${c.stitch}" stroke-width="1.8"/>
          <circle cx="262" cy="210" r="3.5" fill="#b8873f"/><circle cx="338" cy="210" r="3.5" fill="#b8873f"/>
          <path d="M204 146 L${196 - wide} 664 M396 146 L${404 + wide} 664" stroke="${c.stitch}" stroke-width="2" stroke-dasharray="6 5"/>`;
      } else {
        extra += `<path d="M214 150 Q244 176 252 214" fill="none" stroke="${c.dark}" stroke-width="2.2"/>
          <path d="M386 150 Q356 176 348 214" fill="none" stroke="${c.dark}" stroke-width="2.2"/>
          <path d="M268 150 L266 230 M332 150 L334 230" stroke="${c.dark}" stroke-width="1.6" opacity="0.6"/>`;
      }
      if (kind === 'cargo') {
        extra += `<g fill="${c.base}" stroke="${c.dark}" stroke-width="2.4">
            <path d="M186 360 H246 L248 452 Q216 464 186 452 Z"/><path d="M414 360 H354 L352 452 Q384 464 414 452 Z"/></g>
          <path d="M186 360 L248 360 L248 384 L186 384 Z M414 360 L352 360 L352 384 L414 384 Z" fill="${c.dark}" opacity="0.6"/>
          <path d="M${196 - wide + 6} 610 Q${240} 622 ${284 - 2} 610 M${318} 610 Q360 622 ${404 + wide - 6} 610" fill="none" stroke="${c.dark}" stroke-width="3"/>`;
      }
      return band + hem + extra;
    },
  };
}

function shapeFor(kind: GarmentKind, view: View): Shape {
  switch (kind) {
    case 'tee':
      return tee(false, view);
    case 'oversized':
      return tee(true, view);
    case 'hoodie':
      return hoodie(view);
    case 'sweatshirt':
      return sweatshirt(view);
    case 'shirt':
      return shirt(view);
    default:
      return bottoms(kind, view);
  }
}

const BACKDROPS = ['#ECE9E2', '#E6E3DC', '#E9E5DB', '#E3E1DC'];

export function garmentSvg(kind: GarmentKind, hex: string, view: View, seed = 0): string {
  const isDark = luminance(hex) < 0.35;
  const c: Palette = {
    base: hex,
    dark: mix(hex, '#000000', isDark ? 0.35 : 0.18),
    darker: mix(hex, '#000000', isDark ? 0.55 : 0.35),
    light: mix(hex, '#ffffff', isDark ? 0.75 : 0.85),
    stitch: isDark ? mix(hex, '#ffffff', 0.35) : mix(hex, '#000000', 0.3),
  };
  const s = shapeFor(kind, view);
  const bg = BACKDROPS[seed % BACKDROPS.length];
  const isTop = !['cargo', 'trouser', 'jeans'].includes(kind) && view !== 'detail';
  const viewBox = view === 'detail' ? s.detailBox : '0 0 600 750';
  const label = view === 'detail' ? '' : `<text x="580" y="736" text-anchor="end" font-family="DejaVu Sans Mono, Consolas, monospace" font-size="11" letter-spacing="2" fill="#8C877C">SAMPLE IMAGE · DEMO PRODUCT</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="${viewBox}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%">
      <stop offset="0" stop-color="${mix(bg, '#ffffff', 0.35)}"/>
      <stop offset="1" stop-color="${mix(bg, '#000000', 0.06)}"/>
    </radialGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="${isDark ? 0.12 : 0.22}"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="${isDark ? 0.3 : 0.16}"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
    <filter id="fold" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="11"/></filter>
    <clipPath id="clip"><path d="${s.body}"/></clipPath>
  </defs>
  <rect x="-200" y="-200" width="1000" height="1150" fill="url(#bg)"/>
  <g transform="${isTop ? 'translate(300 384) scale(1.1) translate(-300 -370)' : ''}">
  <path d="${s.body}" transform="translate(10 16)" fill="#000" opacity="0.2" filter="url(#soft)"/>
  ${s.under ? s.under(c) : ''}
  <path d="${s.body}" fill="${c.base}"/>
  <g clip-path="url(#clip)">
    <path d="${s.folds}" fill="none" stroke="#000" stroke-opacity="${isDark ? 0.26 : 0.09}" stroke-width="26" stroke-linecap="round" filter="url(#fold)"/>
    <path d="${s.folds}" transform="translate(-14 0)" fill="none" stroke="#fff" stroke-opacity="${isDark ? 0.05 : 0.14}" stroke-width="16" stroke-linecap="round" filter="url(#fold)"/>
  </g>
  ${s.details(c)}
  <path d="${s.body}" fill="url(#shade)"/>
  <path d="${s.body}" fill="none" stroke="${c.darker}" stroke-opacity="0.35" stroke-width="1.5"/>
  </g>
  ${label}
</svg>`;
}
