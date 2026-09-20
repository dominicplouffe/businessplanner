import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { createPlanAction } from "@/lib/actions/plan-actions";

export const metadata: Metadata = { title: "New plan" };

export default function NewPlanPage() {
  return (
    <>
      <AppPageHeader
        eyebrow="New plan"
        title="What are you planning?"
        lede="Just a working title for now — you can change it at any point, and the company name is captured properly during intake."
      />
      <div className="px-6 py-8 sm:px-10">
        <form action={createPlanAction} className="max-w-md space-y-6">
          <Field
            label="Working title"
            hint="For example: Rowan &amp; Fig — SBA loan application."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                name="title"
                autoFocus
                required
                maxLength={120}
                placeholder="Untitled plan"
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Button type="submit" size="lg">
            Continue to intake
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        </form>
      </div>
    </>
  );
}
