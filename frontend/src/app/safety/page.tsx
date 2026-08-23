import Link from "next/link";
import type { Metadata } from "next";
import { SAFETY_SECTIONS } from "@/lib/safetyContent";

export const metadata: Metadata = {
  title: "StormPulse — Outage & Storm Safety Guide",
  description:
    "How to stay safe during power outages: downed lines, generator safety, extension cords, weatherhead repairs, utility impersonation scams, and food safety.",
};

export default function SafetyPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-200">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-gray-900/95 backdrop-blur border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">⛑</span>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white leading-tight truncate">
                Outage &amp; Storm Safety Guide
              </h1>
              <div className="text-[10px] text-gray-400">
                StormPulse · sourced from CPSC, NFPA, FDA, and utility guidance
              </div>
            </div>
          </div>
          <Link
            href="/"
            className="flex-shrink-0 text-xs font-bold uppercase tracking-wider border border-orange-700 text-orange-300 hover:bg-orange-950/50 rounded px-3 py-1.5 transition"
          >
            ← Live Map
          </Link>
        </div>
      </header>

      {/* Emergency banner */}
      <div className="bg-red-950/60 border-b border-red-800">
        <div className="max-w-4xl mx-auto px-4 py-2 text-xs text-red-200">
          <span className="font-bold text-red-300">Emergency or downed line?</span>{" "}
          Call <span className="font-bold">911</span> first, then NIPSCO{" "}
          <a href="tel:18004647726" className="underline font-bold">1-800-4NIPSCO</a>{" "}
          or ComEd <a href="tel:18003347661" className="underline font-bold">1-800-334-7661</a>.
          This page is general guidance — always follow emergency officials and your utility.
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Table of contents */}
        <nav className="flex flex-wrap gap-2 mb-8">
          {SAFETY_SECTIONS.map(section => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="text-xs border border-gray-700 hover:border-yellow-600 hover:text-yellow-200 rounded-full px-3 py-1.5 transition"
            >
              {section.icon} {section.title}
            </a>
          ))}
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {SAFETY_SECTIONS.map(section => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <div className="border-b border-gray-700 pb-2 mb-4">
                <h2 className="text-lg font-bold text-yellow-200">
                  {section.icon} {section.title}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{section.tagline}</p>
              </div>

              <div className="space-y-3">
                {section.items.map((item, i) =>
                  item.myth ? (
                    <div
                      key={i}
                      className="rounded-lg border border-gray-700 bg-gray-900/60 p-3 text-sm leading-relaxed"
                    >
                      <div>
                        <span className="text-red-400 font-bold uppercase text-xs tracking-wider">
                          Myth
                        </span>{" "}
                        <span className="text-gray-300 italic">{item.myth}</span>
                      </div>
                      <div className="mt-1.5">
                        <span className="text-green-400 font-bold uppercase text-xs tracking-wider">
                          Fact
                        </span>{" "}
                        <span className="text-gray-100">{item.fact}</span>
                      </div>
                    </div>
                  ) : item.critical ? (
                    <div
                      key={i}
                      className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm leading-relaxed"
                    >
                      <span className="text-red-400 font-bold">⚠ CRITICAL:</span>{" "}
                      <span className="text-red-100">{item.fact}</span>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-2 text-sm leading-relaxed px-1">
                      <span className="text-yellow-400 flex-shrink-0">•</span>
                      <span className="text-gray-200">{item.fact}</span>
                    </div>
                  )
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-4 border-t border-gray-700 text-[11px] text-gray-500 leading-relaxed">
          <p>
            Compiled from public safety guidance by the U.S. Consumer Product Safety
            Commission (CPSC), National Fire Protection Association (NFPA), FDA/USDA
            food-safety programs, the Electrical Safety Foundation (ESFI), and
            NIPSCO/ComEd customer safety materials. StormPulse is not affiliated with
            NOAA, NWS, FEMA, NIPSCO, or ComEd.
          </p>
          <p className="mt-2">
            <Link href="/" className="text-orange-400 hover:text-orange-300 underline">
              ← Back to the live storm &amp; outage map
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
