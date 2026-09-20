import type { ExportDocument } from "@/lib/export/document";
import { formatAccounting, formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import type { StatementTable } from "@/lib/finance/statements";

/* ==========================================================================
   The printed plan.
   --------------------------------------------------------------------------
   Rendered as a document rather than as a page: a cover, numbered sections,
   the statements as financial tables, the underwriter's own arithmetic, and a
   sources appendix followed by the methodology note. The methodology is the
   part that makes the rest checkable — it prints which regulatory version and
   which benchmark vintage every figure was computed against, and which of
   those are still awaiting a primary source.
   ========================================================================== */

export function PlanDocument({ doc }: { doc: ExportDocument }) {
  const money = (n: number) => formatCurrency(n, doc.currency);

  const written = doc.sections.filter((s) => s.written);

  return (
    <article className="print-root">
      <Cover doc={doc} />

      <section className="print-section">
        <h2>Key figures</h2>
        <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Key figures, scrollable">
        <table className="print-avoid-break">
          <caption className="sr-only">Key figures</caption>
          <tbody>
            {doc.keyFigures.map((figure) => (
              <tr key={figure.label}>
                <th scope="row">{figure.label}</th>
                <td className="figure">
                  {figure.value}
                  {figure.note ? <span className="print-note"> · {figure.note}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {written.map((section, i) => (
        <section key={section.key} className="print-section">
          <h2>
            <span className="figure print-note">{String(i + 1).padStart(2, "0")}</span>{" "}
            {section.title}
          </h2>
          {section.paragraphs.map((paragraph, k) => (
            <p key={k}>{paragraph}</p>
          ))}
        </section>
      ))}

      {doc.market.sizing.complete ? (
        <section className="print-section">
          <h2>Market size, built from the ground up</h2>
          <p className="print-note">
            Each line is derived from the one above it, so a reader can disagree
            with one number rather than with the conclusion.
          </p>
          <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Market size derivation, scrollable">
        <table>
            <caption className="sr-only">Market size derivation</caption>
            <tbody>
              {doc.market.sizing.steps.map((step) => (
                <tr key={step.key}>
                  <th scope="row">
                    {step.label}
                    {step.workings ? <div className="print-note">{step.workings}</div> : null}
                  </th>
                  <td className="figure">
                    {step.kind === "currency" ? money(step.value) : Math.round(step.value).toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          {doc.market.sizing.modelCheck.status === "checked" && doc.market.sizing.modelCheck.overruns ? (
            <p className="print-note">
              Note: the financial model forecasts more revenue than this build
              says is obtainable. The two need reconciling.
            </p>
          ) : null}
        </section>
      ) : null}

      {doc.market.competitors.length > 0 ? (
        <section className="print-section">
          <h2>Competitors</h2>
          <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Named competitors with price evidence, scrollable">
        <table>
            <caption className="sr-only">Named competitors with price evidence</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Position</th>
                <th scope="col">Price as published</th>
                <th scope="col">Observed</th>
              </tr>
            </thead>
            <tbody>
              {doc.market.competitors.map((competitor) => (
                <tr key={competitor.name}>
                  <th scope="row">
                    {competitor.url ? <a href={competitor.url}>{competitor.name}</a> : competitor.name}
                    {competitor.weaknesses ? (
                      <div className="print-note">Weak on: {competitor.weaknesses}</div>
                    ) : null}
                  </th>
                  <td style={{ textAlign: "left" }}>{competitor.positioning || "—"}</td>
                  <td className="figure">{competitor.priceLabel || "none found"}</td>
                  <td className="figure">{competitor.priceDate ?? "undated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </section>
      ) : null}

      <section className="print-section">
        <h2>Financial statements</h2>
        <p className="print-note">
          {doc.horizonYears} years, computed from the drivers listed in the plan.
          The balance sheet carries its own tie row.
        </p>
        {doc.statements.map((table) => (
          <StatementBlock key={table.id} table={table} currency={doc.currency} />
        ))}
      </section>

      <UnderwriterBlock doc={doc} />

      {doc.resilience.exposure !== null ? (
        <section className="print-section">
          <h2>AI disruption resilience</h2>
          <p>
            Assessed task by task and weighted by what each part costs to run,
            exposure stands at {formatPercent(doc.resilience.exposure)} across{" "}
            {formatPercent(doc.resilience.coverage)} of the cost base —{" "}
            {doc.resilience.bandLabel.toLowerCase()}.
          </p>
          {doc.resilience.moatStatement ? (
            <p>What is genuinely hard to automate here: {doc.resilience.moatStatement}</p>
          ) : null}
          <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Task-level exposure, scrollable">
        <table>
            <caption className="sr-only">Task-level exposure</caption>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Share of cost</th>
                <th scope="col">Exposure</th>
              </tr>
            </thead>
            <tbody>
              {doc.resilience.mostExposed.map((task) => (
                <tr key={task.id}>
                  <th scope="row">
                    {task.task}
                    {task.rationale ? <div className="print-note">{task.rationale}</div> : null}
                  </th>
                  <td className="figure">{formatPercent(task.shareOfCost)}</td>
                  <td>{task.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </section>
      ) : null}

      <section className="print-section">
        <h2>Sources</h2>
        {doc.citations.length === 0 ? (
          <p className="print-note">No outside sources were relied on in this plan.</p>
        ) : (
          <ol>
            {doc.citations.map((citation) => (
              <li key={citation.index} className="print-avoid-break">
                {citation.claim ? <div>{citation.claim}</div> : null}
                <div className="print-note">
                  {citation.label}
                  {citation.publisher ? `, ${citation.publisher}` : ""} ·{" "}
                  <span className="figure">{citation.sourceDate}</span>
                  {citation.url ? (
                    <>
                      {" "}
                      <a href={citation.url}>link</a>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <MethodologyBlock doc={doc} />
    </article>
  );
}

function Cover({ doc }: { doc: ExportDocument }) {
  return (
    <header className="print-cover">
      <div>
        <p className="print-note" style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Business plan
        </p>
        <h1 style={{ fontSize: "34pt", lineHeight: 1.1, margin: "6mm 0 0" }}>{doc.companyName}</h1>
        <p style={{ fontSize: "12pt", marginTop: "4mm" }}>{doc.industryLabel}</p>
      </div>
      <div>
        <hr className="print-rule" />
        <p className="print-note">{doc.purposeLabel}</p>
        <p className="print-note">
          Prepared <span className="figure">{doc.preparedOn}</span> ·{" "}
          {doc.horizonYears}-year model
        </p>
        <p className="print-note">
          Every figure in this document was computed by a deterministic model
          from the assumptions listed within it. The workbook exported alongside
          contains the same model as live formulas.
        </p>
      </div>
    </header>
  );
}

function StatementBlock({ table, currency }: { table: StatementTable; currency: string }) {
  return (
    <div style={{ marginTop: "6mm" }}>
      <h3>{table.title}</h3>
      <div className="print-table-scroll" tabIndex={0} role="region" aria-label={`${table.title}, scrollable`}>
        <table className="print-statement">
        <caption className="sr-only">{table.title}</caption>
        <thead>
          <tr>
            <th scope="col"> </th>
            {table.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key}>
              <th
                scope="row"
                style={{
                  paddingLeft: row.indent ? "10pt" : undefined,
                  fontWeight: row.kind === "subtotal" || row.kind === "total" ? 600 : 400,
                }}
              >
                {row.label}
                {row.note ? <div className="print-note">{row.note}</div> : null}
              </th>
              {row.values.map((value, i) => (
                <td
                  key={i}
                  className="figure"
                  style={{ fontWeight: row.kind === "subtotal" || row.kind === "total" ? 600 : 400 }}
                >
                  {row.kind === "check" && Math.abs(value) < 0.01 ? "0" : formatAccounting(value, currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
        </div>
    </div>
  );
}

function UnderwriterBlock({ doc }: { doc: ExportDocument }) {
  const money = (n: number) => formatCurrency(n, doc.currency);
  const u = doc.underwriter;
  if (!u.dscr && u.schedules.length === 0) return null;

  return (
    <section className="print-section">
      <h2>Underwriter view</h2>

      {u.dscr ? (
        <>
          <h3>Debt service coverage</h3>
          <p className="print-note">
            Cash available is EBITDA less cash taxes. The threshold is{" "}
            {formatMultiple(u.dscr.threshold.value)} for {u.dscr.programme}, per{" "}
            {u.dscr.threshold.source.label}, in force from{" "}
            <span className="figure">{u.dscr.threshold.effectiveFrom}</span>.
          </p>
          <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Debt service coverage by year, scrollable">
        <table>
            <caption className="sr-only">Debt service coverage by year</caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Cash available</th>
                <th scope="col">Debt service</th>
                <th scope="col">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {u.dscr.rows.map((row) => (
                <tr key={row.year}>
                  <th scope="row">{row.year}</th>
                  <td className="figure">{money(row.cashAvailable)}</td>
                  <td className="figure">{money(row.debtService)}</td>
                  <td className="figure">
                    {row.dscr === null ? "—" : formatMultiple(row.dscr)}
                    {row.short ? " ▼ short" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : null}

      {u.schedules.map((schedule) => (
        <div key={schedule.loanName} style={{ marginTop: "6mm" }}>
          <h3>{schedule.loanName}</h3>
          <p className="print-note">{schedule.terms}</p>
          <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Table, scrollable">
        <table>
            <caption className="sr-only">{schedule.loanName} amortisation</caption>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Opening</th>
                <th scope="col">Interest</th>
                <th scope="col">Principal</th>
                <th scope="col">Closing</th>
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="figure">{money(row.openingBalance)}</td>
                  <td className="figure">{money(row.interest)}</td>
                  <td className="figure">{money(row.principal)}</td>
                  <td className="figure">{money(row.closingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      ))}

      <div style={{ marginTop: "6mm" }} className="print-avoid-break">
        <h3>Sources and uses</h3>
        <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Sources and uses of funds, scrollable">
        <table>
          <caption className="sr-only">Sources and uses of funds</caption>
          <tbody>
            {u.sources.map((item) => (
              <tr key={`s-${item.label}`}>
                <th scope="row">{item.label}</th>
                <td className="figure">{money(item.amount)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" style={{ fontWeight: 600 }}>Total sources</th>
              <td className="figure" style={{ fontWeight: 600 }}>
                {money(u.sources.reduce((sum, i) => sum + i.amount, 0))}
              </td>
            </tr>
            {u.uses.map((item) => (
              <tr key={`u-${item.label}`}>
                <th scope="row">{item.label}</th>
                <td className="figure">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {u.equityInjection.share !== null ? (
          <p className="print-note">
            Equity injection {formatPercent(u.equityInjection.share)} of total capital,
            against a {formatPercent(u.equityInjection.minimum.value)} minimum (
            {u.equityInjection.minimum.source.label}).
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: "6mm" }} className="print-avoid-break">
        <h3>Owner compensation</h3>
        <p className="print-note">
          Shown separately because a lender recomputes coverage without it, and
          because the E-2 marginality test is assessed on it.
        </p>
        <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Owner compensation by year, scrollable">
        <table>
          <caption className="sr-only">Owner compensation by year</caption>
          <tbody>
            {u.ownerCompensation.map((row) => (
              <tr key={row.year}>
                <th scope="row">{row.year}</th>
                <td className="figure">{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}

function MethodologyBlock({ doc }: { doc: ExportDocument }) {
  const m = doc.methodology;
  return (
    <section className="print-section">
      <h2>Methodology</h2>
      <p>
        Every figure in the statements was computed by a deterministic model
        from the assumptions in this document. No figure was written by a
        language model; the narrative describes arithmetic it did not perform.
        {m.generator === "fixture"
          ? " The narrative in this document was composed directly from the model."
          : ""}
      </p>
      <p>
        Industry context is drawn from {m.benchmarkSource} for{" "}
        {m.benchmarkLabel}. Benchmarks are shown for comparison and never
        substituted for the figures in this plan.
      </p>

      <h3>Regulatory values used</h3>
      <div className="print-table-scroll" tabIndex={0} role="region" aria-label="Regulatory values and their sources, scrollable">
        <table>
        <caption className="sr-only">Regulatory values and their sources</caption>
        <thead>
          <tr>
            <th scope="col">Value</th>
            <th scope="col">Used</th>
            <th scope="col">Source</th>
            <th scope="col">In force from</th>
            <th scope="col">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {m.entries.map((entry) => (
            <tr key={entry.label}>
              <th scope="row">{entry.label}</th>
              <td className="figure">{entry.value}</td>
              <td style={{ textAlign: "left" }}>{entry.source}</td>
              <td className="figure">{entry.effectiveFrom}</td>
              <td>{entry.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
        </div>
      <p className="print-note">Configuration last reviewed {m.configReviewed}.</p>

      <h3>Still to be confirmed against a primary source</h3>
      <p className="print-note">
        Listed rather than omitted. A plan that marks its own unverified inputs
        is worth more than one that presents everything with equal confidence.
      </p>
      <ul className="print-note">
        {m.verificationQueue.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
