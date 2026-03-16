import type { ReactNode } from "react";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { RouterContext } from "#app/router.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Effect Zero — ztunes example" },
    ],
  }),
  component: RootComponent,
});

const zeroCacheURL = import.meta.env.VITE_PUBLIC_ZERO_CACHE_URL as string | undefined;

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {zeroCacheURL ? <link rel="preconnect" href={zeroCacheURL} /> : null}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                height: 100%;
                margin: 0;
                font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
                font-optical-sizing: auto;
                -webkit-font-smoothing: antialiased;
                color: #0a0a0a;
                background: #fafafa;
              }
              *, *::before, *::after { box-sizing: border-box; }
              a { color: inherit; text-decoration: none; }
              a:hover { text-decoration: underline; }
            `,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
