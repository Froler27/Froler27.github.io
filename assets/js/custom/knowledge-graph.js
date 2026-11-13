/* 知识图谱：Canvas 力导向布局 + 缩放/平移/拖拽 + 悬停详情 + 点击跳文章
   数据由 layouts/knowledge.html 写入 <script id="knowledge-data">。 */
(() => {
    const shell = document.getElementById("graph-shell");
    const stage = document.getElementById("graph-stage");
    const canvas = document.getElementById("knowledge-canvas");
    const dataEl = document.getElementById("knowledge-data");
    const tooltip = document.getElementById("graph-tooltip");
    const emptyEl = document.getElementById("graph-empty");
    const searchInput = document.getElementById("graph-query");
    const resetBtn = document.getElementById("graph-reset");
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
        vx: 0,
        vy: 0,
        radius: sizeRadius[node.size] || sizeRadius[1],
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

    /* ---------------- 领域锚点（宽屏铺开 / 窄屏聚拢） ---------------- */
    const anchorById = new Map();
    let layoutMode = null;

    // 确定性抖动，保证每次加载布局一致
    const rand = (seed) => {
        const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return value - Math.floor(value);
    };

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
        state.userAdjusted = false;
    }

    /* ---------------- 力导向模拟 ---------------- */
    const TARGET_LINK = 138;
    const REPULSE = 5400;

    function simulate(steps) {
        const n = nodes.length;
        for (let step = 0; step < steps; step += 1) {
            const fx = new Float64Array(n);
            const fy = new Float64Array(n);

            // 节点间斥力 + 碰撞
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

            // 边：弹簧
            edges.forEach((edge) => {
                const a = edge.a;
                const b = edge.b;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy) || 1;
                const force = (dist - TARGET_LINK) * 0.022;
                const ux = dx / dist;
                const uy = dy / dist;
                const i = a.index;
                const j = b.index;
                fx[i] += ux * force;
                fy[i] += uy * force;
                fx[j] -= ux * force;
                fy[j] -= uy * force;
            });

            // 领域锚点 + 轻微向心
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

    /* ---------------- 视口 ---------------- */
    const state = {
        scale: 1,
        tx: 0,
        ty: 0,
        filter: "all",
        query: "",
        hoverId: null,
        dragging: null,
        panning: null,
        pinch: null,
        userAdjusted: false,
        dpr: 1,
        width: 0,
        height: 0,
    };

    function worldToScreen(x, y) {
        return { x: x * state.scale + state.tx, y: y * state.scale + state.ty };
    }

    function screenToWorld(x, y) {
        return { x: (x - state.tx) / state.scale, y: (y - state.ty) / state.scale };
    }

    function fitView() {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        nodes.forEach((node) => {
            minX = Math.min(minX, node.x - node.radius);
            minY = Math.min(minY, node.y - node.radius);
            maxX = Math.max(maxX, node.x + node.radius);
            maxY = Math.max(maxY, node.y + node.radius);
        });
        const padX = state.width >= 700 ? 76 : 42;
        const padY = state.width >= 700 ? 62 : 44;
        const contentW = Math.max(1, maxX - minX);
        const contentH = Math.max(1, maxY - minY);
        const scale = Math.min(
            (state.width - padX * 2) / contentW,
            (state.height - padY * 2) / contentH,
            1.7
        );
        state.scale = Math.max(0.3, scale);
        state.tx = state.width / 2 - ((minX + maxX) / 2) * state.scale;
        state.ty = state.height / 2 - ((minY + maxY) / 2) * state.scale;
        state.userAdjusted = false;
    }

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
        if (nextMode !== layoutMode) buildLayout(nextMode);
        if (!state.userAdjusted) fitView();
        draw();
    }

    /* ---------------- 配色 ---------------- */
    function themePalette() {
        const attr = root.dataset.theme;
        const dark = attr === "dark" || (attr !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        return {
            dark,
            label: dark ? "#e9f1ff" : "#0b1220",
            labelMuted: dark ? "rgba(147,167,196,0.62)" : "rgba(91,107,133,0.66)",
            edge: dark ? 0.34 : 0.26,
            outer: dark ? 0.5 : 0.42,
            innerMix: dark ? 0.56 : 0.32,
            halo: dark ? 0.16 : 0.12,
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
        return `rgb(${Math.round(r + (tr - r) * amount)}, ${Math.round(g + (tg - g) * amount)}, ${Math.round(b + (tb - b) * amount)})`;
    }

    function domainColor(node) {
        const domain = domainById.get(node.domain);
        return domain ? domain.color : "#38bdf8";
    }

    /* ---------------- 命中测试 ---------------- */
    function nodeAt(px, py) {
        const world = screenToWorld(px, py);
        let found = null;
        let bestDistance = Infinity;
        nodes.forEach((node) => {
            const distance = Math.hypot(node.x - world.x, node.y - world.y);
            const tolerance = node.radius + Math.max(4, 10 / state.scale);
            if (distance <= tolerance && distance < bestDistance) {
                bestDistance = distance;
                found = node;
            }
        });
        return found;
    }

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

    /* ---------------- 绘制 ---------------- */
    function draw() {
        const palette = themePalette();
        const { anyFilter, matchMap } = visibleState();
        const hover = state.hoverId ? byId.get(state.hoverId) : null;
        const hoverNeighbors = hover ? neighbors.get(hover.id) : new Set();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        ctx.translate(state.tx, state.ty);
        ctx.scale(state.scale, state.scale);

        // 领域底色光晕
        domainList.forEach((domain) => {
            const anchor = anchorById.get(domain.id);
            if (!anchor) return;
            const gradient = ctx.createRadialGradient(anchor.x, anchor.y, 10, anchor.x, anchor.y, 230);
            gradient.addColorStop(0, rgba(domain.color, palette.halo));
            gradient.addColorStop(1, rgba(domain.color, 0));
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(anchor.x, anchor.y, 230, 0, Math.PI * 2);
            ctx.fill();
        });

        // 边
        edges.forEach((edge) => {
            const a = edge.a;
            const b = edge.b;
            const matchA = matchMap.get(a.id);
            const matchB = matchMap.get(b.id);
            let alpha = palette.edge;
            if (anyFilter) alpha = matchA && matchB ? 0.5 : 0.07;
            if (hover) {
                const connected = a.id === hover.id || b.id === hover.id;
                alpha = connected ? 0.85 : 0.05;
            }
            const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            gradient.addColorStop(0, rgba(domainColor(a), alpha));
            gradient.addColorStop(1, rgba(domainColor(b), alpha));
            ctx.strokeStyle = gradient;
            ctx.lineWidth = (hover && (a.id === hover.id || b.id === hover.id) ? 1.9 : 1.05) / state.scale;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        });

        // 节点
        nodes.forEach((node) => {
            const color = domainColor(node);
            const matched = matchMap.get(node.id);
            const related = hover ? node.id === hover.id || hoverNeighbors.has(node.id) : false;
            let alpha = 1;
            if (anyFilter && !matched) alpha = 0.18;
            if (hover && !related) alpha = 0.16;
            if (hover && related) alpha = 1;

            const radius = node.radius * (hover && node.id === hover.id ? 1.12 : 1);
            ctx.globalAlpha = alpha;

            // 外圈柔光
            const glow = ctx.createRadialGradient(node.x, node.y, radius * 0.2, node.x, node.y, radius * 2.6);
            glow.addColorStop(0, rgba(color, palette.dark ? 0.3 : 0.22));
            glow.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius * 2.6, 0, Math.PI * 2);
            ctx.fill();

            // 主体：亮心玻璃球
            const body = ctx.createRadialGradient(
                node.x - radius * 0.35,
                node.y - radius * 0.4,
                radius * 0.15,
                node.x,
                node.y,
                radius
            );
            body.addColorStop(0, mix(color, "#ffffff", palette.innerMix));
            body.addColorStop(0.55, color);
            body.addColorStop(1, mix(color, palette.dark ? "#05080f" : "#f4f8ff", palette.dark ? 0.35 : 0.18));
            ctx.fillStyle = body;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
            ctx.fill();

            // 描边
            ctx.strokeStyle = palette.dark ? rgba("#ffffff", 0.55) : rgba("#0b1220", 0.3);
            ctx.lineWidth = 1.1 / state.scale;
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius - 0.6 / state.scale, 0, Math.PI * 2);
            ctx.stroke();

            // hub 内圈装饰
            if (node.size === 3) {
                ctx.strokeStyle = rgba("#ffffff", palette.dark ? 0.34 : 0.5);
                ctx.lineWidth = 0.9 / state.scale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius * 0.55, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 被搜索匹配的节点加一个外环
            if (anyFilter && matched) {
                ctx.strokeStyle = rgba(color, 0.9);
                ctx.lineWidth = 1.6 / state.scale;
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 5 / state.scale, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
        });

        // 标签在屏幕坐标里画，字号不随缩放变化；按重要性排序并做简单避让
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        const compact = state.width < 700;
        const labelRank = (node) => {
            if (hover && node.id === hover.id) return 100;
            if (anyFilter && matchMap.get(node.id)) return 80;
            return node.size * 10;
        };
        const placedLabels = [];
        const overlaps = (a, b) =>
            a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;

        [...nodes].sort((a, b) => labelRank(b) - labelRank(a)).forEach((node) => {
            const matched = matchMap.get(node.id);
            const related = hover ? node.id === hover.id || hoverNeighbors.has(node.id) : false;

            const isHub = node.size === 3;
            const show =
                related ||
                (anyFilter && matched) ||
                isHub ||
                (!compact && (node.size === 2 || state.scale > 1.02)) ||
                (compact && node.size === 2 && state.scale > 1.12);
            if (!show) return;

            const screen = worldToScreen(node.x, node.y);
            const radius = node.radius * state.scale;
            const fontSize = node.size === 3 ? 13.5 : node.size === 2 ? 12 : 11;
            const offset = radius + 7;
            const important = related || (anyFilter && matched);

            ctx.font = `${node.size >= 3 ? 600 : 500} ${fontSize}px ${fontStack}`;
            const textWidth = ctx.measureText(node.label).width;
            const rect = {
                x: screen.x - textWidth / 2 - 4,
                y: screen.y + offset - 2,
                w: textWidth + 8,
                h: fontSize + 6,
            };
            if (!important && placedLabels.some((other) => overlaps(rect, other))) return;

            let alpha = 1;
            if (anyFilter && !matched) alpha = 0.2;
            if (hover && !related) alpha = 0.14;

            ctx.globalAlpha = alpha;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.lineWidth = 3;
            ctx.strokeStyle = palette.bg;
            ctx.strokeText(node.label, screen.x, screen.y + offset);
            ctx.fillStyle = important || (anyFilter && matched) ? palette.label : palette.labelMuted;
            ctx.fillText(node.label, screen.x, screen.y + offset);
            ctx.globalAlpha = 1;
            placedLabels.push(rect);
        });

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /* ---------------- 交互 ---------------- */
    let rafId = 0;
    let simulateUntil = 0;

    function animate(now) {
        simulate(2);
        draw();
        if (now < simulateUntil) {
            rafId = window.requestAnimationFrame(animate);
        } else {
            rafId = 0;
        }
    }

    function reheat(duration = 500) {
        simulateUntil = performance.now() + duration;
        if (!rafId) rafId = window.requestAnimationFrame(animate);
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

    function stagePoint(event) {
        const rect = stage.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    canvas.addEventListener(
        "pointerdown",
        (event) => {
            const point = stagePoint(event);
            const pointers = state.pointers || (state.pointers = new Map());
            pointers.set(event.pointerId, point);
            canvas.setPointerCapture(event.pointerId);

            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                state.pinch = {
                    startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
                    startScale: state.scale,
                    startTx: state.tx,
                    startTy: state.ty,
                    startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                };
                state.dragging = null;
                state.panning = null;
                return;
            }

            const node = nodeAt(point.x, point.y);
            if (node) {
                state.dragging = { node, startX: point.x, startY: point.y, moved: false };
                state.panning = null;
                hideTooltip();
            } else {
                state.panning = { startX: point.x, startY: point.y, tx: state.tx, ty: state.ty };
                state.dragging = null;
            }
            canvas.classList.add("is-dragging");
        },
        { passive: true }
    );

    canvas.addEventListener(
        "pointermove",
        (event) => {
            const point = stagePoint(event);
            if (state.pointers && state.pointers.has(event.pointerId)) {
                state.pointers.set(event.pointerId, point);
            }

            if (state.pinch && state.pointers.size >= 2) {
                const [a, b] = [...state.pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                const scale = clamp(state.pinch.startScale * (dist / state.pinch.startDist), 0.3, 2.8);
                // 用初始视口反推：世界点 = (初始中点 - 初始平移) / 初始缩放
                const anchorWorld = {
                    x: (state.pinch.startMid.x - state.pinch.startTx) / state.pinch.startScale,
                    y: (state.pinch.startMid.y - state.pinch.startTy) / state.pinch.startScale,
                };
                state.scale = scale;
                state.tx = mid.x - anchorWorld.x * scale;
                state.ty = mid.y - anchorWorld.y * scale;
                state.userAdjusted = true;
                draw();
                return;
            }

            if (state.dragging) {
                if (
                    Math.abs(point.x - state.dragging.startX) > 4 ||
                    Math.abs(point.y - state.dragging.startY) > 4
                ) {
                    state.dragging.moved = true;
                }
                const world = screenToWorld(point.x, point.y);
                state.dragging.node.x = world.x;
                state.dragging.node.y = world.y;
                state.dragging.node.vx = 0;
                state.dragging.node.vy = 0;
                draw();
                return;
            }

            if (state.panning) {
                state.tx = state.panning.tx + (point.x - state.panning.startX);
                state.ty = state.panning.ty + (point.y - state.panning.startY);
                state.userAdjusted = true;
                draw();
                return;
            }

            if (event.pointerType === "mouse") {
                const node = nodeAt(point.x, point.y);
                const nextHover = node ? node.id : null;
                if (nextHover !== state.hoverId) {
                    state.hoverId = nextHover;
                    draw();
                }
                if (node) {
                    updateTooltip(node, point.x, point.y);
                    canvas.classList.add("is-hovering");
                } else {
                    hideTooltip();
                    canvas.classList.remove("is-hovering");
                }
            }
        },
        { passive: true }
    );

    function endPointer(event) {
        const point = stagePoint(event);
        if (state.pointers) state.pointers.delete(event.pointerId);

        if (state.dragging) {
            const { node, moved } = state.dragging;
            state.dragging = null;
            if (!moved && node.url) {
                window.location.href = node.url;
                return;
            }
            reheat(600);
        }
        if (state.panning) {
            state.panning = null;
            state.userAdjusted = true;
        }
        if (state.pointers && state.pointers.size < 2) state.pinch = null;
        canvas.classList.remove("is-dragging");

        if (event.pointerType === "mouse") {
            const node = nodeAt(point.x, point.y);
            state.hoverId = node ? node.id : null;
            if (node) updateTooltip(node, point.x, point.y);
            else hideTooltip();
            draw();
        } else {
            hideTooltip();
        }
    }

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("pointerleave", () => {
        if (state.pointers && state.pointers.size === 0) {
            state.hoverId = null;
            hideTooltip();
            draw();
        }
    });

    canvas.addEventListener(
        "wheel",
        (event) => {
            event.preventDefault();
            const point = stagePoint(event);
            const world = screenToWorld(point.x, point.y);
            const factor = Math.exp(-event.deltaY * 0.0015);
            const nextScale = clamp(state.scale * factor, 0.3, 2.8);
            state.scale = nextScale;
            state.tx = point.x - world.x * nextScale;
            state.ty = point.y - world.y * nextScale;
            state.userAdjusted = true;
            draw();
        },
        { passive: false }
    );

    /* ---------------- 筛选与搜索 ---------------- */
    const chips = [...document.querySelectorAll(".graph-chip")];

    function applyFilterUI() {
        chips.forEach((chip) => {
            const active = chip.dataset.filter === state.filter;
            chip.classList.toggle("is-active", active);
            chip.setAttribute("aria-pressed", active ? "true" : "false");
        });
        const { anyFilter, matchedCount } = visibleState();
        emptyEl.hidden = !(anyFilter && matchedCount === 0);
        draw();
    }

    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            const value = chip.dataset.filter || "all";
            state.filter = value;
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
        fitView();
        applyFilterUI();
    });

    /* ---------------- 主题联动 ---------------- */
    new MutationObserver(() => draw()).observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });

    /* ---------------- 初始化 ---------------- */
    function init() {
        resize();
        // 首帧画完再淡入
        window.requestAnimationFrame(() => {
            draw();
            shell.classList.add("is-ready");
        });
    }

    if ("ResizeObserver" in window) {
        new ResizeObserver(resize).observe(stage);
    } else {
        window.addEventListener("resize", resize);
    }

    init();
})();
