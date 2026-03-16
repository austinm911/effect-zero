import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ZeroInit } from "#app/components/zero-init.tsx";
import { SiteLayout } from "#app/components/site-layout.tsx";

export const Route = createFileRoute("/_layout")({
  component: RouteComponent,
  ssr: false,
  staleTime: Infinity,
});

function RouteComponent() {
  return (
    <ZeroInit>
      <SiteLayout>
        <Outlet />
      </SiteLayout>
    </ZeroInit>
  );
}
