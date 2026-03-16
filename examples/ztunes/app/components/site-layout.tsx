import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@rocicorp/zero/react";
import { TargetTabs } from "./target-tabs.tsx";
import { queries } from "#app/zero/queries.ts";

export function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={layoutStyle}>
      <header style={headerStyle}>
        <Link to="/" style={logoStyle}>
          effect-zero
        </Link>
        <TargetTabs />
        <div style={{ flex: 1 }} />
        <CartBadge />
      </header>
      <main style={mainStyle}>{children}</main>
    </div>
  );
}

function CartBadge() {
  const [items] = useQuery(queries.getCartItems());
  return (
    <Link to="/cart" style={cartLinkStyle}>
      Cart ({items.length})
    </Link>
  );
}

const layoutStyle: CSSProperties = {
  padding: 16,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  maxWidth: 960,
  margin: "0 auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  paddingBottom: 16,
  borderBottom: "1px solid #e4e4e7",
  marginBottom: 16,
};

const logoStyle: CSSProperties = {
  fontSize: "1.125rem",
  fontWeight: 700,
  letterSpacing: "-0.025em",
  textDecoration: "none",
};

const cartLinkStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#52525b",
};

const mainStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
};
