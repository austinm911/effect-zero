import { useCallback } from "react";
import { ZeroProvider } from "@rocicorp/zero/react";
import { useRouter } from "@tanstack/react-router";
import { schema } from "#app/zero/schema.ts";
import { mutators } from "#app/zero/mutators.ts";
import { queries } from "#app/zero/queries.ts";
import { DEMO_USER_ID } from "#app/shared/constants.ts";

const cacheURL = import.meta.env.VITE_PUBLIC_ZERO_CACHE_URL || "http://localhost:4848";

export function ZeroInit({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const context = { userId: DEMO_USER_ID };

  const init = useCallback(
    (zero: any) => {
      router.update({
        context: { ...router.options.context, zero },
      });
      void router.invalidate();
      setTimeout(() => {
        zero.preload(queries.listArtists({ limit: 50 }), { ttl: "1m" });
      }, 1_000);
    },
    [router],
  );

  return (
    <ZeroProvider
      schema={schema}
      userID={DEMO_USER_ID}
      context={context}
      cacheURL={cacheURL}
      mutators={mutators}
      init={init}
    >
      {children}
    </ZeroProvider>
  );
}
