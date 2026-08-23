import type { Metadata } from "next";
import SafetyGuide from "./SafetyGuide";

export const metadata: Metadata = {
  title: "Storm & Outage Safety — a field guide for Northwest Indiana",
  description:
    "Most storm deaths happen after the storm. Test yourself on the myths, then learn the facts: downed lines, generators, extension cords, weatherhead repairs, impersonation scams, and keeping food and family safe.",
};

export default function SafetyPage() {
  return <SafetyGuide />;
}
