import "@/styles/print.css";

/* The sample plans are rendered as documents, which means the print stylesheet
   — the same one the PDF route and every shared plan use. It sets a page
   background and a sheet width, so it cannot live inside the marketing layout;
   this segment gets its own, exactly as /share does. The index at /examples is
   an ordinary marketing page and is unaffected. */
export default function ExampleDocumentLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
