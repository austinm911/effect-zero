import { toast } from "sonner";
import {
  browserTargetLabels,
  getBrowserTargetAuthoringMode,
  getBrowserTargetSpec,
  readBrowserTargetFromCookieString,
} from "#app/shared/targets.ts";

type MutationLogOptions = {
  action: string;
  run: () => unknown;
};

export function runLoggedMutation({ action, run }: MutationLogOptions) {
  const target = readBrowserTargetFromCookieString(document.cookie);
  const targetSpec = getBrowserTargetSpec(target);
  const adapter = target === "control" ? "postgresjs" : targetSpec.adapter;
  const serverDbApi = target === "control" ? "zero-postgresjs" : "wrapped-transaction";
  const authoringMode = getBrowserTargetAuthoringMode(target).replaceAll("-", " ");
  const detail = `${browserTargetLabels[target]} · ${adapter} · ${serverDbApi} · ${authoringMode}`;
  const mutation = Promise.resolve().then(run);

  toast.promise(mutation, {
    loading: `${action} via ${detail}`,
    success: `${action} committed via ${detail}`,
    error: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      return `${action} failed via ${detail}: ${message}`;
    },
  });

  return mutation;
}
