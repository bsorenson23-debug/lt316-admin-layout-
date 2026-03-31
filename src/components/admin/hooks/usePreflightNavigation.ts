import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PreflightNavTarget } from "../TumblerExportPanel";

export function usePreflightNavigation() {
  const router = useRouter();

  const scrollAndPulse = useCallback((elementId: string) => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("preflight-pulse");
      setTimeout(() => el.classList.remove("preflight-pulse"), 1000);
    }, 150);
  }, []);

  const handlePreflightNav = useCallback((target: PreflightNavTarget) => {
    switch (target) {
      case "rotary-preset":
        scrollAndPulse("rotary-preset-select");
        break;
      case "cylinder-diameter":
        scrollAndPulse("bed-cylinder-diameter");
        break;
      case "template-dimensions":
        scrollAndPulse("bed-template-dimensions");
        break;
      case "top-anchor":
        router.push("/admin/calibration");
        break;
    }
  }, [scrollAndPulse, router]);

  return { handlePreflightNav };
}
