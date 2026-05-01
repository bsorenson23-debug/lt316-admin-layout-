import type { BodyGeometryContractSeed } from "./bodyGeometryContract.ts";
import {
  inferGeneratedModelStatusFromSource,
} from "./generatedModelUrl.ts";
import type { ProductTemplate } from "../types/productTemplate.ts";

export type ProductTemplateSourceModelStatus = Exclude<
  NonNullable<ProductTemplate["glbStatus"]>,
  "generated-reviewed-model"
>;

export interface ProductTemplateModelLanes {
  sourceModelPath: string | null;
  sourceModelStatus: ProductTemplateSourceModelStatus | null;
  sourceModelLabel: string | null;
  reviewedBodyCutoutQaGlbPath: string | null;
  reviewedBodyCutoutQaStatus: "generated-reviewed-model" | null;
  reviewedBodyCutoutQaModelSourceLabel: string | null;
  reviewedBodyCutoutQaAuditJsonPath: string | null;
  reviewedBodyCutoutQaSourceHash: string | null;
  reviewedBodyCutoutQaSourceSignature: string | null;
  reviewedBodyCutoutQaGlbHash: string | null;
  reviewedBodyCutoutQaGlbSourceHash: string | null;
  reviewedBodyCutoutQaGeneratedAt: string | null;
  reviewedBodyCutoutQaBodyGeometryContract: BodyGeometryContractSeed | null;
  acceptedBodyReferenceSourceHash: string | null;
  acceptedBodyReferenceSourceSignature: string | null;
  legacyGlbPathWasReviewedQa: boolean;
}

function normalized(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function asSourceModelStatus(
  status: ProductTemplate["glbStatus"] | null | undefined,
): ProductTemplateSourceModelStatus | null {
  if (!status || status === "generated-reviewed-model") return null;
  return status;
}

function inferStatus(path: string | null, label: string | null): ProductTemplate["glbStatus"] | null {
  return inferGeneratedModelStatusFromSource({
    modelUrl: path,
    sourceModelLabel: label,
  });
}

function isReviewedQaModel(path: string | null, status: ProductTemplate["glbStatus"] | null, label: string | null): boolean {
  return (status ?? inferStatus(path, label)) === "generated-reviewed-model";
}

export function resolveProductTemplateModelLanes(
  template: ProductTemplate | null | undefined,
): ProductTemplateModelLanes {
  const legacyPath = normalized(template?.glbPath);
  const legacyLabel = normalized(template?.glbSourceLabel);
  const legacyStatus = template?.glbStatus ?? inferStatus(legacyPath, legacyLabel);
  const legacyGlbPathWasReviewedQa = Boolean(
    legacyPath &&
    isReviewedQaModel(legacyPath, legacyStatus, legacyLabel),
  );

  const explicitSourcePath =
    normalized(template?.sourceModelPath) ??
    normalized(template?.sourceGlbPath);
  const explicitSourceLabel =
    normalized(template?.sourceModelLabel) ??
    (!legacyGlbPathWasReviewedQa ? legacyLabel : null);
  const explicitSourceStatus =
    asSourceModelStatus(template?.sourceModelStatus) ??
    (!legacyGlbPathWasReviewedQa ? asSourceModelStatus(legacyStatus) : null);
  const explicitSourceIsReviewed = Boolean(
    explicitSourcePath &&
    isReviewedQaModel(explicitSourcePath, template?.sourceModelStatus ?? null, explicitSourceLabel),
  );

  const sourceModelPath = explicitSourceIsReviewed
    ? null
    : (
        explicitSourcePath ??
        (!legacyGlbPathWasReviewedQa ? legacyPath : null)
      );
  const sourceModelStatus = sourceModelPath
    ? (
        explicitSourceStatus ??
        asSourceModelStatus(inferStatus(sourceModelPath, explicitSourceLabel)) ??
        "verified-product-model"
      )
    : null;
  const sourceModelLabel = sourceModelPath ? explicitSourceLabel : null;

  const reviewedBodyCutoutQaGlbPath =
    normalized(template?.reviewedBodyCutoutQaGlbPath) ??
    (legacyGlbPathWasReviewedQa ? legacyPath : null) ??
    (explicitSourceIsReviewed ? explicitSourcePath : null);
  const reviewedBodyCutoutQaStatus = reviewedBodyCutoutQaGlbPath
    ? "generated-reviewed-model"
    : null;
  const reviewedBodyCutoutQaModelSourceLabel =
    normalized(template?.reviewedBodyCutoutQaModelSourceLabel) ??
    (legacyGlbPathWasReviewedQa ? legacyLabel : null);
  const reviewedBodyCutoutQaBodyGeometryContract =
    template?.reviewedBodyCutoutQaBodyGeometryContract ?? null;

  return {
    sourceModelPath,
    sourceModelStatus,
    sourceModelLabel,
    reviewedBodyCutoutQaGlbPath,
    reviewedBodyCutoutQaStatus,
    reviewedBodyCutoutQaModelSourceLabel,
    reviewedBodyCutoutQaAuditJsonPath: normalized(template?.reviewedBodyCutoutQaAuditJsonPath),
    reviewedBodyCutoutQaSourceHash: normalized(template?.reviewedBodyCutoutQaSourceHash),
    reviewedBodyCutoutQaSourceSignature: normalized(template?.reviewedBodyCutoutQaSourceSignature),
    reviewedBodyCutoutQaGlbHash:
      normalized(template?.reviewedBodyCutoutQaGlbHash) ??
      normalized(reviewedBodyCutoutQaBodyGeometryContract?.glb?.hash),
    reviewedBodyCutoutQaGlbSourceHash:
      normalized(template?.reviewedBodyCutoutQaGlbSourceHash) ??
      normalized(reviewedBodyCutoutQaBodyGeometryContract?.glb?.sourceHash),
    reviewedBodyCutoutQaGeneratedAt:
      normalized(template?.reviewedBodyCutoutQaGeneratedAt) ??
      normalized(reviewedBodyCutoutQaBodyGeometryContract?.glb?.generatedAt),
    reviewedBodyCutoutQaBodyGeometryContract,
    acceptedBodyReferenceSourceHash:
      normalized(template?.acceptedBodyReferenceSourceHash) ??
      normalized(template?.reviewedBodyCutoutQaSourceHash),
    acceptedBodyReferenceSourceSignature:
      normalized(template?.acceptedBodyReferenceSourceSignature) ??
      normalized(template?.reviewedBodyCutoutQaSourceSignature),
    legacyGlbPathWasReviewedQa,
  };
}

export function normalizeProductTemplateModelTruth(template: ProductTemplate): ProductTemplate {
  const lanes = resolveProductTemplateModelLanes(template);
  const normalizedTemplate: ProductTemplate = {
    ...template,
    glbPath: lanes.sourceModelPath ?? "",
    glbStatus: lanes.sourceModelStatus ?? (lanes.sourceModelPath ? "verified-product-model" : undefined),
    glbSourceLabel: lanes.sourceModelLabel ?? undefined,
    sourceModelPath: lanes.sourceModelPath ?? undefined,
    sourceModelStatus: lanes.sourceModelStatus ?? undefined,
    sourceModelLabel: lanes.sourceModelLabel ?? undefined,
    reviewedBodyCutoutQaGlbPath: lanes.reviewedBodyCutoutQaGlbPath ?? undefined,
    reviewedBodyCutoutQaModelSourceLabel: lanes.reviewedBodyCutoutQaModelSourceLabel ?? undefined,
    reviewedBodyCutoutQaAuditJsonPath: lanes.reviewedBodyCutoutQaAuditJsonPath ?? undefined,
    reviewedBodyCutoutQaSourceHash: lanes.reviewedBodyCutoutQaSourceHash ?? undefined,
    reviewedBodyCutoutQaSourceSignature: lanes.reviewedBodyCutoutQaSourceSignature ?? undefined,
    reviewedBodyCutoutQaGlbHash: lanes.reviewedBodyCutoutQaGlbHash ?? undefined,
    reviewedBodyCutoutQaGlbSourceHash: lanes.reviewedBodyCutoutQaGlbSourceHash ?? undefined,
    reviewedBodyCutoutQaGeneratedAt: lanes.reviewedBodyCutoutQaGeneratedAt ?? undefined,
    reviewedBodyCutoutQaBodyGeometryContract: lanes.reviewedBodyCutoutQaBodyGeometryContract ?? undefined,
    acceptedBodyReferenceSourceHash: lanes.acceptedBodyReferenceSourceHash ?? undefined,
    acceptedBodyReferenceSourceSignature: lanes.acceptedBodyReferenceSourceSignature ?? undefined,
  };

  if (!lanes.sourceModelPath) {
    delete normalizedTemplate.glbStatus;
    delete normalizedTemplate.glbSourceLabel;
    delete normalizedTemplate.sourceModelPath;
    delete normalizedTemplate.sourceModelStatus;
    delete normalizedTemplate.sourceModelLabel;
  }

  if (!lanes.reviewedBodyCutoutQaGlbPath) {
    delete normalizedTemplate.reviewedBodyCutoutQaGlbPath;
    delete normalizedTemplate.reviewedBodyCutoutQaModelSourceLabel;
    delete normalizedTemplate.reviewedBodyCutoutQaAuditJsonPath;
    delete normalizedTemplate.reviewedBodyCutoutQaSourceHash;
    delete normalizedTemplate.reviewedBodyCutoutQaSourceSignature;
    delete normalizedTemplate.reviewedBodyCutoutQaGlbHash;
    delete normalizedTemplate.reviewedBodyCutoutQaGlbSourceHash;
    delete normalizedTemplate.reviewedBodyCutoutQaGeneratedAt;
    delete normalizedTemplate.reviewedBodyCutoutQaBodyGeometryContract;
  }

  return normalizedTemplate;
}
