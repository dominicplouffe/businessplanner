import Link from "next/link";
import { Logo } from "./logo";
import { Container } from "@/components/ui/container";
import { brand } from "@/lib/brand";
import { footerNav, legalNav } from "@/lib/nav";

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-surface-sunken">
      <Container width="wide" className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-tertiary">{brand.tagline}</p>
            <p className="mt-6 text-sm text-tertiary">
              <a href={`mailto:${brand.email.hello}`} className="hover:text-primary">
                {brand.email.hello}
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {footerNav.map((group) => (
              <div key={group.heading}>
                <h3 className="font-sans text-eyebrow font-medium uppercase text-tertiary">
                  {group.heading}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-secondary transition-colors hover:text-primary"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-hairline pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-tertiary">
            © {new Date().getFullYear()} {brand.legalName}
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {legalNav.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-tertiary hover:text-primary">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-8 max-w-3xl text-xs leading-relaxed text-tertiary">
          {brand.name} is a document-preparation and financial-modelling tool. It does not provide
          legal, tax, investment, or immigration advice. Plans prepared for a lender, an investor, or
          a government filing should be reviewed by a qualified professional.
        </p>
      </Container>
    </footer>
  );
}
