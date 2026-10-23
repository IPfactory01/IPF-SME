import { SiteShell, usePageMeta } from "@/components/SiteShell";
import { LegalDocument } from "@/lib/legalDocument";
import { PAGE_META } from "@shared/seo";
import React from "react";
import privacySource from "../../../docs/legal/privacy.md?raw";
import termsSource from "../../../docs/legal/terms.md?raw";

/** A public legal page: the site's frame around the approved text, in a plain reading column. No sign-in needed. */
function LegalPage({ title, description, source }: { title: string; description: string; source: string }) {
  usePageMeta(title, description);
  return (
    <SiteShell>
      <article className="mx-auto max-w-[820px] px-4 pb-16 pt-10 sm:pt-14">
        <LegalDocument source={source} />
      </article>
    </SiteShell>
  );
}

export function TermsPage() {
  return <LegalPage title={PAGE_META.terms.title} description={PAGE_META.terms.description} source={termsSource} />;
}

export function PrivacyPage() {
  return <LegalPage title={PAGE_META.privacy.title} description={PAGE_META.privacy.description} source={privacySource} />;
}
