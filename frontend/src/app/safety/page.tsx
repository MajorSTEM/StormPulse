import Link from "next/link";
import type { Metadata } from "next";
import { SAFETY_SECTIONS } from "@/lib/safetyContent";

export const metadata: Metadata = {
  title: "Storm & Outage Safety — a field guide for Northwest Indiana",
  description:
    "Practical safety during power outages: downed lines, generators, extension cords, weatherhead repairs, utility impersonators, and keeping food and family safe.",
};

// The map app locks html/body overflow, so this page carries its own scroll
// container (fixed inset-0 + overflow-y-auto).
export default function SafetyPage() {
  return (
    <div className="fixed inset-0 overflow-y-auto scroll-smooth bg-[#f6f3ec] text-[#211d18]">
      {/* Slim sticky masthead — always a way back, from anywhere on the page */}
      <div className="sticky top-0 z-20 bg-[#f6f3ec]/95 backdrop-blur-sm border-b border-[#d8d2c4]">
        <div className="max-w-2xl mx-auto px-5 py-2.5 flex items-baseline justify-between gap-4 text-sm">
          <span className="font-serif font-bold tracking-tight">Storm &amp; Outage Safety</span>
          <span className="flex gap-5 text-[13px]">
            <a href="#contents" className="underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]">
              Contents
            </a>
            <Link href="/" className="underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]">
              Live map
            </Link>
          </span>
        </div>
      </div>

      <article className="max-w-2xl mx-auto px-5 pb-20 font-serif leading-relaxed">
        {/* Masthead */}
        <header className="pt-10 pb-6 border-b-2 border-[#211d18]">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#8a6a3a] font-sans font-semibold">
            A StormPulse field guide
          </p>
          <h1 className="text-4xl font-bold tracking-tight mt-1.5 leading-tight">
            Storm &amp; Outage Safety
          </h1>
          <p className="text-[13px] text-[#6d675c] mt-2 font-sans">
            Northwest Indiana &amp; Chicagoland · updated August 2026
          </p>
        </header>

        {/* Intro — a person wrote this, for a reason */}
        <p className="mt-6 text-[17px]">
          This guide was put together after the August 11 derecho knocked out power
          to more than 300,000 homes across NIPSCO&rsquo;s territory — the largest
          outage in the company&rsquo;s history. Most of what hurts people in the days
          after a storm isn&rsquo;t the storm. It&rsquo;s the generator in the garage, the
          extension cord that was never meant to run a refrigerator, the line across
          the alley that looks dead. Everything below comes from CPSC, NFPA, FDA,
          and utility safety guidance; none of it is folklore.
        </p>

        {/* Emergency notice — plain and unmissable, not a designed "banner" */}
        <div className="mt-6 border-l-4 border-[#a2422e] pl-4 py-1">
          <p className="text-[15px]">
            <strong>If a line is down or someone is hurt:</strong> call{" "}
            <a href="tel:911" className="font-bold underline underline-offset-2">911</a>{" "}
            first. Then the utility — NIPSCO{" "}
            <a href="tel:18004647726" className="underline underline-offset-2 whitespace-nowrap">1-800-4NIPSCO</a>,
            ComEd{" "}
            <a href="tel:18003347661" className="underline underline-offset-2 whitespace-nowrap">1-800-334-7661</a>.
            This page is general guidance; emergency officials outrank it.
          </p>
        </div>

        {/* Contents */}
        <nav id="contents" className="mt-10 scroll-mt-14">
          <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#6d675c] font-sans font-semibold border-b border-[#d8d2c4] pb-1.5">
            In this guide
          </h2>
          <ol className="mt-3 space-y-1.5 text-[16px]">
            {SAFETY_SECTIONS.map((section, i) => (
              <li key={section.id} className="flex gap-3">
                <span className="text-[#8a6a3a] tabular-nums w-4 text-right flex-shrink-0">{i + 1}.</span>
                <a
                  href={`#${section.id}`}
                  className="underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18]"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        {SAFETY_SECTIONS.map((section, i) => (
          <section key={section.id} id={section.id} className="mt-12 scroll-mt-14">
            <div className="flex items-baseline justify-between gap-4 border-b border-[#d8d2c4] pb-2">
              <h2 className="text-2xl font-bold tracking-tight">
                <span className="text-[#8a6a3a]">{i + 1}.</span> {section.title}
              </h2>
              <a
                href="#contents"
                className="text-[12px] font-sans text-[#6d675c] underline underline-offset-2 decoration-[#b0aa9a] hover:decoration-[#211d18] whitespace-nowrap"
              >
                ↑ contents
              </a>
            </div>
            <p className="mt-2 text-[15px] italic text-[#6d675c]">{section.tagline}</p>

            <div className="mt-4 space-y-4 text-[16px]">
              {section.items.map((item, j) =>
                item.myth ? (
                  <div key={j}>
                    <p>
                      <strong className="text-[#a2422e]">&ldquo;{item.myth}&rdquo;</strong>
                    </p>
                    <p className="mt-1 pl-4 border-l-2 border-[#d8d2c4]">
                      {item.fact}
                    </p>
                  </div>
                ) : item.critical ? (
                  <div key={j} className="border-l-4 border-[#a2422e] pl-4 py-0.5">
                    <p>
                      <strong>Don&rsquo;t skip this — </strong>
                      {item.fact}
                    </p>
                  </div>
                ) : (
                  <p key={j}>{item.fact}</p>
                )
              )}
            </div>
          </section>
        ))}

        {/* Closing */}
        <footer className="mt-14 pt-5 border-t-2 border-[#211d18]">
          <p className="text-[15px]">
            Check on the neighbors you don&rsquo;t hear from. The people most at risk in
            a long outage — the elderly, anyone on powered medical equipment — are
            usually the quietest about it.
          </p>
          <p className="mt-4 text-[13px] text-[#6d675c] font-sans leading-relaxed">
            Compiled from public guidance by the U.S. Consumer Product Safety
            Commission, the National Fire Protection Association, FDA/USDA
            food-safety programs, the Electrical Safety Foundation, and
            NIPSCO/ComEd customer safety materials. StormPulse is an independent
            project, not affiliated with NOAA, the NWS, FEMA, NIPSCO, or ComEd.
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
