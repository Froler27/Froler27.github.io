/* 站点交互：滚动进度、导航态、入场动画、数字滚动、卡片光斑、主题切换过渡 */
(() => {
    const doc = document;
    const root = doc.documentElement;
    const body = doc.body;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    /* ---------- 1. 滚动：导航态 + 顶部进度条 ---------- */
    const progress = doc.querySelector(".scroll-progress");
    let scrollQueued = false;

    const onScroll = () => {
        scrollQueued = false;
        const y = window.scrollY || root.scrollTop || 0;
        body.classList.toggle("is-scrolled", y > 8);
        if (progress) {
            const max = root.scrollHeight - window.innerHeight;
            const ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
            progress.style.transform = `scaleX(${ratio})`;
        }
    };

    window.addEventListener(
        "scroll",
        () => {
            if (!scrollQueued) {
                scrollQueued = true;
                window.requestAnimationFrame(onScroll);
            }
        },
        { passive: true }
    );
    onScroll();

    /* ---------- 2. 入场动画 ---------- */
    const revealEls = Array.from(doc.querySelectorAll(".reveal"));
    if (!reduceMotion && "IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-in");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
        );
        revealEls.forEach((el) => observer.observe(el));
    } else {
        revealEls.forEach((el) => el.classList.add("is-in"));
    }

    /* ---------- 3. 首页数字滚动 ---------- */
    const counters = Array.from(doc.querySelectorAll(".stat-value[data-count]"));
    const runCounter = (el) => {
        const target = parseInt(el.dataset.count || "0", 10);
        if (!Number.isFinite(target) || reduceMotion) {
            el.textContent = String(target);
            return;
        }
        const duration = 1000;
        const start = performance.now();
        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(target * eased));
            if (t < 1) window.requestAnimationFrame(tick);
        };
        el.textContent = "0";
        window.requestAnimationFrame(tick);
    };

    if (counters.length) {
        if ("IntersectionObserver" in window && !reduceMotion) {
            const countObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            runCounter(entry.target);
                            countObserver.unobserve(entry.target);
                        }
                    });
                },
                { threshold: 0.6 }
            );
            counters.forEach((el) => countObserver.observe(el));
        } else {
            counters.forEach((el) => {
                el.textContent = el.dataset.count || el.textContent;
            });
        }
    }

    /* ---------- 4. 卡片光斑（跟随鼠标） ---------- */
    if (finePointer) {
        doc.querySelectorAll(".note-card").forEach((card) => {
            let queued = false;
            let lastEvent = null;
            card.addEventListener(
                "pointermove",
                (event) => {
                    lastEvent = event;
                    if (queued) return;
                    queued = true;
                    window.requestAnimationFrame(() => {
                        queued = false;
                        if (!lastEvent) return;
                        const rect = card.getBoundingClientRect();
                        if (!rect.width || !rect.height) return;
                        const x = ((lastEvent.clientX - rect.left) / rect.width) * 100;
                        const y = ((lastEvent.clientY - rect.top) / rect.height) * 100;
                        card.style.setProperty("--mx", `${x}%`);
                        card.style.setProperty("--my", `${y}%`);
                    });
                },
                { passive: true }
            );
        });
    }

    /* ---------- 5. 主题切换：压掉过渡闪动 ---------- */
    let themeTimer = 0;
    const softThemeSwitch = () => {
        root.classList.add("theme-switching");
        window.clearTimeout(themeTimer);
        themeTimer = window.setTimeout(() => root.classList.remove("theme-switching"), 120);
    };

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === "data-theme") softThemeSwitch();
        }
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    /* ---------- 6. 外链自动加安全属性（正文内 http 链接） ---------- */
    doc.querySelectorAll('.md-content a[href^="http"]').forEach((link) => {
        if (link.hostname && link.hostname !== window.location.hostname) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
    });

    /* ---------- 7. 可访问性兜底 ---------- */
    // 主题给标题锚点加了 aria-hidden，但它本身是可聚焦的链接；
    // 视觉上已经在未悬停时隐藏，无需再从辅助技术里隐藏（否则违反 aria-hidden-focus）。
    doc.querySelectorAll('a.anchor[aria-hidden="true"]').forEach((anchor) => {
        anchor.removeAttribute("aria-hidden");
        anchor.setAttribute("aria-label", "本节链接");
    });

    // 代码块内部若可横向滚动，需要能通过键盘聚焦滚动。
    const codeScrollables = Array.from(doc.querySelectorAll(".md-content pre > code, .md-content .chroma > code"));
    const syncCodeScroll = () => {
        codeScrollables.forEach((code) => {
            if (code.scrollWidth > code.clientWidth + 1) {
                if (!code.hasAttribute("tabindex")) {
                    code.setAttribute("tabindex", "0");
                    code.setAttribute("role", "region");
                    code.setAttribute("aria-label", "代码块，可横向滚动");
                }
            } else if (code.getAttribute("role") === "region" && code.dataset.autoA11y === "1") {
                code.removeAttribute("tabindex");
                code.removeAttribute("role");
                code.removeAttribute("aria-label");
            }
            if (code.hasAttribute("tabindex")) code.dataset.autoA11y = "1";
        });
    };
    window.addEventListener("load", syncCodeScroll);
    window.addEventListener("resize", syncCodeScroll, { passive: true });
})();
