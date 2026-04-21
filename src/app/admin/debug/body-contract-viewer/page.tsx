import { BodyContractViewerHarness } from "@/components/admin/BodyContractViewerHarness";

export default async function BodyContractViewerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const scenario = typeof params.scenario === "string" ? params.scenario : null;

  return <BodyContractViewerHarness scenario={scenario} />;
}
