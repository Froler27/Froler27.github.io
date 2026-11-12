/* 首页 Hero：初始化 WebGL 背景，并跟随站点深浅主题切换配色 */
import { createHeroBackground } from "./hero-gl.js";

const canvas = document.getElementById("hero-bg");

if (canvas) {
    const root = document.documentElement;

    const parseColor = (value, fallback) => {
        const text = (value || "").trim();
        if (!text) return fallback;

        let match = text.match(/^#([0-9a-f]{3})$/i);
        if (match) {
            const hex = match[1];
            return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16) / 255);
        }

        match = text.match(/^#([0-9a-f]{6})$/i);
        if (match) {
            const hex = match[1];
            return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        }

        match = text.match(/^rgba?\(([^)]+)\)$/i);
        if (match) {
            const parts = match[1].split(/[\s,\/]+/).filter(Boolean).slice(0, 3);
            return parts.map((part) => {
                const number = parseFloat(part);
                return Number.isFinite(number) ? Math.min(1, Math.max(0, number / 255)) : 0;
            });
        }

        return fallback;
    };

    const readPalette = () => {
        const styles = getComputedStyle(root);
        return {
            accent: parseColor(styles.getPropertyValue("--accent"), [0.22, 0.741, 0.973]),
            accentDeep: parseColor(styles.getPropertyValue("--accent-deep"), [0.008, 0.518, 0.78]),
            accentBright: parseColor(styles.getPropertyValue("--accent-bright"), [0.49, 0.827, 0.988]),
        };
    };

    const currentTheme = () => {
        const theme = root.dataset.theme;
        if (theme === "dark" || theme === "light") return theme;
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };

    try {
        const background = createHeroBackground(canvas, {
            theme: currentTheme(),
            ...readPalette(),
        });

        background.start();

        new MutationObserver(() => {
            background.setTheme?.(currentTheme(), readPalette());
        }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

        window.addEventListener(
            "pagehide",
            () => {
                background.dispose?.();
            },
            { once: true }
        );
    } catch (error) {
        // WebGL 不可用时静默降级：CSS 背景与文字仍然完整
        canvas.style.display = "none";
        if (window.console && console.warn) console.warn("[hero] background disabled", error);
    }
}
