import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { brand } from "@/lib/brand";
import { CONTACT } from "@/lib/content/company";

export const metadata: Metadata = {
  title: "Contact",
  description: CONTACT.lede,
  openGraph: { title: `Contact · ${brand.name}`, description: CONTACT.lede },
  alternates: { canonical: `${brand.url}/contact` },
};

export default function ContactPage() {
  return (
    <>
      <Section className="pb-12 pt-16 sm:pt-20">
        <Container>
          <Eyebrow className="mb-5">Contact</Eyebrow>
          <h1 className="max-w-3xl text-display-md sm:text-display-lg">Talk to us.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary">{CONTACT.lede}</p>
        </Container>
      </Section>

      <Section className="py-0 sm:py-0">
        <Container>
          <dl className="divide-y divide-hairline border-y border-hairline">
            {CONTACT.channels.map((channel) => (
              <div
                key={channel.label}
                className="grid gap-2 py-8 lg:grid-cols-[minmax(0,14rem)_1fr] lg:gap-14"
              >
                <dt className="font-display text-lg">{channel.label}</dt>
                <dd className="max-w-2xl">
                  <a
                    href={`mailto:${channel.value}`}
                    className="text-primary underline underline-offset-4 hover:text-accent"
                  >
                    {channel.value}
                  </a>
                  <span className="mt-1.5 block text-[0.95rem] leading-relaxed text-secondary">
                    {channel.note}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="py-10 text-sm leading-relaxed text-secondary">
            Before you write: the{" "}
            <Link href="/learn/methodology" className="text-primary underline underline-offset-4">
              methodology page
            </Link>{" "}
            answers most questions about how a figure was produced, and the{" "}
            <Link href="/pricing" className="text-primary underline underline-offset-4">
              pricing page
            </Link>{" "}
            carries the numbers and the cancellation terms in full.
          </p>
        </Container>
      </Section>
    </>
  );
}
