const NS = 'http://www.w3.org/2000/svg';
// Timeline cues share the companion's active clock, including pause and resume.
const cues = [
  [300, 'spark', 300, 410, -18, -50, 1500],
  [700, 'note', 715, 405, 24, -80, 1800],
  [1750, 'heart', 295, 470, -32, -105, 2000],
  [2300, 'spark', 698, 455, 35, -70, 1500],
  [3100, 'note', 720, 430, 36, -110, 2200],
  [3450, 'heart', 282, 490, -32, -105, 2200],
  [3950, 'heart', 735, 485, 28, -90, 1900],
  [4600, 'spark', 302, 428, -12, -55, 1400],
  [5550, 'note', 730, 420, 30, -95, 1800],
  [6200, 'heart', 285, 470, -30, -105, 2000],
  [7300, 'spark', 710, 450, 25, -70, 1500],
  [7800, 'note', 290, 445, -35, -105, 2100],
  [8150, 'heart', 728, 485, 26, -110, 2300],
  [9550, 'heart', 300, 465, -25, -85, 1250],
  [9700, 'heart', 690, 420, 24, -75, 1100],
  [9800, 'spark', 740, 475, 15, -55, 1000],
];
export class MealEffects {
  constructor(svg) {
    this.svg = svg;
    svg.innerHTML = `<defs>
      <symbol id="meal-heart" viewBox="0 0 48 48"><path d="M24 42C17 36 4 27 4 16 4 3 19 2 24 13 29 2 44 3 44 16 44 27 31 36 24 42Z" fill="#edb1ae" stroke="#fff2de" stroke-width="3"/><path d="M12 14q1-4 5-4" fill="none" stroke="#fff5e8" stroke-width="3" stroke-linecap="round"/></symbol>
      <symbol id="meal-note" viewBox="0 0 48 48"><path d="M19 32V10L38 5V27M19 17l19-5" fill="none" stroke="#f5ebd5" stroke-width="4" stroke-linecap="round"/><ellipse cx="13" cy="34" rx="7" ry="5" fill="#bdcedd" stroke="#f7edda" stroke-width="2" transform="rotate(-22 13 34)"/><ellipse cx="32" cy="29" rx="7" ry="5" fill="#bdcedd" stroke="#f7edda" stroke-width="2" transform="rotate(-22 32 29)"/></symbol>
      <symbol id="meal-spark" viewBox="0 0 48 48"><path d="M24 2 29 18 45 24 29 30 24 46 18 30 3 24 18 18Z" fill="#f8dfaf" stroke="#fff7e8" stroke-width="2"/></symbol>
    </defs><g id="mealParticles"></g><g id="mealComic" class="meal-comic"><path d="M-55-23Q-70-14-59 8L-47 22 5 24 19 35 21 22 53 20Q70 9 60-15L40-26Z"/><text text-anchor="middle" y="7"></text><path class="comic-ticks" d="M-76-26l-10-10M-79-5h-14M71-28l8-12"/></g>`;
    this.particles = svg.querySelector('#mealParticles');
    this.comic = svg.querySelector('#mealComic');
    this.nodes = cues.map((cue, i) => {
      const use = document.createElementNS(NS, 'use');
      use.setAttribute('href', `#meal-${cue[1]}`);
      use.setAttribute('width', String(cue[1] === 'spark' ? 25 : 42));
      use.setAttribute('height', String(cue[1] === 'spark' ? 25 : 42));
      use.setAttribute('x', '-21');
      use.setAttribute('y', '-21');
      use.dataset.kind = cue[1];
      this.particles.append(use);
      return use;
    });
    this.hide();
  }
  hide() {
    if (this.hidden) return;
    this.hidden = true;
    this.svg.setAttribute('hidden', '');
    this.svg.style.display = 'none';
    this.svg.dataset.activeCount = '0';
  }
  draw(elapsed, meal, { enabled = true, motion = 1, reduced = false } = {}) {
    if (!meal || !enabled) {
      this.hide();
      return;
    }
    if (this.hidden) {
      this.hidden = false;
      this.svg.removeAttribute('hidden');
      this.svg.style.display = '';
    }
    let active = 0;
    cues.forEach(([start, kind, x, y, dx, dy, duration], i) => {
      const p = (elapsed - start) / duration,
        node = this.nodes[i],
        visible = p >= 0 && p <= 1;
      node.style.display = visible ? '' : 'none';
      if (!visible) return;
      active++;
      const moving = reduced ? 0 : motion,
        alpha = Math.min(1, p * 7, (1 - p) * 5);
      const scale = reduced ? 1 : 0.82 + Math.sin((Math.min(1, p * 4) * Math.PI) / 2) * 0.18;
      node.setAttribute('opacity', String(reduced ? 0.8 : alpha * 0.92));
      node.setAttribute(
        'transform',
        `translate(${x + dx * p * moving + Math.sin(p * 6 + i) * 5 * moving} ${y + dy * p * moving}) rotate(${Math.sin(p * 5 + i) * 12 * moving}) scale(${scale})`,
      );
    });
    const text =
      meal.phase === 'bite'
        ? '啊呜！'
        : meal.phase === 'chew'
          ? '嚼嚼～'
          : meal.phase === 'finish'
            ? '好吃！'
            : '';
    this.comic.style.display = text ? '' : 'none';
    this.comic.querySelector('text').textContent = text;
    const wobble = reduced ? 0 : Math.sin(elapsed / 95) * 2 * motion;
    this.comic.setAttribute('transform', `translate(255 ${552 + wobble}) rotate(-8)`);
    this.svg.dataset.activeCount = String(active);
    this.svg.dataset.phase = meal.phase;
  }
}
