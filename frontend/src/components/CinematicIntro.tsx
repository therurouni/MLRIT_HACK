import { useEffect, useRef, useState, useCallback } from "react";

const FRAME_COUNT = 192;
const SCROLL_PX_PER_FRAME = 8;
const framePath = (i: number) =>
    `/frames/ezgif-frame-${String(i).padStart(3, "0")}.jpg`;

interface CinematicIntroProps {
    onComplete: () => void;
}

export default function CinematicIntro({ onComplete }: CinematicIntroProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const framesRef = useRef<HTMLImageElement[]>([]);
    const currentFrameRef = useRef(0);
    const targetFrameRef = useRef(0);
    const rafRef = useRef<number>(0);

    const [loadProgress, setLoadProgress] = useState(0);
    const [ready, setReady] = useState(false);
    const [showCta, setShowCta] = useState(false);

    /* ── Draw a frame with "cover" behavior ──────────────── */
    const drawFrame = useCallback((index: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const img = framesRef.current[index];
        if (!img?.complete) return;

        const cw = canvas.width,
            ch = canvas.height;
        const iw = img.naturalWidth,
            ih = img.naturalHeight;
        const scale = Math.max(cw / iw, ch / ih);
        const dw = iw * scale,
            dh = ih * scale;
        const dx = (cw - dw) / 2,
            dy = (ch - dh) / 2;

        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(img, dx, dy, dw, dh);
    }, []);

    /* ── Resize canvas ──────────────────────────────────── */
    const resize = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (framesRef.current.length > 0) {
            drawFrame(currentFrameRef.current);
        }
    }, [drawFrame]);

    /* ── Preload all frames ─────────────────────────────── */
    useEffect(() => {
        let loaded = 0;
        const images: HTMLImageElement[] = [];

        for (let i = 1; i <= FRAME_COUNT; i++) {
            const img = new Image();
            img.src = framePath(i);
            img.onload = img.onerror = () => {
                loaded++;
                setLoadProgress(Math.round((loaded / FRAME_COUNT) * 100));
                if (loaded === FRAME_COUNT) {
                    framesRef.current = images;
                    setReady(true);
                }
            };
            images.push(img);
        }
    }, []);

    /* ── Setup after ready ──────────────────────────────── */
    useEffect(() => {
        if (!ready) return;

        resize();
        drawFrame(0);
        window.addEventListener("resize", resize);

        const onScroll = () => {
            const scrollY = window.scrollY;
            const maxScroll = FRAME_COUNT * SCROLL_PX_PER_FRAME;
            const raw = scrollY / maxScroll;
            const clamped = Math.min(Math.max(raw, 0), 1);
            targetFrameRef.current = Math.min(
                Math.floor(clamped * FRAME_COUNT),
                FRAME_COUNT - 1,
            );

            if (clamped >= 0.95) {
                setShowCta(true);
            } else {
                setShowCta(false);
            }
        };

        window.addEventListener("scroll", onScroll, { passive: true });

        // Render loop
        const tick = () => {
            const curr = currentFrameRef.current;
            const target = targetFrameRef.current;
            if (curr !== target) {
                currentFrameRef.current += curr < target ? 1 : -1;
                drawFrame(currentFrameRef.current);
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            window.removeEventListener("resize", resize);
            window.removeEventListener("scroll", onScroll);
            cancelAnimationFrame(rafRef.current);
        };
    }, [ready, resize, drawFrame]);

    /* ── Lock/unlock scroll ─────────────────────────────── */
    useEffect(() => {
        if (!ready) {
            document.documentElement.style.overflow = "hidden";
        } else {
            document.documentElement.style.overflow = "auto";
        }
        return () => {
            document.documentElement.style.overflow = "";
        };
    }, [ready]);

    const totalHeight =
        FRAME_COUNT * SCROLL_PX_PER_FRAME + window.innerHeight;

    return (
        <>
            {/* ── Preloader ────────────────────────────────── */}
            <div
                className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-7 transition-all duration-700 ${ready ? "opacity-0 pointer-events-none" : "opacity-100"}`}
                style={{ background: "var(--claude-bg)" }}
            >
                <div
                    className="font-mono text-[11px] font-light tracking-[4px] uppercase"
                    style={{ color: "var(--claude-text-2)" }}
                >
                    Loading Experience
                </div>
                <div
                    className="rounded-sm overflow-hidden"
                    style={{
                        width: "min(420px, 70vw)",
                        height: "2px",
                        background: "rgba(255,255,255,0.06)",
                    }}
                >
                    <div
                        className="h-full rounded-sm transition-[width] duration-150 ease-out"
                        style={{
                            width: `${loadProgress}%`,
                            background:
                                "linear-gradient(90deg, #D97757, #E8C9A0)",
                            boxShadow: "0 0 12px rgba(217,119,87,0.45)",
                        }}
                    />
                </div>
                <div
                    className="font-mono text-[13px] font-light tracking-[2px]"
                    style={{ color: "var(--claude-text)" }}
                >
                    {loadProgress} %
                </div>
            </div>

            {/* ── Grain overlay ────────────────────────────── */}
            <div
                className="fixed inset-0 z-[90] pointer-events-none"
                style={{
                    opacity: 0.035,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "repeat",
                    backgroundSize: "180px 180px",
                }}
            />

            {/* ── Canvas ───────────────────────────────────── */}
            <canvas
                ref={canvasRef}
                className="fixed top-0 left-0 z-[1]"
                style={{ width: "100vw", height: "100vh" }}
            />

            {/* ── Scroll spacer ────────────────────────────── */}
            <div className="relative z-0" style={{ height: totalHeight }} />

            {/* ── Progress bar ─────────────────────────────── */}
            <div
                className="fixed bottom-0 left-0 z-[100] h-[2px] transition-[width] duration-50"
                style={{
                    width: ready
                        ? `${Math.min((window.scrollY / (FRAME_COUNT * SCROLL_PX_PER_FRAME)) * 100, 100)}%`
                        : "0%",
                    background: "linear-gradient(90deg, #D97757, #E8C9A0)",
                    boxShadow: "0 0 8px rgba(217,119,87,0.45)",
                }}
            />
            {/* Progress bar is also updated via scroll — using a separate tiny component below */}
            <ProgressBar ready={ready} />

            {/* ── Scroll hint ──────────────────────────────── */}
            {ready && !showCta && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[95] flex flex-col items-center gap-2 animate-pulse">
                    <div
                        className="w-px h-9"
                        style={{ background: "var(--claude-text-2)" }}
                    />
                    <span
                        className="font-mono text-[10px] tracking-[3px] uppercase"
                        style={{ color: "var(--claude-text-2)" }}
                    >
                        Scroll
                    </span>
                </div>
            )}

            {/* ── CTA section ──────────────────────────────── */}
            <section
                className={`relative z-50 min-h-screen flex flex-col items-center justify-center text-center px-6 py-16 transition-all duration-[1200ms] ${showCta ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
                style={{ background: "var(--claude-bg)" }}
            >
                <div
                    className="font-mono text-[11px] font-light tracking-[5px] uppercase mb-7"
                    style={{ color: "var(--claude-text-2)" }}
                >
                    Welcome to SEFS
                </div>
                <h1
                    className="font-serif font-bold leading-[1.1] mb-12"
                    style={{
                        fontSize: "clamp(2.4rem, 7vw, 5.5rem)",
                        color: "var(--claude-text)",
                        maxWidth: "800px",
                    }}
                >
                    Organize Your Files
                    <br />
                    <em style={{ color: "#D97757" }}>Intelligently</em>
                </h1>
                <button
                    onClick={() => {
                        // Scroll back to top, reset overflow, and enter the app
                        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
                        onComplete();
                    }}
                    className="inline-flex items-center gap-2.5 font-mono text-[13px] font-normal tracking-[2px] uppercase px-10 py-3.5 rounded-full border cursor-pointer transition-all duration-400 group"
                    style={{
                        color: "var(--claude-text)",
                        borderColor: "var(--claude-accent)",
                        background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow =
                            "0 0 24px rgba(217,119,87,0.45), 0 0 60px rgba(217,119,87,0.15)";
                        e.currentTarget.style.background =
                            "rgba(217,119,87,0.06)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.background = "transparent";
                    }}
                >
                    Enter Site{" "}
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                        →
                    </span>
                </button>
            </section>
        </>
    );
}

/* ── Tiny reactive progress bar ───────────────────────── */
function ProgressBar({ ready }: { ready: boolean }) {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ready) return;

        const maxScroll = FRAME_COUNT * SCROLL_PX_PER_FRAME;

        const onScroll = () => {
            if (barRef.current) {
                const pct = Math.min((window.scrollY / maxScroll) * 100, 100);
                barRef.current.style.width = pct + "%";
            }
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [ready]);

    return (
        <div
            ref={barRef}
            className="fixed bottom-0 left-0 z-[100] h-[2px]"
            style={{
                width: "0%",
                background: "linear-gradient(90deg, #D97757, #E8C9A0)",
                boxShadow: "0 0 8px rgba(217,119,87,0.45)",
            }}
        />
    );
}
