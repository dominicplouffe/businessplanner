import { brand } from "@/lib/brand";
import { LEGAL_EFFECTIVE, type ProseSection } from "./company";

/* ==========================================================================
   Legal documents.
   --------------------------------------------------------------------------
   ⚠ These describe what the product actually does, which is the only kind of
   policy worth publishing — but they have NOT been reviewed by counsel. That
   review is a launch prerequisite. Nothing here should be treated as settled
   wording, and no clause should be copied into a contract.

   Where a commitment depends on infrastructure that does not exist yet, the
   text says so rather than asserting it. A privacy policy that overstates is a
   liability, not a reassurance.
   ========================================================================== */

export type LegalSlug = "privacy" | "terms" | "dpa";

export type LegalDocument = {
  slug: LegalSlug;
  label: string;
  title: string;
  lede: string;
  effective: string;
  sections: ProseSection[];
};

const contact = `Questions about this document go to ${brand.email.hello}.`;

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: "privacy",
    label: "Privacy",
    title: "Privacy policy",
    lede: "What we collect, why, who else sees it, and how to get it back or have it deleted.",
    effective: LEGAL_EFFECTIVE,
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "Account details you give us: your name, your email address, and a hashed password or an OAuth identifier from the provider you signed in with.",
          "Everything you put into a plan: the answers in the intake, the assumptions behind the model, the written sections, the citations, and any documents you generate from them.",
          "Operational records needed to run the service: sign-in times, error reports, and — for plans you have shared by link — the time a link was opened and a salted hash of the viewer's IP address. We store the hash rather than the address so the read analytics work without us keeping a log of who read your plan from where.",
        ],
      },
      {
        heading: "What we do not collect",
        paragraphs: [
          "We do not use advertising trackers or third-party analytics that follow you off this site.",
          "The free calculators run entirely in your browser. Values you type into them are never transmitted to us, because there is no request that would carry them.",
        ],
      },
      {
        heading: "Why we process it",
        paragraphs: [
          "To provide the service you asked for: building your model, generating your plan, and producing your exports. To keep your account secure. To bill you, if you buy something. And to answer you when you write to support.",
          "We do not sell personal data, and we do not share it for advertising.",
        ],
      },
      {
        heading: "Who else processes it",
        paragraphs: [
          "Plan content is sent to Anthropic's API when a section is generated, so that the model can write prose about the figures the engine has computed. Content sent through the API is not used to train models. If no API key is configured for your deployment, generation instead runs a local deterministic generator and nothing leaves the server.",
          "Payments, when they are enabled, are handled by Stripe. We receive a confirmation and the last four digits of the card; we never see the full number.",
          "Transactional email is sent by our email provider. Hosting and the database are provided by our cloud provider.",
          "We will keep a current list of subprocessors available on request, and will give notice before adding a new one that processes plan content.",
        ],
      },
      {
        heading: "Where it is stored and for how long",
        paragraphs: [
          "Data is held in the United States, encrypted in transit and at rest.",
          "Plans are kept until you delete them or close your account. Deleting a plan removes it and its versions; closing an account removes your plans, your workspace and your sign-in credentials. Backups are overwritten on a rolling cycle, so a deleted record can persist in backup for a short period after it disappears from the product.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "You can export any plan at any time in four formats, so your work is portable without asking us for it.",
          "Write to us to access, correct, export or delete the personal data we hold about you, or to object to a particular processing purpose, and we will act within thirty days. If you are in the EEA or the UK, the usual GDPR rights apply and this paragraph does not limit them; if you are in California, so do the CCPA rights, including the right not to be discriminated against for exercising them.",
          contact,
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "We set a session cookie so you stay signed in, and a preference cookie for things like your theme. That is the whole list. There is no advertising cookie and no cross-site tracking, which is also why there is no consent banner in your way.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "If this policy changes in a way that materially affects how we handle your data, we will email account holders before the change takes effect rather than quietly updating the date at the top.",
        ],
      },
    ],
  },
  {
    slug: "terms",
    label: "Terms",
    title: "Terms of service",
    lede: "What we owe you, what you owe us, and the limits on both. Written to be read.",
    effective: LEGAL_EFFECTIVE,
    sections: [
      {
        heading: "What this service is",
        paragraphs: [
          `${brand.legalName} provides document preparation and financial modelling software. It is not a law firm, an accountancy practice, a broker or an investment adviser, and nothing it produces is legal, tax, immigration or investment advice.`,
          "A plan prepared for a lender, an investor or a government filing should be reviewed by a qualified professional before it is submitted. Projections are projections: the model is only as good as the assumptions you give it, and the documents say so.",
        ],
      },
      {
        heading: "Your account",
        paragraphs: [
          "You must be at least eighteen and able to enter a contract. Keep your credentials to yourself; you are responsible for what happens under your account.",
          "Plans belong to a workspace. If you invite others into a workspace, they can see and edit the plans in it.",
        ],
      },
      {
        heading: "Your content is yours",
        paragraphs: [
          "You keep ownership of everything you put in and everything the service generates for you. You grant us only the licence needed to run the service for you — to store your content, process it, and produce your documents.",
          "We do not use your plan content to train models, and we do not publish it. Anything we show publicly as an example is written by us for that purpose.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Do not use the service to prepare documents you know to be false, to impersonate somebody else, or to break the law of the place the document is going.",
          "Do not attempt to extract our source data in bulk, resell access, or circumvent limits. Reporting a vulnerability to us in good faith is explicitly welcome and is not a breach of this clause.",
        ],
      },
      {
        heading: "Payment, cancellation and refunds",
        paragraphs: [
          "The one-time unlock is charged once per plan and does not renew. A subscription, where you take one, renews until you cancel, and cancelling takes one click in the product — no email, no retention call, no form asking you to justify it.",
          "Cancel a subscription and it runs to the end of the period you have paid for; we do not cut you off early. If the product does not do what this site says it does, write to us and we will refund you. We will not require you to document a quota of unsatisfactory sections first.",
        ],
      },
      {
        heading: "Availability and changes",
        paragraphs: [
          "We aim to keep the service available and will give notice of planned downtime, but we do not offer a contractual uptime guarantee at this stage and will not pretend otherwise.",
          "We may change features. Where a change removes something you rely on, we will say so in the changelog and, for anything material, by email.",
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "To the extent the law allows, our total liability to you is limited to the amount you have paid us in the twelve months before the claim, and we are not liable for indirect or consequential loss — including a loan that is declined, a round that does not close or an application that is refused.",
          "Nothing here excludes liability that cannot lawfully be excluded, and consumer rights in your jurisdiction are unaffected.",
        ],
      },
      {
        heading: "Ending it",
        paragraphs: [
          "You can close your account at any time. We may suspend an account that breaches the acceptable use clause, and will tell you why.",
          "Export your plans before you close the account: deletion is meant to be real, and we would rather you keep your work.",
          contact,
        ],
      },
    ],
  },
  {
    slug: "dpa",
    label: "Data processing",
    title: "Data processing addendum",
    lede: "For customers who need a processor agreement on file. Plain terms, no schedule of definitions to decode.",
    effective: LEGAL_EFFECTIVE,
    sections: [
      {
        heading: "Roles",
        paragraphs: [
          "Where you use the service to process personal data about other people — a client's details in a plan you are preparing for them, for instance — you are the controller and we are the processor. We process that data only on your documented instructions, which for most customers means: as necessary to provide the service.",
          "For your own account data we are the controller, and the privacy policy governs it.",
        ],
      },
      {
        heading: "Confidentiality and security",
        paragraphs: [
          "Everyone with access to customer data is bound by confidentiality obligations. Access is limited to the people who need it to operate or support the service.",
          "Our current technical measures are described in full on the security page, including what is not yet in place. We will not list a control here that we have not implemented.",
        ],
      },
      {
        heading: "Subprocessors",
        paragraphs: [
          "We use subprocessors to run the service, including the AI, payment, email and hosting providers named in the privacy policy. Each is bound by terms no less protective than these.",
          "We will give notice before engaging a new subprocessor that processes plan content, and you may object on reasonable data-protection grounds.",
        ],
      },
      {
        heading: "International transfers",
        paragraphs: [
          "Data is processed in the United States. For transfers out of the EEA, the UK or Switzerland we rely on the Standard Contractual Clauses and the UK addendum, which are incorporated here by reference and take precedence over anything in this document that conflicts with them.",
        ],
      },
      {
        heading: "Assistance, breach and deletion",
        paragraphs: [
          "We will help you respond to data subject requests and to regulators, to the extent you cannot do it yourself through the product's own export and deletion tools.",
          "We will notify you without undue delay, and in any case within seventy-two hours of becoming aware, of a personal data breach affecting your data, with what we know at the time.",
          "On termination we will delete customer data, subject to the backup cycle described in the privacy policy, or return it — though the export tools mean you can take it with you at any point without asking.",
          `To have this countersigned, or to ask for our current subprocessor list, write to ${brand.email.hello}.`,
        ],
      },
    ],
  },
];

export function getLegalDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((d) => d.slug === slug);
}
