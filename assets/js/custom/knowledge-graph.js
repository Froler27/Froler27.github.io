/* 知识图谱（3D）：透视投影 + 环绕相机 + 缓慢自转 + 拖拽旋转
   布局仍用 2D 力导向算 x/y，z 用来做空间纵深；投影、排序、交互全部在 3D 里做。 */
(() => {
    const shell = document.getElementById("graph-shell");
    const stage = document.getElementById("graph-stage");
    const canvas = document.getElementById("knowledge-canvas");
    const dataEl = document.getElementById("knowledge-data");
    const tooltip = document.getElementById("graph-tooltip");
    const emptyEl = document.getElementById("graph-empty");
    const searchInput = document.getElementById("graph-query");
    const resetBtn = document.getElementById("graph-reset");
    const motionBtn = document.getElementById("graph-motion");
    if (!shell || !stage || !canvas || !dataEl) return;

    let data;
    try {
        data = JSON.parse(dataEl.textContent);
    } catch (error) {
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const domainList = data.domains || [];
    const domainById = new Map(domainList.map((domain) => [domain.id, domain]));
    const fontStack =
        '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", -apple-system, "Segoe UI", sans-serif';

    const sizeRadius = { 1: 10, 2: 15, 3: 22 };
    const nodes = (data.nodes || []).map((node, index) => ({
        ...node,
        index,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        radius: sizeRadius[node.size] || sizeRadius[1],
        phase: (index * 1.7) % (Math.PI * 2),
    }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const edges = (data.edges || [])
        .map(([a, b]) => ({ a: byId.get(a), b: byId.get(b) }))
        .filter((edge) => edge.a && edge.b);
    const neighbors = new Map(nodes.map((node) => [node.id, new Set()]));
    edges.forEach((edge) => {
        neighbors.get(edge.a.id).add(edge.b.id);
        neighbors.get(edge.b.id).add(edge.a.id);
    });
    if (!nodes.length) return;

    /* ---------------- 确定性随机 ---------------- */
    const rand = (seed) => {
        const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return value - Math.floor(value);
    };

    /* ---------------- 坐标与相机 ---------------- */
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const camera = {
        distance: 1300,
        focal: 1050,
    };

    const cam = {
        yaw: -0.08,
        pitch: -0.1,
        zoom: 1,
        homeYaw: -0.08,
        homePitch: -0.1,
        homeZoom: 1,
        vYaw: 0,
        vPitch: 0,
        zoomUser: false,
        parallaxYaw: 0,
        parallaxPitch: 0,
    };

    const state = {
        width: 0,
        height: 0,
        dpr: 1,
        ambient: false,
        inView: true,
        time: 0,
        introStart: 0,
        filter: "all",
        query: "",
        hoverId: null,
        pointerScreen: null,
        pointers: new Map(),
        dragging: null,
        pinch: null,
        lastInteraction: 0,
        projected: new Map(),
        view: { yaw: cam.yaw, pitch: cam.pitch, zoom: 1 },
    };

    function projectPoint(x, y, z, yaw = state.view.yaw, pitch = state.view.pitch, zoom = state.view.zoom) {
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;

        const distance = camera.distance + z2;
        if (distance < 140) return null;
        const scale = (camera.focal / distance) * zoom;
        return {
            x: state.width / 2 + x1 * scale,
            y: state.height / 2 + y2 * scale,
            depth: distance,
            scale,
        };
    }

    /* ---------------- 领域锚点 + 2D 布局 + z 深度 ---------------- */
    const anchorById = new Map();
    let layoutMode = null;

    function buildLayout(mode) {
        layoutMode = mode;
        const compact = mode === "compact";
        anchorById.clear();

        if (compact) {
            const angles = [-2.35, -0.8, 0.8, 2.35, 3.9, -3.9];
            domainList.forEach((domain, index) => {
                const angle = angles[index % angles.length];
                anchorById.set(domain.id, {
                    x: Math.cos(angle) * 250,
                    y: Math.sin(angle) * 235,
                });
            });
        } else {
            const positions = [
                { x: -430, y: -160 },
                { x: 430, y: -185 },
                { x: 410, y: 175 },
                { x: -430, y: 150 },
            ];
            domainList.forEach((domain, index) => {
                const position = positions[index];
                if (position) {
                    anchorById.set(domain.id, position);
                } else {
                    const angle = index * 1.7 - 1.2;
                    anchorById.set(domain.id, {
                        x: Math.cos(angle) * 430,
                        y: Math.sin(angle) * 240,
                    });
                }
            });
        }

        const counters = new Map();
        nodes.forEach((node) => {
            const anchor = anchorById.get(node.domain) || { x: 0, y: 0 };
            const count = counters.get(node.domain) || 0;
            counters.set(node.domain, count + 1);
            const angle = count * 2.399963 + rand(count + node.index) * 1.7;
            const radius = compact
                ? 30 + Math.sqrt(count) * 25 + rand(node.index + 7) * 20
                : 38 + Math.sqrt(count) * 30 + rand(node.index + 7) * 24;
            node.anchorX = anchor.x + Math.cos(angle) * radius;
            node.anchorY = anchor.y + Math.sin(angle) * radius;
            node.x = node.anchorX + (rand(node.index + 2) - 0.5) * 44;
            node.y = node.anchorY + (rand(node.index + 9) - 0.5) * 44;
            node.vx = 0;
            node.vy = 0;
        });

        simulate(470);
        centerAndFlatten();
        assignDepth();
    }

    // 把布局重心挪到原点，并压扁 y 方向，让 3D 透视有更多横向空间
    function centerAndFlatten() {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        nodes.forEach((node) => {
            minX = Math.min(minX, node.x - node.radius);
            maxX = Math.max(maxX, node.x + node.radius);
            minY = Math.min(minY, node.y - node.radius);
            maxY = Math.max(maxY, node.y + node.radius);
        });
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        nodes.forEach((node) => {
            node.x -= centerX;
            node.y = (node.y - centerY) * 0.62;
            node.anchorX -= centerX;
            node.anchorY = (node.anchorY - centerY) * 0.62;
        });
    }

    // 领域之间拉开前后层次，再给每个节点一点随机纵深
    function assignDepth() {
        const domainDepth = new Map();
        domainList.forEach((domain, index) => {
            const base = [110, -60, 160, -130, 30, -90];
            domainDepth.set(domain.id, base[index % base.length]);
        });
        nodes.forEach((node) => {
            node.z =
                (domainDepth.get(node.domain) || 0) +
                (rand(node.index * 3.7 + 1) - 0.5) * 150;
        });
    }

    /* ---------------- 2D 力导向（只算初始 x/y） ---------------- */
    const TARGET_LINK = 138;
    const REPULSE = 5400;

    function simulate(steps) {
        const n = nodes.length;
        for (let step = 0; step < steps; step += 1) {
            const fx = new Float64Array(n);
            const fy = new Float64Array(n);

            for (let i = 0; i < n; i += 1) {
                const a = nodes[i];
                for (let j = i + 1; j < n; j += 1) {
                    const b = nodes[j];
                    let dx = a.x - b.x;
                    let dy = a.y - b.y;
                    let dist2 = dx * dx + dy * dy;
                    if (dist2 < 1) {
                        dx = rand(i + j) - 0.5;
                        dy = rand(i * 3 + j) - 0.5;
                        dist2 = 1;
                    }
                    const dist = Math.sqrt(dist2);
                    const force = REPULSE / dist2;
                    const ux = dx / dist;
                    const uy = dy / dist;
                    fx[i] += ux * force;
                    fy[i] += uy * force;
                    fx[j] -= ux * force;
                    fy[j] -= uy * force;

                    const minDist = a.radius + b.radius + 18;
                    if (dist < minDist) {
                        const push = (minDist - dist) * 0.14;
                        fx[i] += ux * push;
                        fy[i] += uy * push;
                        fx[j] -= ux * push;
                        fy[j] -= uy * push;
                    }
                }
            }

            edges.forEach((edge) => {
                const a = edge.a;
                const b = edge.b;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 1;
                const force = (dist - TARGET_LINK) * 0.022;
                const ux = dx / dist;
                const uy = dy / dist;
                fx[a.index] += ux * force;
                fy[a.index] += uy * force;
                fx[b.index] -= ux * force;
                fy[b.index] -= uy * force;
            });

            nodes.forEach((node, index) => {
                fx[index] += (node.anchorX - node.x) * 0.011;
                fy[index] += (node.anchorY - node.y) * 0.011;
                fx[index] -= node.x * 0.0016;
                fy[index] -= node.y * 0.0016;

                node.vx = (node.vx + fx[index]) * 0.84;
                node.vy = (node.vy + fy[index]) * 0.84;
                const speed = Math.hypot(node.vx, node.vy);
                if (speed > 9) {
                    node.vx = (node.vx / speed) * 9;
                    node.vy = (node.vy / speed) * 9;
                }
                node.x += node.vx;
                node.y += node.vy;
            });
        }
    }

    /* ---------------- 舞台尺寸 / 适配缩放 ---------------- */
    function computeHomeZoom() {
        if (!state.width || !state.height) return;
        const padX = state.width >= 700 ? 64 : 30;
        const padY = state.width >= 700 ? 56 : 30;
        let extentX = 1;
        let extentY = 1;

        // 采样一圈 yaw，保证自动旋转时节点始终在画面内
        for (let step = 0; step < 24; step += 1) {
            const yaw = (step / 24) * Math.PI * 2;
            nodes.forEach((node) => {
                const point = projectPoint(node.x, node.y, node.z, yaw, cam.homePitch, 1);
                if (!point) return;
                const radius = (node.radius + 10) * point.scale;
                extentX = Math.max(extentX, Math.abs(point.x - state.width / 2) + radius);
                extentY = Math.max(extentY, Math.abs(point.y - state.height / 2) + radius + 14);
            });
        }

        const zoom = Math.min(
            (state.width / 2 - padX) / extentX,
            (state.height / 2 - padY) / extentY
        );
        cam.homeZoom = clamp(zoom * 0.98, 0.22, 2.2);
        if (!cam.zoomUser) cam.zoom = cam.homeZoom;
    }

    function resize() {
        const rect = stage.getBoundingClientRect();
        state.width = Math.max(320, rect.width);
        state.height = Math.max(320, rect.height);
        state.dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(state.width * state.dpr);
        canvas.height = Math.round(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;

        const nextMode = state.width < 700 ? "compact" : "wide";
        if (nextMode !== layoutMode) {
            buildLayout(nextMode);
        }
        computeHomeZoom();
        draw();
    }

    /* ---------------- 主题 / 调色 ---------------- */
    function themePalette() {
        const attr = root.dataset.theme;
        const dark =
            attr === "dark" ||
            (attr !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        return {
            dark,
            label: dark ? "#edf4ff" : "#0b1220",
            labelMuted: dark ? "rgba(150,170,198,0.62)" : "rgba(91,107,133,0.68)",
            edge: dark ? 0.33 : 0.25,
            innerMix: dark ? 0.58 : 0.34,
            halo: dark ? 0.16 : 0.1,
            floor: dark ? 0.11 : 0.09,
            dust: dark ? 0.5 : 0.35,
            bg: dark ? "#05080f" : "#f4f8ff",
        };
    }

    function hexToRgb(hex) {
        const value = hex.replace("#", "");
        const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
        return [
            parseInt(full.slice(0, 2), 16),
            parseInt(full.slice(2, 4), 16),
            parseInt(full.slice(4, 6), 16),
        ];
    }

    function rgba(hex, alpha) {
        const [r, g, b] = hexToRgb(hex);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function mix(hex, target, amount) {
        const [r, g, b] = hexToRgb(hex);
        const [tr, tg, tb] = hexToRgb(target);
        const toHex = (value) => Math.round(value).toString(16).padStart(2, "0");
        return `#${toHex(r + (tr - r) * amount)}${toHex(g + (tg - g) * amount)}${toHex(
            b + (tb - b) * amount
        )}`;
    }

    function domainColor(node) {
        const domain = domainById.get(node.domain);
        return domain ? domain.color : "#38bdf8";
    }

    /* ---------------- 动态偏移 ---------------- */
    function nodeBob(node) {
        if (!state.ambient) return { x: 0, y: 0, z: 0 };
        const t = state.time;
        return {
            x: Math.sin(t * 0.5 + node.phase) * 4,
            y: Math.cos(t * 0.42 + node.phase * 1.3) * 3.4,
            z: Math.sin(t * 0.34 + node.phase * 1.7) * 9,
        };
    }

    /* ---------------- 背景：透视地面 + 空间尘埃 ---------------- */
    const FLOOR_Y = 430;
    const FLOOR_EXTENT = 1150;
    const FLOOR_STEP = 150;

    function drawFloor(palette) {
        const lines = [];
        for (let x = -FLOOR_EXTENT; x <= FLOOR_EXTENT; x += FLOOR_STEP) {
            lines.push([
                projectPoint(x, FLOOR_Y, -FLOOR_EXTENT),
                projectPoint(x, FLOOR_Y, FLOOR_EXTENT),
            ]);
        }
        for (let z = -FLOOR_EXTENT; z <= FLOOR_EXTENT; z += FLOOR_STEP) {
            lines.push([
                projectPoint(-FLOOR_EXTENT, FLOOR_Y, z),
                projectPoint(FLOOR_EXTENT, FLOOR_Y, z),
            ]);
        }
        const color = palette.dark ? "#38bdf8" : "#0284c7";
        ctx.save();
        ctx.strokeStyle = rgba(color, palette.floor);
        ctx.lineWidth = 1;
        ctx.beginPath();
        lines.forEach(([a, b]) => {
            if (!a || !b) return;
            if (a.depth > 6000 || b.depth > 6000) return;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        });
        ctx.stroke();

        // 地面中心的光池
        const center = projectPoint(0, FLOOR_Y, 0);
        if (center) {
            const glow = ctx.createRadialGradient(
                center.x,
                center.y,
                10,
                center.x,
                center.y,
                state.height * 0.42
            );
            glow.addColorStop(0, rgba(color, palette.dark ? 0.13 : 0.09));
            glow.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(center.x, center.y, state.height * 0.42, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    const dust = Array.from({ length: 64 }, (_, index) => ({
        x: (rand(index + 11) - 0.5) * 1700,
        y: (rand(index + 31) - 0.5) * 780,
        z: (rand(index + 51) - 0.5) * 900,
        r: 0.5 + rand(index + 71) * 1.4,
        phase: rand(index + 91) * Math.PI * 2,
    }));

    function drawDust(palette) {
        const color = palette.dark ? "#7dd3fc" : "#0369a1";
        ctx.save();
        dust.forEach((item) => {
            const t = state.ambient ? state.time : 0;
            const x = item.x + Math.sin(t * 0.1 + item.phase) * 12;
            const y = item.y + Math.cos(t * 0.13 + item.phase) * 8;
            const point = projectPoint(x, y, item.z);
            if (!point) return;
            if (point.x < -20 || point.x > state.width + 20 || point.y < -20 || point.y > state.height + 20) return;
            const depthFade = clamp(1.25 - (point.depth - 900) / 1600, 0.15, 0.8);
            ctx.fillStyle = rgba(color, palette.dust * depthFade * 0.55);
            ctx.beginPath();
            ctx.arc(point.x, point.y, item.r * clamp(point.scale, 0.5, 1.4), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    /* ---------------- 过滤状态 ---------------- */
    function matches(node) {
        const query = state.query.trim().toLowerCase();
        const domainOk = state.filter === "all" || node.domain === state.filter;
        if (!domainOk) return false;
        if (!query) return true;
        const haystack = `${node.label} ${node.desc || ""} ${node.kw || ""} ${node.article || ""}`.toLowerCase();
        return haystack.includes(query);
    }

    function visibleState() {
        const anyFilter = state.filter !== "all" || state.query.trim().length > 0;
        const matchMap = new Map(nodes.map((node) => [node.id, matches(node)]));
        const matchedCount = nodes.filter((node) => matchMap.get(node.id)).length;
        return { anyFilter, matchMap, matchedCount };
    }

    /* ---------------- 主绘制 ---------------- */
    function draw() {
        const palette = themePalette();
        const { anyFilter, matchMap } = visibleState();
        const hover = state.hoverId ? byId.get(state.hoverId) : null;
        const hoverNeighbors = hover ? neighbors.get(hover.id) : new Set();

        // 入场镜头：从稍远的侧后方推近；鼠标位置带来一点视差
        let intro = 1;
        if (state.ambient) {
            intro = clamp((performance.now() - state.introStart) / 1100, 0, 1);
            intro = 1 - Math.pow(1 - intro, 3);
        }
        const parallaxYaw = state.ambient ? cam.parallaxYaw + Math.sin(state.time * 0.23) * 0.014 : 0;
        const parallaxPitch = state.ambient
            ? cam.parallaxPitch + Math.sin(state.time * 0.17) * 0.018
            : 0;
        state.view = {
            yaw: cam.yaw - (1 - intro) * 0.32 + parallaxYaw,
            pitch: clamp(cam.pitch + parallaxPitch, -0.7, 0.7),
            zoom: cam.zoom * (0.86 + 0.14 * intro),
        };

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

        drawFloor(palette);
        drawDust(palette);

        // 投影缓存
        const projected = new Map();
        const projectedList = [];
        nodes.forEach((node) => {
            const bob = nodeBob(node);
            const point = projectPoint(node.x + bob.x, node.y + bob.y, node.z + bob.z);
            if (!point) return;
            const entry = { node, point };
            projected.set(node.id, entry);
            projectedList.push(entry);
        });

        let minDepth = Infinity;
        let maxDepth = -Infinity;
        projectedList.forEach(({ point }) => {
            minDepth = Math.min(minDepth, point.depth);
            maxDepth = Math.max(maxDepth, point.depth);
        });
        const depthRange = Math.max(1, maxDepth - minDepth);
        const depthFade = (point) =>
            clamp(1 - (point.depth - minDepth) / depthRange, 0, 1) * 0.55 + 0.45;

        state.projected = projected;

        // 3D 深度辅助线：从节点垂到地面，强化“浮在空间里”的感觉
        ctx.save();
        ctx.setLineDash([2, 5]);
        projectedList.forEach(({ node, point }) => {
            if (node.size < 2) return;
            const bob = nodeBob(node);
            const foot = projectPoint(node.x + bob.x, FLOOR_Y, node.z + bob.z);
            if (!foot) return;
            const alpha = 0.2 * depthFade(point);
            ctx.strokeStyle = rgba(domainColor(node), alpha);
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(point.x, point.y + Math.max(3.5, node.radius * point.scale));
            ctx.lineTo(foot.x, foot.y);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.fillStyle = rgba(domainColor(node), alpha * 1.8);
            ctx.beginPath();
            ctx.arc(foot.x, foot.y, 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.setLineDash([2, 5]);
        });
        ctx.restore();

        // 先画远处的边，再画近处的边
        const edgeDraws = [];
        edges.forEach((edge, edgeIndex) => {
            const a = projected.get(edge.a.id);
            const b = projected.get(edge.b.id);
            if (!a || !b) return;
            edgeDraws.push({ edge, a, b, edgeIndex });
        });
        edgeDraws.sort((a, b) => b.a.point.depth + b.b.point.depth - (a.a.point.depth + a.b.point.depth));

        edgeDraws.forEach(({ edge, a, b, edgeIndex }) => {
            const matchA = matchMap.get(edge.a.id);
            const matchB = matchMap.get(edge.b.id);
            const fade = (depthFade(a.point) + depthFade(b.point)) / 2;
            let alpha = palette.edge * fade;
            if (anyFilter) alpha = (matchA && matchB ? 0.5 : 0.06) * fade;
            if (hover) {
                const connected = edge.a.id === hover.id || edge.b.id === hover.id;
                alpha = (connected ? 0.85 : 0.04) * fade;
            }

            const ax = a.point.x;
            const ay = a.point.y;
            const bx = b.point.x;
            const by = b.point.y;
            const dx = bx - ax;
            const dy = by - ay;
            const length = Math.hypot(dx, dy) || 1;
            const connected = hover && (edge.a.id === hover.id || edge.b.id === hover.id);
            const bend =
                Math.min(26, 8 + length * 0.03) *
                (edgeIndex % 2 === 0 ? 1 : -1) *
                (connected ? 0.65 : 1);
            const controlX = (ax + bx) / 2 + (-dy / length) * bend;
            const controlY = (ay + by) / 2 + (dx / length) * bend;

            const gradient = ctx.createLinearGradient(ax, ay, bx, by);
            gradient.addColorStop(0, rgba(domainColor(edge.a), alpha));
            gradient.addColorStop(1, rgba(domainColor(edge.b), alpha));
            ctx.strokeStyle = gradient;
            ctx.lineWidth = connected ? 1.9 : Math.max(0.7, 1.1 * ((a.point.scale + b.point.scale) / 2) * 0.85);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.quadraticCurveTo(controlX, controlY, bx, by);
            ctx.stroke();

            // 沿边流动的能量点：沿二次曲线插值，看起来像 3D 空间里的能量流
            if (state.ambient) {
                const phase = (((edge.a.index * 0.17 + edge.b.index * 0.11 + edgeIndex * 0.07) % 1) + 1) % 1;
                const progress = (state.time * (connected ? 0.45 : 0.13) + phase) % 1;
                const inv = 1 - progress;
                const dotX = inv * inv * ax + 2 * inv * progress * controlX + progress * progress * bx;
                const dotY = inv * inv * ay + 2 * inv * progress * controlY + progress * progress * by;
                const dotAlpha =
                    (connected ? 0.9 : 0.3) *
                    fade *
                    (anyFilter ? (matchA && matchB ? 1 : 0.18) : 1) *
                    (hover && !connected ? 0.25 : 1);
                if (dotAlpha > 0.02) {
                    const dotScale = (a.point.scale + b.point.scale) / 2;
                    ctx.fillStyle = rgba(domainColor(edge.a), dotAlpha);
                    ctx.beginPath();
                    ctx.arc(dotX, dotY, (connected ? 2.3 : 1.6) * clamp(dotScale, 0.6, 1.6), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        });

        // 节点：由远到近
        const drawList = projectedList.slice().sort((a, b) => b.point.depth - a.point.depth);
        drawList.forEach(({ node, point }) => {
            const rawColor = domainColor(node);
            const fade = depthFade(point);
            // 远处节点往背景色里退一点，形成空气透视
            const color = fade < 0.78 ? mix(rawColor, palette.bg, (0.78 - fade) * 0.55) : rawColor;
            const matched = matchMap.get(node.id);
            const related = hover ? node.id === hover.id || hoverNeighbors.has(node.id) : false;
            let alpha = fade;
            if (anyFilter && !matched) alpha = 0.16 * fade;
            if (hover && !related) alpha = 0.13 * fade;
            if (hover && related) alpha = fade;

            const hovered = hover && node.id === hover.id;
            const scale = point.scale;
            const radius = Math.max(3.5, node.radius * scale) * (hovered ? 1.12 : 1);
            ctx.globalAlpha = alpha;

            const glow = ctx.createRadialGradient(point.x, point.y, radius * 0.2, point.x, point.y, radius * 2.8);
            glow.addColorStop(0, rgba(color, 0.28 * fade));
            glow.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius * 2.8, 0, Math.PI * 2);
            ctx.fill();

            const body = ctx.createRadialGradient(
                point.x - radius * 0.34,
                point.y - radius * 0.42,
                radius * 0.12,
                point.x,
                point.y,
                radius
            );
            body.addColorStop(0, mix(color, "#ffffff", palette.innerMix));
            body.addColorStop(0.55, color);
            body.addColorStop(1, mix(color, palette.dark ? "#05080f" : "#f4f8ff", 0.42));
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = palette.dark ? rgba("#ffffff", 0.5 * fade) : rgba("#0b1220", 0.28 * fade);
            ctx.lineWidth = Math.max(0.6, 1.1 * clamp(scale, 0.6, 1.6));
            ctx.beginPath();
            ctx.arc(point.x, point.y, radius - 0.5, 0, Math.PI * 2);
            ctx.stroke();

            if (node.size === 3) {
                ctx.strokeStyle = rgba("#ffffff", (palette.dark ? 0.32 : 0.45) * fade);
                ctx.lineWidth = 0.9;
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius * 0.52, 0, Math.PI * 2);
                ctx.stroke();
            }

            if (anyFilter && matched) {
                ctx.strokeStyle = rgba(color, 0.85);
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius + 4.5, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
        });

        // 标签：3D 投影后按重要性避让
        const compact = state.width < 700;
        const labelRank = (entry) => {
            if (hover && entry.node.id === hover.id) return 100;
            if (anyFilter && matchMap.get(entry.node.id)) return 80;
            return entry.node.size * 10 + entry.point.depth * 0.001;
        };
        const placedLabels = [];
        const overlaps = (a, b) =>
            a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;

        projectedList
            .slice()
            .sort((a, b) => labelRank(b) - labelRank(a))
            .forEach(({ node, point }) => {
                const matched = matchMap.get(node.id);
                const related = hover ? node.id === hover.id || hoverNeighbors.has(node.id) : false;
                const fade = depthFade(point);
                const isHub = node.size === 3;
                const show =
                    related ||
                    (anyFilter && matched) ||
                    isHub ||
                    (!compact && (node.size === 2 || fade > 0.72) && fade > 0.55) ||
                    (compact && node.size === 2 && fade > 0.8);
                if (!show) return;

                const fontSize = node.size === 3 ? 13.5 : node.size === 2 ? 12 : 11;
                const radius = Math.max(3.5, node.radius * point.scale);
                const offset = radius + 6;
                const important = related || (anyFilter && matched);

                ctx.font = `${node.size >= 3 ? 600 : 500} ${fontSize}px ${fontStack}`;
                const textWidth = ctx.measureText(node.label).width;
                const rect = {
                    x: point.x - textWidth / 2 - 4,
                    y: point.y + offset - 2,
                    w: textWidth + 8,
                    h: fontSize + 6,
                };
                if (!important && placedLabels.some((other) => overlaps(rect, other))) return;
                let alpha = fade;
                if (anyFilter && !matched) alpha = 0.16 * fade;
                if (hover && !related) alpha = 0.12 * fade;

                ctx.globalAlpha = alpha;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.lineWidth = 3;
                ctx.strokeStyle = palette.bg;
                ctx.strokeText(node.label, point.x, point.y + offset);
                ctx.fillStyle = important || (anyFilter && matched) ? palette.label : palette.labelMuted;
                ctx.fillText(node.label, point.x, point.y + offset);
                ctx.globalAlpha = 1;
                placedLabels.push(rect);
            });

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /* ---------------- 命中测试（屏幕坐标） ---------------- */
    function nodeAtScreen(px, py) {
        let found = null;
        let best = Infinity;
        state.projected.forEach(({ node, point }) => {
            const radius = Math.max(8, node.radius * point.scale + 5);
            const distance = Math.hypot(point.x - px, point.y - py);
            if (distance <= radius && distance < best) {
                best = distance;
                found = node;
            }
        });
        return found;
    }

    /* ---------------- 交互 ---------------- */
    function stagePoint(event) {
        const rect = stage.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function updateTooltip(node, px, py) {
        if (!node) {
            hideTooltip();
            return;
        }
        const domain = domainById.get(node.domain);
        tooltip.querySelector(".graph-tooltip-domain").textContent = domain ? domain.label : "";
        tooltip.querySelector(".graph-tooltip-label").textContent = node.label;
        tooltip.querySelector(".graph-tooltip-desc").textContent = node.desc || "";
        tooltip.querySelector(".graph-tooltip-article").textContent = `↳ ${node.article}`;
        tooltip.style.setProperty("--tooltip-color", domain ? domain.color : "var(--accent)");
        tooltip.hidden = false;

        const rect = stage.getBoundingClientRect();
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        let left = px + 18;
        let top = py + 18;
        if (left + width > rect.width - 12) left = px - width - 18;
        if (top + height > rect.height - 12) top = py - height - 18;
        tooltip.style.left = `${clamp(left, 12, Math.max(12, rect.width - width - 12))}px`;
        tooltip.style.top = `${clamp(top, 12, Math.max(12, rect.height - height - 12))}px`;
        tooltip.classList.add("is-visible");
    }

    function hideTooltip() {
        tooltip.classList.remove("is-visible");
        tooltip.hidden = true;
    }

    function updateHover(px, py) {
        const node = nodeAtScreen(px, py);
        const next = node ? node.id : null;
        if (next === state.hoverId) {
            if (node) updateTooltip(node, px, py);
            return;
        }
        state.hoverId = next;
        if (node) {
            updateTooltip(node, px, py);
            canvas.classList.add("is-hovering");
        } else {
            hideTooltip();
            canvas.classList.remove("is-hovering");
        }
        if (!state.ambient) draw();
    }

    let lastDrag = null;

    canvas.addEventListener(
        "pointerdown",
        (event) => {
            const point = stagePoint(event);
            state.pointers.set(event.pointerId, point);
            canvas.setPointerCapture(event.pointerId);
            state.lastInteraction = performance.now();

            if (state.pointers.size === 2) {
                const [a, b] = [...state.pointers.values()];
                state.pinch = {
                    startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                    startZoom: cam.zoom,
                };
                state.dragging = null;
                return;
            }

            state.dragging = {
                startX: point.x,
                startY: point.y,
                lastX: point.x,
                lastY: point.y,
                lastTime: performance.now(),
                node: nodeAtScreen(point.x, point.y),
                moved: false,
            };
            state.pointerScreen = point;
            canvas.classList.add("is-dragging");
        },
        { passive: true }
    );

    canvas.addEventListener(
        "pointermove",
        (event) => {
            const point = stagePoint(event);
            if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, point);

            if (state.pinch && state.pointers.size >= 2) {
                const [a, b] = [...state.pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                cam.zoom = clamp((state.pinch.startZoom * dist) / state.pinch.startDist, cam.homeZoom * 0.45, cam.homeZoom * 4);
                cam.zoomUser = true;
                if (!state.ambient) draw();
                return;
            }

            if (state.dragging) {
                const drag = state.dragging;
                const dx = point.x - drag.lastX;
                const dy = point.y - drag.lastY;
                const now = performance.now();
                const dt = Math.max(8, now - drag.lastTime);
                drag.lastX = point.x;
                drag.lastY = point.y;
                drag.lastTime = now;
                state.lastInteraction = now;

                if (Math.abs(point.x - drag.startX) > 4 || Math.abs(point.y - drag.startY) > 4) {
                    drag.moved = true;
                }

                cam.yaw += dx * 0.0065;
                cam.pitch = clamp(cam.pitch + dy * 0.0035, -0.7, 0.7);
                lastDrag = {
                    yaw: (dx * 0.0065) / (dt / 1000),
                    pitch: (dy * 0.0035) / (dt / 1000),
                };
                state.pointerScreen = point;

                if (!state.ambient) draw();
                return;
            }

            if (event.pointerType === "mouse") {
                state.pointerScreen = point;
                updateHover(point.x, point.y);
            }
        },
        { passive: true }
    );

    function endPointer(event) {
        const point = stagePoint(event);
        state.pointers.delete(event.pointerId);

        if (state.dragging) {
            const drag = state.dragging;
            state.dragging = null;
            if (!drag.moved && drag.node && drag.node.url) {
                window.location.href = drag.node.url;
                return;
            }
            if (lastDrag) {
                cam.vYaw = clamp(lastDrag.yaw * 0.16, -1.6, 1.6);
                cam.vPitch = clamp(lastDrag.pitch * 0.16, -0.9, 0.9);
            }
            lastDrag = null;
        }
        if (state.pointers.size < 2) state.pinch = null;
        canvas.classList.remove("is-dragging");

        if (event.pointerType === "mouse") {
            state.pointerScreen = point;
            updateHover(point.x, point.y);
        } else {
            hideTooltip();
            state.hoverId = null;
        }
        if (!state.ambient) draw();
    }

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", () => {
        state.pointerScreen = null;
        state.hoverId = null;
        hideTooltip();
        canvas.classList.remove("is-hovering");
        if (!state.ambient) draw();
    });

    canvas.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            cam.zoom = clamp(
                cam.zoom * Math.exp(-event.deltaY * 0.0012),
                cam.homeZoom * 0.45,
                cam.homeZoom * 4
            );
            cam.zoomUser = true;
            state.lastInteraction = performance.now();
            if (!state.ambient) draw();
        },
        { passive: false }
    );

    /* ---------------- 动画循环 ---------------- */
    let loopHandle = 0;
    let lastFrame = 0;
    let lastPaint = 0;

    function frame(now) {
        loopHandle = 0;
        const dt = Math.min(0.05, Math.max(0, (now - (lastFrame || now)) / 1000));
        lastFrame = now;
        state.time = now / 1000;

        if (state.ambient) {
            const idle = now - state.lastInteraction > 1200;
            if (idle && !state.dragging && state.pointers.size === 0) {
                cam.yaw += dt * 0.1;
            }

            if (Math.abs(cam.vYaw) > 0.002 || Math.abs(cam.vPitch) > 0.002) {
                cam.yaw += cam.vYaw * dt;
                cam.pitch = clamp(cam.pitch + cam.vPitch * dt, -0.7, 0.7);
                const decay = Math.pow(0.05, dt);
                cam.vYaw *= decay;
                cam.vPitch *= decay;
            } else {
                cam.vYaw = 0;
                cam.vPitch = 0;
            }

            // 鼠标视差：镜头轻微追随指针，空间感更明显
            const targetYaw = state.pointerScreen
                ? (state.pointerScreen.x / state.width - 0.5) * 0.05
                : 0;
            const targetPitch = state.pointerScreen
                ? (state.pointerScreen.y / state.height - 0.5) * 0.028
                : 0;
            const ease = Math.min(1, dt * 3.2);
            cam.parallaxYaw += (targetYaw - cam.parallaxYaw) * ease;
            cam.parallaxPitch += (targetPitch - cam.parallaxPitch) * ease;

            // 高刷屏上限制到 ~60fps，避免无意义的重绘
            if (now - lastPaint >= 15) {
                lastPaint = now;
                draw();
            }

            // 相机持续旋转时，指针下的节点会变化，实时更新悬停
            if (state.pointerScreen && !state.dragging && state.pointers.size === 0) {
                const node = nodeAtScreen(state.pointerScreen.x, state.pointerScreen.y);
                const next = node ? node.id : null;
                if (next !== state.hoverId) {
                    state.hoverId = next;
                    if (node) {
                        updateTooltip(node, state.pointerScreen.x, state.pointerScreen.y);
                        canvas.classList.add("is-hovering");
                    } else {
                        hideTooltip();
                        canvas.classList.remove("is-hovering");
                    }
                }
            }

            if (!document.hidden && state.inView) {
                loopHandle = window.requestAnimationFrame(frame);
            }
        }
    }

    function ensureLoop() {
        if (!loopHandle && !document.hidden && state.inView) {
            lastFrame = 0;
            loopHandle = window.requestAnimationFrame(frame);
        }
    }

    if ("IntersectionObserver" in window) {
        new IntersectionObserver(
            (entries) => {
                state.inView = entries[0].isIntersecting;
                if (state.inView) ensureLoop();
            },
            { threshold: 0.05 }
        ).observe(stage);
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) ensureLoop();
    });

    /* ---------------- 筛选 / 搜索 / 重置 / 动态开关 ---------------- */
    const chips = [...document.querySelectorAll(".graph-chip")];

    function applyFilterUI() {
        chips.forEach((chip) => {
            const active = chip.dataset.filter === state.filter;
            chip.classList.toggle("is-active", active);
            chip.setAttribute("aria-pressed", active ? "true" : "false");
        });
        const { anyFilter, matchedCount } = visibleState();
        emptyEl.hidden = !(anyFilter && matchedCount === 0);
        if (!state.ambient) draw();
    }

    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            state.filter = chip.dataset.filter || "all";
            applyFilterUI();
        });
    });

    searchInput.addEventListener("input", () => {
        state.query = searchInput.value || "";
        applyFilterUI();
    });

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            searchInput.value = "";
            state.query = "";
            applyFilterUI();
        }
    });

    resetBtn.addEventListener("click", () => {
        state.filter = "all";
        state.query = "";
        searchInput.value = "";
        cam.yaw = cam.homeYaw;
        cam.pitch = cam.homePitch;
        cam.vYaw = 0;
        cam.vPitch = 0;
        cam.zoomUser = false;
        cam.zoom = cam.homeZoom;
        applyFilterUI();
        if (state.ambient) ensureLoop();
    });

    function syncMotionUI() {
        if (!motionBtn) return;
        motionBtn.setAttribute("aria-pressed", state.ambient ? "true" : "false");
        motionBtn.title = state.ambient ? "暂停动态效果" : "继续动态效果";
    }

    if (motionBtn) {
        motionBtn.addEventListener("click", () => {
            state.ambient = !state.ambient;
            try {
                window.localStorage.setItem("knowledge-motion", state.ambient ? "on" : "off");
            } catch (error) {
                /* ignore */
            }
            syncMotionUI();
            if (state.ambient) {
                state.introStart = performance.now() - 5000;
                lastFrame = 0;
                ensureLoop();
            } else {
                draw();
            }
        });
    }

    /* ---------------- 主题联动 ---------------- */
    new MutationObserver(() => {
        if (!state.ambient) draw();
    }).observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });

    /* ---------------- 初始化 ---------------- */
    function init() {
        let storedMotion = null;
        try {
            storedMotion = window.localStorage.getItem("knowledge-motion");
        } catch (error) {
            /* ignore */
        }
        state.ambient = storedMotion ? storedMotion === "on" : !reduceMotion;
        state.introStart = performance.now();
        syncMotionUI();

        resize();
        if (state.ambient) {
            ensureLoop();
        } else {
            draw();
        }

        window.requestAnimationFrame(() => {
            shell.classList.add("is-ready");
        });
    }

    if ("ResizeObserver" in window) {
        new ResizeObserver(resize).observe(stage);
    } else {
        window.addEventListener("resize", resize);
    }

    if (new URLSearchParams(window.location.search).has("debug")) {
        window.__kg = { cam, state, nodes, projectPoint, computeHomeZoom };
    }

    init();
})();
