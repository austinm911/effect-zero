import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@rocicorp/zero/react";
import { queries } from "#app/zero/queries.ts";
import { mutators } from "#app/zero/mutators.ts";
import type { CSSProperties } from "react";

export const Route = createFileRoute("/_layout/cart")({
  component: CartPage,
  ssr: false,
});

function CartPage() {
  const { zero } = useRouter().options.context;
  const [cartItems, { type }] = useQuery(queries.getCartItems());

  return (
    <div>
      <h1 style={{ margin: "0 0 16px 0" }}>Cart</h1>
      {cartItems.length === 0 && type === "complete" ? (
        <p style={{ color: "#71717a" }}>No items in cart.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cartItems.map((item) =>
            item.album ? (
              <div key={item.albumId} style={cartRowStyle}>
                <div>
                  <strong>{item.album.title}</strong>
                  <span style={{ color: "#a1a1aa", marginLeft: 8 }}>
                    {item.album.artist?.name ?? "Unknown"}
                  </span>
                </div>
                <button
                  type="button"
                  style={removeButtonStyle}
                  onClick={() => zero.mutate(mutators.cart.remove({ albumId: item.albumId }))}
                >
                  Remove
                </button>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

const cartRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
};

const removeButtonStyle: CSSProperties = {
  padding: "6px 14px",
  fontSize: "0.8125rem",
  fontWeight: 500,
  fontFamily: "inherit",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  background: "#fff",
  color: "#09090b",
};
