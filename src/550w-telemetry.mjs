// Diegetic set dressing for the independent Workshop edition. The hardware and
// temperatures are authored fiction; this module never samples or contacts a PC.
export const SYSTEM_PANEL = `<section id="systemInfo"><h2>SYSTEM CORE / 550W</h2>
  <dl><div><dt>COMPUTE LOAD</dt><dd id="cpuValue" class="readout">24.8%</dd></div></dl><div class="meter"><i id="cpuMeter"></i></div>
  <dl><div><dt>MEMORY POOL</dt><dd id="memoryValue" class="readout">38.6%</dd></div></dl><div class="meter"><i id="memoryMeter"></i></div>
  <p class="micro" id="memoryDetail">49.4 / 128.0 TB · Q-MEM</p>
  <dl class="small-data"><div><dt>CPU</dt><dd id="cpuName">i1000-550W</dd></div><div><dt>GPU</dt><dd id="gpuName">RTX 50900 Ti</dd></div><div><dt>OS</dt><dd id="osName">MOSS OS 5.50</dd></div><div><dt>UPTIME</dt><dd id="uptime">550 D 00 H 00 M</dd></div></dl>
</section>`;

export const ROOT_PANEL = `<section id="weatherInfo"><h2>IPV6 ROOT / BEIJING</h2>
  <dl class="environment-data"><div><dt>NODE</dt><dd>CN-BJ / ROOT-01</dd></div><div><dt aria-label="核心温度">CORE TEMP.</dt><dd class="weather-main"><strong id="temperature">31.8<small>°C</small></strong></dd></div><div><dt aria-label="冷却液温度">COOLANT</dt><dd id="feelsLike">18.6°C</dd></div><div><dt aria-label="同步状态">SYNC STATUS</dt><dd id="rootSync">SYNCHRONIZED</dd></div></dl>
  <div class="root-location"><span>中国互联网中心</span><strong>北京基地 · 旧址</strong></div>
  <div class="micro root-credit"><span>IMMERSION COOLING</span><span id="rootLink">LINK STABLE</span></div>
</section>`;

export function create550WReadout(find) {
  let lastAt = -Infinity,
    snapshot = null;
  const text = (id, value) => {
    const node = find(id);
    if (node.textContent !== value) node.textContent = value;
  };
  function update(elapsed, settings, force = false) {
    if (!settings.showNodeInfo && !settings.showRootEnvironment) return;
    const interval = settings.systemInterval * 1000;
    if (!force && elapsed - lastAt < interval) return;
    lastAt = elapsed;
    // Slow, bounded curves keep the console alive without adding a timer or
    // causing a jump when the host pauses the wallpaper.
    const t = Math.max(0, elapsed) / 1000;
    snapshot = {
      load: 24.8 + Math.sin(t / 31) * 3.2 + Math.sin(t / 13) * 0.7,
      memory: 38.6 + Math.sin(t / 73) * 0.6,
      core: 31.8 + Math.sin(t / 47) * 0.8,
      coolant: 18.6 + Math.sin(t / 61) * 0.3,
    };
    if (settings.showNodeInfo) {
      text('cpuValue', `${snapshot.load.toFixed(1)}%`);
      find('cpuMeter').style.width = `${snapshot.load}%`;
      text('memoryValue', `${snapshot.memory.toFixed(1)}%`);
      find('memoryMeter').style.width = `${snapshot.memory}%`;
      text('topMemory', `${snapshot.memory.toFixed(1)}%`);
      text('memoryDetail', `${(snapshot.memory * 1.28).toFixed(1)} / 128.0 TB · Q-MEM`);
      text(
        'uptime',
        `${550 + Math.floor(t / 86400)} D ${String(Math.floor(t / 3600) % 24).padStart(2, '0')} H ${String(Math.floor(t / 60) % 60).padStart(2, '0')} M`,
      );
    }
    if (settings.showRootEnvironment) {
      const temp = snapshot.core.toFixed(1);
      if (find('temperature').firstChild.nodeValue !== temp)
        find('temperature').firstChild.nodeValue = temp;
      text('feelsLike', `${snapshot.coolant.toFixed(1)}°C`);
    }
  }
  return {
    update,
    get snapshot() {
      return snapshot && { ...snapshot };
    },
  };
}
