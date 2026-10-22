import AccountLayout from "@/components/AccountLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { BUSINESS_ROLE_LABELS } from "@shared/businessCapabilities";
import React, { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

type Form = { name: string; description: string; yearFounded: string; sector: string; website: string };

function BusinessSettings({ businessId }: { businessId: number }) {
  const utils = trpc.useUtils();
  const profile = trpc.account.business.useQuery({ businessId }, { retry: false, refetchOnWindowFocus: false });
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const data = profile.data;
    if (data) setForm({ name: data.name, description: data.description ?? "", yearFounded: data.yearFounded ? String(data.yearFounded) : "", sector: data.sector ?? "", website: data.website ?? "" });
  }, [profile.data]);

  const save = trpc.account.updateBusiness.useMutation({
    onSuccess: () => {
      toast.success("Business profile saved.");
      void utils.account.business.invalidate();
      void utils.account.me.invalidate();
    },
    onError: failure => setError(failure.message),
  });

  if (profile.isLoading || (profile.data && !form)) return <p className="text-sm text-ink-muted">Loading…</p>;
  if (!profile.data || !form) return <p role="alert" className="text-sm text-danger-strong">{profile.error?.message ?? "This business is not available."}</p>;

  const data = profile.data;
  const set = (key: keyof Form) => (event: { target: { value: string } }) => {
    setForm(current => ({ ...current!, [key]: event.target.value }));
    setError(null);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const year = form.yearFounded.trim();
    if (year && !/^\d{4}$/.test(year)) return setError("Enter the year as four digits, for example 2019.");
    setError(null);
    save.mutate({ businessId, name: form.name, description: form.description, yearFounded: year ? Number(year) : null, sector: form.sector, website: form.website });
  };
  const disabled = !data.canEdit;

  return (
    <Card className="rounded-none border-line-soft bg-white shadow-sm">
      <CardHeader className="space-y-2 pb-4">
        <CardTitle className="font-serif text-2xl font-bold tracking-tight">{data.name}</CardTitle>
        <CardDescription className="text-sm text-ink-muted">
          Profile {data.completion.percent}% complete. Your role: {BUSINESS_ROLE_LABELS[data.role]}.
          {disabled && " Only owners and business admins can change these details."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" noValidate onSubmit={submit}>
          {error && <div role="alert" className="border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger-strong">{error}</div>}
          <div className="space-y-2"><Label htmlFor="business-name">Business name</Label><Input id="business-name" value={form.name} onChange={set("name")} disabled={disabled} /></div>
          <div className="space-y-2"><Label htmlFor="business-description">Description</Label>
            <textarea id="business-description" rows={4} value={form.description} onChange={set("description")} disabled={disabled} className="w-full border border-line bg-white px-3 py-2 text-sm disabled:opacity-60" /></div>
          <div className="space-y-2"><Label htmlFor="business-year">Year founded</Label><Input id="business-year" inputMode="numeric" value={form.yearFounded} onChange={set("yearFounded")} disabled={disabled} /></div>
          <div className="space-y-2"><Label htmlFor="business-sector">Sector</Label><Input id="business-sector" value={form.sector} onChange={set("sector")} disabled={disabled} /></div>
          <div className="space-y-2"><Label htmlFor="business-website">Website</Label><Input id="business-website" value={form.website} onChange={set("website")} disabled={disabled} placeholder="https://" /></div>
          <div className="space-y-1 border-t border-line-soft pt-4 text-sm">
            <p className="font-medium">Logo</p>
            <div className="flex h-16 w-16 items-center justify-center border border-dashed border-line text-xs text-ink-muted" aria-label="Logo placeholder">{data.name.slice(0, 2).toUpperCase()}</div>
            <p className="text-ink-muted">Logo upload is coming soon.</p>
          </div>
          {!disabled && (
            <Button disabled={save.isPending} type="submit" className="rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">
              {save.isPending ? "Saving…" : "Save business profile"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export default function BusinessSettingsPage() {
  return (
    <AccountLayout heading="Business settings">
      {account => (account.activeBusiness
        ? <BusinessSettings key={account.activeBusiness.businessId} businessId={account.activeBusiness.businessId} />
        : <p className="text-sm text-ink-muted">You are not working inside a business, so there is no business profile to edit.</p>)}
    </AccountLayout>
  );
}
