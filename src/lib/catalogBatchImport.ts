export interface CatalogBatchImportSummary {
  providerLabel: string;
  styleCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  failedNames: string[];
}

export interface ImportCatalogTemplatesArgs {
  sourceUrl: string;
  onProgress?: (message: string) => void;
}

export async function importCatalogTemplates(
  args: ImportCatalogTemplatesArgs,
): Promise<CatalogBatchImportSummary> {
  args.onProgress?.("Catalog batch import is not available in this build.");
  throw new Error("Catalog batch import is not available in this build.");
}
