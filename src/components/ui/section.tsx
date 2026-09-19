import { cn } from "@/lib/utils";
import { Container } from "./container";
import { Eyebrow } from "./eyebrow";

/** A vertical band. `tone="inverse"` gives the dark editorial sections. */
export function Section({
  className,
  tone = "default",
  children,
  ...props
}: React.ComponentProps<"section"> & { tone?: "default" | "sunken" | "inverse" }) {
  return (
    <section
      className={cn(
        "py-20 sm:py-28",
        tone === "sunken" && "bg-surface-sunken",
        tone === "inverse" && "bg-ink-950 text-paper",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <Container className={className}>
      <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
        {eyebrow ? (
          <Eyebrow className={cn("mb-5", align === "center" && "justify-center")}>{eyebrow}</Eyebrow>
        ) : null}
        <h2 className="text-display-md sm:text-display-lg">{title}</h2>
        {lede ? (
          <p className="mt-5 text-lg leading-relaxed text-secondary [text-wrap:pretty]">{lede}</p>
        ) : null}
      </div>
    </Container>
  );
}
