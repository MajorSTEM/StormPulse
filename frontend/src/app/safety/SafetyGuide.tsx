"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { SAFETY_SECTIONS } from "@/lib/safetyContent";

// ── "Myth or Fact?" self-test ────────────────────────────────────────────────
// Guessing commits the reader (they now need the answer), and the testing
// effect makes the safety facts stick far better than reading alone.
interface QuizItem {
  statement: string;
  isMyth: boolean;
  explain: string;
  sectionId: string;
  sectionLabel: string;
}

const QUIZ: QuizItem[] = [
  {
    statement: "Running a generator in the garage is fine as long as the door is open.",
    isMyth: true,
    explain: "An open door does not clear carbon monoxide — it builds up and drifts indoors. CO from generators kills more people after storms than many storms do.",
    sectionId: "generators", sectionLabel: "Generators",
  },
  {
    statement: "A downed power line that isn't sparking or humming can still kill you.",
    isMyth: false,
    explain: "Energized lines are often completely silent and still — and they can re-energize without warning as crews restore circuits.",
    sectionId: "lines", sectionLabel: "Downed lines",
  },
  {
    statement: "Any extension cord that reaches and fits the plug can safely run a refrigerator.",
    isMyth: true,
    explain: "Undersized cords overheat invisibly and can ignite. Heavy loads need 14 AWG or lower (thicker) — the number is printed on the jacket.",
    sectionId: "cords", sectionLabel: "Extension cords",
  },
  {
    statement: "If the wires ripped off your house in the storm, NIPSCO repairs that for free before reconnecting you.",
    isMyth: true,
    explain: "The weatherhead, mast, and meter base are the homeowner's equipment. A licensed electrician must repair them BEFORE the utility can reconnect — the #1 reason a house stays dark after the street comes back.",
    sectionId: "weatherhead", sectionLabel: "Weatherhead",
  },
  {
    statement: "Near a downed line you should shuffle away with small steps instead of running.",
    isMyth: false,
    explain: "Electricity spreads through the ground in rings (step potential). A long stride can put a lethal voltage difference between your two feet.",
    sectionId: "lines", sectionLabel: "Downed lines",
  },
  {
    statement: "During a storm event, the utility may send workers door-to-door to collect immediate payment.",
    isMyth: true,
    explain: "Never. 'Pay right now or be disconnected' is always a scam — utilities don't collect at the door, and none accept gift cards or wire transfers.",
    sectionId: "scams", sectionLabel: "Scams",
  },
  {
    statement: "During a declared emergency, Indiana gas stations can legally charge whatever the market will bear.",
    isMyth: true,
    explain: "Indiana law (IC 4-6-9.1) restricts unconscionable fuel pricing during a declared emergency. Photograph the sign and your receipt, then report it to the Attorney General: indianaconsumer.com or 1-800-382-5516.",
    sectionId: "gouging", sectionLabel: "Price gouging",
  },
  {
    statement: "A full, unopened freezer keeps food safe for about 48 hours without power.",
    isMyth: false,
    explain: "About 48 hours full, 24 half-full — if the door stays shut. The fridge only buys you ~4 hours.",
    sectionId: "home", sectionLabel: "Food & home",
  },
];

function QuizDeck() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<null | boolean>(null); // user's "is myth" guess
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = QUIZ[index];
  const correct = picked !== null && picked === q.isMyth;

  const next = () => {
    if (index + 1 >= QUIZ.length) setDone(true);
    else { setIndex(index + 1); setPicked(null); }
  };

  if (done) {
    const verdict =
      score === QUIZ.length ? "Perfect. You're the neighbor everyone should be asking."
      : score >= 5 ? "Better than most — the sections below fill the last gaps."
      : score >= 3 ? "About average. The misses above are the ones that hurt people — worth five minutes below."
      : "Most people miss these. That's exactly why this guide exists — start with section 1.";
    return (
      <div className="border-2 border-[#211d18] bg-white/60 p-5">
        <p className="text-[11px] uppercase tracking-[0.18em] font-sans font-semibold text-[#8a6a3a]">
          Your result
        </p>
        <p className="text-3xl font-bold mt-1">
          {score} / {QUIZ.length}
        </p>
        <p className="mt-2 text-[16px]">{verdict}</p>
        <button
          onClick={() => { setIndex(0); setPicked(null); setScore(0); setDone(false); }}
          className="mt-3 text-[13px] font-sans underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]"
        >
          Take it again
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-[#211d18] bg-white/60 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[11px] uppercase tracking-[0.18em] font-sans font-semibold text-[#8a6a3a]">
          Myth or fact?
        </p>
        <p className="text-[12px] font-sans text-[#6d675c] tabular-nums">
          {index + 1} of {QUIZ.length}
        </p>
      </div>

      <p className="mt-3 text-[18px] leading-snug font-bold">&ldquo;{q.statement}&rdquo;</p>

      {picked === null ? (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => { setPicked(true); if (q.isMyth) setScore(s => s + 1); }}
            className="flex-1 border-2 border-[#a2422e] text-[#a2422e] font-sans font-bold text-sm py-2.5 hover:bg-[#a2422e] hover:text-[#f6f3ec] transition"
          >
            MYTH
          </button>
          <button
            onClick={() => { setPicked(false); if (!q.isMyth) setScore(s => s + 1); }}
            className="flex-1 border-2 border-[#3d5a3d] text-[#3d5a3d] font-sans font-bold text-sm py-2.5 hover:bg-[#3d5a3d] hover:text-[#f6f3ec] transition"
          >
            FACT
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className={`font-sans font-bold text-sm ${correct ? "text-[#3d5a3d]" : "text-[#a2422e]"}`}>
            {correct ? "✓ Right." : "✗ Not quite."}{" "}
            <span className="font-normal text-[#211d18]">
              That&rsquo;s a {q.isMyth ? "myth" : "fact"}.
            </span>
          </p>
          <p className="mt-1.5 text-[15px]">{q.explain}</p>
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <a
              href={`#${q.sectionId}`}
              className="text-[13px] font-sans underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]"
            >
              More on this → {q.sectionLabel}
            </a>
            <button
              onClick={next}
              className="border-2 border-[#211d18] font-sans font-bold text-sm px-5 py-1.5 hover:bg-[#211d18] hover:text-[#f6f3ec] transition"
            >
              {index + 1 >= QUIZ.length ? "See my score" : "Next →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat pulls — magazine-style anchors for scanners ─────────────────────────
const STAT_PULLS: Record<string, { big: string; small: string }> = {
  lines: { big: "35 ft", small: "minimum distance from any downed line — silent lines included" },
  cords: { big: "14 AWG", small: "or lower (thicker) for any cord feeding a fridge, sump pump, or heater" },
  scams: { big: "$0", small: "what a real utility worker will ever collect at your door" },
  gouging: { big: "IC 4-6-9.1", small: "the Indiana law that makes emergency fuel gouging reportable, not just outrageous" },
};

// ── Collapsible section cards (progressive disclosure) ───────────────────────
function SectionCard({
  section, number, open, onToggle,
}: {
  section: (typeof SAFETY_SECTIONS)[number];
  number: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section id={section.id} className="scroll-mt-16 border-b border-[#d8d2c4]">
      <button
        onClick={onToggle}
        className="w-full text-left py-5 group"
        aria-expanded={open}
      >
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[11px] uppercase tracking-[0.18em] font-sans font-semibold text-[#8a6a3a]">
            {String(number).padStart(2, "0")} · {section.title}
          </p>
          <span className="font-sans text-xl leading-none text-[#8a6a3a] group-hover:text-[#211d18] transition">
            {open ? "−" : "+"}
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight mt-1 leading-tight group-hover:underline underline-offset-4 decoration-[#b0aa9a]">
          {section.headline}
        </h2>
        {!open && <p className="mt-1.5 text-[15px] italic text-[#6d675c]">{section.hook}</p>}
      </button>

      {open && (
        <div className="pb-6 space-y-4 text-[16px]">
          <p className="italic text-[#6d675c] text-[15px]">{section.tagline}</p>
          {section.items.map((item, j) =>
            item.myth ? (
              <div key={j}>
                <p><strong className="text-[#a2422e]">&ldquo;{item.myth}&rdquo;</strong></p>
                <p className="mt-1 pl-4 border-l-2 border-[#d8d2c4]">{item.fact}</p>
              </div>
            ) : item.critical ? (
              <div key={j} className="border-l-4 border-[#a2422e] pl-4 py-0.5">
                <p><strong>Don&rsquo;t skip this — </strong>{item.fact}</p>
              </div>
            ) : (
              <p key={j}>{item.fact}</p>
            )
          )}
        </div>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SafetyGuide() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
  };

  const toggle = (id: string) => {
    setOpenId(prev => (prev === id ? null : id));
  };

  // Quiz "More on this" links should also expand the target section
  const handleAnchorExpand = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("a[href^='#']");
    if (target) {
      const id = target.getAttribute("href")!.slice(1);
      if (SAFETY_SECTIONS.some(s => s.id === id)) setOpenId(id);
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      onClick={handleAnchorExpand}
      className="fixed inset-0 overflow-y-auto scroll-smooth bg-[#f6f3ec] text-[#211d18]"
    >
      {/* Sticky masthead + reading progress */}
      <div className="sticky top-0 z-20 bg-[#f6f3ec]/95 backdrop-blur-sm border-b border-[#d8d2c4]">
        <div className="max-w-2xl mx-auto px-5 py-2.5 flex items-baseline justify-between gap-4 text-sm">
          <span className="font-serif font-bold tracking-tight">Storm &amp; Outage Safety</span>
          <span className="flex gap-5 text-[13px] font-sans">
            <a href="#contents" className="underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]">
              Sections
            </a>
            <Link href="/" className="underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]">
              Live map
            </Link>
          </span>
        </div>
        <div className="h-[3px] bg-[#e7e2d5]">
          <div className="h-full bg-[#8a6a3a] transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <article className="max-w-2xl mx-auto px-5 pb-20 font-serif leading-relaxed">
        {/* Masthead */}
        <header className="pt-9 pb-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a6a3a] font-sans font-semibold">
            A StormPulse field guide · Northwest Indiana &amp; Chicagoland
          </p>
          <h1 className="text-4xl font-bold tracking-tight mt-1.5 leading-tight">
            Most storm deaths happen <em>after</em> the storm.
          </h1>
          <p className="mt-3 text-[17px]">
            The generator in the garage. The extension cord that was never meant to
            run a refrigerator. The line across the alley that looks dead. After the
            August 11 derecho put 300,000+ homes in the dark, these are the mistakes
            that hurt people — and every one of them is avoidable.
          </p>
        </header>

        {/* Quiz — the hook */}
        <QuizDeck />

        {/* Emergency notice */}
        <div className="mt-6 border-l-4 border-[#a2422e] pl-4 py-1">
          <p className="text-[15px]">
            <strong>If a line is down or someone is hurt:</strong> call{" "}
            <a href="tel:911" className="font-bold underline underline-offset-2">911</a>{" "}
            first, then NIPSCO{" "}
            <a href="tel:18004647726" className="underline underline-offset-2 whitespace-nowrap">1-800-4NIPSCO</a>{" "}
            or ComEd{" "}
            <a href="tel:18003347661" className="underline underline-offset-2 whitespace-nowrap">1-800-334-7661</a>.
          </p>
        </div>

        {/* Sections — tap a headline to open */}
        <div id="contents" className="mt-10 scroll-mt-16">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#6d675c] font-sans font-semibold border-b-2 border-[#211d18] pb-1.5">
            The guide — tap a headline
          </p>
          {SAFETY_SECTIONS.map((section, i) => (
            <div key={section.id}>
              <SectionCard
                section={section}
                number={i + 1}
                open={openId === section.id}
                onToggle={() => toggle(section.id)}
              />
              {STAT_PULLS[section.id] && (
                <aside className="py-5 border-b border-[#d8d2c4] flex items-baseline gap-4">
                  <span className="text-4xl font-bold tracking-tight text-[#8a6a3a] whitespace-nowrap">
                    {STAT_PULLS[section.id].big}
                  </span>
                  <span className="text-[14px] text-[#6d675c] font-sans leading-snug">
                    {STAT_PULLS[section.id].small}
                  </span>
                </aside>
              )}
            </div>
          ))}
        </div>

        {/* Closing */}
        <footer className="mt-10">
          <p className="text-[16px]">
            Check on the neighbors you don&rsquo;t hear from. The people most at risk
            in a long outage — the elderly, anyone on powered medical equipment —
            are usually the quietest about it.
          </p>
          <p className="mt-5 text-[13px] text-[#6d675c] font-sans leading-relaxed">
            Compiled from public guidance by the U.S. Consumer Product Safety
            Commission, the National Fire Protection Association, FDA/USDA
            food-safety programs, the Electrical Safety Foundation, and NIPSCO/ComEd
            customer safety materials. StormPulse is an independent project, not
            affiliated with NOAA, the NWS, FEMA, NIPSCO, or ComEd.
          </p>
          <p className="mt-4 text-[15px]">
            <Link href="/" className="underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]">
              ← Back to the live storm &amp; outage map
            </Link>
          </p>
        </footer>
      </article>
    </div>
  );
}
