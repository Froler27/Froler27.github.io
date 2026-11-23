(() => {
  const lab = document.querySelector('#oit-lab');
  if (!lab) return;

  const width = 320;
  const height = 224;
  const surfaces = [
    { name: '珊瑚红', color: [1, 0.22, 0.13], tiltX: 0.68, tiltY: 0.05, z: 0.24, x: -0.16, y: 0.10 },
    { name: '湖蓝', color: [0.05, 0.58, 1], tiltX: -0.68, tiltY: 0.16, z: 0.02, x: 0.16, y: -0.10 },
    { name: '琥珀黄', color: [1, 0.66, 0.10], tiltX: 0.04, tiltY: -0.68, z: -0.36, x: 0.03, y: 0.16 },
  ];
  const modes = {
    submission: '提交顺序 · Alpha Over',
    object: '物体中心排序 · Alpha Over',
    peel: '前向深度剥离 · 限定层数',
    dual: '双重深度剥离 · 限定轮数',
    weighted: 'Weighted Blended OIT',
  };
  const mode = lab.querySelector('#oit-mode');
  const scene = lab.querySelector('#oit-scene');
  const alpha = lab.querySelector('#oit-alpha');
  const layers = lab.querySelector('#oit-layers');
  const yaw = lab.querySelector('#oit-yaw');
  const pitch = lab.querySelector('#oit-pitch');
  const reverseButton = lab.querySelector('#oit-reverse');
  const depthWrite = lab.querySelector('#oit-depth');
  const canvases = [...lab.querySelectorAll('canvas')];
  const contexts = canvases.map(canvas => canvas.getContext('2d'));
  if (contexts.some(context => !context)) {
    lab.querySelector('#oit-readout').textContent = '当前浏览器无法开启 Canvas，仍可阅读下文的推导。';
    return;
  }
  const images = contexts.map(context => context.createImageData(width, height));
  let reversed = false;
  let probe = [Math.floor(width * 0.41), Math.floor(height * 0.55)];
  let frame;

  function camera() {
    const azimuth = Number(yaw.value) * Math.PI / 180;
    const elevation = Number(pitch.value) * Math.PI / 180;
    const forward = [-Math.sin(azimuth) * Math.cos(elevation), -Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)];
    return {
      forward,
      right: [Math.cos(azimuth), 0, -Math.sin(azimuth)],
      up: [-Math.sin(azimuth) * Math.sin(elevation), Math.cos(elevation), -Math.cos(azimuth) * Math.sin(elevation)],
      eye: forward.map(component => -5 * component),
    };
  }

  function fragmentsAt(x, y, view, intersect) {
    const horizontal = (x + 0.5 - width / 2) / height * 0.83;
    const vertical = (height / 2 - y - 0.5) / height * 0.83;
    const ray = view.forward.map((component, i) => component + horizontal * view.right[i] + vertical * view.up[i]);
    const fragments = [];
    for (const [id, surface] of surfaces.entries()) {
      const sx = intersect ? surface.tiltX : 0;
      const sy = intersect ? surface.tiltY : 0;
      const denominator = ray[2] - sx * ray[0] - sy * ray[1];
      if (Math.abs(denominator) < 1e-8) continue;
      const offset = intersect ? surface.z : [0.65, -0.02, -0.69][id];
      const depth = (offset + sx * (view.eye[0] - surface.x) + sy * (view.eye[1] - surface.y) - view.eye[2]) / denominator;
      const u = view.eye[0] + depth * ray[0] - surface.x;
      const v = view.eye[1] + depth * ray[1] - surface.y;
      if (depth <= 0 || Math.abs(u) > 1.42 || Math.abs(v) > 1.12) continue;
      const edge = Math.min(1.42 - Math.abs(u), 1.12 - Math.abs(v)) < 0.017;
      const color = edge ? surface.color.map(channel => channel * 0.62 + 0.38) : surface.color;
      fragments.push({ id, depth, color });
    }
    return fragments;
  }

  const byDepth = (a, b) => a.depth - b.depth || a.id - b.id;

  function background(x, y) {
    const grid = x % 20 === 0 || y % 20 === 0;
    return grid ? [0.028, 0.043, 0.064] : [0.013, 0.021, 0.034];
  }

  function over(fragments, bg, opacity, writeDepth = false) {
    const color = [...bg];
    let nearest = Infinity;
    for (const fragment of fragments) {
      if (writeDepth && fragment.depth >= nearest) continue;
      nearest = fragment.depth;
      for (let i = 0; i < 3; i++) {
        color[i] = opacity[fragment.id] * fragment.color[i] + (1 - opacity[fragment.id]) * color[i];
      }
    }
    return color;
  }

  function weighted(fragments, bg, opacity) {
    const sum = [0, 0, 0];
    let weightSum = 0;
    let revealage = 1;
    for (const { id, depth, color } of fragments) {
      const a = opacity[id];
      const weight = a * (4 / Math.max(depth, 0.1)) ** 6;
      weightSum += weight;
      revealage *= 1 - a;
      for (let i = 0; i < 3; i++) sum[i] += color[i] * weight;
    }
    return weightSum ? sum.map((value, i) => value / weightSum * (1 - revealage) + bg[i] * revealage) : bg;
  }

  function peeledLayers(sorted, mode, budget) {
    const front = Math.min(sorted.length, budget);
    if (mode === 'peel') return sorted.slice(0, front);
    const back = Math.max(front, sorted.length - budget);
    return [...sorted.slice(0, front), ...sorted.slice(back)];
  }

  function simulate(fragments, sorted, bg, state) {
    const { opacity, ranks, selected, budget, writeDepth } = state;
    switch (selected) {
      case 'weighted':
        return weighted(fragments, bg, opacity);
      case 'peel':
      case 'dual':
        return over(peeledLayers(sorted, selected, budget).reverse(), bg, opacity);
      default:
        return over([...fragments].sort((a, b) => ranks[a.id] - ranks[b.id]), bg, opacity, writeDepth);
    }
  }

  function encode(channel) {
    return Math.round(255 * (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055));
  }

  function draw() {
    const view = camera();
    const intersect = scene.value === 'cross';
    const selected = mode.value;
    const budget = Number(layers.value);
    const opacity = [Number(alpha.value), 0.48, 0.35];
    const order = [0, 1, 2];
    if (reversed) order.reverse();
    if (selected === 'object') {
      const depths = surfaces.map(({ x, y, z }, i) => {
        const centerZ = intersect ? z : [0.65, -0.02, -0.69][i];
        return view.forward[0] * x + view.forward[1] * y + view.forward[2] * centerZ;
      });
      order.sort((a, b) => depths[b] - depths[a]);
    }
    const ranks = surfaces.map((_, id) => order.indexOf(id));
    const ordinary = selected === 'submission' || selected === 'object';
    const state = { opacity, ranks, selected, budget, writeDepth: ordinary && depthWrite.checked };
    lab.querySelector('#oit-active-title').textContent = modes[selected];
    lab.querySelector('#oit-alpha-value').textContent = opacity[0].toFixed(2);
    lab.querySelector('#oit-layer-value').textContent = budget;
    lab.querySelector('#oit-yaw-value').textContent = yaw.value + '°';
    lab.querySelector('#oit-pitch-value').textContent = pitch.value + '°';
    reverseButton.disabled = selected === 'object';
    depthWrite.disabled = !ordinary;
    layers.disabled = selected !== 'peel' && selected !== 'dual';
    lab.querySelector('#oit-order').textContent = (
      selected === 'object' ? '排序后的提交顺序' : '提交顺序'
    ) + '（先 → 后） ' + order.map(id => surfaces[id].name).join(' → ');
    lab.querySelector('#oit-mode-note').textContent = {
      submission: '反转提交顺序，观察同一场景如何变色。开启透明深度写入，看看先写入的近片如何挡住远片。',
      object: '各物体整片使用同一个排序位置。切换平行与相交场景，比较中心排序何时失效。',
      peel: '每轮从剩余片元中取最近一层。增加剥离层数，直到与逐像素参考一致。',
      dual: '每轮取剩余片元中最近和最远两层。两端相遇时，中间层只计一次。轮数只统计剥离，GPU 实现另有初始化。',
      weighted: '反转提交顺序，累加结果保持不变。提高红片 α，比较近似颜色与参考的差别。',
    }[selected];

    let inspection;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const fragments = fragmentsAt(x, y, view, intersect);
        const sorted = [...fragments].sort(byDepth);
        const bg = background(x, y);
        const reference = over([...sorted].reverse(), bg, opacity);
        // Weighted OIT consumes the un-sorted submission order.
        if (reversed) fragments.reverse();
        const result = simulate(fragments, sorted, bg, state);
        const index = (y * width + x) * 4;
        for (const [panel, color] of [result, reference].entries()) {
          for (let i = 0; i < 3; i++) images[panel].data[index + i] = encode(color[i]);
          images[panel].data[index + 3] = 255;
        }
        if (x === probe[0] && y === probe[1]) inspection = { sorted, reference, result };
      }
    }
    for (const [panel, context] of contexts.entries()) {
      context.putImageData(images[panel], 0, 0);
      context.beginPath();
      context.arc(probe[0] + 0.5, probe[1] + 0.5, 5, 0, 2 * Math.PI);
      context.lineWidth = 3;
      context.strokeStyle = '#121827';
      context.stroke();
      context.lineWidth = 1.4;
      context.strokeStyle = 'white';
      context.stroke();
    }
    const { sorted, reference, result } = inspection;
    const rgb = color => color.map(value => value.toFixed(3)).join(', ');
    const maxError = Math.max(...result.map((value, i) => Math.abs(value - reference[i])));
    const list = lab.querySelector('#oit-fragments');
    const peeling = selected === 'peel' || selected === 'dual';
    const kept = peeling ? new Set(peeledLayers(sorted, selected, budget)) : null;
    list.replaceChildren(...sorted.map(fragment => {
      const { id, depth } = fragment;
      const item = document.createElement('li');
      item.textContent = surfaces[id].name + ' · 深度 ' + depth.toFixed(3) + ' · α ' + opacity[id].toFixed(2);
      if (kept) item.textContent += kept.has(fragment) ? ' · 已剥离' : ' · 尚未剥离';
      return item;
    }));
    lab.querySelector('#oit-probe').textContent = '像素 (' + probe.join(', ') + ') · ' + sorted.length + ' 层（近 → 远）';
    lab.querySelector('#oit-readout').textContent = '线性 RGB　当前 (' + rgb(result) + ')　参考 (' + rgb(reference) + ')　最大通道误差 ' + maxError.toFixed(3);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  lab.addEventListener('input', schedule);
  reverseButton.addEventListener('click', () => {
    reversed = !reversed;
    schedule();
  });
  lab.querySelector('#oit-weighted-example').addEventListener('click', () => {
    lab.querySelector('form').reset();
    mode.value = 'weighted';
    alpha.value = '1';
    reversed = false;
    probe = [180, 112];
    schedule();
  });
  lab.querySelector('#oit-reset').addEventListener('click', () => {
    lab.querySelector('form').reset();
    reversed = false;
    probe = [Math.floor(width * 0.41), Math.floor(height * 0.55)];
    schedule();
  });
  for (const canvas of canvases) {
    canvas.addEventListener('click', event => {
      const rect = canvas.getBoundingClientRect();
      probe = [
        Math.max(0, Math.min(width - 1, Math.floor((event.clientX - rect.left) / rect.width * width))),
        Math.max(0, Math.min(height - 1, Math.floor((event.clientY - rect.top) / rect.height * height))),
      ];
      schedule();
    });
    canvas.addEventListener('keydown', event => {
      const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!delta) return;
      event.preventDefault();
      probe = probe.map((value, i) => Math.max(0, Math.min([width, height][i] - 1, value + delta[i] * (event.shiftKey ? 8 : 1))));
      schedule();
    });
  }
  schedule();
})();
