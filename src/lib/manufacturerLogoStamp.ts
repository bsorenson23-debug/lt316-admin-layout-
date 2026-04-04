import type { ManufacturerLogoStamp } from "@/types/productTemplate";
import type { TumblerItemLookupFitDebug } from "@/types/tumblerItemLookup";

export const MANUFACTURER_LOGO_STAMP_ALGO_VERSION = "disabled-v1";

export interface ExtractManufacturerLogoStampArgs {
  photoDataUrl: string;
  overallHeightMm: number;
  brand?: string | null;
  topMarginMm?: number;
  bottomMarginMm?: number;
  fitDebug?: TumblerItemLookupFitDebug | null;
  source: ManufacturerLogoStamp["source"];
}

export async function extractManufacturerLogoStamp(
  args: ExtractManufacturerLogoStampArgs,
): Promise<ManufacturerLogoStamp | null> {
  void args;
  return null;
}
